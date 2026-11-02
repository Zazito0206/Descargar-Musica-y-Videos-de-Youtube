# Sonora

Web privada en español para preparar descargas autorizadas de YouTube en audio MP3 o video MP4. Incluye interfaz adaptable a móvil, clave de acceso, cola, estado real, recuperación del último trabajo y enlaces temporales.

**Estado:** código listo para subir a GitHub. No está desplegado. Pasaron siete pruebas, incluyendo el flujo HTTP con un archivo de prueba. En el navegador se comprobó la conexión y el rechazo de enlaces ajenos a YouTube. Se intentó una descarga real con el video de prueba histórico de yt-dlp, pero YouTube respondió que ya no está disponible: no hay una descarga real exitosa verificada. No se pudo construir ni ejecutar Docker en el entorno de creación. La captura visual del navegador no estuvo disponible, así que la revisión de la interfaz se limitó a su estructura y comportamiento.

## Qué se aloja dónde

```text
Navegador → web y API en Vercel → servidor Docker con yt-dlp y FFmpeg
Navegador ← archivo descargado directamente desde el servidor Docker
```

GitHub guarda el código. Vercel sirve la interfaz y verifica la clave antes de solicitar trabajos. El servidor Docker descarga, convierte y entrega los archivos. No se envían los videos grandes a través de la función de Vercel. No hace falta instalar nada a los visitantes.

**Necesitas un servidor Docker con URL pública HTTPS además de Vercel.** No basta con subir estos archivos a GitHub y pulsar Deploy: primero debes alojar ese servicio y configurar sus secretos. Puedes usar un servidor Linux propio o un alojamiento que mantenga contenedores activos. No uses este backend con estado en una función efímera de Vercel. Los trabajos son temporales y se pierden al reiniciar; debe ejecutarse una sola réplica.

YouTube puede bloquear las IP de alojamientos, pedir autenticación o cambiar sus mecanismos. No existe garantía de que todos los videos sean descargables. No se importan cookies, no hay servicios de terceros ocultos ni evasión de DRM. Usa solo contenido propio o autorizado.

## 1. Subir a GitHub

1. Extrae el ZIP.
2. Crea un repositorio nuevo en GitHub, por ejemplo `sonora-web`.
3. Sube **el contenido** de esta carpeta, de forma que `package.json`, `vercel.json` y `Dockerfile` queden en la raíz. Conserva las carpetas `api`, `backend`, `lib` y `public`.
4. Incluye los archivos ocultos `.gitignore`, `.dockerignore`, `.env.example` y `.github/workflows/check.yml` si subes con Git.
5. Nunca subas `.env` con tus claves ni la carpeta `downloads`.

## 2. Preparar dos claves

Genera dos valores aleatorios distintos, uno para `BACKEND_TOKEN` (al menos 32 caracteres) y otro para `APP_PASSWORD` (al menos 12 caracteres). Puedes usar un gestor de contraseñas o ejecutar dos veces:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_PASSWORD` es la clave que escribirás al entrar a la web. `BACKEND_TOKEN` es un secreto interno: solo va en las variables de los servidores, nunca en el navegador o el repositorio. Todas las personas con la clave de acceso comparten la misma instancia; no hay cuentas individuales.

## 3. Alojar el servicio de descargas

### Con una plataforma de contenedores

Conecta este repositorio a un servicio Docker de tu elección. Selecciona el `Dockerfile` de la raíz, puerto interno **8080**, una sola réplica, proceso siempre activo y, como mínimo orientativo, 1.5 GB de memoria y 3 GB de almacenamiento temporal. El servidor debe poder acceder a YouTube por HTTPS.

Configura estas variables:

| Variable | Valor |
| --- | --- |
| `BACKEND_TOKEN` | El secreto interno que generaste |
| `APP_PASSWORD` | Tu clave de acceso |
| `PUBLIC_URL` | La URL HTTPS pública de este servicio, por ejemplo `https://descargas.tudominio.com` |
| `PORT` | `8080` |

Si la plataforma asigna la URL después del primer intento de despliegue, añade `PUBLIC_URL` y vuelve a desplegar. Revisa que `https://TU-SERVIDOR/healthz` responda `{"ok":true}`. Ese endpoint comprueba que el servidor responde; la primera descarga real es necesaria para verificar acceso a YouTube.

El Dockerfile incluye Node, Python, FFmpeg, Deno y yt-dlp. Su construcción necesita acceso a los repositorios de paquetes. En una plataforma sin límites de disco, establece una cuota de almacenamiento temporal; la supervisión del proceso es una protección adicional, no una cuota del sistema operativo.

### En tu propio Linux con Docker Compose

1. Copia `.env.example` a `.env` y completa `BACKEND_TOKEN`, `APP_PASSWORD` y `PUBLIC_URL`.
2. Ejecuta `docker compose up -d --build`.
3. El servicio queda en `127.0.0.1:8080`. Pon delante un proxy HTTPS (por ejemplo Caddy o el proxy de tu alojamiento) para tu dominio público. Un Caddyfile mínimo:

   ```caddyfile
   descargas.tudominio.com {
     reverse_proxy 127.0.0.1:8080
   }
   ```

