// tests/apiKey.test.js — مفتاح API الاختياري: الطلبات الموقّعة تحصل على حد أعلى
const { test } = require('node:test');
const assert = require('node:assert/strict');

// مفتاح وهمي — هذا الاختبار يعمل في عملية منفصلة عن بقية الاختبارات
process.env.ARALINK_API_KEY = 'test-secret-key';

const { createRateLimiter } = require('../server/server');

// طلب وهمي مصغّر (يحتاجه الوسيط فقط)
function fakeReq(headers = {}, query = {}) {
  return { headers, query, ip: '1.2.3.4', socket: { remoteAddress: '1.2.3.4' } };
}

function call(limiter, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve({ statusCode: this.statusCode, body }); return this; },
      setHeader() { return this; },
    };
    limiter(req, res, () => resolve({ ok: true }));
  });
}

test('بدون مفتاح: يتجاوز الحد بعد max طلبات (429)', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
  for (let i = 0; i < 3; i++) {
    const r = await call(limiter, fakeReq());
    assert.ok(r.ok, `الطلب ${i + 1} يجب أن يمر`);
  }
  const r4 = await call(limiter, fakeReq());
  assert.equal(r4.statusCode, 429);
  assert.equal(r4.body.error, 'rate-limited');
});

test('المفتاح الصحيح يرفع الحد إلى max×3', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
  for (let i = 0; i < 9; i++) {
    const r = await call(limiter, fakeReq({ 'x-api-key': 'test-secret-key' }));
    assert.ok(r.ok, `الطلب الموقّع ${i + 1} يجب أن يمر (حد 9)`);
  }
  const r10 = await call(limiter, fakeReq({ 'x-api-key': 'test-secret-key' }));
  assert.equal(r10.statusCode, 429);
});

test('المفتاح الخاطئ لا يرفع الحد', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
  for (let i = 0; i < 3; i++) await call(limiter, fakeReq({ 'x-api-key': 'wrong' }));
  const r4 = await call(limiter, fakeReq({ 'x-api-key': 'wrong' }));
  assert.equal(r4.statusCode, 429);
});

test('المفتاح عبر ?api_key= يعمل أيضًا', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
  for (let i = 0; i < 6; i++) {
    const r = await call(limiter, fakeReq({}, { api_key: 'test-secret-key' }));
    assert.ok(r.ok, `طلب ?api_key=${i + 1} يجب أن يمر`);
  }
  const r7 = await call(limiter, fakeReq({}, { api_key: 'test-secret-key' }));
  assert.equal(r7.statusCode, 429);
});
