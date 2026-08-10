// tests/api.test.js — اختبارات تكامل لواجهة API (بدون مكتبات: node:test + fetch مدمج)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

// رفع حدود الطلبات قبل تحميل الإعدادات حتى لا تتأثر الاختبارات بحد 20/دقيقة/IP
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const app = require('../server/server');

let server;
let baseUrl;

before(async () => {
  // منفذ عشوائي — نطلب من الخادم الاستماع يدويًا بدل تشغيله كعملية مستقلة
  server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

test('GET /api/health → 200', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('GET /api/languages → 200 مع 100+ لغة', async () => {
  const res = await fetch(`${baseUrl}/api/languages`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.languages));
  assert.ok(body.languages.length >= 100, `العدد الفعلي: ${body.languages.length}`);
});

test('POST /api/translate-text → 200 أو 502 (اعتمادًا على توفر محركات الترجمة)', async () => {
  const res = await fetch(`${baseUrl}/api/translate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello from the unit tests', targetLang: 'ar' }),
  });
  if (res.status === 200) {
    const body = await res.json();
    assert.equal(body.type, 'text');
    assert.ok(body.translated && body.translated.trim().length > 0, 'الترجمة يجب ألا تكون فارغة عند النجاح');
  } else {
    // كل المحركات فشلت (حجب/انقطاع شبكة) — مسار الخطأ: 502 مع رمز صحيح
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'translate-failed');
  }
});

test('POST /api/translate بدون url → 400 invalid-url', async () => {
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'invalid-url');
});

test('POST /api/translate برابط غير HTTP → 400 invalid-url', async () => {
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'not-a-url', targetLang: 'ar' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'invalid-url');
});

test('POST /api/translate بعنوان داخلي → 400 blocked-url (حماية SSRF)', async () => {
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1:3999', targetLang: 'ar' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'blocked-url');
});

test('POST /api/translate برابط مكسور → 400/422 مع رمز خطأ منطقي', async () => {
  // TLD .invalid محجوز دوليًا ولا يُحل أبدًا → DNS يفشل → invalid-url
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://aralink-nonexistent.invalid/', targetLang: 'ar' }),
  });
  assert.ok([400, 422].includes(res.status), `حالة غير متوقعة: ${res.status}`);
  const body = await res.json();
  assert.ok(['invalid-url', 'fetch-failed'].includes(body.error), `رمز خطأ غير منطقي: ${body.error}`);
});
