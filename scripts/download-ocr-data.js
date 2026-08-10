// scripts/download-ocr-data.js — تحميل ملفات traineddata الخاصة بـ tesseract.js مرة واحدة
// الاستخدام: npm run download:ocr
// يكتب: server/ocr/traineddata/{ara,eng}.traineddata.gz — لا يُحتاج شبكة بعد ذلك
// يطبع الحجم النهائي لكل ملف؛ exit 1 عند أي فشل
const fs = require('fs');
const path = require('path');

const BASE = 'https://tessdata.projectnaptha.com/4.0.0/';
const FILES = ['ara.traineddata.gz', 'eng.traineddata.gz'];
const DEST_DIR = path.join(__dirname, '..', 'server', 'ocr', 'traineddata');

// تحميل ملف واحد عبر fetch (Node 18+) وكتابته على القرص
async function download(name) {
  const url = BASE + name;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} لـ ${name} (${url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(DEST_DIR, name), buf);
  return { name, size: buf.length };
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  for (const name of FILES) {
    const { size } = await download(name);
    console.log(`${name}: ${size} bytes`);
  }
}

main().catch((e) => {
  console.error('فشل تحميل traineddata:', e.message);
  process.exit(1);
});
