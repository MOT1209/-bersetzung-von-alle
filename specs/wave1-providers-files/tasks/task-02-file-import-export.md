# Task 02: استيراد/تصدير الملفات (File Import / Export)

## Status

pending

## Wave

1

## Description

بناء وحدة `server/files.js` تترجم **ملفات** كاملة وتصدّرها بنفس البنية: DOCX (قراءة
mammoth / كتابة docx)، XLSX (exceljs)، CSV، SRT/VTT (ترجمات بتوقيتات محفوظة)، JSON
وXML (قيم نصية فقط مع حفظ المفاتيح)، EPUB (قراءة epub2)، PPTX (قراءة عبر jszip +
fast-xml-parser)، TXT/MD مباشرة. نقطتان API: `POST /api/translate-file` (نص
base64 + الصيغة) و`POST /api/export` (يعيد ملفاً جاهزاً للتحميل). الترجمة بالدفعات
مع فك التكرار لحماية الحصص المجانية. كل الاختبارات بلا شبكة (حقن دالة ترجمة).

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-integration-docs

**Context from dependencies:** لا شيء. يعتمد على `server/translate.js` الحالي فقط عبر
`require('./translate')` **وقت التنفيذ** (وليس التفكيك عند الاستيراد) ليمكن تزييف
`translateText` في الاختبارات.

## Files to Create

- `server/files.js` — الاستخراج والترجمة والتصدير
- `server/routes-file.js` — راوتر `/api/translate-file` + `/api/export`
- `tests/files.test.js` — اختبارات شاملة (بلا شبكة)

## Files to Modify

- `server/server.js` — تركيب الراوتر **قبل** middleware الجلب العام (حد 15mb للراوتر)

## Technical Details

### `server/files.js` — الواجهة العامة

```js
const translate = require('./translate'); // وصول وقت التنفيذ — يسمح بحقن دالة في الاختبارات
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const JSZip = require('jszip');
const EPUB = require('epub2');

const SUPPORTED_IMPORT = ['txt','md','docx','xlsx','csv','srt','vtt','json','xml','epub','pptx'];
const SUPPORTED_EXPORT = ['txt','md','docx','srt','vtt','json','csv','xml'];
const MAX_FILE_CHARS = 300000;   // حد النص المستخرج
const MAX_CELLS = 2000;          // حد الخلايا في xlsx/csv

module.exports = {
  SUPPORTED_IMPORT, SUPPORTED_EXPORT,
  parseSubtitle, buildSubtitle,
  extractText, translateFileContent, buildExport,
  translateList, translateStructured,
};
```

### دوال مهمة

**`parseSubtitle(content, fmt)`** — يقبل 'srt' أو 'vtt' ويعيد
`{ segments: [{ start, end, text }] }` (بالثواني، أرقام). أنماط:
- SRT: `index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext`
- VTT: `WEBVTT` header، `HH:MM:SS.mmm --> HH:MM:SS.mmm\ntext`، تجاهل سطور
  `NOTE`/فارغة. بعض ملفات VTT فيها `00:00:00.000 --> 00:00:00.000` وسمات — تجاهل ما
  بعد المسافة في سطر التوقيت.
- النص قد يكون متعدد الأسطر — اجمع الأسطر حتى السطر الفارغ التالي أو التوقيت التالي.

**`buildSubtitle(segments, fmt)`** — عكسها: يعيد نص SRT/VTT كاملاً مع تنسيق الوقت:
- SRT: `HH:MM:SS,mmm` — VTT: `HH:MM:SS.mmm`
- دالة مساعدة `formatClock(seconds, { srt })` (توجد `buildSrt` في `server/youtube.js`
  — راجعها لتطابق التنسيق، لكن لا تعتمد عليها في الاستيراد).

**`extractText(buffer, ext)`** → `{ format, text, segments? }`:
- `txt`/`md`: النص كما هو (`buffer.toString('utf8')`)
- `docx`: `mammoth.extractRawText({ buffer })` → `result.value`
- `srt`/`vtt`: `parseSubtitle` → `{ format, segments, text: segments.map(s=>s.text).join('\n') }`
- `xlsx`: exceljs `new ExcelJS.Workbook().xlsx.load(buffer)` → لكل ورقة، لكل صف، اجمع
  قيم الخلايا النصية (أول 2000 خلية): الصف = خلايا بفواصل ` | `، الأوراق/الصفوف
  بفواصل أسطر — `text` جاهز للترجمة، مع `MAX_CELLS`/`MAX_FILE_CHARS`
