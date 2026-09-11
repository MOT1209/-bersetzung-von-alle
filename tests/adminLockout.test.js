// tests/adminLockout.test.js — قفل الأدمن يفشل مغلقًا (fail-closed)
//
// كان أي خطأ في مخزن العدّادات يسمح بمحاولة الدخول بلا قفل (fail-open):
// مع REDIS_URL في الإنتاج، انقطاع Redis يعطّل القفل ويفتح الباب لتخمين
// ADMIN_TOKEN. الآن خطأ المخزن ⇒ ‏503 للمسار الإداري (لا 429 ولا سماح).
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.RATE_LIMIT_MAX = '10000';
process.env.RATE_LIMIT_MAX_HEAVY = '10000';

const { checkLoginLock } = require('../server/server');
const { createStore } = require('../server/store');

const req = (ip) => ({ ip });

test('خطأ المخزن ⇒ storeError (يفشل مغلقًا لا مفتوحًا)', async () => {
  const throwing = {
    incr: async () => { throw new Error('redis down'); },
    reset: async () => {},
  };
  const lock = await checkLoginLock(req('10.0.0.1'), throwing);
  assert.deepEqual(lock, { storeError: true });
});

test('العدّاد السليم: 4 محاولات تمرّ والخامسة تُقفل (نافذة 60 ثانية)', async () => {
  const store = createStore();
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(await checkLoginLock(req('10.0.0.2'), store), null, `المحاولة ${i + 1} قُفلت مبكرًا`);
    }
    const locked = await checkLoginLock(req('10.0.0.2'), store);
    assert.ok(locked && typeof locked.retryAfter === 'number', 'المحاولة الخامسة لم تُقفل');
    assert.ok(locked.retryAfter >= 1 && locked.retryAfter <= 60, `Retry-After خارج النافذة: ${locked.retryAfter}`);
  } finally {
    await store.close();
  }
});

test('القفل لكل IP وحده — IP آخر لا يتأثر', async () => {
  const store = createStore();
  try {
    for (let i = 0; i < 5; i++) await checkLoginLock(req('10.0.0.3'), store);
    assert.ok(await checkLoginLock(req('10.0.0.3'), store), 'المهاجم لم يُقفل');
    assert.equal(await checkLoginLock(req('10.0.0.9'), store), null, 'بريء قُفل مع المهاجم');
  } finally {
    await store.close();
  }
});
