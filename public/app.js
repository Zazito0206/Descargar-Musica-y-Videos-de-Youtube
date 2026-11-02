const $ = selector => document.querySelector(selector);
const form = $('#download-form');
const notice = $('#notice');
const submit = $('#submit');
let currentJob, polling=false;
let storedJob;
try { storedJob = localStorage.getItem('sonora-job'); } catch {}

async function api(action,body,id) {
  const params = new URLSearchParams({action});
  if (id) params.set('id',id);
  const response = await fetch(`/api/control?${params}`,{
    method:body ? 'POST' : 'GET',
    headers:{'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(25000)
  });
  let data;
  try {data = await response.json();} catch {throw new Error('El servidor devolvió una respuesta inesperada. Revisa la configuración del despliegue.');}
  if (!response.ok) {
    setConnection(false);
    throw new Error(data.error || 'No se pudo completar la solicitud.');
  }
  setConnection(true);
  return data;
}

function setConnection(ok) {
  $('#connection').textContent = ok ? 'Conectado' : 'Sin conectar';
  $('#connection').classList.toggle('connected',ok);
}

$('#connect').addEventListener('click',async()=>{
  $('#connect').disabled=true;notice.textContent='';
  try {
    await api('health');
    notice.textContent='Conexión lista. Ya puedes preparar tu descarga.';
    if (storedJob && !currentJob) {currentJob=storedJob;void poll();}
  } catch (e) {notice.textContent=e.message;}
  finally {$('#connect').disabled=false;}
});

$('#paste').addEventListener('click',async()=>{
  try {$('#url').value=await navigator.clipboard.readText();notice.textContent='';}
  catch {notice.textContent='No se pudo acceder al portapapeles. Pega el enlace con Ctrl+V o mantén pulsado el campo en tu móvil.';$('#url').focus();}
});

function render(job) {
  $('#job-panel').hidden=false;
  $('#job-format').textContent=job.format.toUpperCase();
  $('#job-heading').textContent=job.state === 'ready' ? 'Listo para llevar' : job.state === 'error' ? 'No se pudo preparar' : 'Preparando tu archivo';
  $('#job-message').textContent=job.message;
  const step=job.state === 'queued' ? 0 : job.state === 'ready' ? 3 : /convirtiendo/i.test(job.message) ? 2 : 1;
  document.querySelectorAll('.steps li').forEach((element,index)=>element.classList.toggle('active',job.state !== 'error' && index <= step));
  const link=$('#download-link');link.hidden=true;link.removeAttribute('href');
  $('#expiry').textContent='';
  if (job.state === 'ready' && job.downloadUrl) {
    let safe;
    try {safe = new URL(job.downloadUrl);if (!['https:','http:'].includes(safe.protocol)) throw new Error();} catch {throw new Error('El enlace de descarga no es válido.');}
    link.href=safe.href;link.hidden=false;link.rel='noreferrer';
    $('#expiry').textContent=`${(job.size/1024/1024).toFixed(1)} MB · Disponible hasta las ${new Date(job.expiresAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`;
  }
  $('#resume').hidden=true;
}

async function poll() {
  if (polling || !currentJob) return;
  polling=true;submit.disabled=true;
  try {
    while (currentJob) {
      const job = await api('status',undefined,currentJob);
      render(job);
      if (['ready','error'].includes(job.state)) {currentJob=undefined;break;}
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
  } catch (error) {
    notice.textContent=error.message;
    $('#resume').hidden=false;
    $('#job-panel').hidden=false;
  } finally {polling=false;submit.disabled=false;}
}
$('#resume').addEventListener('click',()=>{notice.textContent='';void poll();});
form.addEventListener('submit',async event=>{
  event.preventDefault();notice.textContent='';
  if (polling) return;
  submit.disabled=true;
  try {
    const job = await api('create',{url:$('#url').value.trim(),format:new FormData(form).get('format'),permission:$('#permission').checked});
    currentJob=job.id;storedJob=job.id;
    try {localStorage.setItem('sonora-job',job.id);} catch {}
    render(job);await poll();
  } catch (error) {notice.textContent=error.message;}
  finally {submit.disabled=false;}
});
if (storedJob) notice.textContent='Hay una descarga anterior. Pulsa Comprobar conexión para recuperar su estado.';