- `csv`: محلل يدوي صغير يحترم علامات الاقتباس (`"a,b"` خلية واحدة) → `rows: string[][]`
  → `text` = صفوف بفواصل أسطر، خلايا بفواصل ` | `
- `json`: `JSON.parse(buffer)` → `{ structure }` يحفظ الكائن + `text` = تمثيل نصي
  للقيم النصية (سطور)
- `xml`: `new XMLParser({ ignoreAttributes: false, trimValues: false }).parse(...)`
  → `{ structure, text }`
- `epub`: `EPUB.create(buffer)` (قراءة الصفحات عبر events — انظر توثيق epub2:
  `epub.flow` / `epub.spine`؛ وثّق التعامل مع `epub` غير الصالح بخطأ واضح) →
  اجمع نص الفصول
- `pptx`: `JSZip.loadAsync(buffer)` → اقرأ `ppt/slides/slide*.xml` (رتبها رقمياً) →
  استخرج نصوص `<a:t>` (regex `/<a:t[^>]*>([^<]*)<\/a:t>/g` أو fast-xml-parser) →
  شريحة = فقرة، `\n` بين الجمل

كل استخراج: إذا تجاوز `text.length` حد `MAX_FILE_CHARS` اقتطع مع تمييز
(`text = text.slice(0, MAX_FILE_CHARS) + '\n…'`).

**`translateList(uniqueTexts, targetLang, translateFn)`** — قلب الترجمة بالدفعات:
- فك التكرار (Set مع الاحتفاظ بالترتيب)، تجاهل النصوص الفارغة/القصيرة جداً
- دفعات: اجمع نصوصاً حتى 3500 حرف، افصلها بـ `\n`، ترجم الدفعة كقطعة واحدة عبر
  `translateFn(chunk, targetLang, 'auto')`، ثم افصل النتيجة بـ `\n` (Google يحافظ
  على الأسطر). إن اختلف عدد الأسطر بعد الترجمة → ارجع النص المترجم كاملاً كسطر واحد
  لهذه الدفعة (مقاومة للأخطاء، لا ترمِ)
- تأخير 250ms بين الدفعات (حماية حصص Google) — احترم وجود كاش تلقائياً
- تعيد `Map` من النص الأصلي → المترجم

**`translateStructured(obj, translateListMap)`** — اجتياز متكرر لأي كائن/مصفوفة:
- القيم النصية (`typeof v === 'string'` وأطول من 1 حرف وليست أرقاماً/روابط/توقيتات
  خالصة) تُترجم عبر الخريطة (بدون إعادة طلب)
- المفاتيح محفوظة كما هي؛ `null`/رقم/بولين يبقى

**`translateFileContent(content, format, targetLang, translateFn, sourceLang)`** →
`{ format, translated, segments?, structure?, stats: { items, fromCache? } }`:
- `translateFn` افتراضي `translate.translateText` — يُستدعى **وقت التنفيذ**
- `content` **نص/سلسلة** (للاختبارات والتطبيق) — الاستخراج من Buffer في دوال
  `extractText`/اختبارات
- SRT/VTT: `translateList(نصوص فريدة)` → `segments` جديد بنفس التوقيتات ونصوص مترجمة
  + `translated` = `buildSubtitle(segments, format)`
- JSON/XML: `translateStructured(structure, map)` → `structure` جديد + `translated` =
  تمثيل نصي جميل
- CSV: خلايا فريدة → خريطة → إعادة بناء `rows` → `translated` = CSV مُعاد بناؤه
  (مع تخطي القيم الفارغة؛ الخلايا التي تتعذر ترجمتها تبقى أصلية)
- XLSX: مثل CSV خلايا فريدة (استخرج النص، ترجم، أعد البناء كمصفوفة صفوف لاحقاً في
  التصدير)
- TXT/MD/DOCX/EPUB/PPTX: `translateFn(text كاملاً)` عبر chunkText الموجود
  (`translate.translateText` يقسّم داخلياً) → `translated` نص
