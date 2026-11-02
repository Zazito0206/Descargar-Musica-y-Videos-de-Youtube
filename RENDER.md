# Conectar Render y Vercel

Repositorio: https://github.com/Zazito0206/Descargar-Musica-y-Videos-de-Youtube

## Render: servidor de descargas

1. Entra a https://dashboard.render.com/ y elige New → Web Service.
2. Conecta GitHub y selecciona este repositorio. Si no aparece, concede acceso a este repositorio en la integración de GitHub.
3. Configura nombre `sonora-descargas`, rama `main`, lenguaje/runtime `Docker`, raíz vacía y Dockerfile `./Dockerfile`. Conserva el comando de inicio del Dockerfile. Una sola instancia.
4. Elige una región cercana a tus usuarios y un tamaño con 2 GB de memoria. Consulta los precios antes de contratar; no hace falta un plan de equipo de pago para seleccionar el tamaño del servicio. La tarifa de cómputo y el consumo son conceptos distintos.
5. En Environment añade `BACKEND_TOKEN` (secreto aleatorio de al menos 32 caracteres), `APP_PASSWORD` (otra clave de al menos 12 caracteres) y `PORT=8080`. Guarda las claves en tu gestor de contraseñas. Solo se configuran en Render. No las pegues en el chat ni las subas a GitHub.
6. En Health Check Path escribe `/healthz`.
7. Revisa la tarifa del servicio y despliega cuando estés de acuerdo. El código usa automáticamente `RENDER_EXTERNAL_URL`, una variable que Render proporciona, por lo que no necesitas definir `PUBLIC_URL` manualmente.
8. Espera a que el servicio indique Live y copia su dirección `https://....onrender.com`. Abre esa dirección seguida de `/healthz`: debe responder `{"ok":true}`.
9. Abre también la dirección sin `/healthz`, introduce APP_PASSWORD y prueba primero una descarga corta autorizada. Eso permite comprobar YouTube antes de conectar Vercel. La respuesta de salud por sí sola no valida acceso a YouTube.

No se ha verificado el acceso de este proyecto a YouTube desde Render. YouTube puede bloquear su IP. No hay garantía de éxito por contratar un plan. La instancia gratuita tiene poca memoria y se suspende por inactividad; no equivale a una configuración fiable para este trabajo. Los trabajos se pierden al reiniciar y los archivos terminados caducan a los 15 minutos.

## Vercel: web

1. Entra a https://vercel.com/new e importa este repositorio.
2. Framework Preset: Other. Root Directory: raíz del repo. Output Directory: `public`. No añadas Build Command.
3. Añade estas variables a Production:
   - `BACKEND_URL`: URL HTTPS que te dio Render, sin rutas.
   No añadas `BACKEND_TOKEN` ni `APP_PASSWORD` a Vercel. La función de Vercel envía por HTTPS la clave que el usuario escribe a Render, que la valida.
4. Pulsa Deploy. Si cambias variables después, vuelve a desplegar.
5. Abre la dirección de Vercel, introduce APP_PASSWORD y pulsa Conectar.
6. Prueba un MP3 y un MP4 autorizados, guarda ambos y comprueba su reproducción. Recarga la página y verifica también la recuperación del último trabajo con Conectar.

Referencias oficiales: https://render.com/docs/docker , https://render.com/docs/environment-variables , https://render.com/pricing , https://vercel.com/docs/git/vercel-for-github
