import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../backend/server.js';
import { normalizeYouTube, validateJob } from '../lib/validation.js';
import { proxyRequest } from '../api/control.js';
import { buildArguments } from '../backend/downloader.js';

const video = 'https://www.youtube.com/watch?v=BaW_jenozKc';
const token = 'a'.repeat(48);
const password = 'private-test-password';
const env = {BACKEND_TOKEN:token,APP_PASSWORD:password,PUBLIC_URL:'http://127.0.0.1:8080'};

test('normaliza enlaces y elimina listas, marcas de tiempo y parámetros ajenos',()=>{
  for (const link of ['https://youtu.be/BaW_jenozKc?t=10','https://music.youtube.com/watch?v=BaW_jenozKc&list=xxx','https://www.youtube.com/shorts/BaW_jenozKc','https://www.youtube.com/live/BaW_jenozKc']) assert.equal(normalizeYouTube(link),video);
});
test('rechaza hosts engañosos, protocolos, puertos, listas y argumentos de comandos',()=>{
  for (const link of ['https://youtube.com.evil.test/watch?v=BaW_jenozKc','file:///etc/passwd','http://youtube.com/watch?v=BaW_jenozKc','https://user@youtube.com/watch?v=BaW_jenozKc','https://youtube.com:9000/watch?v=BaW_jenozKc','https://youtube.com/playlist?list=abc','--exec rm -rf','https://127.0.0.1/watch?v=BaW_jenozKc']) assert.throws(()=>normalizeYouTube(link));
  assert.throws(()=>validateJob({url:video,format:'exe',permission:true}));
  assert.throws(()=>validateJob({url:video,format:'mp3',permission:false}));
});
test('el proceso usa argumentos separados y limita duración, tamaño y formatos',()=>{
  const args=buildArguments({url:video,format:'mp3'},'/tmp/sonora test');
  assert.deepEqual(args.slice(-2),['--',video]);
  assert.ok(args.includes('--ignore-config'));
  assert.ok(args.includes('!is_live & duration <= 1200'));
  assert.equal(args[args.indexOf('--audio-format')+1],'mp3');
  assert.ok(buildArguments({url:video,format:'mp4'},'/tmp/output').includes('--recode-video'));
});

async function fixture(t,download) {
  const directory=await mkdtemp(path.join(tmpdir(),'sonora-'));
  const app=createApp({env,directory,download});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});});
  return {origin,app,proxyEnv:{...env,BACKEND_URL:origin}};
}

test('flujo HTTP: clave → crear → consultar → enlace protegido → archivo',async t=>{
  const content=Buffer.from('audio-fixture');
  const {origin,proxyEnv}=await fixture(t,async(job,folder,update)=>{
    update('Convirtiendo el archivo…');
    const file=path.join(folder,'Canción de prueba.mp3');await writeFile(file,content);
    return {file,name:'Canción de prueba.mp3',size:content.length};
  });
  assert.equal((await fetch(`${origin}/jobs`)).status,401);
  assert.equal((await proxyRequest({method:'GET',action:'health',password:'wrong'},proxyEnv)).status,401);
  assert.equal((await proxyRequest({method:'GET',action:'health',password},proxyEnv)).status,200);
  const created=await proxyRequest({method:'POST',action:'create',password,body:{url:video,format:'mp3',permission:true}},proxyEnv);
  assert.equal(created.status,202);
  let ready;
  for (let i=0;i<50;i++) {
    ready=await proxyRequest({method:'GET',action:'status',id:created.data.id,password},proxyEnv);
    if (ready.data.state === 'ready') break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(ready.data.state,'ready');
  assert.equal(ready.data.name,'Canción de prueba.mp3');
  const download=new URL(ready.data.downloadUrl);download.host=new URL(origin).host;
  const file=await fetch(download);
  assert.equal(file.status,200);
  assert.match(file.headers.get('content-disposition'),/attachment/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()),content);
  download.searchParams.set('key','incorrect');
  assert.equal((await fetch(download)).status,404);
  const browser=await fetch(`${origin}/api/control?action=health`,{headers:{'x-access-key':password}});
  assert.equal(browser.status,200);
  assert.equal((await fetch(origin)).status,200);
  assert.equal((await fetch(`${origin}/.env`)).status,401);
});

test('fallos del descargador llegan al usuario y no generan enlaces',async t=>{
  const {proxyEnv}=await fixture(t,async()=>{throw new Error('YouTube rechazó la descarga desde este servidor.');});
  const created=await proxyRequest({method:'POST',action:'create',password,body:{url:video,format:'mp4',permission:true}},proxyEnv);
  let result;
  for (let i=0;i<50;i++) {
    result=await proxyRequest({method:'GET',action:'status',id:created.data.id,password},proxyEnv);
    if (result.data.state==='error') break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(result.data.state,'error');
  assert.match(result.data.message,/rechazó/);
  assert.equal(result.data.downloadUrl,undefined);
});

test('cola acotada: solo un proceso activo y hasta cuatro solicitudes pendientes',async t=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const {proxyEnv}=await fixture(t,async()=>{await gate;throw new Error('Cancelado en prueba');});
  t.after(()=>release());
  for (let i=0;i<4;i++) {
    assert.equal((await proxyRequest({method:'POST',action:'create',password,body:{url:video,format:'mp3',permission:true}},proxyEnv)).status,202);
  }
  assert.equal((await proxyRequest({method:'POST',action:'create',password,body:{url:video,format:'mp3',permission:true}},proxyEnv)).status,429);
  release();
  await new Promise(resolve=>setTimeout(resolve,50));
});

test('el proxy informa configuración incompleta sin inventar éxito',async()=>{
  const result=await proxyRequest({method:'GET',action:'health',password},{});
  assert.equal(result.status,503);
});
