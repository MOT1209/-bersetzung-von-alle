# Task 01: سجل المزوّدين الموحّد (Provider Registry)


## Status

complete


## Wave

1

## Description

تحويل محركات الترجمة في `server/translate.js` من مصفوفة ثابتة
(`TRANSLATION_ENGINES`) إلى **سجل مزوّدين** بواجهة مشتركة، مع إضافة مزوّدين مجانيين
جديدين: **DeepL** (مفتاح مجاني اختياري) و**متوافق OpenAI** (يغطي Ollama / LM Studio
المحليين مجاناً وOpenRouter/Groq بمفاتيح مجانية). الهدف: أي مزوّد جديد يُضاف باستدعاء
`registerProvider()` واحد، والمستخدم يستطيع فرض مزوّد معيّن لكل طلب أو إعادة ترتيب
السلسلة، مع بقاء آلية الاحتياط التلقائي والتجميد (cooldown) والكاش كما هي.

الواجهات الحالية (`translateText`, `translateTextWithMeta`, `detectLanguage`,
`chunkText`, `isUntranslatable`, `applyGlossary`) **لا تتغير توقيعاتها** — نضيف
`opts` اختيارياً لـ `translateTextWithMeta` فقط.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-integration-docs

**Context from dependencies:** لا شيء — هذا الملف هو نقطة البداية. يبني على
`server/translate.js` الحالي (اقرأه من القرص قبل التعديل — قد تكون الجلسة الموازية
أضافت سطوراً مثل `logError`).

## Files to Create

- `tests/provider.test.js` — اختبارات السجل والمزوّدين الجدد (بلا شبكة، خوادم stub)

## Files to Modify

- `server/translate.js` — سجل المزوّدين + مزوّد DeepL + مزوّد OpenAI-compatible
- `server/config.js` — متغيرات بيئة جديدة
- `server/envSettings.js` — مفاتيح إعدادات جديدة + تطبيق فوري
- `server/routes-translate.js` — `GET /api/providers` + تمرير `provider`/`providers`
- `.env.example` — توثيق المتغيرات الجديدة

## Technical Details

### بنية السجل (في `server/translate.js`)

```js
// واجهة المزوّد الموحّدة
// { id, label, requiresKey, isAvailable(), translate(text, targetLang, sourceLang) }
const providers = [];           // المزوّدون المسجّلون بالترتيب
const providerById = {};        // id → كائن المزوّد
function registerProvider(p) {
  providers.push(p);
  providerById[p.id] = p;
}
function getProviders() { return providers.slice(); }
function getProvider(id) { return providerById[id]; }
// المزوّدات المتاحة فعلاً (isAvailable) — تُستخدم للسلسلة الافتراضية
function getAvailableProviders() { return providers.filter((p) => p.isAvailable()); }
```

تحويل المحركات الحالية: كل دالة (`translateViaGoogle`, `translateViaMyMemory`,
`translateViaLibre`, `translateViaGemini`) تصبح مزوّداً:

```js
registerProvider({
  id: 'google',
  label: 'Google (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaGoogle,
});
registerProvider({
  id: 'mymemory', label: 'MyMemory (مجاني)', requiresKey: false,
  isAvailable: () => true, translate: translateViaMyMemory,
});
registerProvider({
  id: 'libre', label: 'LibreTranslate (مجاني)', requiresKey: false,
  isAvailable: () => true, translate: translateViaLibre,
});
registerProvider({
  id: 'gemini', label: 'Gemini (مفتاح مجاني)', requiresKey: true,
  isAvailable: () => Boolean(config.GEMINI_API_KEY), translate: translateViaGemini,
});
```

### المزوّد الجديد 1: DeepL (مجاني اختياري)

```js
// DeepL Free API: https://api-free.deepl.com/v2/translate
registerProvider({
  id: 'deepl', label: 'DeepL (مجاني)', requiresKey: true,
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
```

### المزوّد الجديد 2: متوافق OpenAI (محلي مجاني — Ollama / LM Studio)

```js
// يغطي أي خادم chat/completions: Ollama (http://localhost:11434/v1)،
// LM Studio (http://localhost:1234/v1)، OpenRouter، Groq… مجاني أو بمفتاح مجاني.
registerProvider({
  id: 'openai', label: 'AI محلي/متوافق OpenAI', requiresKey: false,
  isAvailable: () => Boolean(config.OPENAI_BASE_URL),
  translate: async (text, targetLang, sourceLang) => {
    const url = config.OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (config.OPENAI_API_KEY) headers.Authorization = `Bearer ${config.OPENAI_API_KEY}`;
    const prompt = `Translate the following text to ${targetLang}. Return only the translation, no explanations:\n\n${text}`;
    const res = await fetch(url, {
      method: 'POST', headers, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: config.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI-compatible HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new Error('OpenAI-compatible: استجابة فارغة');
    return out.trim();
  },
});
```