4. Apunta el DNS del dominio al servidor y permite los puertos HTTPS correspondientes. El Compose suministrado limita memoria, CPU y espacio temporal. No expone directamente el puerto 8080 al exterior.

## 4. Publicar la web en Vercel

1. En Vercel, pulsa **Add New → Project** e importa el repositorio.
2. Selecciona **Framework Preset: Other** y usa la raíz del repositorio como **Root Directory**.
3. No necesitas un Build Command ni instalar dependencias npm: el frontend es HTML/CSS/JS y la API usa módulos nativos de Node. El directorio de salida es **public**, declarado en `vercel.json`. Si Vercel propone `npm install`, no hay dependencias que instalar.
4. En **Environment Variables**, añade:

   | Variable | Valor |
   | --- | --- |
   | `BACKEND_URL` | La URL HTTPS del servicio Docker, sin rutas ni `/` final |
   | `BACKEND_TOKEN` | Exactamente el mismo secreto que en Docker |
   | `APP_PASSWORD` | Exactamente la misma clave que en Docker |

5. Activa las variables para **Production** y para **Preview** solo si deseas usar también vistas previas. Pulsa **Deploy**.
6. Abre tu URL de Vercel, introduce la clave de acceso y pulsa **Conectar**.
7. Pega el enlace de un video propio/autorizado corto, elige el formato, confirma el permiso y pulsa **Preparar descarga**.
8. Cuando termine, pulsa **Guardar archivo**. Comprueba que el archivo se reproduce en tu dispositivo, primero MP3 y luego MP4.

GitHub Pages solo sirve archivos estáticos y no puede ejecutar la API de este proyecto. Usa Vercel para la interfaz tal como se indica.

## Uso local opcional

Requiere Node 22 o posterior, Python 3.11 o posterior, FFmpeg y Deno. Instala yt-dlp con `python -m pip install "yt-dlp[default]==2026.10.26"` y asegúrate de que el comando `yt-dlp` esté disponible. Si no está en PATH, establece `YTDLP_PATH` con la ruta completa de su ejecutable.

Copia `.env.example` a `.env`, define las dos claves y usa `PUBLIC_URL=http://localhost:8080`. Ejecuta `npm start` y abre `http://localhost:8080`. El mismo servidor sirve la interfaz y la API. Esto permite usar la web en tu equipo sin Vercel, aunque no verifica que el servidor público pueda acceder a YouTube.

## Límites y mantenimiento

- Uso privado con clave compartida; no es un servicio público multiusuario. No hay facturación, cuentas ni cuotas por usuario.
- Un proceso de descarga a la vez y hasta cuatro trabajos activos/pendientes. Máximo diez trabajos retenidos.
- Videos de hasta 20 minutos; sin directos, canales ni listas completas. YouTube debe informar una duración válida.
- MP3 a 192 kbps y MP4 hasta 720p. La fuente puede tener menor calidad.
- Hasta 100 MB por archivo de origen y 250 MB finales. Si la fuente adecuada excede esos límites, la operación falla.
- Tiempo máximo de preparación: 12 minutos. Los archivos y los errores caducan a los 15 minutos de finalizar; la limpieza se ejecuta cada 30 segundos.
- La clave se mantiene en el campo de la página, no en almacenamiento persistente. Solo se guarda en el navegador el ID aleatorio del último trabajo. Al volver, introduce la clave y pulsa Conectar.
- Cada enlace de archivo contiene un secreto aleatorio; cualquiera que reciba ese enlace puede descargarlo mientras siga vigente. No lo compartas si el contenido es privado.
- Los archivos viven en almacenamiento temporal. Un reinicio borra el estado; no se garantiza recuperación tras reiniciar o redeplegar.
- Mantén actualizado yt-dlp: cambia su versión en `Dockerfile` y reconstruye el contenedor. Revisa sus notas antes de actualizar.
- Revisa los logs del backend para errores de acceso; nunca añadas cookies o claves al repositorio.

## Comprobaciones

```text
npm run check
npm test
```

Las pruebas cubren validación de enlaces, rechazo de solicitudes no autorizadas, creación y consulta de trabajos, cola llena, propagación de errores y entrega HTTP de un archivo de prueba protegido. No descargan videos reales ni comprueban los bloqueos de YouTube desde tu alojamiento.

### Antes de dar por terminada tu instalación

Comprueba desde la URL pública de Vercel: conexión con clave correcta, rechazo con clave incorrecta, descarga real de un MP3 y un MP4 autorizados, reproducción de ambos archivos y recuperación del estado después de recargar. Prueba también desde tu móvil. Una respuesta de salud correcta por sí sola no valida la descarga de YouTube.

## Referencias

- Límites de Vercel Functions: https://vercel.com/docs/functions/limitations
- Dependencias de yt-dlp: https://github.com/yt-dlp/yt-dlp#dependencies
- Imágenes oficiales de Deno: https://github.com/denoland/deno_docker
