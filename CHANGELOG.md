# 📋 سجل التغييرات — AraLink

جميع التغييرات المهمة في المشروع موثقة هنا، بالترتيب من الأحدث إلى الأقدم.

## 📊 لوحة جودة الترجمة (WER) — المرحلة 2

**التاريخ:** 2026-08-27

- **`server/quality.js`** جديد: يقيس كل مزوّد ترجمة مقابل مجموعة جُمل مرجعية
  (`samples/translation/refset.json` — 8 جُمل × 4 لغات: ar/fr/de/es) عبر WER
  (`server/wer.js`) مع تطبيع خاص بكل لغة. الدرجة = `1 − min(WER, 1)`.
- **`scripts/bench-translate.js`** + `npm run bench:translate`: يشغّل القياس على
  المزوّدين المتاحين ويكتب `cache/quality-report.json`. خيارات: `--provider`،
  `--lang ar,fr`، `--delay`. ⚠️ يستهلك حصص الترجمة — يدوي لا في CI.
- **`GET /api/stats/quality`** (محمي بـ ADMIN_TOKEN): يقدّم آخر تقرير، أو
  `{ available: false }` إن لم يُشغَّل القياس بعد.
- **لوحة التحكم** (`admin.html` + `dashboard.js`): جدول جديد «جودة الترجمة حسب
  المزوّد» — درجة/‏WER لكل مزوّد ولكل لغة + وقت آخر تشغيل. لا يكسر اللوحة إن غاب التقرير.
- **اختبارات**: `tests/quality.test.js` (8) — بلا شبكة (مزوّدون وهميون): ترتيب
  حسب الدرجة، احتساب الإخفاقات، دورة حفظ/تحميل، وبوابة الإدارة على النقطة.
- `no-unused-vars` أضيف `ignoreRestSiblings` (لنمط حذف مفتاح عبر rest).
- **إصلاح سباق في `server/stats.js`**: `logEntry` كان يقرأ-يعدّل-يكتب دون تسلسل،
  فمداخل متزامنة تدهس بعضها (ضياع ترجمات في اللوحة). الآن كل الكتابات تمرّ عبر
  سلسلة وعود واحدة، و`trackUsage` ينتظرها + `flushStats()` للاختبارات.

## 🧹 تثبيت الجودة — إصلاحات المرحلة 1

**التاريخ:** 2026-08-27

- **إصلاح اختبار فاشل**: `tests/usage.test.js` كان يتوقّع `200` من `/api/stats` بينما صارت
  المسارات محمية بـ `ADMIN_TOKEN` (تُرجع `401`). حُدِّث ليضبط `ADMIN_TOKEN` + `STATS_LOG`
  ويطلب `/api/stats/summary` بترويسة `x-admin-token`، مع اختبار حارس للرفض بلا رمز.
- **تصفير تحذيرات lint** (كانت 23 → 0): إعدادات `no-unused-vars` تتجاهل مُعامل `catch`
  و`^_`؛ وحذف استيرادات ومتغيرات ميتة (`translateText` في `routes-sse`،
  `fetchArticleContent` في `routes-translate`، `path`/`config` في اختبارات، `progress` في `ocr`).
- `npm run lint` صار `--max-warnings=0` — أي تحذير جديد يكسر CI.
- **إصلاح أخطاء هجرة وحدات الواجهة** (`public/js/`):
  - وضع ترجمة الملف كان مكسورًا — `translate.js` يرسل `FormData` بينما `/api/translate-file`
    يتوقّع JSON base64. حُوِّل إلى `{ format, content, targetLang }` و`handleFile` صار يقرأ
    الملف base64 مع كشف الصيغة (11 صيغة) وحدّ 10MB.
  - زر «مشاركة» على سطح المكتب (بلا `navigator.share`) كان يرمي `TypeError` — لا عنصر
    `#share-link`. أُضيف حقل الرابط إلى `#share-view` مع تنسيقه، و`shareResult` صار يحرسه.
  - تحقّق آلي: كل مُعرّفات DOM المُشار إليها من `public/js/` موجودة الآن في `index.html`،
    واختبار حيّ لـ `/api/translate-file` ناجح.
- **مزامنة الوثائق مع الكود**: README/plan.md/AGENTS.md تعكس الآن CSP المفعّلة بتوجيهات،
  والمزوّد `zen` بمتغيراته `ZEN_*` (بدل `OPENAI_*`)، وسجل المزوّدين الموحّد، وبنية
  الواجهة الجديدة (وحدات `public/js/` بمدخل `app.js` — و`public/script.js` أصبح قديمًا مُستبدَلًا).
- الإجمالي: **233 اختباراً ناجحاً**، `node --check` 39/39.

## 🗂️ الموجة 3: انتهاء صلاحية كاش الترجمة — `plan.md`

**التاريخ:** 2026-08-11

- `server/cache.js`: مدة صلاحية افتراضية **30 يومًا** للمدخلات (`CACHE_TTL_MS` بالمللي ثانية؛
  `0` = بلا انتهاء) — يكمل حد العدد الأقصى ويمنع النمو غير المحدود.
