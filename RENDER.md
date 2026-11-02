# Sonora en Render y Vercel, sin contraseña

Repositorio: https://github.com/Zazito0206/Descargar-Musica-y-Videos-de-Youtube

## Render

1. New → Web Service. Selecciona el repositorio y la rama `main`.
2. Runtime: Docker. Raíz vacía. Dockerfile: `./Dockerfile`. Una sola instancia.
3. Configura `PORT=8080` y Health Check Path `/healthz`.
4. El código utiliza `RENDER_EXTERNAL_URL` automáticamente. No necesita `APP_PASSWORD` ni `BACKEND_TOKEN`. Si quedaron de una instalación anterior, APP_PASSWORD se ignora y BACKEND_TOKEN solo se utiliza para llamadas internas si tiene una longitud válida.
5. Despliega. Espera a Live y comprueba `/healthz`.

El plan gratuito puede quedarse sin memoria al convertir y suspende la instancia por inactividad. No se ha garantizado el acceso de YouTube desde la IP del alojamiento. Elegir un plan de pago no garantiza que YouTube acepte descargas.

## Vercel

1. Importa el mismo repositorio. Application Preset: Other. Raíz: `./`. Output Directory: `public`.
2. Configura solamente `BACKEND_URL=https://TU-SERVICIO.onrender.com`.
3. Despliega y abre la web. No solicita contraseña.
4. Pulsa Comprobar conexión y prueba un MP3 y un MP4 autorizados.

La web es pública. Cualquier visitante puede usar los recursos del servidor. La cola global, la duración, el tamaño y la caducidad siguen limitados.
