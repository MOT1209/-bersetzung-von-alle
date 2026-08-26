// tests/smart.test.js — اختبارات الترجمة الذكية (/api/translate-smart) + حدود الحجم
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

// نعطّل مفتاح Gemini في كائن الإعدادات المشترك (routes-translate يقرأ config عند الطلب)
const config = require('../server/config');
config.GEMINI_API_KEY = '';

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
});

test('POST /api/translate-smart بلا مفتاح → 503 smart-unavailable', async () => {
  const res = await fetch(`${baseUrl}/api/translate-smart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello world', targetLang: 'ar' }),
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'smart-unavailable');
});

test('POST /api/translate-smart بنص فارغ → 400 invalid-text', async () => {
  const res = await fetch(`${baseUrl}/api/translate-smart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/translate-text بنص ضخم → 413 input-too-large', async () => {
  const big = 'x'.repeat(200001);
  const res = await fetch(`${baseUrl}/api/translate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: big, targetLang: 'ar' }),
  });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.error, 'input-too-large');
});

test('POST /api/translate برابط طويل جدًا → 413 input-too-large', async () => {
  const url = 'https://example.com/' + 'a'.repeat(2100);
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, targetLang: 'ar' }),
  });
  assert.equal(res.status, 413);
});
