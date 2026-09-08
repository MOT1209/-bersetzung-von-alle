/* ---------- AraLink — محرك الترجمة المحلي (بلا شبكة، بلا DOM) ----------
 *
 * مُجزِّئ توكنز (tokenizer) يدعم العربية واللاتينية + تطبيع (lowercase +
 * إزالة الحركات) + قاموس مُطَبَّع + مطابقة غير حساسة لحالة الأحرف +
 * إعادة تطبيق Capitalization + فصل علامات الترقيم وإعادة تركيبها مع
 * الحفاظ على المسافات الأصلية حرفيًا.
 *
 * وحدة نقية: لا DOM ولا fetch — تُستورد من المتصفح ومن اختبارات Node معًا.
 * (public/package.json يعلن type:module ليعمل الاستيراد من طرف Node)
 */

/* ===== أنماط المعالجة =====
 * بدل split(' ') الذي يكسر علامات الترقيم ويتجاهل العربية، نميّز ثلاثة أنواع:
 * مسافة/مسافات، كلمة (لاتينية \w أو عربية \u0600-\u06FF)، أو علامة ترقيم مفردة.
 * التقسيم بالاستبدال مع التقاط المسافات يضمن إعادة التركيب بمسافات مطابقة حرفيًا.
 */
const TOKEN_RE = /[\w\u0621-\u0652\u0660-\u0669\u0670-\u06D3]+|[^\s\w]/gu;
/* علامات الترقيم العربية (، ؛ ؟ ...) ليست حروفًا: U+0600–U+0620 فواصل/تحكم،
 * و U+06D4 نقطة عربية — تبقى خارج صنف الكلمة. الحروف تبدأ من U+0621،
 * والحركات U+064B–U+0652 تلتصق بالكلمة فتُعدّ جزءًا منها (التطبيع يزيلها)،
 * والأرقام العربية الهندية U+0660–U+0669 كلمات أيضًا. */
const TOKEN_SPLIT_RE = /([\s]+)|([\w\u0621-\u0652\u0660-\u0669\u0670-\u06D3]+)|([^\s\w])/gu;
const WORD_RE = /^[\w\u0600-\u06FF]+$/u;
/* الحركات والتنوين (ً ٌ ٍ َ ُ ِ ّ ْ) + ألف خنجرية + تطويل */
const DIACRITICS_RE = /[\u064B-\u0652\u0670\u0640]/g;
/* أحرف قوية الاتجاه: عبرية + عربية (أساسية، متممة، أشكال العرض) */
const RTL_LETTER_RE = /[\u0590-\u07FF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
/* أحرف قوية الاتجاه لاتينية/يونانية/سيريلية — للحسم عند الخليط */
const LTR_LETTER_RE = /[A-Za-z\u00C0-\u024F\u0370-\u04FF]/;
/* مفاتيح محجوزة لا يجوز أن تصبح مدخلات قاموس (حماية من تلوث النموذج الأولي) */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DEFAULTS = {
  stripDiacritics: true,  // إزالة الحركات قبل المطابقة — ضرورية للعربية المشكولة
  maxEntries: 20000,      // حد منطقي يمنع ملفات ضخمة من تعليق المتصفح
  maxKeyLen: 100,
  maxValueLen: 500,
};

/* ===== وضع debug — تسجيل خطوات المعالجة أثناء التطوير ===== */
let debug = false;
export function setDebug(on) { debug = !!on; }
export function isDebug() { return debug; }
function dbg(msg) { if (debug) console.log('[localEngine]', msg); }

/* ===== المعالجة (Tokenization) ===== */

/* كل التوكنز: كلمات وعلامات ترقيم (بلا مسافات) */
export function tokenize(text) {
  return String(text ?? '').match(TOKEN_RE) || [];
}

export function isWordToken(token) {
  return WORD_RE.test(token);
}

/* ===== التطبيع (Normalization) ===== */

export function stripDiacritics(text) {
  return String(text ?? '').replace(DIACRITICS_RE, '');
}

/* تطبيع كلمة للمطابقة: lowercase + إزالة الحركات (اختياريًا، مفعّل افتراضيًا) */
export function normalizeWord(word, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let s = String(word ?? '');
  if (o.stripDiacritics) s = stripDiacritics(s);
  return s.toLowerCase();
}

/* ===== بناء قاموس مُطَبَّع =====
 * المفاتيح كلها lowercase (+ بلا حركات)، والقيم نصوص غير فارغة.
 * المدخلات غير الصالحة تُتخطى مع تسجيل سبب في وضع debug.
 * يرمي TypeError('invalid-dictionary') إن: المدخل ليس كائنًا، أو لا توجد
 * أي مدخلة صالحة، أو تجاوز العدد maxEntries — ليرفض مسار الرفع الملف مبكرًا.
 */
export function normalizeDictionary(dict, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
    throw new TypeError('invalid-dictionary');
  }
  const out = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(dict)) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      dbg(`skip: value of "${rawKey}" is not a non-empty string`);
      continue;
    }
    const key = normalizeWord(rawKey, o);
    if (RESERVED_KEYS.has(key)) {
      dbg('skip: reserved key');
      continue;
    }
    if (!key || key.length > o.maxKeyLen) {
      dbg(`skip: key "${rawKey}" empty or longer than ${o.maxKeyLen}`);
      continue;
    }
    const value = rawValue.trim();
    if (value.length > o.maxValueLen) {
      dbg(`skip: value of "${key}" longer than ${o.maxValueLen}`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      dbg(`skip: duplicate key "${key}"`);
      continue;
    }
    if (count >= o.maxEntries) {
      throw new TypeError('invalid-dictionary'); // تجاوز الحد المسموح — رفض لا اقتطاع صامت
    }
    out[key] = value;
    count++;
  }
  if (!count) throw new TypeError('invalid-dictionary');
  return out;
}

