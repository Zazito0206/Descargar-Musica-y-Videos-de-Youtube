export function normalizeYouTube(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Pega un enlace válido de YouTube.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Pega un enlace completo de YouTube.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('El enlace debe empezar por https://.');
  const hosts = ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'];
  if (!hosts.includes(url.hostname)) throw new Error('Este servicio solo acepta videos de YouTube.');
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('No se encontró un video válido. Las listas y los canales no son compatibles.');
  return `https://www.youtube.com/watch?v=${id}`;
}

export function validateJob(body) {
  if (!body || !['mp3','mp4'].includes(body.format)) throw new Error('Selecciona audio MP3 o video MP4.');
  if (body.permission !== true) throw new Error('Confirma que tienes permiso para descargar el contenido.');
  return { url: normalizeYouTube(body.url), format: body.format };
}
