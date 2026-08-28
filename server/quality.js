// server/quality.js — قياس جودة الترجمة عبر مجموعة نصوص مرجعية
//
// الفكرة (البند "لوحة جودة الترجمة"): تحويل اختيار المزوّد من انطباع إلى رقم.
// لكل مزوّد × كل جملة مرجعية × كل لغة هدف: نترجم النص المصدر ونقارن الناتج
// بالترجمة المرجعية عبر WER (server/wer.js) — مع تطبيع خاص بكل لغة.
//
//   score = 1 - min(WER, 1)     ∈ [0..1]   (1 = مطابق، 0 = مختلف كليًا)
//
// لا يُشغَّل عند كل فتح للوحة (يستهلك حصص الترجمة). يُشغَّل يدويًا عبر
// scripts/bench-translate.js فيكتب cache/quality-report.json، والـ API يقدّم
// آخر تقرير فقط.

const fs = require('fs');
const path = require('path');
const { wordErrorRate } = require('./wer');

const REPORT_FILE = process.env.QUALITY_REPORT || path.join(__dirname, '..', 'cache', 'quality-report.json');
const REFSET_FILE = process.env.QUALITY_REFSET || path.join(__dirname, '..', 'samples', 'translation', 'refset.json');

// ===== مجموعة المرجع =====
function loadRefset(file = REFSET_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data) || !data.length) throw new Error('refset must be a non-empty array');
  for (const e of data) {
    if (!e || typeof e.source !== 'string' || !e.targets || typeof e.targets !== 'object') {
      throw new Error(`refset entry invalid: ${JSON.stringify(e).slice(0, 80)}`);
    }
  }
  return data;
}

// المرجع قد يكون نصًا واحدًا أو مصفوفة صياغات مقبولة — نأخذ أفضل درجة
function bestScore(references, hypothesis, lang) {
  const refs = Array.isArray(references) ? references : [references];
  let best = null;
  for (const ref of refs) {
    const s = scoreOne(ref, hypothesis, lang);
    if (!best || s.score > best.score) best = s;
  }
  return best;
}

// ===== حساب درجة جملة واحدة =====
function scoreOne(reference, hypothesis, lang) {
  const { wer, ref, hyp, distance } = wordErrorRate(reference, hypothesis, lang);
  return {
    wer: round(wer),
    score: round(Math.max(0, 1 - Math.min(wer, 1))),
    refWords: ref,
    hypWords: hyp,
    distance,
  };
}

// ===== قياس مزوّد واحد =====
// translateFn(text, targetLang, sourceLang) => Promise<string>
async function benchmarkProvider(id, translateFn, refset, opts = {}) {
  const { langs, delayMs = 300 } = opts;
  const rows = [];
  for (const entry of refset) {
    for (const [lang, reference] of Object.entries(entry.targets || {})) {
      if (langs && langs.length && !langs.includes(lang)) continue;
      const row = { id: entry.id, lang, ok: false };
      try {
        const hypothesis = await translateFn(entry.source, lang, entry.sourceLang || 'en');
        Object.assign(row, bestScore(reference, String(hypothesis || ''), lang), { ok: true, hypothesis });
      } catch (e) {
        row.error = (e && e.message) || String(e);
      }
      rows.push(row);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return aggregate(id, rows);
}

// ===== تجميع صفوف مزوّد إلى ملخّص =====
function aggregate(id, rows) {
  const ok = rows.filter((r) => r.ok);
  const byLang = {};
  for (const r of ok) (byLang[r.lang] = byLang[r.lang] || []).push(r.score);
  const perLang = {};
  for (const [lang, arr] of Object.entries(byLang)) perLang[lang] = round(avg(arr));

  return {
    provider: id,
    samples: rows.length,
    succeeded: ok.length,
    failed: rows.length - ok.length,
    avgScore: ok.length ? round(avg(ok.map((r) => r.score))) : null,
    avgWer: ok.length ? round(avg(ok.map((r) => r.wer))) : null,
    perLang,
    rows,
  };
}

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const round = (x) => Math.round(x * 1000) / 1000;

// ===== تشغيل القياس الكامل =====
// providers: [{ id, translate(fn) } | { id, fn }]
async function runBenchmark(opts = {}) {
  const refset = opts.refset || loadRefset();
  const providers = opts.providers || [];
  const langs = opts.langs && opts.langs.length ? opts.langs : null;

  const detail = [];
  for (const p of providers) {
    const fn = typeof p.translate === 'function' ? p.translate.bind(p) : p.fn;
    if (typeof fn !== 'function') throw new Error(`provider ${p && p.id} has no translate function`);
    detail.push(await benchmarkProvider(p.id, fn, refset, { langs, delayMs: opts.delayMs }));
  }

  const allLangs = langs || [...new Set(refset.flatMap((e) => Object.keys(e.targets || {})))];
  return {
    generatedAt: new Date().toISOString(),
    refsetSize: refset.length,
    langs: allLangs,
    // ملخّصات خفيفة للعرض السريع + التفصيل الكامل للتشخيص
    summary: detail.map(({ rows, ...s }) => s).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)),
    detail,
  };
}

// ===== حفظ/تحميل التقرير (كتابة ذرّية — نفس نمط cache.js) =====
function saveReport(report, file = REPORT_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
      fs.copyFileSync(tmp, file);
      fs.rmSync(tmp, { force: true });
    } else throw e;
  }
}

function loadReport(file = REPORT_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  loadRefset,
  scoreOne,
  bestScore,
  aggregate,
  benchmarkProvider,
  runBenchmark,
  saveReport,
  loadReport,
  REPORT_FILE,
  REFSET_FILE,
};
