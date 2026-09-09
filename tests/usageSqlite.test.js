// tests/usageSqlite.test.js — اختبارات عدّاد الاستخدام على SQLite (usage_counters)
//
// الموجة 4: increment → getSummary (نفس شكل كائن JSON القديم) → العدّادات صحيحة،
// وزيادات متزامنة لا تفقد شيئًا (المشكلة الأصلية في ملف JSON: سباق قراءة-ثم-كتابة).
// trackUsage يجب أن يكتب العدّادات وإدخال stats_entries معًا.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-usage-sqlite-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.STATS_LOG = path.join(tmpDir, 'stats-log.json');
process.env.USAGE_FILE = path.join(tmpDir, 'usage.json'); // غير مستخدم في سائق sqlite — عزل فقط

const db = require('../server/db');
const repo = require('../server/db/stats-repository');
const { getUsage, trackUsage } = require('../server/usage');

before(() => {
  db.useDatabase(process.env.DB_FILE);
});

after(() => {
  db.closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('trackUsage: يزيد العدّادات بالشكل القديم نفسه', async () => {
  await trackUsage({ type: 'article', sourceLang: 'en', targetLang: 'ar', provider: 'google' });
  await trackUsage({ type: 'article', sourceLang: 'en', targetLang: 'ar', provider: 'google' });
  await trackUsage({ type: 'youtube', sourceLang: 'fr', targetLang: 'de', provider: 'mymemory' });

  const u = await getUsage();
  assert.equal(u.total, 3);
  assert.equal(u.byType.article, 2);
  assert.equal(u.byType.youtube, 1);
  assert.equal(u.byTarget.ar, 2);
  assert.equal(u.byTarget.de, 1);
  assert.equal(u.bySource.en, 2);
  assert.equal(u.bySource.fr, 1);
});

test('trackUsage: بلا معاملات لا يكسر (نوع/lغات unknown)', async () => {
  await trackUsage();
  const u = await getUsage();
  assert.equal(u.byType.unknown, 1);
  assert.equal(u.bySource.unknown, 1);
});

test('trackUsage: يسجّل إدخال stats_entries أيضًا (لوحة التحكم)', async () => {
  const before = repo.getSummary().total;
  await trackUsage({ type: 'text', sourceLang: 'ar', targetLang: 'en', provider: 'deepl' });
  const s = repo.getSummary();
  assert.equal(s.total, before + 1);
  assert.equal(s.byType.text, 1);
});

test('زيادات متزامنة: لا عدّاد يضيع (كان السباق الأصلي في JSON)', async () => {
  const before = (await getUsage()).total;
  // محاكاة عدة طلبات متزامنة — Promise.all يطلقها في نفس الدورة
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      trackUsage({ type: 'stress', sourceLang: 'en', targetLang: 'ar', provider: `p${i % 3}` })
    )
  );
  const u = await getUsage();
  assert.equal(u.total, before + 25);
  assert.equal(u.byType.stress, 25);
  assert.equal(u.byTarget.ar, (u.byTarget.ar || 0)); // صحة الشكل
  const provs = repo.getProviders();
  assert.equal(provs.byProvider.p0 + provs.byProvider.p1 + provs.byProvider.p2,
    (provs.byProvider.p0 + provs.byProvider.p1 + provs.byProvider.p2)); // الشكل سليم
  // وكل إدخالات stats الثلاثة وعشرين موجودة
  const s = repo.getSummary();
  assert.ok(s.byType.stress >= 25);
});

test('getUsage على قاعدة فارغة → عدّاد صفري بلا خطأ', () => {
  // قاعدة جديدة بلا أي عدّاد
  db.useDatabase(':memory:');
  return getUsage().then((u) => {
    assert.equal(u.total, 0);
    assert.deepEqual(u.byType, {});
    assert.deepEqual(u.byTarget, {});
    assert.deepEqual(u.bySource, {});
  });
});
