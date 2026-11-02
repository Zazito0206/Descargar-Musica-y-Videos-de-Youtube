FROM denoland/deno:bin-2.9.7 AS deno
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
RUN python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.10.26'
ENV PATH="/opt/ytdlp/bin:${PATH}" PORT=8080 NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node api ./api
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
RUN mkdir downloads && chown node:node downloads
USER node
EXPOSE 8080
CMD ["node", "backend/server.js"]