### الترتيب والسلسلة

```js
// الترتيب الافتراضي: مجاني بلا مفاتيح أولاً ثم الاختيارية (تُتخطى تلقائياً إن لم تتوفر)
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
```

في `translateTextWithMeta(text, targetLang, sourceLang, opts)`:
استبدل `TRANSLATION_ENGINES` بـ `resolveProviders(opts)` داخل الحلقة. آلية
`engineOnCooldown`/`engineSucceeded`/`engineFailed` تبقى كما هي (تُستدعى باسم
`engine.id`). تأكد أن `logError` مستدعاة عند الفشل (قد تكون موجودة من الجلسة الموازية —
لا تحذفها).

> ملاحظة: `translateText` تستدعي `translateTextWithMeta(text, targetLang, sourceLang)`
> بدون opts — تبقى متوافقة.

### `server/config.js` — متغيرات جديدة

```js
// ===== مزوّدات اختيارية (مجانية) =====
DEEPL_API_KEY: process.env.DEEPL_API_KEY || '',
DEEPL_URL: process.env.DEEPL_URL || 'https://api-free.deepl.com',
OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '', // مثال محلي: http://localhost:11434/v1
OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
OPENAI_MODEL: process.env.OPENAI_MODEL || '',
PROVIDER_ORDER: process.env.PROVIDER_ORDER || '', // مثل: 'google,mymemory,libre,gemini'
```

أضفها داخل `module.exports` مع تعليقات عربية تشرح أنها اختيارية ومجانية.

### `server/envSettings.js` — مفاتيح الإعدادات الجديدة

- أضف إلى `SETTING_KEYS`: `'DEEPL_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'OPENAI_MODEL', 'PROVIDER_ORDER'`
- في `saveSettings`: تحقق `OPENAI_BASE_URL` يبدأ بـ `http(s)://` إن وُجد (نمط تحقق
  `LIBRE_URL` الموجود)، و`PROVIDER_ORDER` يقبل حروفاً/أرقاماً/فواصل فقط
  (`/^[a-z0-9_,-]+$/i`).
- في التطبيق الفوري (بعد كتابة الملف): عيّن `config.DEEPL_API_KEY` إلخ لنفس
  القيم الجديدة.
- في `getSettings`: أعد الحقول الجديدة مقنّعة للمفاتيح:
  `deeplKey` (masked)، `hasDeeplKey`، `openaiKey` (masked)، `hasOpenaiKey`،
  `openaiBaseUrl`، `openaiModel`، `providerOrder`.

### `server/routes-translate.js`

- `GET /api/providers`:

```js
router.get('/providers', (req, res) => {
  const list = getProviders().map((p) => ({
    id: p.id, label: p.label, requiresKey: p.requiresKey,
    available: p.isAvailable(),
  }));
  res.json({ providers: list, defaultOrder: (config.PROVIDER_ORDER || '').split(',').filter(Boolean) });
});
```

- في `POST /api/translate` و`POST /api/translate-text`: اقرأ `provider`/`providers`
  من الجسم (`req.body.provider`, `req.body.providers`) ومررها كـ opts للاستدعاءات:
  `translateTextWithMeta(..., { provider, providers })` أو
  `translateText(..., { provider, providers })` — أضف وسيطاً ثالثاً اختيارياً للدالة.
  استورد `getProviders` من `./translate`.

### `.env.example`

أضف توثيقاً عربياً للمتغيرات الجديدة (بنمط الملف الحالي):

```
# ===== مزوّدات ترجمة اختيارية (مجانية) =====
# DeepL المجاني — مفتاح اختياري من deeple.com/pro-api (مجاني)
# DEEPL_API_KEY=
# أي خادم متوافق مع OpenAI (Ollama محلي مجاني: http://localhost:11434/v1 —
# LM Studio: http://localhost:1234/v1 — أو OpenRouter/Groq بمفتاح مجاني)
# OPENAI_BASE_URL=
# OPENAI_API_KEY=
# OPENAI_MODEL=
# ترتيب المزوّدين المفضّل (فاصلة) — تُتخطى المزوّدات غير المتوفرة تلقائياً
# PROVIDER_ORDER=google,mymemory,libre,gemini
```

### اختبارات `tests/provider.test.js` (بلا شبكة)

