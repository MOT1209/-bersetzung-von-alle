# AraLink — نظام الوكيل المتعدد الشامل (Multi-Agent Workflow System)

> **الحالة:** مخطط — جاهز للمراجعة والتنفيذ
> **عدد الوكلاء:** 12 رئيسي + 24 فرعي = **36 وكيل**
> **التاريخ:** 2026-09-10

---

## المقدمة

هذا المستند يصمم نظام عمل متعدد الوكلاء (Multi-Agent Workflow System) شامل لأداة
**AraLink (ترجِم)**. يغطي كل جوانب المشروع: التطوير، الاختبار، الأمان، التوثيق،
النشر، الجودة، والأداء. كل وكيل هو كيان حقيقي يستخدم أداة Task لتنفيذ مهامه.

---

## الفهرس

1. [هيكل الوكلاء الشجري](#1-هيكل-الوكلاء-الشجري)
2. [الوكلاء الرئيسيون الاثنا عشر](#2-الوكلاء-الرئيسيون-الاثنا- عشر)
3. [الوكلاء الفرعيون (2 لكل رئيسي)](#3-الوكلاء-الفرعيون)
4. [.communication-and-coordination](#4-التواصل-والتنسيق)
5. [Workflows and Pipelines](#5-سير-العمل-والخطوط-الإنتاجية)
6. [Agent Task Reference](#6-مرجع-مهام-الوكلاء)

---

## 1. هيكل الوكلاء الشجري

```
┌─────────────────────────────────────────────────────────────────────┐
│                    🧠 ORCHESTRATOR AGENT (المنسّق الرئيسي)          │
│         يوزّع المهام، يراقب التقدم، يكشف التعارضات، يقرّر التسلسل   │
└──────────┬────────────────────────────────────────────────┬─────────┘
           │                                                │
     ┌─────┴─────────────────────────────────────────┬──────┘
     │                                                │
     ▼                                                ▼
┌─────────────────────┐                  ┌─────────────────────────────┐
│ 🔄 PARALLEL WAVE 1  │                  │ 🔒 SHARED SERVICES          │
│ (يمكن تشغيلها معًا) │                  │ (تُستدعى عند الحاجة)        │
├─────────────────────┤                  ├─────────────────────────────┤
│                     │                  │                             │
│ ┌───┐ ┌───┐ ┌───┐ │                  │ ┌─────────────────────────┐ │
│ │ A1│ │ A2│ │ A3│ │                  │ │ 🛡️ Security Sentinel     │ │
│ └───┘ └───┘ └───┘ │                  │ │ (حارس الأمان المتجوّل)  │ │
│ ┌───┐ ┌───┐ ┌───┐ │                  │ └─────────────────────────┘ │
│ │ A4│ │ A5│ │ A6│ │                  │ ┌─────────────────────────┐ │
│ └───┘ └───┘ └───┘ │                  │ │ 📋 Quality Guardian      │ │
│ ┌───┐ ┌───┐ ┌───┐ │                  │ │ (حارس الجودة المتنقّل)  │ │
│ │ A7│ │ A8│ │ A9│ │                  │ └─────────────────────────┘ │
│ └───┘ └───┘ └───┘ │                  │ ┌─────────────────────────┐ │
│ ┌───┐ ┌───┐ ┌───┐ │                  │ │ 📊 Metrics Collector     │ │
│ │10 │ │11 │ │12 │ │                  │ │ (جامع المقاييس)         │ │
│ └───┘ └───┘ └───┘ │                  │ └─────────────────────────┘ │
└─────────────────────┘                  └─────────────────────────────┘
```

### قائمة الوكلاء الرئيسيون بالاختصارات

| الرمز | الوكيل الرئيسي | النطاق |
|-------|----------------|--------|
| **A1** | 🔌 Translation Core Agent | محرك الترجمة الأساسي |
| **A2** | 📥 Content Extractor Agent | استخراج المحتوى من الروابط |
| **A3** | 🎨 Frontend UI Agent | واجهة المستخدم العربية |
| **A4** | ⚙️ Backend API Agent | الخادم وواجهات API |
| **A5** | 🎵 Media Pipeline Agent | TTS/STT/Dubbing/OCR |
| **A6** | 🗄️ Data & Storage Agent | قاعدة البيانات والتخزين |
| **A7** | ✅ Quality Assurance Agent | الاختبار والجودة |
| **A8** | 🛡️ Security Hardening Agent | الحماية والأمان |
| **A9** | 🚀 Deployment Agent | النشر والبنية التحتية |
| **A10** | 📖 Documentation Agent | التوثيق والمطوية |
| **A11** | ⚡ Performance Agent | الأداء والتحسين |
| **A12** | 🔗 Integration & Extension Agent | الإضافات والتكامل الخارجي |

---

## 2. الوكلاء الرئيسيون الاثنا عشر — وصف تفصيلي

### A1: 🔌 Translation Core Agent

**المهمة:** إدارة محرك الترجمة المتعدد المزوّدين مع التبديل التلقائي.

**النطاق:**
- `server/translate.js` — الترجمة fallback chain (Google → MyMemory → Libre → Gemini → DeepL → zen)
- `server/languages.js` — قائمة اللغات和支持ة
- كشف اللغة التلقائي عبر Google detection endpoint
- تقسيم النصوص الطويلة (4500 chars/chunk)
- الحفاظ على البنية (فواصل الأسطر، الفقرات، الكتل البرمجية)
- تبريد المحركات (cooldown) بعد فشل

**المخرجات المطلوبة:**
- تقرير عن حالة كل مزوّد (يعمل/متدخّل/محظور)
- اختبار كل مزوّد بالـ API الحقيقي
- تحسين منطق fallback以防情

---

### A2: 📥 Content Extractor Agent

**المهمة:** استخراج المحتوى من أي رابط — YouTube، مقالات، مواقع.

**النطاق:**
- `server/youtube.js` + `server/youtubeApi.js` — استخراج تعليقات YouTube
- `server/fetchContent.js` — استخراج النص من المقالات عبر cheerio + readability
- `server/extractionRules.js` — قواعد تنظيف HTML
- `server/context-detect.js` — كشف نوع الرابط تلقائيًا
- احترام المواقع (User-Agent خفيف، طلبات مخففة)
- معالجة الروابط المحجوبة والأخطاء بwdGrace

**المخرجات المطلوبة:**
- اختبار استخراج من 10 مواقع متنوعة
- تقرير عن المواقع التي يفشل استخراجها + اقتراح حلول

---

### A3: 🎨 Frontend UI Agent

**المهمة:** بناء وصيانة الواجهة العربية (RTL) المتجاوبة.

**النطاق:**
- `public/index.html` — الصفحة الرئيسية
- `public/style.css` — نظام التصميم حسب DESIGN.md
- `public/js/app.js` — نقطة الدخول (ES module)
- `public/js/ui.js` — مكوّنات الواجهة
- `public/js/translate.js` — منطق واجهة الترجمة
- `public/js/result.js` — عرض النتائج
- `public/js/stream.js` — SSE streaming UI
- الوضع الداكن/الفاتح + حفظ التفضيل في localStorage
- المتجاوبة مع الشاشات المختلفة
- إمكانية الوصول (ARIA، focus-visible، تباين AA)

**المخرجات المطلوبة:**
- مراجعة RTL شاملة لكل المكوّنات
- اختبار على شاشات مختلفة (موبايل، تابلت، سطح مكتب)
- تأكيد اتباع نظام التصميم في DESIGN.md

---

### A4: ⚙️ Backend API Agent

**المهمة:** إدارة الخادم وواجهات API والوسائط الوسيطة.

**النطاق:**
- `server/server.js` — Express app setup
- `server/routes-*.js` — جميع الـ 14 مسار API
- `server/config.js` — تحميل الإعدادات من .env
- `server/adminAuth.js` — مصادقة المسؤول
- `server/ssrf.js` — حماية SSRF
- `server/store.js` — متجر حد الطلبات
- ترتيب الوسائط (helmet → compression → routes)
- تسجيل وتوثيق كل API endpoint
- معالجة الأخطاء المركزية

**المخرجات المطلوبة:**
- مراجعة ترتيب الوسائط في server.js
- التأكد من تسجيل جميع المسارات (لا مسارات مفقودة)
- اختبار شامل لـ API endpoints

---

### A5: 🎵 Media Pipeline Agent

**المهمة:** إدارة خط إنتاج الوسائط المتعددة (TTS/STT/Dubbing/OCR).

**النطاق:**
- `server/tts.js` + `server/edge-tts.js` — تحويل النص إلى كلام
- `server/audio.js` + `server/providers/stt/` — تحويل الكلام إلى نص
- `server/dubbing/` — خط إنتاج الدبلجة الكامل (11 ملف)
  - `dubbing-pipeline.js`, `dubbing-service.js`, `voice-manager.js`
  - `segment-processor.js`, `audio-mixer.js`, `timing-engine.js`
  - `ffmpeg.js`, `ffmpeg-cost.js`, `export-service.js`
  - `cleanup.js`, `dub-owner.js`
- `server/ocr.js` + `server/ocr/` — التعرف الضوئي على الحروف
- `server/pdf.js` — معالجة ملفات PDF
- `server/files.js` — استيراد/تصدير 8 صيغ
- `server/routes-local-video.js` + `server/routes-dub.js` + `server/routes-tts.js` + `server/routes-ocr.js`

**المخرجات المطلوبة:**
- اختبار خط الدبلجة الكامل (من فيديو إلى صوت مترجم)
- اختبار OCR على صور بعربية مختلفة
- اختبار TTS بأكثر من لغة

---

### A6: 🗄️ Data & Storage Agent

**المهمة:** إدارة قاعدة البيانات والتخزين وال崩溃ات.

**النطاق:**
- `server/db/index.js` — تهيئة SQLite عبر `node:sqlite`
- `server/db/migrations.js` — ترحيلات/shemas
- `server/db/projects.js` — مشاريع المستخدمين
- `server/db/stats-repository.js` — مستودع الإحصائيات
- `server/cache.js` — ذاكرة التخزين المؤقت (ملف-based)
- `server/usage.js` — تتبع الاستخدام
- `server/stats.js` — إحصائيات النظام
- `server/providers/storage/` — مزوّدي التخزين (ملف + S3)
- `PRAGMA foreign_keys = ON` — ضروري لـ CASCADE
- تنظيف التخزين المؤقت القديم (TTL)

**المخرجات المطلوبة:**
- مراجعة migrations.js — لا تعديل migration مُنفّذ
- اختبار foreign keys cascade
- اختبار التخزين على القرص + S3

---

### A7: ✅ Quality Assurance Agent

**المهمة:** الاختبار الشامل وضمان الجودة.

**النطاق:**
- `tests/*.test.js` — 60+ ملف اختبار
- `tests/helpers/` — أدوات المساعدة في الاختبارات
- `server/quality.js` + `server/wer.js` — اختبار جودة الترجمة (WER benchmark)
- `npm run test` — تشغيل جميع الاختبارات
- `npm run test:coverage` — تغطية الكود
- التحقق من تثبيت المسارات في server.js (smoke test)
- التحقق من عدم تسريب Content-Encoding في SSE
- اختبار rate limiting, CORS, security headers

**المخرجات المطلوبة:**
- تشغيل جميع الاختبارات + التأكد من نجاحها
- تقرير تغطية الكود
- تحديد أي اختبارات مفقودة أو ضعيفة

---

### A8: 🛡️ Security Hardening Agent

**المهمة:** حماية التطبيق من الثغرات الأمنية.

**النطاق:**
- `server/ssrf.js` — حماية من هجمات SSRF
- `server/adminAuth.js` — مصادقة المسؤول (ADMIN_TOKEN)
- `server/ownerToken.js` — توقيع ملكية المحتوى
- Helmet CSP directives — تقييد الموارد
- CORS allowlist — تقييد المصادر
- Rate limiting — حماية من الاستنزاف
- تشفير API keys في .env (لا commits)
- حماية filePath traversal في ملفات المستخدم
- اختبار OWASP Top 10

**المخرجات المطلوبة:**
- مسح أمني شامل للتطبيق
- تقرير ثغرات (إن وُجدت) مع الحلول
- التأكد من عدم تسريب مفاتيح API

---

### A9: 🚀 Deployment Agent

**المهمة:** إدارة النشر والبنية التحتية وال错误恢复.

**النطاق:**
- `Dockerfile` + `docker-compose.yml` — حاوية Docker
- `render.yaml` — نشر على Render
- `server/jobs/queue.js` + `server/jobs/index.js` — محرك المهام الخلفية
- `server/jobs/job-manager.js` — مدير المهام
- `server/logger.js` — تسجيل الأحداث
- `scripts/check.js` — فحص ما قبل التشغيل
- `boot.out.txt` / `boot.err.txt` — سجلات الإقلاع
- `DEPLOY_NOTES.md` — ملاحظات النشر
- `CURRENT_STATE.md` — الحالة الحالية

**المخرجات المطلوبة:**
- مراجعة Dockerfile — تحسين الحجم والأمان
- اختبار البناء والتشغيل في Docker
- التحقق من صحة render.yaml

---

### A10: 📖 Documentation Agent

**المهمة:** كتابة وصيانة التوثيق.

**النطاق:**
- `README.md` — الدليل الرئيسي
- `DESIGN.md` — نظام التصميم
- `AGENTS.md` — تعليمات الوكلاء
- `CHANGELOG.md` — سجل التغييرات
- `DEPLOY_NOTES.md` — ملاحظات النشر
- `CURRENT_STATE.md` — الحالة الحالية
- `TEST_CASES.md` — حالات الاختبار
- `THIRD_PARTY.md` — المكتبات الخارجية
- `docs/openapi.json` — مواصفة API
- توثيق تعليقات الكود (JSDoc)
- `specs/` — مواصفات الميزات

**المخرجات المطلوبة:**
- مراجعة README.md — تحديث الحالة
- توثيق جميع API endpoints في OpenAPI
- تحديث CHANGELOG.md بأحدث التغييرات

---

### A11: ⚡ Performance Agent

**المهمة:** تحسين الأداء وتخفيض التكلفة.

**النطاق:**
- `server/cache.js` — ذاكرة التخزين المؤقت (TTL configurable)
- `server/cost.js` — تتبع تكلفة API calls
- `server/providers/translation/` — تحسين مزوّدين
- `server/routes-sse.js` — streaming بدل الانتظار
- `server/jobs/queue.js` — قسمة المهام الثقيلة
- `compression` middleware — ضغط الاستجابات
- `server/extractionRules.js` — تحسين استخراج HTML
- `scripts/bench-translate.js` + `scripts/perf-translate.js`
- `server/wer.js` — قياس جودة vs سرعة

**المخرجات المطلوبة:**
- تقرير أداء حالي (benchmarks)
- تحسين cache hit ratio
- تحسين وقت استجابة API

---

### A12: 🔗 Integration & Extension Agent

**المهمة:** إدارة التكامل الخارجي والإضافات.

**النطاق:**
- `extension/` — إضافة Chrome (Manifest V3)
  - `extension/background.js` — خلفية الإضافة
  - `extension/popup.js` + `extension/popup.html` — واجهة الإضافة
  - `extension/manifest.json` — تكوين الإضافة
- `server/routes-settings.js` — إعدادات API keys
- `server/envSettings.js` — إدارة متغيرات البيئة
- التكامل مع YouTube Data API v3
- التكامل مع محركات الترجمة الخارجية
- التكامل مع外部 TTS/STT services
- `server/providers/tts/` + `server/providers/stt/`

**المخرجات المطلوبة:**
- اختبار الإضافة على Chrome
- اختبار التكامل مع YouTube API
- مراجعة manifest.json — التوافق مع Manifest V3

---

## 3. الوكلاء الفرعيون (2 لكل رئيسي)

### A1: 🔌 Translation Core Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A1.1** Provider Health Monitor | مراقبة حالة مزوّدي الترجمة | اختبار كل مزوّد عبر API، قياس وقت الاستجابة، كشف المحظورين، تحديث cooldown timers |
| **A1.2** Chunking & Fallback Engineer | هندسة التقسيم والتبديل التلقائي | اختبار chunking strategies، تحسين حد 4500 chars، ضمان fallback chain، اختبار preserve formatting |

---

### A2: 📥 Content Extractor Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A2.1** YouTube Specialist | متخصّص YouTube | اختبار youtube-transcript، youtubeApi.js، التعامل مع الفيديوهات المحجوبة، تحسين YouTube Data API integration |
| **A2.2** Web Scraper Engineer | مهندس استخراج المواقع | تحس cheerio/readability rules، اختبار مواقع مختلفة، معالجة JavaScript-heavy sites، تحسين User-Agent rotation |

---

### A3: 🎨 Frontend UI Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A3.1** RTL Layout Specialist | متخصّص التخطيط العربي | مراجعة جميع المكونات لـ RTL، اختبار على شاشات مختلفة، ضمان方向 الصحيح للحدود والظلال |
| **A3.2** Interaction & Accessibility Engineer | مهندس التفاعل وإمكانية الوصول | اختبار keyboard navigation، ARIA labels، focus management، تحسين error states، loading states |

---

### A4: ⚙️ Backend API Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A4.1** Route Architect | مهندس المسارات | مراجعة 14 routes في server.js، التأكد من تسجيلها، تحسين middleware ordering، معالجة الأخطاء المركزية |
| **A4.2** Config & Auth Specialist | متخصّص التكوين والمصادقة | مراجعة config.js، .env management، ADMIN_TOKEN flow، cookie handling، owner tokens، API key validation |

---

### A5: 🎵 Media Pipeline Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A5.1** Dubbing Pipeline Engineer | مهندس خط الدبلجة | اختبار dubbing-pipeline.js الكامل، voice-manager، segment-processor، audio-mixer، timing-engine، ffmpeg integration |
| **A5.2** TTS/OCR/Files Specialist | متخصّص TTS/OCR/الملفات | اختبار tesseract.js OCR، gTTS/Edge-TTS، PDF parsing، file import/export (8 صيغ)، تحسين دقة OCR بالعربية |

---

### A6: 🗄️ Data & Storage Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A6.1** Database Migration Specialist | متخصّص ترحيلات قاعدة البيانات | مراجعة migrations.js، اختبار foreign keys، cascade deletes، حماية من تعديل migrations منفذة |
| **A6.2** Cache & Storage Engineer | مهندس التخزين المؤقت والتخزين | تحسين cache.js TTL، اختبار S3 storage provider، تنظيف الملفات القديمة، usage tracking accuracy |

---

### A7: ✅ Quality Assurance Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A7.1** Test Suite Runner | مشغّل مجموعة الاختبارات | تشغيل `npm run test` + `npm run lint`، تحليل الفشل، تغطية الكود عبر c8، smoke test |
| **A7.2** Integration Test Builder | بنّاء اختبارات التكامل | كتابة اختبارات جديدة للميزات المفقودة، اختبار API end-to-end، اختبار الترجمة الحقيقية، اختبار SSE streaming |

---

### A8: 🛡️ Security Hardening Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A8.1** Vulnerability Scanner | ماسح الثغرات | فحص OWASP Top 10، SSRF testing، injection testing، CSP audit، secrets scanning |
| **A8.2** Auth & Rate Limit Auditor | مدقّق المصادقة وحدود الطلبات | اختبار ADMIN_TOKEN flow، rate limiter correctness، CORS policy، API key security، owner token validation |

---

### A9: 🚀 Deployment Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A9.1** Docker & Container Engineer | مهندس Docker | تحسين Dockerfile (multi-stage)، اختبار docker-compose، تقليل حجم الصورة، أمان الحاوية |
| **A9.2** Job Queue & Process Manager | مدير المهام والعمليات | اختبار jobs/queue.js، concurrency limits، job cancellation، TTL cleanup، error recovery، restart handling |

---

### A10: 📖 Documentation Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A10.1** API Documentation Writer | كاتب توثيق API | تحديث OpenAPI spec، توثيق جميع endpoints، أمثلة cURL، أكواد الخطأ |
| **A10.2** User Guide & Changelog Writer | كاتب دليل المستخدم وسجل التغييرات | تحديث README.md، CHANGELOG.md، DRESS deployment notes، توثيق الميزات الجديدة |

---

### A11: ⚡ Performance Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A11.1** Benchmark Runner | مشغّل قياسات الأداء | تشغيل bench:translate + perf:translate، قياس response times، قياس memory usage، تحليل cache hit ratio |
| **A11.2** Optimization Engineer | مهندس التحسين | تحسين chunking strategy، تحسين caching logic، تحسين compression، تحسين SSE streaming، تقليل API calls |

---

### A12: 🔗 Integration & Extension Agent

| الفرعي | المهمة | النطاق التقني |
|--------|--------|---------------|
| **A12.1** Chrome Extension Developer | مطوّر إضافة Chrome | اختبار manifest.json V3، background.js، popup.js، اختبار على Chrome، تحديث icons |
| **A12.2** External API Integrator | مطوّر التكامل الخارجي | اختبار YouTube Data API v3، اختبار محركات الترجمة الخارجية، اختبار TTS/STT services، إدارة API keys |

---

## 4. التواصل والتنسيق

### 4.1 نموذج التواصل

```
┌─────────────────────────────────────────────────────────────────┐
│                     📨 MESSAGE BUS                              │
│              (قائمة مهام مشتركة في specs/)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📤 PRODUCER (وكيل يُنجز مهمة)                                 │
│     │                                                          │
│     ▼                                                          │
│  ┌──────────────┐                                              │
│  │ Task Result   │ → يُحدّث specs/{feature}/task-status.md     │
│  │ + Artifacts   │ → يحفظ المخرجات في المسار المحدد            │
│  └──────┬───────┘                                              │
│         │                                                      │
│         ▼                                                      │
│  📥 CONSUMER (وكيل يعتمد على المخرجات)                         │
│     │                                                          │
│     ▼                                                          │
│  يقرأ specs/{feature}/ للاطلاع على الحالة                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 قواعد التواصل

| القاعدة | الوصف |
|---------|-------|
| **1. لا يتداخل الوكلاء** | كل وكيل مسؤول عن نطاقه فقط |
| **2. المخرجات في specs/** | جميع المخرجات تُحفظ في `specs/{feature}/` |
| **3. الحالة في ملفات** | التحديثات عبر `task-status.md` لا رسائل مباشرة |
| **4. التبعيات صريحة** | كل وكيل يحدد تبعياته في بداية مهمته |
| **5. المنسّق يحسم التعارضات** | Orchestrator يقرّر عند تعارض الأولويات |
| **6. الفشل = تقرير** | أي وكيل يفشل يُنشئ تقرير فشل في specs/ |

### 4.3 بروتوكول التبعيات

```
الوكيل A1.1 (Provider Health Monitor)
    │
    ├── يعتمد على: لا شيء (独立)
    ├── يُنشئ: provider-status.json
    │
    ▼
الوكيل A1.2 (Chunking & Fallback Engineer)
    │
    ├── يعتمد على: provider-status.json (من A1.1)
    ├── يُنشئ: fallback-report.json
    │
    ▼
الوكيل A7.1 (Test Suite Runner)
    │
    ├── يعتمد على: fallback-report.json + provider-status.json
    ├── يُنشئ: test-results.json
```

### 4.4 جدول التبعيات الكامل

```
A1.1 ──→ A1.2 ──→ A7.1
A2.1 ──→ A2.2 ──→ A7.1
A3.1 ──→ A3.2 ──→ A7.1
A4.1 ──→ A4.2 ──→ A7.1
A5.1 ──→ A5.2 ──→ A7.1
A6.1 ──→ A6.2 ──→ A7.1

A8.1 ──→ A8.2 (يتطلبان بعضهما)
A9.1 ──→ A9.2
A10.1 ──→ A10.2
A11.1 ──→ A11.2
A12.1 ──→ A12.2

A7.2 ←─ جميع الوكلاء (reciprocal — يكتب اختبارات ويعيد للمراجعة)
```

---

## 5. سير العمل والخطوط الإنتاجية

### 5.1 Workflow: الترجمة الشاملة (Full Translation Pipeline)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 المهمة: ترجمة فيديو YouTube كامل (نص + صوت)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Wave 1 (Parallel):                                            │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ A2.1 YouTube      │  │ A6.1 DB Check    │                    │
│  │ Specialist        │  │ Project Setup    │                    │
│  └────────┬─────────┘  └────────┬─────────┘                    │
│           │                     │                               │
│  Wave 2 (Sequential):                                          │
│  ┌──────────────────┐                                          │
│  │ A1.1 Provider     │ ← يحتاج transcript من A2.1             │
│  │ Health Check      │                                          │
│  └────────┬─────────┘                                          │
│           │                                                     │
│  Wave 3 (Parallel):                                            │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ A1.2 Translation  │  │ A5.2 TTS         │                    │
│  │ (chunk + fallback)│  │ (audio generate) │                    │
│  └────────┬─────────┘  └────────┬─────────┘                    │
│           │                     │                               │
│  Wave 4 (Sequential):                                          │
│  ┌──────────────────┐                                          │
│  │ A5.1 Dubbing      │ ← يحتاج الترجمة من A1.2                │
│  │ Pipeline          │   + الصوت من A5.2                       │
│  └────────┬─────────┘                                          │
│           │                                                     │
│  Wave 5 (Parallel):                                            │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ A3.2 Display      │  │ A6.2 Cache       │                    │
│  │ Result UI         │  │ Store Result     │                    │
│  └────────┬─────────┘  └────────┬─────────┘                    │
│           │                     │                               │
│  Wave 6 (Quality Gate):                                        │
│  ┌──────────────────┐                                          │
│  │ A7.1 Smoke Test   │ ← يتحقق من كل النتائج                  │
│  └──────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Workflow: ترجمة مقال (Article Translation)

```
Wave 1:
  A2.2 Web Scraper → استخراج النص

Wave 2:
  A1.1 Health Check → التحقق من المزوّدين

Wave 3:
  A1.2 Chunk + Translate → ترجمة النص

Wave 4:
  A3.2 Display → عرض النتيجة
  A6.2 Cache → حفظ النتيجة

Wave 5:
  A7.1 Verify → التحقق من الجودة
```

### 5.3 Workflow: مسح أمني شامل (Security Audit)

```
Wave 1 (Parallel — 5 وكلاء معًا):
  A8.1 Vulnerability Scan
  A8.2 Auth + Rate Limit Audit
  A4.1 Route Security Review
  A12.1 Extension Security Check
  A6.2 Database Security Check

Wave 2 (Aggregation):
  Orchestrator → يجمع التقارير → يصنف الثغرات

Wave 3 (Remediation — parallel):
  A4.2 Fix Auth Issues
  A8.1 Fix Vulnerabilities
  A3.2 Fix CSP Issues

Wave 4 (Verification):
  A7.1 Re-run Tests
  A8.1 Re-scan
```

### 5.4 Workflow: نشر إصدار جديد (Release Pipeline)

```
Wave 1 (Pre-flight):
  A7.1 Full Test Suite → كل الاختبارات تمرّ
  A8.1 Security Scan → لا ثغرات حرجة
  A11.1 Benchmark → أداء مقبول

Wave 2 (Documentation):
  A10.2 Changelog → تحديث CHANGELOG.md
  A10.1 API Docs → تحديث OpenAPI

Wave 3 (Build):
  A9.1 Docker Build → بناء الصورة
  A9.2 Queue Health → التأكد من المهام

Wave 4 (Deploy):
  A9.1 Deploy → نشر على Render
  A12.2 API Verify → التأكد من APIs

Wave 5 (Post-deploy):
  A7.1 Smoke Test → اختبار على الإنتاج
  A11.2 Monitor → مراقبة الأداء
```

---

## 6. مرجع مهام الوكلاء

### 6.1 جدول التنفيذ والتبعيات

| الوكيل | النوع | التبعيات | المخرجات |
|--------|-------|----------|----------|
| A1.1 | Independent | لا شيء | `provider-status.json` |
| A1.2 | After A1.1 | `provider-status.json` | `fallback-report.json` |
| A2.1 | Independent | لا شيء | `transcript-samples/` |
| A2.2 | After A2.1 | `transcript-samples/` | `extraction-report.json` |
| A3.1 | Independent | لا شيء | `rtl-audit.json` |
| A3.2 | After A3.1 | `rtl-audit.json` | `accessibility-report.json` |
| A4.1 | Independent | لا شيء | `route-audit.json` |
| A4.2 | After A4.1 | `route-audit.json` | `auth-audit.json` |
| A5.1 | After A1.2 | `fallback-report.json` | `dubbing-test.json` |
| A5.2 | Independent | لا شيء | `media-test.json` |
| A6.1 | Independent | لا شيء | `migration-report.json` |
| A6.2 | After A6.1 | `migration-report.json` | `cache-report.json` |
| A7.1 | After ALL | جميع التقارير | `test-results.json` |
| A7.2 | After A7.1 | `test-results.json` | `integration-tests/` |
| A8.1 | Independent | لا شيء | `vulnerability-report.json` |
| A8.2 | After A8.1 | `vulnerability-report.json` | `auth-audit.json` |
| A9.1 | Independent | لا شيء | `docker-report.json` |
| A9.2 | After A9.1 | `docker-report.json` | `queue-report.json` |
| A10.1 | Independent | لا شيء | `openapi-updated.json` |
| A10.2 | After A10.1 | `openapi-updated.json` | `changelog-draft.md` |
| A11.1 | Independent | لا شيء | `benchmark-results.json` |
| A11.2 | After A11.1 | `benchmark-results.json` | `optimization-report.json` |
| A12.1 | Independent | لا شيء | `extension-report.json` |
| A12.2 | After A12.1 | `extension-report.json` | `integration-report.json` |

### 6.2 أمثلة على مهام كل وكيل فرعي

#### A1.1 — Provider Health Monitor
```markdown
المهمة: مراقبة حالة مزوّدي الترجمة
1. اختبار Google Translate endpoint (الكشف + الترجمة)
2. اختبار MyMemory API
3. اختبار LibreTranslate
4. اختبار Gemini API (إن كان مفتاحًا متاحًا)
5. اختبار DeepL API (إن كان مفتاحًا متاحًا)
6. قياس وقت الاستجابة لكل مزوّد
7. كشف المحظورين (rate limit exceeded)
8. تحديث cooldown timers في translate.js
9. إنشاء provider-status.json
```

#### A5.1 — Dubbing Pipeline Engineer
```markdown
المهمة: اختبار خط الدبلجة الكامل
1. تشغيل dubbing-pipeline.js بفيديو تجريبي
2. اختبار voice-manager.js — اختيار الأصوات
3. اختبار segment-processor.js — تقسيم المقاطع
4. اختبار audio-mixer.js — مزج الصوت
5. اختبار timing-engine.js — مزامنة التوقيتات
6. اختبار ffmpeg.js — معالجة FFmpeg
7. اختبار export-service.js — تصدير النتيجة
8. اختبار cleanup.js — تنظيف الملفات المؤقتة
9. اختبار dub-owner.js — التحقق من الملكية
```

---

## ملاحظات التنفيذ

### كيف يُنفّذ هذا النظام؟

1. **المنسّق (Orchestrator)** هو الوكيل الرئيسي الذي يُشغّلWave 1 أولاً
2. كل wave تنتظر اكتمال wave السابقة قبل البدء
3. داخل نفس wave — الوكلاء يعملون **بالتوازي** (باستخدام Task tool متعدد)
4. بعد كل wave — المنسّق يراجع المخرجات ويتخذ قرار المتابعة
5. عند فشل وكيل — المنسّق يقرّر: إعادة المحاولة / تخطّي / إيقاف

### أدوات التنفيذ المتاحة

| الأداة | الاستخدام |
|--------|-----------|
| `Task` tool | تشغيل كل وكيل فرعي |
| `Bash` tool | تشغيل npm scripts (test, lint, build) |
| `Read/Write/Edit` tools | قراءة/كتابة الكود والمخرجات |
| `Glob/Grep` tools | البحث في الكود |
| `memory_*` tools | حفظ المعرفة المشتركة بين الوكلاء |

### معايير نجاح النظام

- [ ] كل الوكلاء الـ 36 قابلون للتشغيل
- [ ] التبعيات تُحترم (لا وكيل يبدأ قبل اكتمال تبعياته)
- [ ] المخرجات موثقة في specs/
- [ ] لا تعارضات بين الوكلاء
- [ ] الفشل يُسجّل ولا يُبتلع بصمت

---

> **الملخص:** نظام 36 وكيل يغطي كل جوانب AraLink — من استخراج المحتوى إلى النشر.
> يعملWave-by-Wave مع تبعيات واضحة ومخرجات موثقة.
