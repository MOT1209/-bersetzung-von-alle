# AraLink — صورة Docker للإنتاج (نشر على Render/Railway/أي سحابة)
FROM node:22-slim

# أدوات النظام: ffmpeg للصوت + python3/yt-dlp لتنزيل فيديوهات يوتيوب
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip curl ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    # تحقّق وقت البناء: لو تغيّر مسار التثبيت يفشل البناء هنا بوضوح
    # بدل أن يفشل كل مسار يوتيوب وقت التشغيل بـ ENOENT غامض
    && /usr/local/bin/yt-dlp --version

WORKDIR /app

# تثبيت الاعتماديات أولاً (استفادة من كاش الطبقات)
COPY package*.json ./
# YOUTUBE_DL_SKIP_DOWNLOAD: postinstall الخاص بـ youtube-dl-exec ينزّل الثنائي من
# GitHub API (60 طلبًا/ساعة لكل IP بلا مصادقة)، وعلى بنية Render بعناوين IP مشتركة
# يفشل البناء بشكل متقطّع. الصورة تستخدم yt-dlp المثبَّت عبر pip3 أعلاه عبر
# YTDLP_PATH، فلا حاجة إلى الثنائي المنزَّل.
#
# تنبيه: لا تستخدم --omit=optional هنا. جرّبتُه فأسقط onnxruntime-node (اعتمادية
# اختيارية لـ @xenova/transformers) فتوقّف الخادم عن الإقلاع أصلًا داخل الحاوية.
# العلم يسقط كل الاختياريات في الشجرة لا youtube-dl-exec وحده.
RUN if [ -f package-lock.json ]; then YOUTUBE_DL_SKIP_DOWNLOAD=true npm ci --omit=dev; else YOUTUBE_DL_SKIP_DOWNLOAD=true npm install --omit=dev; fi

# بقية الكود
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    STT_ENGINE=sherpa \
    YTDLP_PATH=/usr/local/bin/yt-dlp

# الكاش والنماذج تعيش خارج الكود (تُسحب كوحدة تخزين عند التشغيل)
VOLUME /app/cache

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server/server.js"]
