// tests/settingsAuth.test.js — حماية /api/settings بـ ADMIN_TOKEN (تعطيل افتراضي + مقارنة ثابتة الزمن)
// يعمل في عملية منفصلة (node --test) فيُعدّ ADMIN_TOKEN محلياً.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-settings-auth-'));
const tmpEnv = path.join(tmpDir, '.env');
process.env.ENV_FILE = tmpEnv;
fs.writeFileSync(tmpEnv, 'GEMINI_API_KEY=initial\n');

// حدود مرتفعة قبل require لـ config — وإلا استنزفت اختبارات المصادقة heavyLimiter
// (10 طلبات/دقيقة) وعادت بـ 429 بدل رمز المصادقة المتوقَّع.
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

// ===== الحالة 1: بلا ADMIN_TOKEN → المسار معطّل بالكامل (503) =====
// تأكد أن require يحدث هنا بينما ADMIN_TOKEN غير مضبوط.
delete process.env.ADMIN_TOKEN;
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
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* تجاهل */ }
});

// نضمن أن ADMIN_TOKEN لا يزال فارغًا قبل هذه الاختبارات
test('GET /api/settings بدون ADMIN_TOKEN → 503 settings-disabled (الوضع الآمن الافتراضي)', async () => {
  assert.equal(process.env.ADMIN_TOKEN || '', '', 'ADMIN_TOKEN يجب أن يكون فارغًا في هذه المرحلة');
  const res = await fetch(`${baseUrl}/api/settings`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'settings-disabled');
});

test('POST /api/settings بدون ADMIN_TOKEN → 503 حتى مع x-admin-token', async () => {
  assert.equal(process.env.ADMIN_TOKEN || '', '', 'ADMIN_TOKEN يجب أن يكون فارغًا في هذه المرحلة');
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'whatever' },
    body: JSON.stringify({ GEMINI_API_KEY: 'x' }),
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'settings-disabled');
});

// ===== الحالة 2: ADMIN_TOKEN مضبوط → يتطلب توكنًا صحيحًا =====
// requireAdmin يقرأ process.env.ADMIN_TOKEN عند كل طلب، فيكفي ضبطه الآن
const ADMIN = 'settings-admin-test-key';
test('GET /api/settings بعد تفعيل ADMIN_TOKEN → 401 بدون توكن', async () => {
  process.env.ADMIN_TOKEN = ADMIN;
  const res = await fetch(`${baseUrl}/api/settings`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthorized');
});

test('POST /api/settings بتوكن خاطئ → 401 unauthorized', async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'wrong-key' },
    body: JSON.stringify({ GEMINI_API_KEY: 'should-not-apply' }),
  });
  assert.equal(res.status, 401);
});

// توكن بنفس طول الصحيح — يمرّ عبر crypto.timingSafeEqual لا عبر فحص الطول،
// فيغطي المسار الذي كان فحص الطول وحده سيخفيه
test('POST /api/settings بتوكن خاطئ بنفس الطول → 401 unauthorized', async () => {
  const wrong = 'X'.repeat(ADMIN.length);
  assert.equal(wrong.length, ADMIN.length);
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': wrong },
    body: JSON.stringify({ GEMINI_API_KEY: 'should-not-apply' }),
  });
  assert.equal(res.status, 401);
});

test('الرفض لا يكتب في .env', async () => {
  // كل المحاولات الفاشلة أعلاه يجب ألا تكون قد لمست الملف
  assert.match(fs.readFileSync(tmpEnv, 'utf8'), /GEMINI_API_KEY=initial/);
});

// ===== فصل الصلاحيات: مفتاح حصص الطلاب ليس رمزًا إداريًا =====
test('ARALINK_API_KEY لا يفتح /api/settings', async () => {
  const saved = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  process.env.ARALINK_API_KEY = 'student-quota-key';
  try {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'student-quota-key' },
      body: JSON.stringify({ OPENAI_BASE_URL: 'https://evil.example' }),
    });
    assert.equal(res.status, 503, 'مفتاح الحصص يجب ألا يمنح صلاحية الكتابة في .env');
  } finally {
    delete process.env.ARALINK_API_KEY;
    process.env.ADMIN_TOKEN = saved;
  }
});

// ===== مسارات القواعد محمية كذلك =====
test('POST /api/settings/rules بدون توكن → 401', async () => {
  const res = await fetch(`${baseUrl}/api/settings/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'evil.example', contentSelectors: ['body'] }),
  });
  assert.equal(res.status, 401);
});

test('DELETE /api/settings/rules/:domain بدون توكن → 401', async () => {
  const res = await fetch(`${baseUrl}/api/settings/rules/evil.example`, { method: 'DELETE' });
  assert.equal(res.status, 401);
});

// ===== المسار الناجح (أخيرًا — لأنه وحده يكتب فعلًا في الملف) =====
test('POST /api/settings بالتوكن الصحيح → 200 ويُطبّق الإعداد', async () => {
  const config = require('../server/config');
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN },
    body: JSON.stringify({ GEMINI_API_KEY: 'admin-passed-key' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true });
  // التطبيق الفوري + الكتابة الفعلية
  assert.equal(config.GEMINI_API_KEY, 'admin-passed-key');
  assert.match(fs.readFileSync(tmpEnv, 'utf8'), /GEMINI_API_KEY=admin-passed-key/);
});

test('GET /api/settings بالتوكن الصحيح → 200', async () => {
  const res = await fetch(`${baseUrl}/api/settings`, { headers: { 'x-admin-token': ADMIN } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.hasGeminiKey, 'boolean');
});