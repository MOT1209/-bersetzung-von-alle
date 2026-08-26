// tests/usage.test.js — اختبارات عدّاد الاستخدام (usage.js) + نقطة /api/stats
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ملف عدّاد مؤقت + حدود عالية حتى لا تتأثر بحد الطلبات
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-usage-'));
process.env.USAGE_FILE = path.join(tmpDir, 'usage.json');
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const { trackUsage, getUsage } = require('../server/usage');
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
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const tseq = { concurrency: false };
test('trackUsage: يزداد العداد وأنواع اللغات', tseq, async () => {
  await trackUsage({ type: 'article', sourceLang: 'en', targetLang: 'ar' });
  await trackUsage({ type: 'youtube', sourceLang: 'en', targetLang: 'ar' });
  await trackUsage({ type: 'text', sourceLang: 'fr', targetLang: 'ar' });
  const u = await getUsage();
  assert.equal(u.total, 3);
  assert.equal(u.byType.article, 1);
  assert.equal(u.byType.youtube, 1);
  assert.equal(u.byTarget.ar, 3);
  assert.equal(u.bySource.fr, 1);
});

test('trackUsage: يتجاهل القيم الناقصة بأمان', tseq, async () => {
  await trackUsage(); // بدون معاملات — لا يكسر
  const u = await getUsage();
  assert.equal(u.total, 4);
  assert.equal(u.byType.unknown, 1);
});

test('GET /api/stats → يعيد العدّاد', tseq, async () => {
  const res = await fetch(`${baseUrl}/api/stats`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 4);
});

test('getUsage: ملف مفقود → عدّاد فارغ بدون خطأ', tseq, async () => {
  const empty = path.join(tmpDir, 'nope.json');
  const old = process.env.USAGE_FILE;
  process.env.USAGE_FILE = empty;
  try {
    const u = await getUsage();
    assert.equal(u.total, 0);
    assert.deepEqual(u.byType, {});
  } finally {
    process.env.USAGE_FILE = old;
  }
});
