# Requirements: Wave 1 — Providers + Files

## Summary

أرا لينك اليوم يترجم الروابط (يوتيوب/مقالات) بسلسلة محركات ثابتة
(Google→MyMemory→Libre→Gemini). الموجة 1 ترفعه إلى منصة ترجمة حقيقية على ثلاث ركائز:

1. **طبقة مزوّدين موحّدة**: كل محرك يصبح مزوّداً مسجلاً بواجهة مشتركة
   (`id/label/requiresKey/isAvailable/translate`). المزوّدون الجدد مجانيون: DeepL
   (مفتاح مجاني اختياري) وأي مزوّد متوافق مع OpenAI (Ollama / LM Studio محليان =
   مجانيان بلا مفتاح؛ OpenRouter/Groq بمفاتيح مجانية). المستخدم يختار المزوّد المفضّل
   من الواجهة، والطلب يحمل `provider` لفرضه، مع بقاء سلسلة الاحتياط التلقائي.
2. **استيراد/تصدير ملفات**: 11 صيغة إدخال (txt, md, docx, xlsx, csv, srt, vtt, json,
   xml, epub, pptx) و8 صيغ إخراج (txt, md, docx, srt, vtt, json, csv, xml). الترجمة
   تحافظ على البنية: التوقيتات في الترجمات، المفاتيح في JSON/XML، الصفوف في CSV/XLSX.
3. **واجهة المستخدم**: وضع «ملف» جديد (سحب/إفلات + تحميل) + أزرار تصدير النتيجة
   بأي صيغة + قائمة «المحرك المفضّل» في الإعدادات مع حالة كل مزوّد.

كل شيء **مجاني**: المزوّدات الافتراضية بلا مفاتيح (Google/MyMemory/Libre)، والمزوّدات
الاختيارية إما مجانية (DeepL Free، مفتاح Gemini المجاني الموجود) أو محلية (Ollama/
LM Studio). لا حاجة لأي مفتاح مدفوع.

## Goals

- بنية مزوّدين قابلة للتوسع: إضافة مزوّد جديد = استدعاء `registerProvider()` فقط
- تبديل المزوّد فوراً من الواجهة + فرضه لكل طلب + احتياط تلقائي عند الفشل
- ترجمة ملفات DOCX/XLSX/CSV/SRT/VTT/JSON/XML/EPUB/PPTX مع الحفاظ على البنية
- تصدير النتيجة المترجمة بأي صيغة مدعومة (SRT/VTT للتوقيتات، DOCX/TXT/MD للنص،
  JSON/XML/CSV للبنى)
- كاش الترجمة الحالي يعمل مع كل المزوّدين (بدون تكرار)
- كل الاختبارات الجديدة بلا شبكة (stub خوادم محلية / حقن دالة ترجمة)

## Non-Goals

- لا قاعدة بيانات (يبقى بلا حالة — الكاش ملف JSON فقط)
- لا إعادة بناء ملفات pptx/epub (إخراجها v1 = txt/md/docx فقط — موثّق كقيد)
- لا OCR ولا فيديو محلي ولا تشكيل عربي في هذه الموجة (موجة 2)
- لا لمس أعمال الجلسة الموازية: `extension/`, `public/sw.js`,
  `public/manifest.webmanifest`, `public/icons/`
- لا محركات مدفوعة (لا Azure/Microsoft مدفوع، لا Google Cloud مدفوع)

## Acceptance Criteria

- [ ] `GET /api/providers` يعيد كل المزوّدين مع `available` (المفتاح موجود؟) و`active`
- [ ] `POST /api/translate` و`/api/translate-text` يقبلان `provider`/`providers` ويفرضان الترتيب
- [ ] المزوّد الجديد «متوافق OpenAI» يترجم عبر `OPENAI_BASE_URL` (Ollama/LM Studio/OpenRouter)
- [ ] `POST /api/translate-file` يترجم docx/xlsx/csv/srt/vtt/json/xml/epub/pptx/txt/md
- [ ] `POST /api/export` يعيد ملفاً بترميز MIME صحيح + `Content-Disposition: attachment`
- [ ] SRT/VTT: التوقيتات الأصلية محفوظة والنتيجة تُعاد بصيغة صحيحة
- [ ] JSON/XML: المفاتيح والبنية محفوظة، القيم النصية فقط تُترجم
- [ ] الواجهة: وضع ملف (سحب/إفلات) + أزرار تصدير + قائمة المزوّد المفضّل في الإعدادات
- [ ] `npm test` يمر بالكامل (القديم + الجديد) و`npm run check` سليم
- [ ] RTL عربي لكل الإضافات الجديدة، بلا نصوص إنجليزية ظاهرة في الواجهة

## Assumptions

- العقد الحالي في `server/translate.js` يُحافَظ عليه: `translateText` و
  `translateTextWithMeta` و`detectLanguage` و`chunkText` و`isUntranslatable` و
  `applyGlossary` (توقيعات متماثلة — لا كسر للواجهة)
- `require('docx')` و`require('fast-xml-parser')` يعملان في CommonJS (مثبتان بالفعل)
- كل الحزم الجديدة مثبتة في `node_modules` (لا حاجة لـ npm install)

## Technical Constraints

- CommonJS، Node 18+ (global fetch متاح)، التعليقات بالعربية (نمط المشروع)
- الترجمة بالدفعات: حدود Google (≤10 طلب/دقيقة بلا حجب) → كاش + تأخير 250ms + تجميع
  القطع: الملفات تُترجم عبر `translateList` (فك تكرار + دفعات ≤3500 حرف)
- الاختبارات بلا شبكة: خوادم stub على `127.0.0.1:0` + حقن دالة ترجمة
  (`translateFileContent(..., translateFn)` وfiles.js يستدعي `translate.translateText`
  وقت التنفيذ ليمكن تزييفه في الاختبارات)
- حجم جسم JSON لمسارات الملفات: `express.json({ limit: '15mb' })` على الراوتر نفسه
  ويُركَّب الراوتر **قبل** middleware الجلب العام في `server.js` (وإلا يرفض 2mb)
- `MAX_FILE_CHARS = 300000` حد النص المستخرج من أي ملف (حماية ذاكرة)
- `MAX_CELLS = 2000` حد الخلايا في xlsx/csv (حماية حصص الترجمة المجانية)
