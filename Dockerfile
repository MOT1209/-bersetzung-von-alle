# AraLink — صورة Docker للإنتاج (نشر على Render/Railway/أي سحابة)
FROM node:22-slim

# أدوات النظام: ffmpeg للصوت + python3/yt-dlp لتنزيل فيديوهات يوتيوب
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip curl ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# تثبيت الاعتماديات أولاً (استفادة من كاش الطبقات)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# بقية الكود
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    STT_ENGINE=sherpa

# الكاش والنماذج تعيش خارج الكود (تُسحب كوحدة تخزين عند التشغيل)
VOLUME /app/cache

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server/server.js"]
