# Task 03: OCR (tesseract.js Backend)

## Status
complete

## Wave
1

## Description
`POST /api/ocr`: صورة (png/jpg/webp/bmp) base64 → tesseract.js (ara+eng) → نص. ملفات traineddata تُحمَّل مرة واحدة عبر سكربت وتُخزَّن محلياً (offline بعدها). **لا تلمس server.js ولا public/** — المنسّق يركّب الراوتر.

⚠️ **البدء بعد تثبيت tesseract.js**: تحقق أولاً أن `require.resolve('tesseract.js')` ينجح (المنسّق يثبّته في الخلفية). إن لم يكن موجوداً بعد: أنهِ مهمتك بتقرير «بانتظار التثبيت» — لا تثبّت بنفسك (npm بطيء على هذا الجهاز وقد يتعارض مع تثبيت المنسّق).

## Files to Create
- `server/ocr.js`
- `server/routes-ocr.js`
- `scripts/download-ocr-data.js` — تحميل traineddata مرة واحدة
- `tests/ocr.test.js`

## Technical Details

### 1) server/ocr.js
```js
const { createWorker } = require('tesseract.js');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'ocr', 'traineddata'); // server/ocr/traineddata/
```
- `OCR_LANGS = 'ara+eng'`
- **`ensureTraineddata()`**: إن لم توجد ملفات `ara.traineddata.gz` و`eng.traineddata.gz` في DATA_DIR → استدعِ سكربت التحميل؟ لا — أبسط: ارمِ خطأ واضحاً `ocr-not-ready` يوجه إلى `npm run download:ocr` (انظر 3). (التحميل التلقائي من CDN ممكن عبر tesseract.js لكنه قد يفشل/يبطئ — المطلوب التحميل المسبق.)
- **`recognizeImage(buffer)`**: worker جديد لكل طلب (نمط آمن): `const w = await createWorker(OCR_LANGS, 1, { langPath: DATA_DIR, cachePath: DATA_DIR, cacheMethod: 'write', logger: m => { if (m.status === 'recognizing text') progress = m.progress } })` → `const { data } = await w.recognize(buffer)` → `await w.terminate()` → يعيد `{ text: data.text.trim(), confidence: data.confidence }`.
- انتبه: createWorker قد ينشئ blob/Worker مشكلة في Node — النسخة 7 تتعامل معها (تستخدم worker_threads). إن واجهت مشكلة `navigator`/`document` راجع توثيق tesseract.js للـ Node.
- تصدير `{ recognizeImage, OCR_LANGS, DATA_DIR }`.

### 2) server/routes-ocr.js
- `express.Router()` + `express.json({ limit: '15mb' })` (نمط routes-file)
- **`POST /api/ocr`** body `{ content: base64, ext }`:
  - ext في `['png','jpg','jpeg','webp','bmp']` — إلا `400 invalid-format`
  - content سلسلة ≤ `15 * 1024 * 1024` — إلا `400 invalid-file`
  - إن لم تكن traineddata جاهزة → `503 { error: 'ocr-not-ready' }`
  - نجاح: `{ text, confidence }` — بلا نص/فارغ → `422 { error: 'ocr-empty' }`
- `sendError` محلي: `invalid-format:400, invalid-file:400, ocr-not-ready:503, ocr-empty:422, server-error:500`.

### 3) scripts/download-ocr-data.js
- يقرأ `ara.traineddata.gz` و`eng.traineddata.gz` من `https://tessdata.projectnaptha.com/4.0.0/` (GitHub Pages — تحميل مباشر بـ fetch) ويكتبهما في `server/ocr/traineddata/` (mkdir recursive).
- stdout: الحجم النهائي لكل ملف. exit 1 عند فشل التحميل.
- أضف في `package.json` script: `"download:ocr": "node scripts/download-ocr-data.js"` — **وحدك** من يعدّل package.json (لا ينافسك أحد).

### 4) tests/ocr.test.js (بلا شبكة)
- لا تستدعِ tesseract.js الحقيقي في الاختبارات (بطيء/ثقيل): تزييف `require('../server/ocr').recognizeImage` بدالة تعيد `{text:'مرحبا', confidence: 90}`.
- 1) رفض صيغة غير مدعومة (ext='pdf') → 400
- 2) نقص content → 400
- 3) نجاح: POST مع صورة base64 وهمية صغيرة → 200 + text من التزييف
- 4) `ocr-not-ready`: تزييف دالة فحص جاهزية traineddata (أو تحقق السلوك: إن لم توجد الملفات تُرجع 503 — افحص دالة `ensureTraineddata` عبر تزييف fs/المسار إن لزم؛ الأبسط: اختبر أن routes-ocr تستدعي دالة قابلة للتزييف وقت التنفيذ)
- 5) `scripts/download-ocr-data.js` بلا شبكة: لا تختبره (يحتاج شبكة) — فقط `node --check` عليه.

## Acceptance Criteria
- [ ] require('tesseract.js') ينجح (بعد تثبيت المنسّق)
- [ ] node --check server/ocr.js server/routes-ocr.js scripts/download-ocr-data.js
- [ ] node --test tests/ocr.test.js → يمر بلا شبكة
- [ ] npm run download:ocr (يدوي — المنسّق يشغّله) يحمّل الملفين
- [ ] لا تلمس server.js ولا public/
