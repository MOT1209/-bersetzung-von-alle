// server/tashkeel.js — تشكيل النص العربي (إضافة الحركات)
// Gemini أولاً (مجاني — GEMINI_API_KEY موجود) + احتياطي قواعدي فوري بلا شبكة
const config = require('./config');

// حروف عربية أساسية وعلامات تشكيل (حركات/سكون/شدة)
const ARABIC_RE = /[\u0600-\u06FF]/;
const ARABIC_RUN_RE = /[\u0600-\u06FF]{2,}/g; // كلمة عربية من حرفين فأكثر
const DIACRITIC_RE = /[\u064B-\u0652\u0670]/; // حركات التشكيل (فتحة/ضمة/كسرة/سكون/شدة…)

// ===== التشكيل عبر Gemini (المحرك الأساسي عند توفر المفتاح) =====
// نفس نمط translateViaGemini حرفيًا: بلا systemInstruction، مهلة 30 ثانية،
// قراءة candidates[0].content.parts[0].text (درس المشروع: systemInstruction يسبب رفضًا)
async function diacritizeViaGemini(text) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مضبوط');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
  const prompt = 'أضِف حركات التشكيل الكاملة (فَتْحَة، ضَمَّة، كَسْرَة، سُكُون، شَدَّة) إلى النص العربي التالي. لا تُغيّر أي حرف أو كلمة، وأَعِد النص مشكولًا فقط بدون شرح:\n\n' + text;
  const res = await fetch(url + `?key=${encodeURIComponent(config.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini: استجابة فارغة');
  return out.trim();
}

// ===== تشكيل مقطع عربي (داخلي): شدة على الحرف المكرر + سكون على آخر حرف =====
// بسيط — الجودة أقل (سكون/شدة فقط) لكنه فوري وبلا شبكة ولا اعتماديات
function diacritizeArabicRun(run) {
  const chars = [...run];
  let out = '';
  let i = 0;
  // 1) الشدة: دمج الحرف المكرر في حرف واحد مشدّد (دد → دّ)
  while (i < chars.length) {
    const c = chars[i];
    if (i + 1 < chars.length && chars[i + 1] === c) {
      out += c + '\u0651';
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  // 2) السكون: على آخر حرف إن لم يكن مشكولًا بالفعل (الحركة ملحقة بآخر حرف)
  const last = out[out.length - 1];
  if (DIACRITIC_RE.test(last)) return out; // آخر حرف عليه حركة — لا نضيف سكونًا مزدوجًا
  return out + '\u0652';
}

// ===== التشكيل القواعدي (احتياطي بلا شبكة) =====
// لا يلمس اللاتيني/الأرقام/الروابط إطلاقًا — يعالج المقاطع العربية فقط داخل كل كلمة
function diacritizeBasic(text) {
  const str = String(text == null ? '' : text);
  return str
    .split(/(\s+)/) // كلمات مع فواصلها (مسافات/أسطر) — نحافظ على البنية حرفيًا
    .map((token) => {
      if (/^\s+$/.test(token)) return token; // فاصل مسافة/سطر
      // حماية الروابط (لا نشكّل روابط أبدًا)
      if (/^https?:\/\//i.test(token) || /^www\./i.test(token) || token.includes('://')) return token;
      return token.replace(ARABIC_RUN_RE, diacritizeArabicRun);
    })
    .join('');
}

// ===== المدخل الرئيسي: تشكيل نص كامل =====
// يقسم النص لفقرات سطرية؛ الأسطر الخالية من العربية تُبقى حرفيًا.
// إن وُجد مفتاح Gemini → قطع ≤8000 (على حدود الأسطر) عبر Gemini بالتتابع،
// وعند أي فشل (خطأ/مهلة/تغيّر عدد الأسطر) → الاحتياطي القواعدي للقطعة كلها.
async function diacritize(text) {
  const src = String(text == null ? '' : text);
  const lines = src.split('\n');
  const hasArabic = (s) => ARABIC_RE.test(s);

  // بلا مفتاح → القواعدي مباشرة (سطرًا بسطر — غير العربي حرفيًا)
  if (!config.GEMINI_API_KEY) {
    return {
      diacritized: lines.map((l) => (hasArabic(l) ? diacritizeBasic(l) : l)).join('\n'),
      engine: 'basic',
    };
  }

  // تجميع الأسطر في قطع ≤8000 حرف (فصل على حدود الأسطر فقط)
  const MAX_CHARS = 8000;
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const line of lines) {
    const add = line.length + 1;
    if (curLen + add > MAX_CHARS && cur.length) {
      chunks.push(cur);
      cur = [line];
      curLen = add;
    } else {
      cur.push(line);
      curLen += add;
    }
  }
  if (cur.length) chunks.push(cur);

  const outLines = [];
  let geminiUsed = false; // engine الفعلي: 'gemini' فقط إن نجحت استدعاءات Gemini
  for (const chunkLines of chunks) {
    const chunkText = chunkLines.join('\n');
    if (!hasArabic(chunkText)) {
      outLines.push(...chunkLines); // قطعة بلا عربية — حرفيًا
      continue;
    }
    let processed;
    try {
      const res = await diacritizeViaGemini(chunkText);
      const resLines = res.split('\n');
      // إعادة البناء بفواصل الأسطر الأصلية: غير العربي حرفيًا، والعربي من نتيجة Gemini
      if (resLines.length !== chunkLines.length) throw new Error('Gemini: عدد الأسطر تغيّر');
      processed = chunkLines.map((line, i) => (hasArabic(line) ? resLines[i] : line));
      geminiUsed = true;
    } catch (e) {
      // فشل Gemini لهذه القطعة كلها → الاحتياطي القواعدي
      processed = chunkLines.map((line) => (hasArabic(line) ? diacritizeBasic(line) : line));
    }
    outLines.push(...processed);
  }
  return { diacritized: outLines.join('\n'), engine: geminiUsed ? 'gemini' : 'basic' };
}

module.exports = { diacritize, diacritizeBasic, diacritizeViaGemini };
