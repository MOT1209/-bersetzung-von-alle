// tests/settings.test.js — اختبارات قراءة/حفظ إعدادات .env
// ملاحظة مهمة: نستخدم ENV_FILE → ملف مؤقت في tmpdir (لا نلمس .env الحقيقي أبدًا)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');

// ===== إعداد: ملف مؤقت قبل أي require حتى يستخدمه envSettings.js =====
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-settings-'));
const tmpEnv = path.join(tmpDir, '.env');
process.env.ENV_FILE = tmpEnv;

// محتوى مبدئي للملف المؤقت (يحاكي .env حقيقي)
const INITIAL = [
  'GEMINI_API_KEY=abcdef1234567890',
  'MYMEMORY_EMAIL=test@example.com',
  'LIBRE_URL=https://libretranslate.example.com',
].join('\n') + '\n';
fs.writeFileSync(tmpEnv, INITIAL);

const { getSettings, saveSettings } = require('../server/envSettings');
const config = require('../server/config');

// ===== خادم HTTP للتحقق من نقطة API /api/settings =====
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
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // تجاهل — التنظيف فقط
  }
});

// ===== getSettings =====

test('getSettings: يعيد المفتاح مقنّعًا ولا يكشفه كاملاً', async () => {
  const s = await getSettings();
  assert.equal(s.hasGeminiKey, true);
  assert.ok(s.geminiKey.startsWith('abcdef'), `المقنّع: ${s.geminiKey}`);
  assert.ok(s.geminiKey.endsWith('...'));
  assert.ok(!s.geminiKey.includes('1234567890'), 'لا يجوز ظهور بقية المفتاح في الرد');
  assert.equal(s.myMemoryEmail, 'test@example.com');
  assert.ok(/^https?:/.test(s.libreUrl));
  assert.ok(Number.isFinite(s.rateLimitMax));
});

test('getSettings: عند غياب المفتاح hasGeminiKey=false', async () => {
  // ملف فارغ مؤقتًا لاختبار حالة عدم وجود مفتاح
  const emptyEnv = path.join(tmpDir, 'empty.env');
  const oldEnv = process.env.ENV_FILE;
  process.env.ENV_FILE = emptyEnv;
  fs.writeFileSync(emptyEnv, '');
  try {
    const { getSettings: gs } = require('../server/envSettings');
    const s = await gs();
    assert.equal(s.hasGeminiKey, false);
    assert.equal(s.geminiKey, '');
  } finally {
    process.env.ENV_FILE = oldEnv;
    fs.rmSync(emptyEnv, { force: true });
  }
});

// ===== saveSettings =====

test('saveSettings: يكتب الملف ويطبّق فورًا على config و process.env (بدون إعادة تشغيل)', async () => {
  const res = await saveSettings({ GEMINI_API_KEY: 'newkey1234567890' });
  assert.deepEqual(res, { ok: true });

  // التطبيق الفوري
  assert.equal(config.GEMINI_API_KEY, 'newkey1234567890');
  assert.equal(process.env.GEMINI_API_KEY, 'newkey1234567890');

  // الملف حُدّث فعلاً
  const fileContent = fs.readFileSync(tmpEnv, 'utf8');
  assert.ok(fileContent.includes('GEMINI_API_KEY=newkey1234567890'), fileContent);

  // القراءة تعيد المفتاح الجديد مقنّعًا
  const s = await getSettings();
  assert.equal(s.geminiKey, 'newkey...');
});

test('saveSettings: مفتاح فارغ لا يمسح القديم', async () => {
  await saveSettings({ GEMINI_API_KEY: '' });
  assert.equal(config.GEMINI_API_KEY, 'newkey1234567890', 'يجب أن يبقى المفتاح القديم كما هو');
  const s = await getSettings();
  assert.equal(s.hasGeminiKey, true);
});

test('saveSettings: يحدّث MYMEMORY_EMAIL و LIBRE_URL', async () => {
  await saveSettings({
    MYMEMORY_EMAIL: 'new@example.com',
    LIBRE_URL: 'https://new.example.com/translate',
  });
  assert.equal(config.MYMEMORY_EMAIL, 'new@example.com');
  assert.equal(config.LIBRE_URL, 'https://new.example.com/translate');
  const fileContent = fs.readFileSync(tmpEnv, 'utf8');
  assert.ok(fileContent.includes('MYMEMORY_EMAIL=new@example.com'));
  assert.ok(fileContent.includes('LIBRE_URL=https://new.example.com/translate'));
});

test('saveSettings: يرفض حقن أسطر جديدة في القيمة (invalid-settings)', async () => {
  await assert.rejects(
    saveSettings({ GEMINI_API_KEY: 'abc\nPORT=1234' }),
    (e) => e.code === 'invalid-settings'
  );
});

test('saveSettings: يرفض جسمًا غير صالح (invalid-settings)', async () => {
  await assert.rejects(saveSettings(null), (e) => e.code === 'invalid-settings');
  await assert.rejects(saveSettings('text'), (e) => e.code === 'invalid-settings');
  await assert.rejects(saveSettings(['array']), (e) => e.code === 'invalid-settings');
});

// ===== نقطة API عبر HTTP =====

test('GET /api/settings → 200 مع إعدادات مقنّعة', async () => {
  const res = await fetch(`${baseUrl}/api/settings`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.hasGeminiKey, 'boolean');
  assert.ok(!body.geminiKey || body.geminiKey.endsWith('...'));
  assert.ok('myMemoryEmail' in body && 'libreUrl' in body);
});

test('POST /api/settings → 200 { ok: true } ويطبّق فورًا', async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ GEMINI_API_KEY: 'httpkey123456' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true });
  assert.equal(config.GEMINI_API_KEY, 'httpkey123456');
});

test('POST /api/settings بجسم غير صالح → 400 invalid-settings', async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ GEMINI_API_KEY: 'bad\nvalue' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'invalid-settings');
});
