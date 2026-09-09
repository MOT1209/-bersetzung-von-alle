// server/usage.js — عدّاد استخدام بسيط (SQLite افتراضيًا، JSON للتوافق)
// يعرفك: كم ترجمة تمت، وأكثر اللغات المطلوبة، وأنواع المحتوى
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { logEntry } = require('./stats');
const repo = require('./db/stats-repository');

function usageFile() {
  return process.env.USAGE_FILE || path.join(__dirname, '..', 'cache', 'usage.json');
}

function usingSqlite() {
  return (config.STATS_DRIVER || 'sqlite') !== 'json';
}

// كائن نظيف في كل استدعاء — لا تُشارك الكائنات الثابتة (trackUsage يطفّر byType)
function emptyUsage() {
  return { total: 0, byType: {}, byTarget: {}, bySource: {} };
}

// ===== قراءة العدّادات (SQLite) =====
function sqliteUsage() {
  const counters = repo.getUsageCounters();
  return { ...emptyUsage(), ...counters };
}

// ===== قراءة العدّادات (JSON legacy) =====
async function jsonUsage() {
  try {
    const raw = await fs.readFile(usageFile(), 'utf8');
    const data = JSON.parse(raw);
    return { ...emptyUsage(), ...(data || {}) };
  } catch {
    return emptyUsage();
  }
}

async function getUsage() {
  if (usingSqlite()) return sqliteUsage();
  return jsonUsage();
}

// ===== تسجيل ترجمة ناجحة =====
async function trackUsage({ type = 'unknown', sourceLang = 'unknown', targetLang = 'unknown', provider } = {}) {
  if (usingSqlite()) {
    try {
      repo.incrementCounter('total');
      repo.incrementCounter(`type:${type}`);
      repo.incrementCounter(`target:${targetLang}`);
      repo.incrementCounter(`source:${sourceLang}`);
    } catch {
      // العدّاد احتياطي — لا يكسر الطلب أبدًا
    }
  } else {
    try {
      const u = await getUsage();
      u.total = (u.total || 0) + 1;
      u.byType[type] = (u.byType[type] || 0) + 1;
      u.byTarget[targetLang] = (u.byTarget[targetLang] || 0) + 1;
      u.bySource[sourceLang] = (u.bySource[sourceLang] || 0) + 1;
      const file = usageFile();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(u), 'utf8');
      try {
        await fs.rename(tmp, file);
      } catch (e) {
        if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
          await fs.copyFile(tmp, file);
          await fs.rm(tmp, { force: true }).catch(() => {});
        } else throw e;
      }
    } catch {
      // العدّاد احتياطي — لا يكسر الطلب أبدًا
    }
  }
  // Log timestamped entry for dashboard statistics (best-effort — serialised in
  // stats.js; awaited so a read right after trackUsage sees this entry)
  await logEntry({ type, sourceLang, targetLang, provider: provider || 'unknown' }).catch(() => {});
}

module.exports = { getUsage, trackUsage };