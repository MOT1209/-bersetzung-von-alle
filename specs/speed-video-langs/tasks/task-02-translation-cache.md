# Task 02: كاش الترجمة الدائم + شارة meta.cached

## Status

complete — cache.js + translate.js + meta.cached في routes-translate.js. تحقق: get/set يعملان، cache/ يُنشأ.

pending

## Wave

1

## Description

حصة Google المجانية اليومية مستنفدة (429) — والترجمة نفس النص مرارًا مضيعة. نضيف كاش ملفي
بسيط: أي نص يُترجم يُحفظ في `cache/translation-cache.json` بمفتاح = hash(النص+اللغة المصدر+اللغة
الهدف)، وأي طلب لاحق لنفس المفتاح يُرجع فورًا بدون شبكة. نضيف أيضًا `meta.cached:true` في
استجابة `/api/translate` عندما تأتي الترجمة كلها من الكاش لتعرض الواجهة شارة «⚡ من الذاكرة».

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-video-player-frontend.md

**Context from dependencies:** ملفات حالية: `server/translate.js` (يصدّر `translateText(text,targetLang,sourceLang)`, `detectLanguage`, `chunkText`, `isUntranslatable`) — بداخله حلقة `for (const chunk of chunks)` تستدعي Google ثم Gemini. `server/routes-translate.js` فيه `handleYouTube` الذي يبني `translatedAll` ويرد `{type,youtube, videoId, sourceLang, captions, meta:{title,source}}` و`handleArticle` الذي يرد `{type,article, sourceLang, translatedBlocks, originalBlocks, meta:{title}}`.

## Files to Create

- `server/cache.js` — كاش ملفي بسيط (تحميل/حفظ/تنظيف)

## Files to Modify

- `server/translate.js` — استدعاء الكاش في حلقة الترجمة
- `server/routes-translate.js` — إضافة `meta.cached` في ردّي يوتيوب والمقال
- `.gitignore` — تجاهل `cache/` (إن وُجد ملف .gitignore)

## Technical Details

### server/cache.js (تصميم)

```js
// كاش ملفي: { [key]: { text, ts } } — key = sha1(text + '|' + sourceLang + '|' + targetLang)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CACHE_FILE = path.join(__dirname, '..', 'cache', 'translation-cache.json');
const MAX_ENTRIES = 5000;

function load() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; } }
function save(data) {
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) { /* حذف الأقدم: اجعل الإدخالات [key, ts] ورتّب */ }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
}
function cacheKey(text, sourceLang, targetLang) {
  return crypto.createHash('sha1').update(text + '|' + (sourceLang||'') + '|' + targetLang).digest('hex');
}
function get(text, sourceLang, targetLang) { const d = load(); return d[cacheKey(text, sourceLang, targetLang)]?.text || null; }
function set(text, sourceLang, targetLang, translated) { const d = load(); d[cacheKey(text, sourceLang, targetLang)] = { text: translated, ts: Date.now() }; save(d); }
module.exports = { get, set };
```

- عمليات القراءة/الكتابة متزامنة بسيطة (لا قاعدة بيانات) — يكفي لحجم صغير.
- `cache/` داخل المشروع: أضفه إلى `.gitignore`.

### server/translate.js — التعديل

في `translateText`، قبل استدعاء Google لكل chunk:

```js
const { get: cacheGet, set: cacheSet } = require('./cache');
// ...
for (const chunk of chunks) {
  const cached = cacheGet(chunk, sourceLang, targetLang);
  if (cached) { results.push(cached); fromCacheCount++; continue; }
  // ...المنطق الحالي (Google → Gemini)... عند النجاح:
  cacheSet(chunk, sourceLang, targetLang, out);
}
```

- أعد من `translateText` أيضًا عدد الأجزاء القادمة من الكاش، أو عدّل التوقيع إلى
  `translateText(text, targetLang, sourceLang)` → `{ translated, fromCacheCount }`؟ لا — أبسط:
  اصدّر دالة مساعدة جديدة `translateTextWithMeta(...)` تُرجع `{ translated, chunksFromCache }`
  وتترك `translateText` كما هي (تستدعي الدالة الجديدة). بهذا لا تنكسر الاستدعاءات الحالية.

### server/routes-translate.js — meta.cached

- في `handleYouTube`: اجمع `totalBatches` و`cachedBatches` من استدعاءات translateTextWithMeta؛
  في نهاية الرد أضف `meta.cached = cachedBatches === totalBatches` (عندما الكل من الكاش).
- في `handleArticle`: نفس الفكرة — اجمع النتائج، `meta.cached` = كل الكتل من الكاش.
- لا تغيّر أي رمز خطأ أو شكل `captions`/`translatedBlocks`.

### API

- لا مسارات جديدة. فقط حقل `meta.cached` (boolean) في ردود /api/translate.

## Acceptance Criteria

- [ ] `npm run check` سليم
- [ ] اختبار: `translateText('Hello world','ar','en')` مرتين — الثانية ترجع من الكاش (سجّل «cache hit»)
- [ ] ملف `cache/translation-cache.json` يُنشأ بعد أول ترجمة ناجحة
- [ ] `/api/translate` يستجيب بـ `meta.cached:true` عند تكرار نفس الرابط+اللغة (اختبار عبر curl على رابط لا يحتاج حصة إن أمكن؛ وإلا اختبر الوحدة مباشرة)
- [ ] `.gitignore` يتجاهل `cache/`

## Notes

- لا تلمس `server/audio.js`/`config.js`/`package.json` (task-01) ولا `server/server.js` (task-03).
- الكاش يقلل أثر حصص Google اليومية: أول طلب لكل نص فقط يستهلك الحصة.
- لا تُخفِ فشل الترجمة الحقيقي: الكاش يُكتب بعد نجاح فقط — الأخطاء (429) لا تُخزَّن.
