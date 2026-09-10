// server/db/stats-repository.js — مستودع الإحصائيات وعدادات الاستخدام
//
// كل وصول إلى SQL للإحصائيات يمرّ من هنا — stats.js و usage.js لا يكتبان
// استعلامًا واحدًا؛ فتبديل النواة إلى Postgres لاحقًا يمسّ هذا الملف والأحدات
// في migrations.js فقط. هذه النسخة تحلّ محل ملفي JSON (stats-log.json و
// usage.json) التي لم تكن تصلح لعدة خوادم ولا لاستعلامات النطاق الزمني.
const { getDb } = require('./index');

// ===== إدخالات الإحصائيات (stats_entries) =====
// عدّاد لتأخير عملية التنظيف: لا تُنفَّذ prune אלא كل 100 إدراج لتوفير استعلامات
let _insertCount = 0;
const PRUNE_EVERY = 100;

// إدراج إدخال زمني — كل ترجمة ناجحة تسجَّل هنا (يُ invoked من usage.trackUsage)
function insertEntry({ type, sourceLang = null, targetLang = null, provider = null } = {}) {
  getDb().prepare(
    'INSERT INTO stats_entries (type, source_lang, target_lang, provider, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(String(type || 'unknown'), sourceLang, targetLang, provider, Date.now());
  // نفس سقف سائق JSON القديم (آخر 10,000 إدخال) — يمنع نموّ الجدول بلا حدود
  // يُنفَّذ مرة كل 100 إدراج بدل كل إدراج لتوفير استعلامتين على الأقل
  if (++_insertCount % PRUNE_EVERY === 0) pruneEntries(10000);
}

// ملخص سريع: الإجمالي، اليوم، الأسبوع، والتوزيع حسب النوع
// "اليوم" بحدود UTC منتصف الليل — نفس سلوك سائق JSON القديم (toISOString)
function getSummary() {
  const db = getDb();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const todayStart = Date.parse(`${todayStr}T00:00:00Z`);
  const weekStart = now - 7 * dayMs;

  const totalRow = db.prepare('SELECT COUNT(*) AS n FROM stats_entries').get();
  const todayRow = db.prepare('SELECT COUNT(*) AS n FROM stats_entries WHERE created_at >= ?').get(todayStart);
  const weekRow = db.prepare('SELECT COUNT(*) AS n FROM stats_entries WHERE created_at >= ?').get(weekStart);
  const byRows = db.prepare('SELECT type, COUNT(*) AS n FROM stats_entries GROUP BY type').all();

  const byType = {};
  for (const r of byRows) byType[r.type || 'unknown'] = r.n;
  return {
    total: totalRow.n,
    todayCount: todayRow.n,
    weekCount: weekRow.n,
    byType,
  };
}

// سلسلة زمنية: عدد الترجمة لكل يوم من آخر N يومًا (أقصى 30)
// الحدود والتسمية كلاهما UTC — متسقة مع بعضها ومع سائق JSON القديم
// (الذي كان يجمّع بـ toISOString). خلط التوقيت المحلي مع UTC يزيح الصفوف يومًا كاملًا.
// بدلاً من n استعلام SELECT COUNT، استعلام واحد مع GROUP BY على DATE()
function getTimeseries(days = 7) {
  const n = Math.max(1, Math.min(30, Number(days) || 7));
  const db = getDb();
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const startMs = nowMs - (n - 1) * dayMs;

  // استعلام واحد: تجميع بعدد اليوم بصيغة YYYY-MM-DD
  const rows = db.prepare(
    `SELECT DATE(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n
     FROM stats_entries
     WHERE created_at >= ?
     GROUP BY day`
  ).all(startMs);

  // تحويل النتائج إلى خريطة { 'YYYY-MM-DD': count }
  const countsByDay = {};
  for (const r of rows) countsByDay[r.day] = r.n;

  // إعادة بناء كاملة: ملء الأيام المفقودة بـ 0
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * dayMs);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, count: countsByDay[dateStr] || 0 });
  }
  return { days: result };
}

// توزيع المزوّدين (count per provider)
function getProviders() {
  const rows = getDb().prepare('SELECT provider, COUNT(*) AS n FROM stats_entries GROUP BY provider').all();
  const byProvider = {};
  for (const r of rows) byProvider[r.provider || 'unknown'] = r.n;
  return { byProvider };
}

// توزيع اللغات (source و target)
function getLanguages() {
  const srcRows = getDb().prepare('SELECT source_lang, COUNT(*) AS n FROM stats_entries GROUP BY source_lang').all();
  const tgtRows = getDb().prepare('SELECT target_lang, COUNT(*) AS n FROM stats_entries GROUP BY target_lang').all();
  const bySource = {};
  const byTarget = {};
  for (const r of srcRows) bySource[r.source_lang || 'unknown'] = r.n;
  for (const r of tgtRows) byTarget[r.target_lang || 'unknown'] = r.n;
  return { bySource, byTarget };
}

// توزيع الساعات (0-23) — بساعة الخادم المحلية لا UTC (نفس سلوك سائق JSON القديم
// الذي كان يستخدم new Date(entry.timestamp).getHours())
function getHourly() {
  const rows = getDb().prepare('SELECT created_at FROM stats_entries').all();
  const hours = Array(24).fill(0);
  for (const r of rows) {
    hours[new Date(r.created_at).getHours()]++;
  }
  return { hours };
}

// تنظيف: يُبقي آخر maxEntries فقط (محاكاة القبع السابق البالغ 10,000)
function pruneEntries(maxEntries = 10000) {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS n FROM stats_entries').get().n;
  if (count <= maxEntries) return 0;
  const overflow = count - maxEntries;
  // أسرع حذف: أقدم صفّ يُبقى هو الذي يلي overflow صفًا من البداية،
  // فاحذف كل صف قبل إحداثيته — دون قراءة كل الصفوف.
  const keepFrom = db.prepare('SELECT id FROM stats_entries ORDER BY id ASC LIMIT 1 OFFSET ?').get(overflow);
  if (!keepFrom) return 0;
  db.prepare('DELETE FROM stats_entries WHERE id < ?').run(keepFrom.id);
  return overflow;
}

// ===== عدّادات الاستخدام (usage_counters) =====

// لغة المفاتيح: 'total' للإجمالي، و'type:article' و'target:ar' و'source:en'.
function incrementCounter(key, by = 1) {
  getDb().prepare(
    'INSERT INTO usage_counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value'
  ).run(String(key), Math.max(1, Number(by) || 1));
}

function getCounter(key) {
  const row = getDb().prepare('SELECT value FROM usage_counters WHERE key = ?').get(String(key));
  return row ? row.value : 0;
}

function getCountersByPrefix(prefix) {
  const prefixQuery = `${prefix}:%`;
  const rows = getDb().prepare('SELECT key, value FROM usage_counters WHERE key LIKE ?').all(prefixQuery);
  const out = {};
  for (const r of rows) out[r.key.slice(prefix.length + 1)] = r.value;
  return out;
}

// يعيد عدّادات الاستخدام كاملة بنفس شكل كائن JSON القديم
function getUsageCounters() {
  return {
    total: getCounter('total'),
    byType: getCountersByPrefix('type'),
    byTarget: getCountersByPrefix('target'),
    bySource: getCountersByPrefix('source'),
  };
}

module.exports = {
  insertEntry,
  getSummary,
  getTimeseries,
  getProviders,
  getLanguages,
  getHourly,
  pruneEntries,
  incrementCounter,
  getCounter,
  getCountersByPrefix,
  getUsageCounters,
};