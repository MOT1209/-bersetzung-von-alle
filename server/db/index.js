// server/db/index.js — اتصال SQLite وتطبيق الترحيلات
//
// لماذا node:sqlite المدمج: SQL حقيقي بمعاملات وفهارس، **بلا أي تبعية وبلا بناء
// أصلي**. هذه ليست تفصيلة: الدوكرفايل يوثّق أن اعتمادية أصلية مفقودة
// (onnxruntime-node) منعت الخادم من الإقلاع أصلًا داخل الحاوية. تجنّب البناء
// الأصلي هنا يتجنّب تكرار ذلك.
//
// حدّ صادق: الوحدة **تجريبية** في Node 22 وتُصدر ExperimentalWarning، وواجهتها
// قد تتغيّر في إصدار قادم. لذلك كل الوصول يمرّ بطبقة المستودعات (repositories)
// — الانتقال إلى better-sqlite3 أو Postgres يمسّ هذا الملف وحده.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const migrations = require('./migrations');

let db = null;

function open(file) {
  const target = file || config.DB_FILE;
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });

  const { DatabaseSync } = require('node:sqlite');
  const handle = new DatabaseSync(target);

  // ضروري: SQLite يعطّل المفاتيح الأجنبية افتراضيًا، فبدون هذا لا يعمل
  // ON DELETE CASCADE إطلاقًا وتبقى الأصول يتيمة بعد حذف مشروعها.
  handle.exec('PRAGMA foreign_keys = ON');
  // WAL: قراءات متزامنة لا تحجبها كتابة — يناسب خادمًا يقرأ أكثر مما يكتب
  if (target !== ':memory:') handle.exec('PRAGMA journal_mode = WAL');

  migrate(handle);
  return handle;
}

function migrate(handle) {
  handle.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    handle.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    // كل ترحيل في معاملة واحدة: فشل في منتصفه لا يترك مخطّطًا نصفيًا
    handle.exec('BEGIN');
    try {
      handle.exec(m.up);
      handle.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)')
        .run(m.version, m.name, Date.now());
      handle.exec('COMMIT');
    } catch (e) {
      handle.exec('ROLLBACK');
      throw e;
    }
  }
}

// الاتصال المشترك للتطبيق (كسول — لا يُفتح ملف قاعدة إلا عند أول استخدام)
function getDb() {
  if (!db) db = open();
  return db;
}

function closeDb() {
  if (db) {
    try { db.close(); } catch { /* مغلق أصلًا */ }
    db = null;
  }
}

// لإعادة التهيئة في الاختبارات: يفتح قاعدة أخرى ويستبدل المشتركة
function useDatabase(file) {
  closeDb();
  db = open(file);
  return db;
}

module.exports = { getDb, closeDb, useDatabase, open, migrate };
