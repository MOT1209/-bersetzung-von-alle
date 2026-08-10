// tests/rateLimitCoverage.test.js — البند E4: كل مسار مُعدِّل تحت حد طلبات
//
// الخلل الأصلي: app.use('/api/translate', limiter) لا يغطي '/api/translate-smart'
// لأن Express يطابق app.use على حدود المقاطع. سبعة مسارات كانت مكشوفة.
//
// الإثبات هنا: نستنزف خط الأساس المُركَّب على '/api' كاملًا، ثم نتحقق أن كل
// مسار مُعدِّل يُرجع 429. ووصول 429 قبل 400/401/503 يثبت أن الحد يسبق المعالج.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');

// حد منخفض حتى يسهل استنزافه، قبل require لـ config
process.env.RATE_LIMIT_MAX = '5';
process.env.RATE_LIMIT_MAX_HEAVY = '3';

// ملف .env مؤقت حتى لا يلمس الاختبار ملف المشروع
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-rl-'));
process.env.ENV_FILE = path.join(tmpDir, '.env');
fs.writeFileSync(process.env.ENV_FILE, 'GEMINI_API_KEY=abcdef1234567890\n');

const app = require('../server/server');
let server;
let baseUrl;

// المسارات المُعدِّلة الثلاثة عشر من جدول التدقيق
const MUTATING_ROUTES = [
  ['POST', '/api/settings'],
  ['POST', '/api/settings/rules'],
  ['DELETE', '/api/settings/rules/example.com'],
  ['POST', '/api/translate'],
  ['POST', '/api/translate-text'],
  ['POST', '/api/translate-smart'],
  ['POST', '/api/srt'],
  ['POST', '/api/translate-file'],
  ['POST', '/api/export'],
  ['POST', '/api/tts'],
  ['POST', '/api/tashkeel'],
  ['POST', '/api/video-local'],
  ['POST', '/api/ocr'],
];

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // استنزاف خط الأساس (5 طلبات/دقيقة/IP) عبر مسار غير مُعدِّل
  for (let i = 0; i < 8; i++) {
    await fetch(`${baseUrl}/api/health`);
  }
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // تجاهل — التنظيف فقط
  }
});

for (const [method, route] of MUTATING_ROUTES) {
  test(`${method} ${route} → 429 بعد تجاوز الحد`, async () => {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify({}),
    });
    assert.equal(res.status, 429, `${route} أفلت من حد الطلبات`);
    assert.deepEqual(await res.json(), { error: 'rate-limited' });
    assert.ok(res.headers.get('retry-after'), 'ترويسة Retry-After مفقودة');
  });
}