- `stats.items` = عدد القطع/الخلايا الفريدة المترجمة

**`buildExport(format, { text, segments, structure, filename })`** →
`{ buffer, mime, extension }`:
- `txt`/`md`: Buffer نصي، mime `text/plain`/`text/markdown`
- `srt`/`vtt`: من `segments` (أو parse من `text`) عبر `buildSubtitle`
- `json`: `JSON.stringify(structure ?? text, null, 2)`، mime `application/json`
- `xml`: من `structure` عبر `new XMLBuilder({ ignoreAttributes: false }).build(...)`
  أو نص خام إن لم يوجد structure، mime `application/xml`
- `csv`: من `text` (سطور) أو structure، mime `text/csv`
- `docx`: مكتبة `docx`:

```js
const { Document, Packer, Paragraph, TextRun } = require('docx');
const paragraphs = String(text).split(/\n{1,}/).map((p) =>
  new Paragraph({ children: [new TextRun({ text: p })] }));
const doc = new Document({ sections: [{ children: paragraphs }] });
const buffer = await Packer.toBuffer(doc);
```

- `filename` افتراضي `translated.<ext>` (sanitize: احذف `/\\` والأحرف الخطرة)

### `server/routes-file.js`

```js
const express = require('express');
const { translateFileContent, buildExport, SUPPORTED_IMPORT, SUPPORTED_EXPORT } = require('./files');
const router = express.Router();

// راوتر خاص بحد جسم أكبر (15mb) — يُركَّب قبل express.json العام في server.js
router.use(express.json({ limit: '15mb' }));

// POST /api/translate-file — body: { format, content (base64), targetLang?, sourceLang?, provider? }
router.post('/translate-file', async (req, res) => { ... });
// POST /api/export — body: { format, text?, segments?, structure?, filename? }
router.post('/export', async (req, res) => { ... });
module.exports = router;
```

- `translate-file`:
  - تحقق `format` في SUPPORTED_IMPORT (إلا `400 invalid-format`) و`content` سلسلة
    (إلا `400 invalid-file`؛ حد طول base64 ~40MB)
  - `Buffer.from(content, 'base64')` → لكن files.js يتعامل مع Buffer: أضف في
    translateFileContent فحصاً: إن كان `Buffer.isBuffer(content)` استخرج أولاً عبر
    `extractText(content, format)` ثم ترجم. (الواجهة ترسل base64 → نمرر
    `Buffer.from(content,'base64')`).
  - مرر `provider`/`providers` من الجسم إلى translateFn عبر غلاف:
    `(t, tl, sl) => translate.translateText(t, tl, sl, { provider, providers })`
  - نجاح: `200 { format, translated, segments?, structure?, stats }`
  - الخطأ الموحّد: `sendError(res, e)` محلي (رمز → حالة: `invalid-format:400`,
    `invalid-file:400`, `translate-failed:502`, `server-error:500`) — كرر القالب
    الصغير من routes-translate.js (لا تستورد منه)
- `export`:
  - تحقق format في SUPPORTED_EXPORT والحمولة المناسبة (segments لـ srt/vtt،
    structure لـ json/xml، text لبقية) — إلا `400 invalid-format`/`invalid-export`
  - `res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)`
  - `res.type(mime).send(buffer)`
- ربط `body.provider` مع الترجمة وعدم كسر أي شيء آخر.

### `server/server.js`

ركّب الراوتر **فوراً بعد** `app.use(cors())` و**قبل** `app.use(express.json({limit:'2mb'}))`:

```js
app.use(cors());
app.use('/api', require('./routes-file')); // قبل express.json العام — له حد جسم 15mb خاص
app.use(express.json({ limit: '2mb' }));
```

(لا تغيّر الحد العام — الراوتر يعالج جسمه بنفسه. تأكد عدم تعارض المسارات مع الراوترات
الأخرى: `/api/translate-file` و`/api/export` غير مستخدمين.)

### اختبارات `tests/files.test.js` (بلا شبكة)

استخدم دالة ترجمة مزيفة: `const fakeTranslate = async (t) => String(t).toUpperCase()`
(أو `'X'` ثابتة). أنماط الاختبارات:

