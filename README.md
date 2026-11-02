# Sonora

Web en español para preparar descargas autorizadas de YouTube en MP3 o MP4. Acceso público, sin cuenta ni contraseña, según la configuración solicitada por su propietario.

- Web: https://sonora-descargas.vercel.app
- Servidor: https://sonora-descargas.onrender.com
- Guía de despliegue: [RENDER.md](RENDER.md)

## Arquitectura

Navegador → web y API en Vercel → servidor Docker en Render → YouTube.

El archivo terminado se descarga directamente desde Render. Vercel solo requiere `BACKEND_URL`. Render genera su token interno automáticamente; no solicita APP_PASSWORD. El servidor usa Node, yt-dlp, FFmpeg y Deno incluidos en el Dockerfile.

La web es pública: cualquier persona con el enlace puede iniciar trabajos y consumir recursos del alojamiento. No hay cuentas, cuotas por usuario ni garantía de disponibilidad bajo carga. La cola y los archivos temporales se comparten en una sola réplica. Los trabajos se pierden al reiniciar o desplegar.

## Límites

- Audio MP3 a 192 kbps; video MP4 hasta 720p.
- Videos públicos de hasta 20 minutos. Sin directos, listas completas ni videos privados.
- Un proceso de descarga a la vez y hasta cuatro trabajos activos/pendientes; diez trabajos retenidos.
- Hasta 100 MB por archivo de origen y 250 MB en el archivo final.
- Preparación de hasta 12 minutos. Los resultados caducan 15 minutos después de finalizar; limpieza cada 30 segundos.
- Cada archivo tiene un enlace aleatorio temporal. Compartirlo permite que otra persona lo descargue hasta que caduque.
- Solo acepta enlaces de YouTube y los normaliza antes de procesarlos. No usa credenciales de YouTube ni evita DRM.

Usa contenido propio o autorizado. YouTube puede bloquear las IP de servidores o cambiar sus mecanismos. No se garantiza que todos los videos puedan descargarse; una comprobación de salud correcta no equivale a una descarga real exitosa.

## Desarrollo local

Requiere Node 22+, Python 3.11+, FFmpeg, Deno y yt-dlp. Instala yt-dlp con `python -m pip install "yt-dlp[default]==2026.10.26"` y verifica que esté en PATH, o establece `YTDLP_PATH` con la ruta de su ejecutable.

Copia `.env.example` a `.env`, establece `PUBLIC_URL=http://localhost:8080` y ejecuta `npm start`. También puedes usar `docker compose up -d --build`; el Compose expone el servicio solo en localhost, limita CPU y memoria y usa almacenamiento temporal limitado. Para publicar Docker necesitas una URL HTTPS y una sola réplica.

No subas archivos `.env` ni `downloads/` a GitHub. Mantén actualizado yt-dlp modificando su versión en el Dockerfile y reconstruyendo el contenedor.

## Pruebas

`npm run check` revisa la sintaxis y `npm test` comprueba el flujo HTTP con un archivo de prueba, la validación de enlaces, el acceso público sin contraseña, las rutas internas protegidas, la cola y la propagación de errores. No equivale a una descarga de YouTube desde el alojamiento público.

Para verificar una instalación, prueba una descarga real autorizada de MP3 y MP4 desde Vercel y reproduce ambos archivos. Puedes cerrar la pestaña durante la preparación y volver: el navegador guarda el ID del último trabajo; pulsa Comprobar conexión para recuperarlo antes de su caducidad.

## Referencias

- https://github.com/yt-dlp/yt-dlp#dependencies
- https://render.com/docs/docker
- https://vercel.com/docs/functions/limitations
