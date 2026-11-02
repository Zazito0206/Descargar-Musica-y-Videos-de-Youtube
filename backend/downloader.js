import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_BYTES = 250 * 1024 * 1024;

export function buildArguments(job, directory) {
  const args = ['--ignore-config','--no-playlist','--no-progress','--newline','--no-colors',
    '--js-runtimes','deno','--socket-timeout','25','--retries','2','--fragment-retries','2',
    '--max-filesize','100M','--match-filters','!is_live & duration <= 1200',
    '--no-write-info-json','--no-write-thumbnail','--windows-filenames',
    '-P',directory,'-o','%(title).100B [%(id)s].%(ext)s'];
  if (job.format === 'mp3') args.push('-f','bestaudio/best','-x','--audio-format','mp3','--audio-quality','192K');
  else args.push('-f','bv[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]',
    '--merge-output-format','mp4','--recode-video','mp4');
  args.push('--',job.url);
  return args;
}

export async function runDownload(job, directory, update) {
  await new Promise((resolve,reject) => {
    const child = spawn(process.env.YTDLP_PATH || 'yt-dlp',buildArguments(job,directory),{
      shell:false,windowsHide:true,detached:process.platform !== 'win32',stdio:['ignore','pipe','pipe']
    });
    let tail = '', forced;
    const stop = reason => {
      if (forced) return;
      forced = reason;
      if (child.pid) {
        try { if (process.platform !== 'win32') process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); } catch {}
      }
    };
    const timer = setTimeout(()=>stop('La descarga superó el límite de 12 minutos.'),12*60*1000);
    const monitor = setInterval(async()=>{
      try {
        const names = await readdir(directory);
        let size = 0;
        for (const name of names) size += (await stat(path.join(directory,name))).size;
        if (size > MAX_BYTES * 2) stop('El contenido supera el tamaño permitido.');
      } catch {}
    },2000);
    child.stdout.on('data', chunk => {
      const line = chunk.toString();
      if (/\[ExtractAudio\]|\[Merger\]|\[VideoConvertor\]/.test(line)) update('Convirtiendo el archivo…');
      else if (line.includes('[download]')) update('Descargando el contenido…');
    });
    child.stderr.on('data',chunk=>{tail = (tail+chunk.toString()).slice(-4000);});
    child.once('error',error=>{clearTimeout(timer);clearInterval(monitor);reject(new Error(error.code === 'ENOENT' ? 'El servidor no tiene yt-dlp instalado.' : 'No se pudo iniciar la descarga.'));});
    child.once('close',code=>{
      clearTimeout(timer);clearInterval(monitor);
      if (forced) return reject(new Error(forced));
      if (code === 0) return resolve();
      console.error('download_failed',tail.replace(/https?:\/\/\S+/g,'[url]'));
      if (/sign in|bot|403|429/i.test(tail)) reject(new Error('YouTube rechazó la descarga desde este servidor. No se puede garantizar acceso a este video.'));
      else if (/not available|private|removed|unavailable/i.test(tail)) reject(new Error('El video no está disponible o requiere acceso privado.'));
      else reject(new Error('No se pudo descargar este contenido. Prueba otro video o actualiza yt-dlp en el servidor.'));
    });
  });
  const names = await readdir(directory);
  const name = names.find(name=>name.endsWith(`.${job.format}`));
  if (!name) throw new Error('No se generó un archivo: verifica que el video no sea en vivo, dure hasta 20 minutos y no exceda el límite de tamaño.');
  const file = path.join(directory,name);
  const size = (await stat(file)).size;
  if (size > MAX_BYTES || !size) throw new Error('El archivo final supera el límite de 250 MB o está vacío.');
  return {file,name,size};
}
