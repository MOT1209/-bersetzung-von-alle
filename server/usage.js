// server/usage.js — عدّاد استخدام بسيط بملف JSON (cache/usage.json)
// يعرفك: كم ترجمة تمت، وأكثر اللغات المطلوبة، وأنواع المحتوى
const fs = require('fs/promises');
const path = require('path');

function usageFile() {
  return process.env.USAGE_FILE || path.join(__dirname, '..', 'cache', 'usage.json');
}

// كائن نظيف في كل استدعاء — لا تُشارك الكائنات الثابتة (trackUsage يطفّر byType)
function emptyUsage() {
  return { total: 0, byType: {}, byTarget: {}, bySource: {} };
}

// ===== قراءة العدّادات =====
async function getUsage() {
  try {
    const raw = await fs.readFile(usageFile(), 'utf8');
    const data = JSON.parse(raw);
    return { ...emptyUsage(), ...(data || {}) };
  } catch {
    return emptyUsage();
  }
}

// ===== تسجيل ترجمة ناجحة =====
async function trackUsage({ type = 'unknown', sourceLang = 'unknown', targetLang = 'unknown' } = {}) {
  try {
    const u = await getUsage();
    u.total = (u.total || 0) + 1;
    u.byType[type] = (u.byType[type] || 0) + 1;
    u.byTarget[targetLang] = (u.byTarget[targetLang] || 0) + 1;
    u.bySource[sourceLang] = (u.bySource[sourceLang] || 0) + 1;
    const file = usageFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(u), 'utf8');
  } catch {
    // العدّاد احتياطي — لا يكسر الطلب أبدًا
  }
}

module.exports = { getUsage, trackUsage };
