import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { matches, proxyRequest } from '../api/control.js';
import { validateJob } from '../lib/validation.js';
import { runDownload } from './downloader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ttl = 15 * 60 * 1000;
const token = () => randomBytes(24).toString('hex');

export function createApp({env=process.env, download=runDownload, directory=path.join(root,'downloads')}={}) {
  if (!env.APP_PASSWORD) throw new Error('Falta APP_PASSWORD en las variables de Render.');
  if (env.APP_PASSWORD.length < 12) throw new Error('APP_PASSWORD debe tener al menos 12 caracteres. Actualiza esa contraseña en Render.');
  // El token solo protege llamadas internas. Si no se configuró uno válido,
  // genera uno por proceso; Vercel no necesita conocerlo.
  const backendToken = env.BACKEND_TOKEN?.length >= 32 ? env.BACKEND_TOKEN : randomBytes(32).toString('hex');
  const serviceEnv = {...env, BACKEND_TOKEN:backendToken};
  const publicAddress = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL;
  if (!publicAddress) throw new Error('Configura PUBLIC_URL con la URL pública del servidor.');
  const publicUrl = new URL(publicAddress);
  if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['localhost','127.0.0.1'].includes(publicUrl.hostname))) throw new Error('PUBLIC_URL debe usar HTTPS.');
  if (publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('PUBLIC_URL debe contener solo el origen público.');
  const jobs = new Map();
  let running = false;
  const json = (res,code,data) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const publicJob = job => ({id:job.id,state:job.state,message:job.message,format:job.format,name:job.name,size:job.size,
    expiresAt:job.expiresAt,downloadUrl:job.state === 'ready' ? new URL(`/files/${job.id}?key=${job.fileKey}`,publicUrl).href : undefined});
  async function cleanup() {
    for (const [id,job] of jobs) if (job.expiresAt && job.expiresAt < Date.now()) {
      jobs.delete(id);
      await rm(path.join(directory,id),{recursive:true,force:true}).catch(()=>{});
    }
  }
  async function pump() {
    if (running) return;
    const job = [...jobs.values()].find(j=>j.state === 'queued');
    if (!job) return;
    running = true; job.state = 'working'; job.message = 'Preparando el video…';
    const folder = path.join(directory,job.id);
    try {
      await mkdir(folder,{recursive:true});
      Object.assign(job,await download(job,folder,message=>{job.message=message;}));
      job.state = 'ready'; job.message = 'Tu archivo está listo.';
    } catch (error) {
      job.state='error';job.message=error.message;
      await rm(folder,{recursive:true,force:true}).catch(()=>{});
    } finally {
      job.expiresAt=Date.now()+ttl;
      running=false;
      void pump();
    }
  }
  const timer = setInterval(()=>void cleanup(),30000);
  timer.unref();
  const server = http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    try {
      const url = new URL(req.url,'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return json(res,200,{ok:true});
      if (url.pathname.startsWith('/files/') && req.method === 'GET') {
        const job = jobs.get(url.pathname.split('/')[2]);
        if (!job || job.state !== 'ready' || job.expiresAt < Date.now() || !matches(url.searchParams.get('key'),job.fileKey)) return json(res,404,{error:'El archivo no existe o el enlace ha caducado.'});
        // Abre el archivo antes de enviar cabeceras; la limpieza puede ejecutarse en paralelo.
        const stream = createReadStream(job.file);
        await new Promise((resolve,reject)=>{stream.once('open',resolve);stream.once('error',reject);});
        res.writeHead(200,{'Content-Type':job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4','Content-Length':job.size,
          'Content-Disposition':`attachment; filename="sonora.${job.format}"; filename*=UTF-8''${encodeURIComponent(job.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,
          'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
        await pipeline(stream,res).catch(()=>{});
        return;
      }
      // El mismo frontend funciona localmente y en Docker, sin un proxy adicional.
      if (url.pathname === '/api/control') {
        const body = req.method === 'POST' ? await readJson(req) : undefined;
        const result = await proxyRequest({method:req.method,action:url.searchParams.get('action'),id:url.searchParams.get('id'),password:req.headers['x-access-key'],body},
          {...serviceEnv,BACKEND_URL:`http://127.0.0.1:${server.address().port}`});
        return json(res,result.status,result.data);
      }
      if (['/','/index.html','/app.js','/styles.css','/favicon.svg'].includes(url.pathname) && req.method === 'GET') {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const type = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml'}[file.split('.').pop()];
        res.setHeader('Content-Type',type);
        res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        return res.end(await readFile(path.join(root,'public',file)));
      }
      if (!matches(req.headers.authorization,`Bearer ${backendToken}`)) return json(res,401,{error:'Acceso no autorizado.'});
      if (url.pathname === '/health' && req.method === 'GET') return json(res,200,{ok:true,active:[...jobs.values()].filter(j=>['queued','working'].includes(j.state)).length});
      if (url.pathname === '/jobs' && req.method === 'POST') {
        const body = await readJson(req);
        const data = validateJob(body);
        await cleanup();
        if (jobs.size >= 10 || [...jobs.values()].filter(j=>['queued','working'].includes(j.state)).length >= 4) return json(res,429,{error:'La cola está llena. Espera unos minutos antes de intentar otra descarga.'});
        const job = {...data,id:token(),fileKey:token(),state:'queued',message:'En cola. Tu descarga comenzará pronto.'};
        jobs.set(job.id,job);
        json(res,202,publicJob(job));
        void pump();return;
      }
      if (/^\/jobs\/[a-f0-9]{48}$/.test(url.pathname) && req.method === 'GET') {
        const job = jobs.get(url.pathname.split('/')[2]);
        if (!job || (job.expiresAt && job.expiresAt < Date.now())) return json(res,404,{error:'Esta descarga caducó o el servidor se reinició. Inicia una nueva.'});
        return json(res,200,publicJob(job));
      }
      json(res,404,{error:'Ruta no encontrada.'});
    } catch (error) {
      if (res.headersSent) return res.destroy();
      json(res,error.status || 400,{error:error.status === 413 ? 'Solicitud demasiado grande.' : error.message || 'Solicitud no válida.'});
    }
  });
  server.on('close',()=>clearInterval(timer));
  server.requestTimeout=30000;
  server.headersTimeout=15000;
  return server;
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 8192) throw Object.assign(new Error(),{status:413});
  }
  try {return JSON.parse(data);} catch {throw new Error('Solicitud no válida.');}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.join(root,'downloads');
  await mkdir(directory,{recursive:true});
  // No conservamos trabajos tras reinicios: retira restos del proceso anterior.
  for (const entry of await readdir(directory)) if (/^[a-f0-9]{48}$/.test(entry)) await rm(path.join(directory,entry),{recursive:true,force:true});
  const server = createApp({directory});
  server.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log(`Sonora: http://localhost:${server.address().port}`));
}
