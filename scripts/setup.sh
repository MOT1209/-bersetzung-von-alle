#!/usr/bin/env bash
# Bootstrap AraLink: install deps, prepare .env, start the server.
set -e
cd "$(dirname "$0")/.."

if [ ! -f package.json ]; then
  echo "❌ package.json غير موجود — نفّذ المواصفة specs/translation-tool أولًا (الموجة 1) لإنشاء مشروع الخادم."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || echo "# PORT=3000
GEMINI_API_KEY=" > .env
  echo "✅ تم إنشاء .env من القالب"
fi

echo "📦 تثبيت الاعتماديات..."
npm install

echo "🚀 التشغيل على http://localhost:3000"
npm run dev
