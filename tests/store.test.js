// tests/store.test.js — طبقة التخزين (server/store.js) — مُشغّل الذاكرة بلا شبكة
const { test } = require('node:test');
const assert = require('node:assert/strict');

// لا REDIS_URL → مُشغّل الذاكرة
delete process.env.REDIS_URL;
const { createStore } = require('../server/store');

test('incr: يزيد العدّاد ويعيد count + resetAt', async () => {
  const s = createStore();
  const a = await s.incr('ip1', 60000);
  assert.equal(a.count, 1);
  assert.ok(a.resetAt > Date.now());
  const b = await s.incr('ip1', 60000);
  assert.equal(b.count, 2);
  assert.equal(b.resetAt, a.resetAt); // نفس النافذة
  await s.close();
});

test('incr: مفاتيح مختلفة معزولة', async () => {
  const s = createStore();
  await s.incr('x', 60000);
  await s.incr('x', 60000);
  const y = await s.incr('y', 60000);
  assert.equal(y.count, 1);
  await s.close();
});

test('متجران مستقلان لا يتقاسمان العدّادات', async () => {
  const s1 = createStore();
  const s2 = createStore();
  await s1.incr('same', 60000);
  await s1.incr('same', 60000);
  const r = await s2.incr('same', 60000);
  assert.equal(r.count, 1);
  await s1.close();
  await s2.close();
});

test('النافذة تنتهي: العدّاد يبدأ من جديد بعد resetAt', async () => {
  const s = createStore();
  const a = await s.incr('k', 30); // نافذة 30ms
  assert.equal(a.count, 1);
  await new Promise((r) => setTimeout(r, 45));
  const b = await s.incr('k', 30);
  assert.equal(b.count, 1, 'يجب أن يبدأ العدّاد من 1 بعد انتهاء النافذة');
  assert.ok(b.resetAt > a.resetAt);
  await s.close();
});

test('reset(key) يمسح مفتاحًا واحدًا؛ reset() يمسح الكل', async () => {
  const s = createStore();
  await s.incr('a', 60000);
  await s.incr('b', 60000);
  await s.reset('a');
  assert.equal((await s.incr('a', 60000)).count, 1);
  assert.equal((await s.incr('b', 60000)).count, 2);
  await s.reset();
  assert.equal((await s.incr('b', 60000)).count, 1);
  await s.close();
});

test('kind = memory بلا REDIS_URL', () => {
  assert.equal(createStore().kind, 'memory');
});
