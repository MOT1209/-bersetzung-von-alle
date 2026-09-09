// tests/statsSqlite.test.js — اختبارات سائق SQLite للإحصائيات (stats_entries)
//
// يغطي الموجة 4 من خطة نقل stats/usage إلى SQLite:
//   - إدراج إدخالات واستعلام Summary/Timeseries/Providers/Languages/Hourly عبر SQL
//   - pruneEntries يحذف الأقدم فوق السقف (سلوك سائق JSON القديم: آخر 10,000)
//   - logEntry عبر stats.js يكتب في SQLite
//   - السائق JSON يبقى بديلًا صالحًا للتراجع (STATS_DRIVER=json)
//
// كل ملف اختبار يعمل في عملية منفصلة — إعداد DB_FILE هنا لا يلوث بقية الاختبارات.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// قاعدة معزولة في مجلد مؤقت — لا نلمس cache/aralink.db الحقيقي
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-stats-sqlite-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.STATS_LOG = path.join(tmpDir, 'stats-log.json'); // لاختبار سائق JSON أدناه
process.env.USAGE_FILE = path.join(tmpDir, 'usage.json');

const db = require('../server/db');
const repo = require('../server/db/stats-repository');
const config = require('../server/config');
const stats = require('../server/stats');

before(() => {
  db.useDatabase(process.env.DB_FILE);
});

after(() => {
  db.closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('getSummary: الإجمالي واليوم والأسبوع والتوزيع حسب النوع', () => {
  repo.insertEntry({ type: 'article', sourceLang: 'en', targetLang: 'ar', provider: 'google' });
  repo.insertEntry({ type: 'youtube', sourceLang: 'en', targetLang: 'ar', provider: 'google' });
  repo.insertEntry({ type: 'article', sourceLang: 'fr', targetLang: 'de', provider: 'mymemory' });

  const s = repo.getSummary();
  assert.equal(s.total, 3);
  // كل الإدخالات أُنشئت الآن → اليوم والأسبوع يشملانها كلها
  assert.equal(s.todayCount, 3);
  assert.equal(s.weekCount, 3);
  assert.equal(s.byType.article, 2);
  assert.equal(s.byType.youtube, 1);
});

test('getTimeseries: صف لكل يوم من آخر N يوم والعدّ في يومه الصحيح', () => {
  repo.insertEntry({ type: 'text', sourceLang: 'en', targetLang: 'ar' });
  const { days } = repo.getTimeseries(7);
  assert.equal(days.length, 7);
  // تواريخ مرتبة تصاعديًا وآخر صف هو اليوم
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(days[days.length - 1].date, today);
  // 3 من اختبار summary + 1 هنا — كله اليوم (UTC، متسق مع حدود التجميع)
  assert.ok(days[days.length - 1].count >= 1);
  // لا سالب ولا undefined في أي صف
  for (const d of days) assert.ok(Number.isInteger(d.count) && d.count >= 0);
});

test('getTimeseries: يقيّد الأيام إلى 30 كحد أقصى', () => {
  assert.equal(repo.getTimeseries(500).days.length, 30);
  assert.equal(repo.getTimeseries(0).days.length, 7); // قيمة غير صالحة → الافتراضي
});

test('getProviders وgetLanguages: التوزيع يطابق الإدخالات', () => {
  const prov = repo.getProviders();
  assert.equal(prov.byProvider.google, 2);
  assert.equal(prov.byProvider.mymemory, 1);

  const langs = repo.getLanguages();
  // 3 إدخالات en: اثنان من اختبار summary + واحد من اختبار timeseries
  assert.equal(langs.bySource.en, 3);
  assert.equal(langs.bySource.fr, 1);
  // 3 إدخالات ar: اثنان من summary + واحد من timeseries
  assert.equal(langs.byTarget.ar, 3);
  assert.equal(langs.byTarget.de, 1);
});

test('getHourly: العدّ في ساعة الخادم المحلية (سلوك JSON القديم)', () => {
  const { hours } = repo.getHourly();
  assert.equal(hours.length, 24);
  const sum = hours.reduce((a, b) => a + b, 0);
  assert.equal(sum, repo.getSummary().total);
});

test('pruneEntries: يحذف الأقدم فوق السقف ويبقي الأحدث', () => {
  // ندرج 15 قديمة ثم 10 جديدة، ثم نُبقي آخر 10 فقط
  for (let i = 0; i < 15; i++) repo.insertEntry({ type: 'prune-old' });
  for (let i = 0; i < 10; i++) repo.insertEntry({ type: 'prune-new' });

  const deleted = repo.pruneEntries(10); // أبقِ آخر 10 فقط
  // 4 من الاختبارات السابقة + 15 قديمة = 19 محذوفًا؛ الباقي 10 من prune-new
  assert.equal(deleted, 19);
  const after = repo.getSummary();
  assert.equal(after.total, 10);
  // الباقون هم الأحدث: كل prune-old ذابت وكل prune-new بقيت
  assert.equal(after.byType['prune-new'], 10);
  assert.equal(after.byType['prune-old'], undefined);
});

test('pruneEntries: تحت السقف لا يحذف شيئًا', () => {
  const before = repo.getSummary().total;
  assert.equal(repo.pruneEntries(before + 100), 0);
  assert.equal(repo.getSummary().total, before);
});

test('logEntry عبر stats.js يكتب في SQLite (يُنتظر حتى الاكتمال)', async () => {
  const before = repo.getSummary().total;
  await stats.logEntry({ type: 'sse', sourceLang: 'ar', targetLang: 'en', provider: 'deepl' });
  const summary = await stats.getSummary();
  assert.equal(summary.total, before + 1);
  assert.equal(summary.byType.sse, 1);
});

test('السائق JSON يبقى بديلًا: STATS_DRIVER=json يكتب في STATS_LOG', async () => {
  const old = config.STATS_DRIVER;
  config.STATS_DRIVER = 'json';
  try {
    await stats.logEntry({ type: 'json-driver', sourceLang: 'en', targetLang: 'ar' });
    // قراءة عبر سائق JSON مباشرة من الملف المعزول
    const raw = fs.readFileSync(process.env.STATS_LOG, 'utf8');
    const entries = JSON.parse(raw);
    const found = entries.find((e) => e.type === 'json-driver');
    assert.ok(found, 'الإدخال غير موجود في ملف JSON');
    assert.equal(found.sourceLang, 'en');
    // والقراءة عبر getSummary تعمل على ملف JSON
    const summary = await stats.getSummary();
    assert.ok(summary.total >= 1);
  } finally {
    config.STATS_DRIVER = old;
  }
});
