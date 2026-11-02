import { timingSafeEqual } from 'node:crypto';
import { validateJob } from '../lib/validation.js';

export function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function proxyRequest({method, action, id, password, body}, env = process.env) {
  if (!env.BACKEND_TOKEN || env.BACKEND_TOKEN.length < 32 || !env.APP_PASSWORD || env.APP_PASSWORD.length < 12 || !env.BACKEND_URL) {
    return {status:503, data:{error:'Falta configurar el servidor. Revisa las variables de entorno indicadas en la guía.'}};
  }
  if (!matches(password, env.APP_PASSWORD)) return {status:401,data:{error:'La clave de acceso no es correcta.'}};
  let backend;
  try {
    backend = new URL(env.BACKEND_URL);
    if (!['https:','http:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/') throw new Error();
    if (backend.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(backend.hostname)) throw new Error();
  } catch { return {status:503,data:{error:'La dirección del servidor no es válida.'}}; }
  let path, payload;
  if (action === 'health' && method === 'GET') path = '/health';
  else if (action === 'create' && method === 'POST') {
    try { payload = validateJob(body); payload.permission = true; } catch (e) {return {status:400,data:{error:e.message}};}
    path = '/jobs';
  } else if (action === 'status' && method === 'GET' && /^[a-f0-9]{48}$/.test(id || '')) path = `/jobs/${id}`;
  else return {status:400,data:{error:'Solicitud no válida.'}};
  try {
    const response = await fetch(new URL(path, backend), {
      method: payload ? 'POST' : 'GET',
      headers:{Authorization:`Bearer ${env.BACKEND_TOKEN}`, 'Content-Type':'application/json'},
      body:payload ? JSON.stringify(payload) : undefined,
      signal:AbortSignal.timeout(20000), redirect:'error'
    });
    const data = await response.json();
    return {status:response.status,data};
  } catch (error) {
    console.error('backend_unreachable', error.name);
    return {status:502,data:{error:'No se pudo conectar con el servidor de descargas. Intenta de nuevo en unos segundos.'}};
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.headers['content-length'] && Number(req.headers['content-length']) > 8192) return res.status(413).json({error:'Solicitud demasiado grande.'});
  let body = req.body;
  if (typeof body === 'string') {
    try {body = JSON.parse(body);} catch {return res.status(400).json({error:'Solicitud no válida.'});}
  }
  const {status,data} = await proxyRequest({method:req.method,action:req.query.action,id:req.query.id,password:req.headers['x-access-key'],body});
  res.status(status).json(data);
}
