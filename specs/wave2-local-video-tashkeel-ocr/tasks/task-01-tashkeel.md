# Task 01: تشكيل عربي (Tashkeel Backend)

## Status
complete

## Wave
1

## Description
نقطة `POST /api/tashkeel` تشكّل النص العربي: Gemini أولاً (مجاني — GEMINI_API_KEY موجود) مع احتياطي قواعدي فوري بلا شبكة. **لا تلمس server.js ولا public/** — المنسّق يركّب الراوتر.

## Files to Create
- `server/tashkeel.js` — منطق التشكيل
- `server/routes-tashkeel.js` — راوتر POST /api/tashkeel
- `tests/tashkeel.test.js` — اختبارات بلا شبكة

## Technical Details

### server/tashkeel.js
```js
// server/tashkeel.js — تشكيل النص العربي (إضافة الحركات)
// Gemini أولاً (مجاني) + احتياطي قواعدي بلا شبكة
const config = require('./config');
```
- **`diacritizeViaGemini(text)`**: اقرأ `translateViaGemini` في server/translate.js (~سطر 144) وكرّر النمط حرفياً: POST إلى `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent` مع `?key=`، headers JSON، `AbortSignal.timeout(30000)`، **بلا systemInstruction** (درس المشروع: يسبب رفضاً). Prompt بالعربية:
  `أضِف حركات التشكيل الكاملة (فَتْحَة، ضَمَّة، كَسْرَة، سُكُون، شَدَّة) إلى النص العربي التالي. لا تُغيّر أي حرف أو كلمة، وأَعِد النص مشكولًا فقط بدون شرح:\n\n${text}`
  اقرأ `data.candidates[0].content.parts[0].text`. إن لم يوجد → ارمِ خطأ.
- **`diacritizeBasic(text)`** — احتياطي قواعدي (بلا اعتماديات): لكل كلمة عربية (regex `\b[\u0600-\u06FF]{2,}\b` أو تقسيم مسافات) أضف سكوناً `\u0652` فوق آخر حرف إن لم يكن مشكولاً بالفعل، وشدة `\u0651` فوق الحرف الأول إن كان حرفاً مكرراً (gg→gّ). بسيط — الجودة أقل (سكون/شدة فقط). لا تلمس النصوص غير العربية (أرقام/روابط/لاتينية).
- **`diacritize(text)`** — المدخل الرئيسي: قسّم النص لفقرات (أسطر)، افحص كل فقرة: إن خلت من حروف عربية (`/[\u0600-\u06FF]/`) أبقها كما هي. إن وُجد `config.GEMINI_API_KEY` → chunks ≤8000 حرف (فصل على حدود الأسطر) عبر Gemini بالتتابع مع إعادة بناء النص بفواصل الأسطر الأصلية؛ عند أي فشل (خطأ/مهلة/استجابة فارغة) → ارجع للاحتياطي القواعدي للفقرة كلها. إن لم يوجد مفتاح → القواعدي مباشرة.
- تصدير: `module.exports = { diacritize, diacritizeBasic, diacritizeViaGemini }`

### server/routes-tashkeel.js
- `express.Router()` + `express.json({ limit: '2mb' })` على الراوتر نفسه (نمط routes-file)
- `POST /api/tashkeel` body `{ text }`:
  - بلا text/فارغ → `400 { error: 'invalid-text' }`
  - أطول من 200000 → `413 { error: 'input-too-large' }`
  - نجاح: `{ diacritized, engine: 'gemini'|'basic' }` — engine حسب المسار الفعلي
  - خطأ → `500 { error: 'server-error' }` (sendError محلي بقالب routes-translate)
- تصدير `module.exports = router`

### server.js
**لا تلمسه** — المنسّق سيضيف:
```js
app.use('/api/tashkeel', heavyLimiter);
app.use('/api', require('./routes-tashkeel'));
```

### tests/tashkeel.test.js (بلا شبكة — لا تستدعي Gemini أبداً)
1. `diacritizeBasic('مرحبا بالعالم')` → النتيجة تحوي حروفاً عربية وسكوناً (`\u0652`) في مواضع متوقعة، وعدد الكلمات محفوظ
2. `diacritizeBasic` لا يلمس النص اللاتيني/الأرقام (`'hello 123'` → كما هو)
3. `diacritizeBasic('gg')` → يضيف شدة
4. `diacritize` بلا مفتاح (عيّن `process.env.GEMINI_API_KEY=''` قبل استيراد config/تاشكيل — أو كائن فرعي عبر إعادة تعيين config.GEMINI_API_KEY إن كان قابل للتعديل؛ الأسهل: `config.GEMINI_API_KEY=''` ثم استعد القيمة الأصلية في finally) → يعمل عبر القواعدي ويُعيد `engine:'basic'` في مسار API
5. `POST /api/tashkeel` (عبر `app.listen(0)` كما في tests/settings.test.js) مع نص عربي → 200 + `diacritized` سلسلة غير فارغة؛ مع نص فارغ → 400
6. نص مختلط: `'hello\nمرحبا بالعالم\n123'` → الأسطر غير العربية تبقى حرفياً

## Acceptance Criteria
- [ ] node --check server/tashkeel.js server/routes-tashkeel.js
- [ ] node --test tests/tashkeel.test.js → كل الاختبارات تمر بلا شبكة
- [ ] node --test tests/translate.test.js tests/settings.test.js → لا كسر قديم
