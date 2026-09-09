#!/usr/bin/env node
// scripts/disk-usage.js — مراقبة قرص /app/cache (الميزة 5 — اختياري)
//
// Render Starter: قرص 5GB يتقاسمه projects/ مع cache/ (قاعدة SQLite + ملفات
// التخزين). لو امتلأ، الدبلجة والتخزين يفشلان قبل أن يفشل الـ healthcheck —
// لذلك نحتاج إنذارًا مستقلًا لا ينتظر الامتلاء الكامل.
//
// الاستعمال:
//   node scripts/disk-usage.js                 # يطبع الحجم ويخرج 0
//   DISK_LIMIT_GB=4 node scripts/disk-usage.js # حد الإنذار (افتراضي 4 من 5)
//
// الخروج 1 عند تجاوز الحد — يصلح كخطوة cron أو كتحذير في السجلات على Render.
const fs = require('fs');
const path = require('path');

const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '..', 'cache');
// الافتراضي 4GB — قرص Render خمسة غيغابايت، أنذِر قبل الامتلاء بغيغابايت
// (?? لا ||: القيمة 0 صالحة كسقف — يجب أن تُحترم لا أن تسقط إلى الافتراضي)
const LIMIT_GB = Number(process.env.DISK_LIMIT_GB ?? 4);

function dirBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0; // المجلد غير موجود بعد = صفر استخدام
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirBytes(p);
    else {
      try { total += fs.statSync(p).size; } catch { /* محذوف أثناء العد — تجاهل */ }
    }
  }
  return total;
}

const bytes = dirBytes(CACHE_DIR);
const gb = bytes / 1024 ** 3;
const limitBytes = LIMIT_GB * 1024 ** 3;
const over = bytes > limitBytes;

// أكبر 3 مجلدات فرعية — يكشف المستنزف فورًا (projects عادةً)
let subDirs = [];
try {
  subDirs = fs.readdirSync(CACHE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, gb: dirBytes(path.join(CACHE_DIR, e.name)) / 1024 ** 3 }))
    .sort((a, b) => b.gb - a.gb)
    .slice(0, 3);
} catch { /* لا مجلد */ }

console.log(` القرص: ${CACHE_DIR}`);
console.log(` المستخدم: ${gb.toFixed(2)}GB / حد الإنذار ${LIMIT_GB}GB`);
for (const s of subDirs) console.log(`   ${s.name}: ${s.gb.toFixed(2)}GB`);
if (over) {
  console.error(`⚠ تجاوز حد الإنذار (${gb.toFixed(2)}GB > ${LIMIT_GB}GB) — نظّف projects/ أو ارفع حجم القرص`);
  process.exit(1);
}
console.log('✔ تحت الحد');
