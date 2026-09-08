// server/dubbing/cleanup.js — تنظيف تلقائي لمشاريع الدبلجة القديمة
// كل دبلجة ≈ فيديو + صوت + مقاطع TTS؛ بلا تنظيف يمتلئ القرص.
// القواعد: حذف المشاريع الأقدم من RETENTION، وإن تجاوز الإجمالي السقفَ يُحذف
// الأقدم أولًا. المشاريع التي لها مهمة جارية تُحمى دائمًا (انظر isProtected).
const fs = require('fs');
const path = require('path');

// حماية المشاريع الجارية (CURRENT_STATE.md §20).
//
// كانت الحماية «كل ما عمره أقل من ساعة» — وهو معيار خاطئ في الاتجاهين: يحمي
// مشروعًا اكتمل قبل دقيقتين (فلا تُسترَدّ مساحته)، ويكشف مشروعًا جاريًا تجاوز
// عمره الساعة. والأثر عملي: قرص Render خمسة غيغابايت، وطلب واحد قد ينتج مثلها،
// فإن مُنع الاسترداد ساعةً كاملة امتلأ القرص قبل أن يعمل التنظيف أصلًا.
//
// المعيار الصحيح: هل للمشروع مهمة قيد التشغيل فعلًا؟ الجواب على القرص أصلًا في
// job-*.json الذي يكتبه job-manager.
const MIN_AGE_PROTECT_MS = 2 * 60 * 1000; // دقيقتان: مهلة إنشاء قبل كتابة أول job-*.json

// هل للمشروع مهمة لم تنتهِ بعد؟ (queued/processing)
function hasActiveJob(projectPath) {
  let files = [];
  try { files = fs.readdirSync(projectPath).filter((f) => f.startsWith('job-') && f.endsWith('.json')); }
  catch { return false; }
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(projectPath, f), 'utf8')).status;
      if (s === 'queued' || s === 'processing') return true;
    } catch { /* ملف تالف — لا يُعتبر حماية */ }
  }
  return false;
}

// المشروع محميّ إن كان جاريًا، أو أحدث من مهلة الإنشاء القصيرة
function isProtected(it, now) {
  return (now - it.mtime) <= MIN_AGE_PROTECT_MS || hasActiveJob(it.path);
}

function dirSize(dir) {
  let total = 0;
  let files = [];
  try { files = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const f of files) {
    const p = path.join(dir, f.name);
    try {
      if (f.isDirectory()) total += dirSize(p);
      else total += fs.statSync(p).size;
    } catch { /* تجاهل */ }
  }
  return total;
}

function cleanupProjects({ dir, maxAgeDays = 7, maxBytes = 5368709120 } = {}) {
  const target = dir || path.join(__dirname, '..', '..', 'projects');
  let entries = [];
  try { entries = fs.readdirSync(target, { withFileTypes: true }).filter((e) => e.isDirectory()); }
  catch { return { removed: [], freedBytes: 0, totalBytes: 0 }; }

  const now = Date.now();
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const info = entries.map((e) => {
    const p = path.join(target, e.name);
    let mtime = 0;
    try { mtime = fs.statSync(p).mtimeMs; } catch { mtime = now; }
    return { name: e.name, path: p, mtime, size: dirSize(p) };
  });

  const removed = [];
  let freedBytes = 0;
  const remove = (it) => {
    try {
      fs.rmSync(it.path, { recursive: true, force: true });
      removed.push(it.name);
      freedBytes += it.size;
    } catch { /* تجاهل */ }
  };

  // 1) الأقدم من مدة الاحتفاظ (ما عدا المشاريع الجارية)
  for (const it of info) {
    if (it.mtime < cutoff && !isProtected(it, now)) remove(it);
  }
  // 2) سقف الحجم: الأقدم أولًا (الجاري يُستثنى دائمًا)
  const remaining = info.filter((it) => !removed.includes(it.name));
  let total = remaining.reduce((a, b) => a + b.size, 0);
  remaining.sort((a, b) => a.mtime - b.mtime);
  for (const it of remaining) {
    if (total <= maxBytes) break;
    if (isProtected(it, now)) continue;
    remove(it);
    total -= it.size;
  }
  return { removed, freedBytes, totalBytes: total };
}

// جدولة دورية: أول تشغيل بعد دقيقة (لا يؤخر الإقلاع)، ثم كل ساعة.
// كانت كل 6 ساعات: على قرص 5GB يمكن أن يمتلئ القرص كاملًا بين تشغيلين.
// المؤقت unref حتى لا يُبقي العملية حية في الاختبارات.
function scheduleCleanup({ maxAgeDays, maxBytes } = {}) {
  const run = () => {
    try {
      const r = cleanupProjects({ maxAgeDays, maxBytes });
      if (r.removed.length) console.log(`[cleanup] removed ${r.removed.length} project(s), freed ${Math.round(r.freedBytes / 1048576)}MB`);
    } catch (e) { console.error('[cleanup]', e.message); }
  };
  const t1 = setTimeout(run, 60 * 1000);
  const t2 = setInterval(run, 60 * 60 * 1000);
  if (t1.unref) t1.unref();
  if (t2.unref) t2.unref();
  return { stop: () => { clearTimeout(t1); clearInterval(t2); } };
}

module.exports = { cleanupProjects, scheduleCleanup };
