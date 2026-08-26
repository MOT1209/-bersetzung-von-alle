# 🤖 نظام AI Agent — مشروع AraLink (مترجم الروابط)

نظام وكيل ذكاء اصطناعي كامل مبني على
[Agentic Coding Starter Kit](https://github.com/leonvanzyl/agentic-coding-starter-kit)
مع مهارات مخصصة لمشروع الترجمة.

## 🧠 ما هو هذا النظام؟

هو **عقل إرشادي لأي وكيل برمجة** (pi، Codex، Cursor، Claude Code). عندما يفتح الوكيل هذا
المجلد، يقرأ ملفات الإرشادات ويصبح قادرًا على:

| الملف | الوظيفة |
|---|---|
| `AGENTS.md` | القواعد الحاكمة: التخطيط، التقسيم، الوكالات الفرعية، العمارة، الاختبار |
| `CLAUDE.md` | نفس الإرشادات لمستخدمي Claude Code |
| `DESIGN.md` | نظام تصميم واجهة الترجمة (RTL عربي، ألوان، مكونات) |
| `.agents/skills/` | 18 مهارة عمل (تخطيط، تنفيذ، مراجعة، أمان، تصميم...) |
| `.claude/skills/` | نفس المهارات لـ Claude Code |
| `specs/translation-tool/` | مواصفة تنفيذ كاملة مقسمة إلى أمواج متوازية |

## 🛠️ المهارات المثبتة

- **create-spec** — تحويل محادثة التخطيط إلى مواصفة تنفيذ (spec)
- **implement-feature** — تنفيذ المواصفة موجة-بموجة مع بوابات مراجعة
- **translate-link** 🆕 — مهارة مخصصة لمشروع الترجمة (إلزامية قبل لمس كود الترجمة)
- **checkpoint** — حفظ نقاط التقدم
- **skill-creator** — إنشاء مهارات جديدة
- **security-scanner**، **review-pr**، **ship-it**، **frontend-design** وغيرها

## 📦 المواصفة الجاهزة: `specs/translation-tool/`

مواصفة كاملة لأداة الترجمة، مقسمة إلى 3 أمواج (منفذة بالكامل ✅):

```
الموجة 1 (متوازية)        الموجة 2 (متوازية)        الموجة 3
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│ 01 الإعداد    │        │ 04 المقالات   │        │ 06 الصقل      │
│ 02 محرك       │ ─────► │ 05 يوتيوب     │ ─────► │    والأخطاء   │
│    الترجمة    │        └───────────────┘        └───────────────┘
│ 03 الواجهة    │
└───────────────┘
```

## 🔊 ميزة الصوت: `specs/audio-pipeline/`

منفذة بالكامل ✅ — للفيديوهات **بدون ترجمات نصية**: تحميل الصوت (yt-dlp) → تفريغه محليًا
(Whisper tiny عبر transformers.js، بدون مفتاح API) → ترجمة النص مع توقيتات + تنزيل SRT.
وأي نتيجة تُقرأ بصوت عربي عبر زر **«🔊 استمع بالعربية»** (gTTS مجاني).

## ⚡ المرحلة الثانية: السرعة + الفيديو المترجم + كل اللغات — `specs/speed-video-langs/`

منفذة بالكامل ✅ :
- **محرك تفريغ أسرع**: sherpa-onnx (أسرع من الوقت الفعلي على CPU) بدل transformers.js،
  مع احتياطي تلقائي؛ وتحويل m4a→f32 مباشر بدون ملف wav وسيط (كان حتى 350MB).
- **كاش ترجمة دائم**: `cache/translation-cache.json` — إعادة نفس الرابط/النص فورية وبدون حصة
  Google (يعالج 429) + شارة «⚡ من الذاكرة المؤقتة» + صلاحية افتراضية 30 يومًا
  (`CACHE_TTL_MS`، و`0` لتعطيل الانتهاء).
- **130 لغة**: زر اختيار كامل بأسماء عربية + بحث فوري (`GET /api/languages`).
- **مشغل الفيديو المترجم**: الفيديو يشتغل داخل الصفحة وشريط الترجمة المترجمة يتحدث معه
  (YouTube IFrame API)، النقر على جملة ينقل الفيديو لها، وزر **«▶ تشغيل بترجمات مدمجة»**
  ينزّل الفيديو ويعرضه بترجمات WebVTT مرسومة فوقه (`GET /api/video/:id`).
- **إصلاح جوهري**: تنزيل يوتيوب عبر `server/downloader.js` (yt-dlp.exe مباشرة بـ execFile) —
  الغلاف النصي السابق كان يكسر الصيغ ويعلّق.

## 🗂️ المنصة: ملفات + مزوّدون — `specs/wave1-providers-files/`

منفذة بالكامل ✅ — ترقية أرا لينك إلى منصة ترجمة حقيقية:

- **6 مزوّدات موحّدة كلها مجانية**: Google / MyMemory / Libre / Gemini / DeepL (Free) /
  OpenAI-compatible (Ollama وLM Studio محليان بلا مفتاح).
- **`GET /api/providers`** يعيد كل المزوّدين وحالتهم؛ والطلب يقبل `provider` (فرض واحد) أو
  `providers` (ترتيب مخصّص) مع بقاء الاحتياط التلقائي.
- **مفاتيح اختيارية** عبر `.env`: `DEEPL_API_KEY`، `OPENAI_BASE_URL`
  (مثال Ollama: `http://localhost:11434/v1`)، `OPENAI_MODEL`، `PROVIDER_ORDER`.
- **ترجمة ملفات**: 11 صيغة إدخال (txt, md, docx, xlsx, csv, srt, vtt, json, xml, epub, pptx)
  و8 صيغ إخراج (txt, md, docx, srt, vtt, json, csv, xml) — مع الحفاظ على البنية:
  توقيتات SRT/VTT، مفاتيح JSON/XML، صفوف CSV/XLSX.
- **نقطتان جديدتان**: `POST /api/translate-file` (ترجمة ملف base64) و`POST /api/export`
  (تنزيل النتيجة بأي صيغة، مع أسماء ملفات عربية صحيحة).
- **الواجهة**: وضع «📄 ترجمة ملف» (سحب/إفلات) + أزرار تصدير + قائمة «المحرك المفضّل»
  في الإعدادات مع حقول DeepL وOpenAI.
- **قيد v1 موثّق**: تصدير pptx/epub بـ txt/md/docx فقط (لا إعادة بناء الصيغة).


## 🧩 الإضافات: امتداد المتصفح + OCR/TTS/PDF

- **امتداد المتصفح**: مجلد `extension/` (Chrome Manifest V3) — ترجم أي صفحة بنقرة واحدة عبر `popup.js` + `background.js`.
- **OCR/TTS/PDF**: استخراج النص من الصور (`server/ocr.js` + Tesseract.js) وملفات PDF (`server/pdf.js`) وتحويل النتيجة إلى صوت عربي (`server/tts.js` عبر MS Edge TTS) — مع معاينة وتصدير.

## 🛡️ الأمان (تحصين 2026)

- **CORS**: متغير `CORS_ORIGIN` في `.env` — قائمة أصول مسموحة مفصولة بفواصل
  (مثال: `https://app.example.com`)، وافتراضيًا (فارغ) = **نفس الأصل فقط**، وتُحجب
  طلبات المتصفحات من نطاقات أخرى تلقائيًا.
- **رؤوس أمان**: `helmet` مع تعطيل CSP (لازم لتشغيل مشغّل يوتيوب) → حماية clickjacking
  عبر `X-Frame-Options` و`X-Content-Type-Options: nosniff`؛ و`trust proxy` عند
  `NODE_ENV=production` لضبط `req.ip` خلف Render.

## 🚀 طريقة الاستخدام

### 1) مع أي وكيل برمجة (pi، Codex، Cursor، Claude Code)

افتح هذا المجلد ثم اكتب للوكيل:

```text
نفّذ المواصفة specs/translation-tool/ موجة بموجة باستخدام مهارة implement-feature.
```

### 2) تخطيط ميزة جديدة

```text
أنشئ مواصفة لميزة الترجمة الصوتية (dubbing) باستخدام مهارة create-spec.
```

### 3) تنفيذ يدوي مباشر

```bash
npm install
npm run dev        # يبدأ الخادم على http://localhost:3000
```

## 📁 هيكل المشروع المستهدف (من AGENTS.md)

```text
/                    ← أداة ترجمة، وليست تطبيق Next.js
├── public/          ← الملفات المنشورة عبر HTTP (وهي وحدها)
│   ├── index.html   ← الواجهة (RTL عربي)
│   ├── style.css    ← نظام التصميم
│   └── script.js    ← منطق الواجهة
├── server/
│   ├── server.js    ← خادم Express
│   ├── fetchContent.js ← استخراج المقالات
│   ├── youtube.js   ← ترجمات يوتيوب
│   ├── translate.js ← محرك الترجمة
│   ├── files.js     ← استيراد/تصدير الملفات (11 صيغة)
│   ├── routes-file.js ← مسارات ترجمة الملفات والتصدير
│   ├── usage.js     ← عدّاد الاستخدام
│   ├── logger.js    ← سجلات موحدة
│   └── config.js
├── .env             ← مفاتيح API (سرية)
├── specs/           ← المواصفات
└── .agents/skills/  ← مهارات الوكيل
```

## 📚 المصادر

- [Agentic Coding Starter Kit](https://github.com/leonvanzyl/agentic-coding-starter-kit)
- [Leon's Agent Skills](https://github.com/leonvanzyl/skills)
- [Skills CLI](https://github.com/vercel-labs/skills)
