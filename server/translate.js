// server/translate.js — محرك الترجمة: كشف اللغة + ترجمة + تقسيم + احتياطي Gemini
const config = require('./config');
const { get: cacheGet, set: cacheSet } = require('./cache');
const { logError } = require('./logger'); // سجل أخطاء المحركات (cache/errors.log)

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
  // كود / JSON / سطر تقني خالص — لا يُترجم
  if (isCodeLine(t)) return true;
  return false;
}

// هل السطر كود/JSON/مسار تقني خالص؟ (لا تمسّ الجمل العادية)
function isCodeLine(t) {
  if (!t) return false;
  // وسم HTML/XML مثل <div> أو <a href="...">
  if (/<\/?[a-zA-Z][^>]*>/.test(t)) return true;
  // JSON/كائن/مصفوفة تُغلق بالقوسين وتحمل ':' أو '='
  if ((/^\{.*\}$/.test(t) || /^\[.*\]$/.test(t)) && /[:=]/.test(t)) return true;
  // أمر برمجي أو أداة CLI تبدأ بكلمة محجوزة
  if (/^(const|let|var|import|export|require|function|class|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|npm|yarn|pnpm|git|npx|curl|sudo|apt)\b/.test(t)) return true;
  // عبارة تعيين تنتهي بفاصلة منقوطة
  if (t.includes('=') && /;\s*$/.test(t)) return true;
  // مسار/اسم ملف تقني — بلا مسافات، ويحتوي فاصل مسار أو امتدادًا حقيقيًا.
  // لا يكفي وجود '.' وحدها: أسطر مثل "Yes." و"Okay." و"No." شائعة جدًا في
  // الترجمات وكانت تُصنَّف كودًا فتبقى إنجليزية. الشرط أن يتبع النقطةَ الأخيرة
  // امتداد فعلي (file.txt) أو أن يوجد فاصل مسار (/usr/bin) — والنقطة الطرفية
  // وحدها لا تكفي.
  if (
    /^[\w\/.\\\-]+$/.test(t) &&
    t.length < 80 &&
    (/[\/\\]/.test(t) || /\.[A-Za-z0-9]{1,8}$/.test(t))
  ) {
    return true;
  }
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

// ===== سجل المزوّدين الموحّد =====
// كل محرك ترجمة أصبح مزوّدًا بواجهة موحدة:
// { id, label, requiresKey, isAvailable(), translate(text, targetLang, sourceLang) }
// إضافة مزوّد جديد = استدعاء registerProvider() واحد فقط.
const providers = [];      // المزوّدون المسجّلون بالترتيب
const providerById = {};   // id → كائن المزوّد

function registerProvider(p) {
  providers.push(p);
  providerById[p.id] = p;
}
function getProviders() { return providers.slice(); }
function getProvider(id) { return providerById[id]; }
// المزوّدات المتاحة فعلاً (isAvailable) — تُستخدم للسلسلة الافتراضية
function getAvailableProviders() { return providers.filter((p) => p.isAvailable()); }

// ترتيب السلسلة: فرض من الطلب (provider/providers) ثم PROVIDER_ORDER ثم الافتراضي.
// المزوّدات غير المتوفرة تُتخطى تلقائيًا.
function resolveProviders(opts) {
  // opts: { provider?: string, providers?: string[] } (اختياري — من جسم الطلب)
  if (opts && opts.provider) {
    const p = getProvider(opts.provider);
    return p && p.isAvailable() ? [p] : getAvailableProviders();
  }
  if (opts && Array.isArray(opts.providers) && opts.providers.length) {
    const order = [];
    for (const id of opts.providers) {
      const p = getProvider(id);
      if (p && p.isAvailable()) order.push(p);
    }
    return order.length ? order : getAvailableProviders();
  }
  const configured = (config.PROVIDER_ORDER || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) {
    const order = [];
    for (const id of configured) {
      const p = getProvider(id);
      if (p && p.isAvailable()) order.push(p);
    }
    return order.length ? order : getAvailableProviders();
  }
  return getAvailableProviders();
}

// تسجيل المحركات الحالية كمزوّدين (الترتيب: Google الأسرع → MyMemory → Libre → Gemini)
registerProvider({
  id: 'google',
  label: 'Google (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaGoogle,
});
registerProvider({
  id: 'mymemory',
  label: 'MyMemory (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaMyMemory,
});
registerProvider({
  id: 'libre',
  label: 'LibreTranslate (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaLibre,
});
registerProvider({
  id: 'gemini',
  label: 'Gemini (مفتاح مجاني)',
  requiresKey: true,
  isAvailable: () => Boolean(config.GEMINI_API_KEY),
  translate: translateViaGemini,
});

// ===== المزوّد الجديد 1: DeepL (مجاني اختياري) =====
// DeepL Free API: https://api-free.deepl.com/v2/translate — مفتاح مجاني اختياري
registerProvider({
  id: 'deepl',
  label: 'DeepL (مجاني)',
  requiresKey: true,
  isAvailable: () => Boolean(config.DEEPL_API_KEY),
  translate: async (text, targetLang, sourceLang) => {
    const url = config.DEEPL_URL + '/v2/translate';
    const body = { text: [text], target_lang: targetLang.toUpperCase() };
    if (sourceLang && sourceLang !== 'auto') body.source_lang = sourceLang.toUpperCase();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.translations?.[0]?.text;
    if (!out) throw new Error('DeepL: استجابة فارغة');
    return out;
  },
});

// ===== المزوّد الجديد 2: opencode zen (متوافق OpenAI) =====
// بوابة opencode zen على https://opencode.ai/zen/v1 بمصادقة Bearer، وفيها نماذج
// مجانية (deepseek-v4-flash-free وغيرها). ولأن البروتوكول متوافق مع OpenAI،
// يكفي تغيير ZEN_BASE_URL لاستخدام أي خادم chat/completions آخر:
// Ollama (http://localhost:11434/v1) أو LM Studio (http://localhost:1234/v1).
//
// شرط التوفر هو المفتاح لا الرابط: ZEN_BASE_URL له قيمة افتراضية دائمًا، فلو
// اعتمدنا عليه لظهر المزوّد متاحًا وفشل كل طلب بـ401.
registerProvider({
  id: 'zen',
  label: 'opencode zen (متوافق OpenAI)',
  requiresKey: true,
  isAvailable: () => Boolean(config.ZEN_API_KEY && config.ZEN_BASE_URL),
  translate: async (text, targetLang, sourceLang) => {
    const url = config.ZEN_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (config.ZEN_API_KEY) headers.Authorization = `Bearer ${config.ZEN_API_KEY}`;
    const prompt = `Translate the following text to ${targetLang}. Return only the translation, no explanations:\n\n${text}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: config.ZEN_MODEL || 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`zen HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new Error('zen: استجابة فارغة');
    return out.trim();
  },
});

// ===== الترجمة مع محاولات وتقسيم =====
// opts اختياري: { provider?: string, providers?: string[] } — فرض مزوّد/ترتيب معين
async function translateText(text, targetLang, sourceLang, opts) {
  return (await translateTextWithMeta(text, targetLang, sourceLang, opts)).translated;
}

// مثل translateText لكن مع إحصائيات الكاش — تُرجع { translated, chunksFromCache, chunksTotal }
// opts اختياري ويُمرَّر إلى resolveProviders لتحديد سلسلة المزوّدين
async function translateTextWithMeta(text, targetLang, sourceLang, opts) {
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
    // جرّب المزوّدين بالترتيب (resolveProviders: فرض الطلب أو PROVIDER_ORDER أو الافتراضي)
    // المزوّدون المجمّدون (3 إخفاقات متتالية خلال 60 ثانية) يُتخطون مؤقتًا
    for (const engine of resolveProviders(opts)) {
      if (engineOnCooldown(engine.id)) continue;
      try {
        out = await engine.translate(chunk, targetLang, sourceLang);
        engineSucceeded(engine.id);
        break;
      } catch (e) {
        lastErr = e;
        engineFailed(engine.id);
        // سجّل الفشل (غير متزامن — لا يؤخر الاستجابة)
        logError('engine:' + engine.id, e.message || e);
        // فاصل قصير بين المزوّدين لتجنّب حجب سريع
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

// ===== مسرد المصطلحات: استبدال بعد الترجمة (per-user — لا يُخزَّن في الكاش) =====
// الاستبدال حساس لحالة الأحرف مع حدود كلمة، الأطول أولاً، دون المساس بالروابط
function applyGlossary(text, glossary) {
  if (!text || !Array.isArray(glossary) || !glossary.length) return text;
  const pairs = glossary
    .filter((g) => g && typeof g.from === 'string' && typeof g.to === 'string')
    .map((g) => ({ from: g.from.trim(), to: g.to.trim() }))
    .filter((g) => g.from.length >= 2 && g.from.length <= 100 && g.to.length <= 200)
    // الأطول أولاً — يمنع الاستبدال الجزئي (dog قبل doghouse)
    .sort((a, b) => b.from.length - a.from.length);
  if (!pairs.length) return text;

  // حماية الروابط: استبدل المواضع داخل الروابط بعلامات مميزة ثم أعدها لاحقاً
  const links = [];
  let out = text.replace(/https?:\/\/\S+/gi, (m) => {
    links.push(m);
    return `\u0000L${links.length - 1}\u0000`;
  });

  for (const { from, to } of pairs) {
    // كلمات أبجدية رقمية فقط (مع عربية) — منع حقن regex برموز خاصة
    if (!/^[\w\u0600-\u06FF' -]+$/u.test(from)) continue;
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'giu');
    // دالة بديل لا نص — حتى لا يفسّر المتصفح '$1'/'$&' في نص المسرد كمرجع
    out = out.replace(re, () => to);
  }

  // إعادة الروابط
  return out.replace(/\u0000L(\d+)\u0000/g, (m, i) => links[Number(i)] || m);
}

module.exports = {
  translateText,
  translateTextWithMeta,
  detectLanguage,
  chunkText,
  isUntranslatable,
  applyGlossary,
  // ===== سجل المزوّدين =====
  registerProvider,
  getProviders,
  getProvider,
  getAvailableProviders,
  resolveProviders,
};
