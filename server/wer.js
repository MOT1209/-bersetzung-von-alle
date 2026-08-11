// server/wer.js — حساب نسبة خطأ الكلمات (WER) مع تطبيع خاص بكل لغة
//
// لماذا التطبيع ضروري: بدونه يصبح القياس ظالمًا وغير مفيد.
//   * العربية: النص المرجعي قد يحمل تشكيلًا والنموذج لا يُخرجه (أو العكس)،
//     وصور الألف (أ إ آ) والياء/الألف المقصورة (ي ى) والتاء المربوطة (ة/ه)
//     تختلف بين الكتّاب. بلا توحيدها تُحتسب أخطاءً وهي ليست كذلك.
//   * التركية: toLowerCase في جافاسكربت يحوّل 'I' إلى 'i' وهذا **خطأ** في
//     التركية: نظيرة 'I' الصغيرة هي 'ı'، ونظيرة 'İ' هي 'i'. بلا معالجة
//     صريحة تُحتسب كل كلمة فيها I خطأً.
//
// الواجهة العامة: { normalize, wordErrorRate, levenshtein }

// محارف التشكيل العربية + التطويل
const AR_DIACRITICS = /[ً-ْٰـ]/g;

// ترقيم عربي ولاتيني شائع
const PUNCT = /[.,!?;:"'`()[\]{}<>«»…—–\-_/\\|@#$%^&*+=~؟،؛٪٫٬]/g;

function normalizeArabic(t) {
  return t
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

// تصغير تركي صحيح: I→ı و İ→i قبل toLowerCase العام
function toLowerTurkish(t) {
  return t.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

/**
 * تطبيع نص قبل المقارنة.
 * @param {string} text
 * @param {string} lang - ar | tr | de | en (غيرها يُعامَل معاملة عامة)
 */
function normalize(text, lang) {
  let t = String(text == null ? '' : text);
  const l = String(lang || '').toLowerCase().slice(0, 2);

  t = l === 'tr' ? toLowerTurkish(t) : t.toLowerCase();
  if (l === 'ar') t = normalizeArabic(t);

  return t
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** مسافة ليفنشتاين على مستوى العناصر (كلمات هنا) — مصفوفتان لا مصفوفة كاملة */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,      // إدراج
        prev[j] + 1,         // حذف
        prev[j - 1] + cost   // استبدال
      );
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[b.length];
}

/**
 * نسبة خطأ الكلمات = (استبدال + حذف + إدراج) ÷ عدد كلمات المرجع.
 * ملاحظة: قد تتجاوز 1 (100%) حين يُخرج النموذج كلامًا أكثر من المرجع —
 * وهذا ليس خطأ حسابيًا بل سلوك معروف للنماذج الضعيفة (الهلوسة والتكرار).
 * @returns {{ wer:number, ref:number, hyp:number, distance:number }}
 */
function wordErrorRate(reference, hypothesis, lang) {
  const ref = normalize(reference, lang).split(' ').filter(Boolean);
  const hyp = normalize(hypothesis, lang).split(' ').filter(Boolean);

  if (ref.length === 0) {
    // لا مرجع: WER = 0 إن كان الناتج فارغًا أيضًا، وإلا 1 (كله إدراج)
    return { wer: hyp.length === 0 ? 0 : 1, ref: 0, hyp: hyp.length, distance: hyp.length };
  }

  const distance = levenshtein(ref, hyp);
  return { wer: distance / ref.length, ref: ref.length, hyp: hyp.length, distance };
}

module.exports = { normalize, wordErrorRate, levenshtein };