1. `parseSubtitle` SRT (3 مقاطع) → segments صحيحة (توقيتات + نصوص)
2. `parseSubtitle` VTT (مع `WEBVTT` و`NOTE`) → تجاهل العناوين
3. `buildSubtitle` SRT/VTT → نص بتنسيق `00:00:01,000 --> 00:00:04,000`
4. `extractText(Buffer.from('مرحبا'), 'txt')` → `{ text: 'مرحبا' }`
5. `translateFileContent('hello\nworld', 'txt', 'ar', fakeTranslate)` →
   `translated` مرفوع الحالة (أو حسب fake)
6. SRT عبر translateFileContent: التوقيتات محفوظة والنصوص مترجمة
7. JSON: `{ name: 'hello', meta: { tags: ['a','b'] }, count: 3 }` →
   المفاتيح والأرقام محفوظة، القيم النصية مترجمة
8. CSV: `a,b\n"x,y",z` → rebuild يحافظ على الخلايا (راجع الاقتباس في المخرجات)
9. docx export: `buffer[0..1]` يساوي `PK` (`0x50 0x4B`) ويفك عبر jszip ويحتوي النص
10. xlsx: أنشئ مصنفاً صغيراً في الاختبار عبر exceljs → `extractText` يعيد محتوى خلية
11. `GET/POST` نقاط API عبر `app.listen(0)`: `POST /api/translate-file` بـ
    `{ format:'txt', content: Buffer.from('hi').toString('base64') }` بعد تزييف
    `require('../server/translate').translateText` (انتبه: files.js يستدعي
    `translate.translateText` وقت التنفيذ — التزييف ينجح) → 200 والنص المترجم
12. `POST /api/export` srt → header Content-Disposition attachment + نص SRT صحيح

**خطأ شائع يجب تفاديه:** `require('../server/translate')` يقرأ config.js الذي يحاول
قراءة `.env` — لا مشكلة. لكن لا تدع الاختبارات تستدعي الشبكة أبداً: دائماً حقن
`translateFn` أو تزييف `translate.translateText`.

## Acceptance Criteria

- [ ] `server/files.js` يصدّر الدوال المطلوبة وكل الصيغ الـ11 تعمل في extractText
- [ ] `POST /api/translate-file` يترجم txt/json/srt/xlsx ويرجع بنية صحيحة
- [ ] `POST /api/export` يعيد ملفات docx/srt/json/csv بترميز MIME + attachment صحيحين
- [ ] SRT/VTT: توقيتات أصلية محفوظة 100%
- [ ] JSON/XML: المفاتيح والبنية محفوظة، القيم النصية فقط تُترجم
- [ ] `npm run check` سليم وكل اختبارات files.test.js تمر بلا شبكة
- [ ] حجم حد 15mb يعمل عبر الراوتر (اختبار: أرسل جسماً >2mb؟ اختياري — تحقق يدوياً
  أن الراوتر مركّب قبل express.json العام)

## Notes

- ⚠️ **جلسة موازية نشطة تعدّل `server/server.js`**: أعد قراءته قبل التعديل، أضف
  سطر التركيب فقط ولا تحذف أي شيء موجود. لا تنفّذ git add/commit/clean.
- لا تلمس `extension/` و`public/sw.js` و`public/manifest.webmanifest`.
- لا تقم بـ `npm install` — الحزم مثبتة (mammoth 1.12.1، docx 9.7.1، exceljs 4.4.0،
  epub2 3.0.2، fast-xml-parser 5.10.1، jszip 3.10.1). كلها تعمل مع `require` في
  CommonJS (مُتحقَّق).
- epub2 API: `const epub = new EPUB(buffer)` ثم `epub.on('end', ...)` — اقرأ
  `node_modules/epub2/README.md` إن لزم للفصول. إن تعذّر فتح الملف: خطأ واضح
  `invalid-file`.
- القيد الموثّق (v1): تصدير pptx/epub غير مدعوم — يُخرجان txt/md/docx فقط.
- النصوص القصيرة (حرف واحد/أرقام/روابط) لا تُترجم — تحقق سريع بمنطق مشابه
  `isUntranslatable` في translate.js.