- انتهت الصلاحية → `get()` يرجع `null` ويحذف المدخل من الذاكرة ويُجدول فلاشًا ليطهر القرص.
- `prune()` تُسقط المنتهي قبل تقليم العدد، وتُطبَّق أيضًا عند التحميل الأول (`loadInitial`).
- توثيق: `.env.example` + `README.md`.
- اختبارات جديدة: `tests/cacheTtl.test.js` و`tests/cacheTtlZero.test.js` (انتهاء أثناء التشغيل،
  إسقاط عند الإقلاع، إسقاط المنتهي قبل تقليم العدد، و`CACHE_TTL_MS=0` = بلا انتهاء).

## 🗂️ الموجة: تقوية الأمان — ترويسات الأمان + trust proxy — `plan.md`

**التاريخ:** 2026-08-11

- إضافة `helmet` (^8.3.0) — ترويسات أمان قياسية لكل الاستجابات: `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `COOP`/`CORP`، و`Strict-Transport-Security` (يُرسَل في كل استجابة — المتصفحات تعمل به فقط عبر HTTPS).
- `Content-Security-Policy` معطّل عمدًا (الواجهة تحمّل YouTube iframe API وسكربت ثيم مضمّن).
- تفعيل `trust proxy` في الإنتاج فقط (`NODE_ENV=production`) — يستعيد حد الطلبات لكل IP خلف بروكسي Render.
- اختبارات جديدة: `tests/securityHeaders.test.js` (ترويسات أساسية، غياب CSP، HSTS المشروط، فصل سلال IP عبر X-Forwarded-For).

## 🗂️ الموجة: تقوية الأمان — CORS بقائمة بيضاء — `plan.md`

**التاريخ:** 2026-08-11

- استبدال `app.use(cors())` المفتوح بمُصادِح قائمة بيضاء عبر `CORS_ORIGIN` في `.env`.
- فارغة = نفس الأصل فقط (الافتراضي الآمن)؛ فاصلة لأكثر من أصل؛ `*` للكل.
- طلبات بلا ترويسة Origin (نفس الأصل / عملاء غير متصفح) تمرّ بلا ترويسات CORS.
- اختبارات جديدة: `tests/cors.test.js` (رفض الأصول الأجنبية، عكس الأصل المسموح، القائمة والفاصل النجمي).
## 🗂️ الموجة 1: مزوّدون موحّدون + استيراد/تصدير ملفات — `specs/wave1-providers-files/`

**التاريخ:** 2026-08-10 — **الالتزام:** `22d7b19`

### المزوّدون (طبقة موحّدة)

- سجل مزوّدين موحّد (`registerProvider`) — إضافة مزوّد جديد = سطر واحد.
- **6 مزوّدات** كلها مجانية: Google / MyMemory / Libre / Gemini / DeepL (Free) /
  OpenAI-compatible (يدعم Ollama وLM Studio محليين بلا مفتاح، وOpenRouter/Groq بمفتاح مجاني).
- `GET /api/providers` يعيد كل المزوّدين مع حالة `available` (المفتاح موجود؟) و`active`.
- الطلب يقبل `provider` (فرض واحد) أو `providers` (ترتيب مخصّص) مع بقاء الاحتياط التلقائي عند الفشل.
- مفاتيح اختيارية عبر `.env`: `DEEPL_API_KEY`، `OPENAI_BASE_URL` (مثال Ollama: `http://localhost:11434/v1`)،
  `OPENAI_MODEL`، `PROVIDER_ORDER`.

### الملفات

- **11 صيغة إدخال**: txt, md, docx, xlsx, csv, srt, vtt, json, xml, epub, pptx.
- **8 صيغ إخراج**: txt, md, docx, srt, vtt, json, csv, xml.
- الحفاظ على البنية: توقيتات SRT/VTT، مفاتيح JSON/XML، صفوف CSV/XLSX.
- `POST /api/translate-file` (base64 + صيغة + لغة هدف) و`POST /api/export` (ملف جاهز للتحميل
  مع `Content-Disposition: attachment` وترميز MIME صحيح وأسماء عربية عبر RFC 5987).
- حماية حصص الترجمة: `MAX_FILE_CHARS = 300000` و`MAX_CELLS = 2000`، وحد جسم 15MB على الراوتر.

### الواجهة

- وضع **«📄 ترجمة ملف»** جديد (سحب/إفلات + اختيار ملف) بجانب وضعي الرابط والنص.
- أزرار **تصدير** النتيجة بأي صيغة مدعومة.
- قائمة **«المحرك المفضّل»** في الإعدادات مع حالة كل مزوّد + حقول جديدة لـ DeepL وOpenAI.

### اختبارات وجودة

- **23 اختباراً جديداً** (بلا شبكة: حقن دالة ترجمة + خوادم stub محلية) — الإجمالي **107** اختباراً ✅
- `npm run check` سليم: **25/25** ملفاً ✅

### قيود v1 (موثقة)

- **pptx/epub**: الاستيراد مدعوم، لكن التصدير بـ txt/md/docx فقط (لا إعادة بناء pptx/epub في v1).
- لا قاعدة بيانات (يبقى بلا حالة — الكاش ملف JSON فقط)، ولا OCR في هذه الموجة.
