// server/translate.js — محرك الترجمة: كشف اللغة + ترجمة + تقسيم + احتياطي Gemini
const config = require('./config');
const { get: cacheGet, set: cacheSet } = require('./cache');

const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=:tl&dt=t';
const MAX_CHUNK = 4500;

// تتبّع إخفاقات المحركات: بعد 3 إخفاقات متتالية يُجمَّد المحرك 60 ثانية
// (يحمي حصة Google المجانية وحصص MyMemory/Libre المحدودة)
const ENGINE_COOLDOWN_FAILS = 3;
const ENGINE_COOLDOWN_MS = 60000;
const engineFails = {}; // { name: { consecutive, cooldownUntil } }

function engineOnCooldown(name) {
  const s = engineFails[name];
  if (!s) return false;
  if (s.cooldownUntil && Date.now() < s.cooldownUntil) return true;
  delete engineFails[name]; // انتهت مدة التجميد: عودة للخدمة
  return false;
}

function engineSucceeded(name) {
  delete engineFails[name];
}

function engineFailed(name) {
  const s = engineFails[name] || (engineFails[name] = { consecutive: 0, cooldownUntil: 0 });
  if (Date.now() < s.cooldownUntil) return; // ما زال مجمدًا
  s.consecutive = (s.consecutive || 0) + 1;
  if (s.consecutive >= ENGINE_COOLDOWN_FAILS) {
    s.cooldownUntil = Date.now() + ENGINE_COOLDOWN_MS;
    s.consecutive = 0;
  }
}

// ===== الأدوات المساعدة =====

function isUntranslatable(line) {
  const t = line.trim();
  if (!t) return true;
  // رابط فقط
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  // ختم زمني فقط
  if (/^\d{1,2}:\d{2}(:\d{2})?([,.]\d+)?\s*$/.test(t)) return true;
  // وسم موسيقى / تصفيق
  if (/^\[(music|applause|laughter|music playing|♪|♫)\]/i.test(t)) return true;
  // كود أو مسار تقني
  if (/^[<\w\/.\\-]+$/i.test(t) && t.length < 60 && !/[أ-يa-zA-Z]{4,}/.test(t)) return false;
  return false;
}

// ===== كشف اللغة =====
async function detectLanguage(text) {
  if (!text || !text.trim()) return 'en';
  try {
    const body = new URLSearchParams({ q: text.slice(0, 500) });
    const res = await fetch(GOOGLE_URL.replace(':tl', 'en'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data && data[2] ? data[2] : 'en';
  } catch (e) {
    return 'en'; // الافتراضي عند الفشل
  }
}

// ===== الترجمة عبر Google المجانية =====
async function translateViaGoogle(text, targetLang, sourceLang) {
  const sl = sourceLang || 'auto';
  const url = GOOGLE_URL.replace(':tl', targetLang);
  const body = new URLSearchParams({ q: text, sl, tl: targetLang, dt: 't' });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  // فحص سريع لصفحات الحجب (مثل /sorry): قد يعيد Google 200 بنص HTML بدل JSON
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) throw new Error('Google blocked');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Google blocked');
  }
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Google blocked');
  const translated = data[0].map((seg) => (seg ? seg[0] : '')).join('');
  return translated;
}

// ===== الترجمة عبر MyMemory (احتياطي مجاني) =====
async function translateViaMyMemory(text, targetLang, sourceLang) {
  // MyMemory لا يقبل 'auto' — نستخدم الإنجليزية كافتراض عند عدم المعرفة
  const src = (sourceLang || 'auto') === 'auto' ? 'en' : sourceLang;
  let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${targetLang}`;
  // بريد اختياري يرفع الحصة اليومية المجانية
  if (config.MYMEMORY_EMAIL) url += `&Email=${encodeURIComponent(config.MYMEMORY_EMAIL)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  if (!data || data.responseStatus !== 200) {
    throw new Error(`MyMemory status ${data ? data.responseStatus : 'unknown'}`);
  }
  const out = data.responseData && data.responseData.translatedText;
  // رسالة 'MYMEMORY WARNING' تعني تجاوز الحصة اليومية
  if (!out || /MYMEMORY WARNING/i.test(out)) {
    throw new Error('MyMemory: تجاوز الحصة أو استجابة فارغة');
  }
  return out;
}

// ===== الترجمة عبر LibreTranslate (احتياطي مجاني) =====
async function translateViaLibre(text, targetLang, sourceLang) {
  const base = config.LIBRE_URL || 'https://libretranslate.com';
  const res = await fetch(base + '/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: sourceLang || 'auto', target: targetLang, format: 'text' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Libre HTTP ${res.status}`);
  // بعض الخوادم تعيد صفحة HTML بدل JSON (أو خادم وسيط) — لا نتعامل معها
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) throw new Error('Libre: استجابة غير JSON');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Libre: استجابة غير JSON');
  }
  const out = data && data.translatedText;
  if (!out) throw new Error('Libre: استجابة فارغة');
  return out;
}

