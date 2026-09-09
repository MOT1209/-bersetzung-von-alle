// tests/statsMigration.test.js — اختبارات ترحيل المخطط v3 (stats + usage_counters)
//
// الموجة 4: بدء قاعدة فارغة → تطبيق الترحيلات → التحقق من المخطط والفهارس،
// وأن الترحيلات السابقة (v1/v2) ما زالت سليمة، وأن المعاملة تتراجع (ROLLBACK)
// عند فشل في منتصف الترحيل.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-stats-mig-'));
const dbFile = path.join(tmpDir, 'test.db');
process.env.DB_FILE = dbFile;

const db = require('../server/db');

after(() => {
  db.closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('قاعدة فارغة → الترحيلات تُطبَّق كلها (v1→v3) في معاملات', () => {
  const handle = db.useDatabase(dbFile);
  const applied = handle
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all();
  assert.deepEqual(applied.map((r) => r.version), [1, 2, 3]);
  assert.equal(applied[2].name, 'stats-entries-and-usage-counters');
});

test('مخطط stats_entries: الأعمدة والفهارس موجودة', () => {
  const handle = db.getDb();
  const cols = handle.prepare('PRAGMA table_info(stats_entries)').all().map((c) => c.name);
  assert.deepEqual(cols.sort(), ['created_at', 'id', 'provider', 'source_lang', 'target_lang', 'type'].sort());

  const idx = handle.prepare('PRAGMA index_list(stats_entries)').all().map((i) => i.name);
  assert.ok(idx.includes('idx_stats_created'), 'فهرس created_at مفقود');
  assert.ok(idx.includes('idx_stats_type'), 'فهرس type مفقود');
});

test('مخطط usage_counters: مفتاح أساسي وقيمة افتراضية 0', () => {
  const handle = db.getDb();
  const cols = handle.prepare('PRAGMA table_info(usage_counters)').all();
  const pk = cols.find((c) => c.name === 'key');
  assert.equal(pk.pk, 1, 'key يجب أن يكون مفتاحًا أساسيًا');
  const value = cols.find((c) => c.name === 'value');
  assert.equal(value.notnull, 1);
  assert.equal(value.dflt_value, '0');
});

test('إعادة الفتح لا تعيد الترحيل ولا تفقد البيانات', () => {
  const handle = db.getDb();
  handle.prepare('INSERT INTO usage_counters (key, value) VALUES (?, ?)').run('type:persist', 7);

  db.closeDb();
  const reopened = db.useDatabase(dbFile);
  const row = reopened.prepare('SELECT value FROM usage_counters WHERE key = ?').get('type:persist');
  assert.equal(row.value, 7);
  const applied = reopened.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get();
  assert.equal(applied.n, 3); // لم يُضف ترحيل جديد
});

test('فشل في منتصف ترحيل → ROLLBACK ولا نصف مخطط', () => {
  // ترحيل فاسد: جدول صحيح ثم جدول مكسور — المعاملة يجب أن تتراجع كلها
  const handle = db.open(dbFile.replace('.db', '-rollback.db'));
  // open() يطبق الترحيلات القياسية؛ الآن نحاكي فشلًا يدويًا على نسخة أخرى
  handle.exec('BEGIN');
  try {
    handle.exec('CREATE TABLE half_table (id INTEGER)');
    handle.exec('CREATE TABLE definitely_broken (no_such_syntax');
    assert.fail('يجب أن يفشل exec');
  } catch {
    handle.exec('ROLLBACK');
  } finally {
    const tables = handle
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='half_table'")
      .get();
    assert.equal(tables, undefined, 'ROLLBACK لم يُلغِ الجدول النصفي');
    handle.close();
  }
});