النمط (مثل `tests/settings.test.js`): عيّن متغيرات البيئة **قبل** `require` ثم شغّل
خادمي stub محليين عبر `http.createServer().listen(0)`:

```js
// 1) اضبط env قبل أي require حتى يقرأها config.js
process.env.DEEPL_API_KEY = 'test-key';
process.env.DEEPL_URL = 'http://127.0.0.1:PORT_A';        // سيُستبدل بالمنفذ الفعلي لاحقاً
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:PORT_B';  // نفسه
process.env.OPENAI_MODEL = 'test-model';
```

> **انتباه:** لأن المنافذ تُعرف بعد listen، اعتمد نمط: أنشئ الخادمين أولاً، ثم عيّن
> env، ثم `require('../server/translate')` (config.js يقرأ env وقت الاستيراد). بديل
> أوضح: `process.env.DEEPL_URL` يُضبط ديناميكياً بعد بدء الخادم **قبل** أول استدعاء —
> المهم أن config.js لم يُستورد بعد. رتب الكود بحيث: أنشئ stubs → عيّن env →
> استورد config/translate.

اختبارات مقترحة (8):

1. `registerProvider/getProviders`: السجل يعيد كل المزوّدات، و`getProvider('google')` موجود
2. `isAvailable`: google/mymemory/libre متاحون دائماً؛ gemini متاح فقط بمفتاح
   (أعد تشغيل الاستيراد؟ أبسط: اختبر `getAvailableProviders()` يحتوي google ولا يحتوي
   deepl/openai عندما env فارغان — نفّذ بحالة ثانية عبر كائن فرعي: غطِّ بـ
   `getProvider('deepl').isAvailable() === true` لأن DEEPL_API_KEY مضبوط في هذه
   العملية، و`getProvider('openai').isAvailable() === true` لوجود OPENAI_BASE_URL)
3. `resolveProviders` بالترتيب الافتراضي: أول عنصر `google`
4. `resolveProviders({provider:'deepl'})`: يُرجع deepl فقط
5. ترجمة فعلية عبر مزوّد deepL من stub: الخادم يعيد
   `{ translations: [{ text: 'translated' }] }` ويتحقق أن الطلب يحمل رأس
   `Authorization: DeepL-Auth-Key test-key` وأن `target_lang` = 'AR' — ثم
   `translateText('hello', 'ar', 'en', { provider: 'deepl' })` يعيد `'translated'`
6. مزوّد openai من stub: الخادم يعيد `{ choices: [{ message: { content: 'الترجمة' } }] }`
   ويتحقق من `model: 'test-model'` في الجسم — `translateText(...)` مع
   `{ provider: 'openai' }` يعيد النص المترجم
7. ترتيب مخصص عبر opts.providers: `{ providers: ['openai', 'google'] }` — يبدأ من
   openai (الـ stub ينجح فلا يصل google)
8. `GET /api/providers` (عبر `app.listen(0)` مثل tests/settings.test.js): يعيد
   مصفوفة تحتوي google مع `available: true`

ملاحظة: لا تُفعّل gemini في الاختبارات (يحتاج شبكة) — اتركه غير متاح.

## Acceptance Criteria

- [ ] `require('../server/translate')` يصدّر نفس الوظائف القديمة بنفس التوقيعات
- [ ] `getProviders()` يعيد 6 مزوّدات: google, mymemory, libre, gemini, deepl, openai
- [ ] `translateText('hello','ar','en',{provider:'deepl'})` يترجم عبر stub DeepL
- [ ] `translateText('hello','ar','en',{provider:'openai'})` يترجم عبر stub OpenAI
- [ ] ترتيب افتراضي يبدأ بـ google ويتخطى المزوّدات غير المتوفرة
- [ ] `GET /api/providers` يعمل ويعيد الحقول المطلوبة
- [ ] `npm run check` سليم (لا أخطاء صياغة)
- [ ] كل الاختبارات الجديدة تمر دون أي اتصال شبكي

## Notes

- ⚠️ **جلسة موازية نشطة تعدّل نفس الملفات** (`server/translate.js`,
  `server/routes-translate.js`, `.env.example`): أعد قراءة كل ملف من القرص قبل
  التعديل. لا تحذف أي سطر موجود (مثل استدعاءات `logError`/`trackUsage`). لا تنفّذ
  `git add/commit/clean` — المنسّق يلتزم.
- لا تلمس `extension/` ولا `public/sw.js` ولا `public/manifest.webmanifest`.
- لا تقم بـ `npm install` — كل الحزم مثبتة.
- نمط التعليقات بالعربية كما في الملفات الحالية.
- `detectLanguage` يبقى كما هو (Google) — لا يمر عبر السجل.