/* التطبيع مكلف — يُحسب مرة لكل كائن قاموس ثم يُحفظ (WeakMap) */
const dictCache = new WeakMap();
function getNormalized(dict, opts) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return null;
  const cached = dictCache.get(dict);
  if (cached) return cached;
  try {
    const norm = normalizeDictionary(dict, opts);
    dictCache.set(dict, norm);
    return norm;
  } catch {
    return null; // قاموس غير قابل للاستخدام → النص يمر كما هو بلا كسر
  }
}

/* ===== إعادة تطبيق Capitalization =====
 * "Hello" → ترجمة تبدأ بحرف لاتيني كبير. "HELLO" (كله أحرف كبيرة) → ترجمة
 * كاملة كبيرة. العربية بلا حالة أحرف فلا تتأثر — آمن في الاتجاهين.
 */
export function applyCapitalization(translated, original) {
  const t = String(translated ?? '');
  const o = String(original ?? '');
  if (!t || !o) return t;
  const isUpper = (ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  const hasLower = /[a-z]/.test(o);
  const hasUpper = /[A-Z]/.test(o);
  if (hasUpper && !hasLower) return t.toUpperCase(); // HELLO → كل الحروف كبيرة
  if (isUpper(o[0])) {
    const m = t.match(/[a-zA-Z]/); // أول حرف لاتيني في الترجمة (إن وجد)
    if (m && m.index !== undefined) {
      return t.slice(0, m.index) + t[m.index].toUpperCase() + t.slice(m.index + 1);
    }
  }
  return t;
}

/* ===== اقتراحات fuzzy (Levenshtein) — للاقتراح فقط، لا استبدال صامت =====
 * تُستدعى في وضع debug للكلمات غير المطابقة لمساعدة صاحب القاموس.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export function suggest(norm, word, max = 3) {
  if (!norm || typeof norm !== 'object' || !word || word.length < 3) return [];
  const tol = word.length > 6 ? 2 : 1;
  const hits = [];
  for (const key of Object.keys(norm)) {
    if (Math.abs(key.length - word.length) > 2) continue;
    const dist = levenshtein(key, word);
    if (dist <= tol) hits.push({ key, dist });
  }
  return hits.sort((x, y) => x.dist - y.dist).slice(0, max);
}

/* ===== الترجمة بقاموس محلي =====
 * تعيد تركيب النص من التوكنز مع الحفاظ على كل مسافة وعلامة ترقيم في موضعها.
 * الكلمات غير الموجودة تُترك كما هي — لا نص يُفقد ولا يُشوَّه.
 * opts: { stripDiacritics, maxEntries, ... } — نفس خيارات normalizeDictionary
 */
export function translateWithDictionary(text, dict, opts = {}) {
  const src = String(text ?? '');
  if (!src) return '';
  const norm = getNormalized(dict, opts);
  if (!norm) return src;

  let misses = 0;
  const out = src.replace(TOKEN_SPLIT_RE, (m, ws, word, punct) => {
    if (ws) return ws;      // المسافات الأصلية كما هي حرفيًا
    if (punct) return punct; // علامات الترقيم كما هي
    const key = normalizeWord(word, opts);
    const hit = Object.prototype.hasOwnProperty.call(norm, key) ? norm[key] : undefined;
    if (hit !== undefined) return applyCapitalization(hit, word);
    misses++;
    if (debug) {
      const s = suggest(norm, key);
      if (s.length) dbg(`no match for "${word}" — did you mean: ${s.map((x) => x.key).join(', ')}?`);
    }
    return word;
  });
  dbg(`translated ${src.length} chars — ${misses} unmatched tokens, ${Object.keys(norm).length} dict entries`);
  return out;
}

/* ===== كشف اتجاه النص (RTL) =====
 * أول حرف قوي الاتجاه يحسم: عربي/عبري → rtl، لاتيني/غيره → ltr،
 * بلا أحرف قوية (أرقام/ترقيم فقط) → false.
 */
export function isRtlText(text) {
  const s = String(text ?? '');
  const rtl = s.match(RTL_LETTER_RE);
  if (!rtl) return false;
  const ltr = s.match(LTR_LETTER_RE);
  if (!ltr) return true;
  return rtl.index < ltr.index;
}