// ===== الترجمة عبر Gemini (احتياطي) =====
async function translateViaGemini(text, targetLang) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مضبوط');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url + `?key=${encodeURIComponent(config.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Translate the following text to ${targetLang}. Return only the translation, no explanations:\n\n${text}` }] }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini: استجابة فارغة');
  return out.trim();
}

// ترتيب المحركات: Google (الأسرع) → MyMemory → Libre → Gemini (احتياطي المفتاح)
const TRANSLATION_ENGINES = [
  { name: 'google', run: translateViaGoogle },
  { name: 'mymemory', run: translateViaMyMemory },
  { name: 'libre', run: translateViaLibre },
  { name: 'gemini', run: translateViaGemini },
];

// ===== الترجمة مع محاولات وتقسيم =====
async function translateText(text, targetLang, sourceLang) {
  return (await translateTextWithMeta(text, targetLang, sourceLang)).translated;
}

// مثل translateText لكن مع إحصائيات الكاش — تُرجع { translated, chunksFromCache, chunksTotal }
async function translateTextWithMeta(text, targetLang, sourceLang) {
  if (!text || !text.trim()) return { translated: '', chunksFromCache: 0, chunksTotal: 0 };

  const chunks = chunkText(text);
  const results = [];
  let fromCacheCount = 0;

  for (const chunk of chunks) {
    // كاش: نفس النص+اللغتين يُرجع فورًا بدون استهلاك حصة
    const cached = cacheGet(chunk, sourceLang, targetLang);
    if (cached !== null) {
      console.log('[cache] hit:', chunk.slice(0, 60));
      results.push(cached);
      fromCacheCount++;
      continue;
    }

    let out = null;
    let lastErr = null;
    // جرّب المحركات بالترتيب مرة واحدة لكل منها: Google → MyMemory → Libre → Gemini
    // المحركات المجمّدة (3 إخفاقات متتالية خلال 60 ثانية) تُتخطى مؤقتًا
    for (const engine of TRANSLATION_ENGINES) {
      if (engineOnCooldown(engine.name)) continue;
      try {
        out = await engine.run(chunk, targetLang, sourceLang);
        engineSucceeded(engine.name);
        break;
      } catch (e) {
        lastErr = e;
        engineFailed(engine.name);
        // فاصل قصير بين المحركات لتجنّب حجب سريع
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    if (!out) {
      // كل الخدمات فشلت: خطأ واضح بدل إرجاع النص الأصلي بصمت (واجهة مضللة)
      const err = new Error('translate-failed');
      err.code = 'translate-failed';
      err.cause = lastErr;
      throw err;
    }
    // الحفظ في الكاش بعد نجاح فقط — الأخطاء (429 مثلًا) لا تُخزَّن أبدًا
    cacheSet(chunk, sourceLang, targetLang, out);
    results.push(out);

    // تأخير صغير بين القطع الشبكية لتجنّب انفجار الطلبات
    // (يحمي من حجب Google المجاني وحصص Gemini في الدقيقة)
    if (results.length + fromCacheCount < chunks.length) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return { translated: results.join('\n\n'), chunksFromCache: fromCacheCount, chunksTotal: chunks.length };
}

// ===== تقسيم النص إلى أجزاء =====
function chunkText(text, maxChars = MAX_CHUNK) {
  const clean = text.replace(/\r\n/g, '\n');
  const paragraphs = clean.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  const pushChunk = (t) => {
    if (!t.trim()) return;
    chunks.push(t.trim());
  };

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= maxChars) {
      current = current ? current + '\n\n' + para : para;
    } else {
      // تقسيم الفقرة الطويلة جدًا على حدود الجمل
      if (current) pushChunk(current);
      current = '';
      if (para.length > maxChars) {
        const sentences = para.split(/(?<=[.!?؟])\s+/);
        let part = '';
        for (const s of sentences) {
          if ((part + ' ' + s).length > maxChars && part) {
            pushChunk(part);
            part = s;
          } else {
            part = part ? part + ' ' + s : s;
          }
        }
        if (part) pushChunk(part);
      } else {
        current = para;
      }
    }
  }
  if (current) pushChunk(current);
  return chunks.length ? chunks : [text];
}

module.exports = { translateText, translateTextWithMeta, detectLanguage, chunkText, isUntranslatable };
