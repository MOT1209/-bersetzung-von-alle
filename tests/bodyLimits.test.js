// tests/bodyLimits.test.js — البند D1: تعارض حدود الجسم
//
// routes-local-video يعلن MAX_BASE64 = 40MB، لكن express.json({limit:'2mb'})
// العام كان مُركَّبًا قبله في server.js، فيرفض أي جسم فوق 2mb قبل بلوغ المعالج:
// حدّ الـ40MB كود ميت والميزة مقيّدة عمليًا بـ2mb.
//
// الإثبات هنا: جسم أكبر من 2mb يصل إلى المعالج فيردّ برمز تحقّق من المجال
// (invalid-format / invalid-file) لا بـ413 من المحلل.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// عزل الحالة عن ملفات المشروع الحقيقية
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-body-'));
process.env.ENV_FILE = path.join(tmpDir, '.env');
process.env.CACHE_FILE = path.join(tmpDir, 'cache.json');
fs.writeFileSync(process.env.ENV_FILE, '');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const app = require('../server/server');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* تنظيف */ }
});

// ~3mb من base64 — فوق حدّ الـ2mb العام وتحت حدّ المسار
const BIG = 'A'.repeat(3 * 1024 * 1024);

test('POST /api/video-local: جسم ~3mb يتجاوز حدّ الـ2mb العام ويبلغ المعالج', async () => {
  const res = await fetch(`${baseUrl}/api/video-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'x.mp4', content: BIG }),
  });

  assert.notEqual(res.status, 413, 'المحلل العام رفض الجسم قبل بلوغ المعالج');
  // وصل المعالج: يردّ برمز من مجاله هو
  const body = await res.json().catch(() => ({}));
  assert.ok(
    ['invalid-format', 'invalid-file', 'audio-empty', 'video-too-long', 'server-error'].includes(body.error),
    `رمز غير متوقع: ${res.status} ${JSON.stringify(body)}`
  );
});

test('POST /api/translate-file: جسم ~3mb يبلغ المعالج كذلك (حد 15mb)', async () => {
  const res = await fetch(`${baseUrl}/api/translate-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'مجهول', content: BIG }),
  });
  assert.notEqual(res.status, 413);
  const body = await res.json().catch(() => ({}));
  assert.equal(body.error, 'invalid-format');
});

test('المسارات العادية تبقى محدودة بـ2mb → 413 input-too-large', async () => {
  const res = await fetch(`${baseUrl}/api/translate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: BIG }),
  });
  assert.equal(res.status, 413, 'حدّ الـ2mb العام يجب أن يبقى ساريًا على بقية المسارات');
  assert.deepEqual(await res.json(), { error: 'input-too-large' });
});

test('JSON تالف → 400 invalid-json لا 500', async () => {
  const res = await fetch(`${baseUrl}/api/translate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text": ',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid-json' });
});
