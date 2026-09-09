# AraLink — أرا لينك

**أداة ترجمة ذكية تحوّل أي رابط إلى أي لغة**

*A smart translation tool that turns any URL into any language.*

![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![Tests](https://img.shields.io/badge/tests-621%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-~77%25-lines-blue)
![Version](https://img.shields.io/badge/version-1.0.0-informational)

---

## ماذا يفعل / What It Does

الصق أي رابط ← اختر لغة ← اقرأ الترجمة. لا تسجيل، لا تعقيد.

Paste any URL → choose a language → read the translation. No sign-up, no complexity.

### مصادر الترجمة / Translation Sources

| المصدر | ماذا يفعل | How it works |
|--------|-----------|-------------|
| **يوتيوب / YouTube** | استخراج النص + ترجمة فورية مع ترجمات مدمجة في الصفحة | Transcript extraction + in-page subtitles via YouTube IFrame API |
| **مقالات ومواقع / Articles** | استخراج النص الرئيسي من أي صفحة وترجمته | Server-side fetch + readability extraction |
| **ملفات / Files** | 11 صيغة إدخال → 8 صيغة إخراج مع حفظ البنية | SRT timings, JSON keys, CSV/XLSX rows preserved |
| **نص ملصق / Pasted text** | ترجمة مباشرة لأي نص مقسّم تلقائيًا | Auto-chunked, ~4500 chars per request |
| **صور / Images** | OCR عبر Tesseract.js → ترجمة النص المستخرج | Text extraction then translation |
| **PDF** | استخراج النص من ملفات PDF → ترجمة | Server-side parsing + translation |

### ميزة الصوت / Audio Pipeline

للفيديوهات بدون ترجمات نصية: تحميل الصوت (yt-dlp) → تفريغ محلي
(Whisper عبر sherpa-onnx، بدون مفتاح API) → ترجمة مع توقيتات →
تنزيل SRT + صوت عربي (gTTS).

*For videos without captions: audio download → local transcription (Whisper, no API key) → translate with timings → SRT + Arabic audio.*

### الميزة الرئيسية / Highlighted Features

- **6 مزوّدات مجانية** — Google / MyMemory / Libre / Gemini / DeepL / zen (OpenAI-compatible) مع احتياط تلقائي
- **كاش ترجمة دائم** — `cache/translation-cache.json`، شارة ⚡ من الذاكرة المؤقتة، صلاحية 30 يومًا
- **امتداد متصفح / Browser extension** — Chrome Manifest V3، ترجم أي صفحة بنقرة واحدة
- **sentence-level audio** — مشغل فيديو مع ترجمة جملة بجملة (YouTube IFrame API)
- **تصدير مترجم مع ترجمات مدمجة** — تنزيل فيديو مع WebVTT مرسوم فوقه (`GET /api/video/:id`)
- **واجهة عربية RTL** — Cairo/Tajawal، وضع فاتح/داكن، 130+ لغة

---

## البدء السريع / Quick Start

```bash
# استنساخ المستودع / Clone
git clone https://github.com/MOT1209/-bersetzung-von-alle.git
cd -bersetzung-von-alle

# تثبيت التبعيات / Install dependencies
npm install

# تشغيل الخادم / Start the server
npm run dev        # http://localhost:3000
```

الخادم يعمل بدون مفاتيح API — المزوّدات المجانية تعمل تلقائيًا.
أضف مفاتيح اختيارية في `.env` لتفعيل مزوّدات إضافية (انظر الجدول أدناه).

*The server runs without API keys — free providers work out of the box.
Add optional keys in `.env` for additional providers (see env table below).*

### نسخة مسبقة / One-Click Deploy

- **Docker:** `docker build -t aralink . && docker run -p 3000:3000 aralink`
- **Render:** تعريف `render.yaml` جاهز — `_NEW` في Render ثم اختر المجلد

---

## البنية التقنية / Architecture

| الطبقة | التقنية | Details |
|--------|---------|---------|
| **الواجهة / Frontend** | ES modules (`public/js/`) | RTL Arabic, Cairo font, dark/light themes, `index.html` |
| **الخادم / Backend** | Node.js + Express | 15 routers in `server/routes-*.js` |
| **قاعدة البيانات / DB** | SQLite (`node:sqlite` المدمج) | Single file `cache/aralink.db`, no native build required |
| **محرك الترجمة / Translation** | 6 مزوّدات موحّدة | Unified registry, auto-fallback, per-engine cooldown |
| **الوظائف الثقيلة / Jobs** | `server/jobs/` | Concurrency-capped (STT/dub/OCR), progress + cancellation |
| **التخزين / Storage** | Local disk or S3/R2/MinIO | Key-based (`server/providers/storage/`), pluggable driver |

---

## الجودة والاختبارات / Quality & Testing

```bash
npm test                    # 621 اختبار (node --test)
npm run lint                # ESLint — صفر تحذيرات
npm run check               # فحص بنائي لـ 104 ملف

npm run test:coverage       # c8 coverage (text)
npm run test:coverage:html  # تقرير HTML في coverage/

npm run bench:translate     # قياس جودة المزوّدين (WER) → cache/quality-report.json
npm run perf:translate      # قياس الأداء المحلي → cache/perf-report.json
```

| المقياس | القيمة | Gate |
|---------|--------|------|
| اختبارات ناجحة | **621** | — |
| تغطية خطوط | **~77.9%** | 70% (`.c8rc.json`) |
| تغطية فروع | **~73.1%** | 60% |
| تغطية دوال | **~80.6%** | 70% |
| تحذيرات Lint | **0** | `--max-warnings=0` |

> ⚠️ `bench:translate` يستهلك حصّة الترجمة المجانية — شغّله يدويًا فقط، لا في CI.

---

## للمطورين / For Developers

### هيكل المشروع / Repo Layout

```
/
├── public/              ← الواجهة (HTTP فقط)
│   ├── index.html       ← الصفحة الرئيسية (RTL)
│   ├── style.css        ← نظام التصميم
│   └── js/              ← وحدات ES: app.js, ui.js, translate.js, result.js ...
├── server/
│   ├── server.js        ← Express app
│   ├── translate.js     ← محرك الترجمة + كشف اللغة
│   ├── fetchContent.js  ← استخراج المقالات
│   ├── youtube.js       ← ترجمات يوتيوب
│   ├── files.js         ← استيراد/تصدير (11→8 صيغ)
│   ├── routes-*.js      ← مسارات API (15 ملف)
│   ├── jobs/            ← محرك الوظائف الثقيلة
│   ├── db/              ← migrations + queries
│   └── config.js        ← تحميل الإعدادات
├── extension/           ← امتداد Chrome (Manifest V3)
├── tests/               ← 60 ملف اختبار
├── docs/openapi.json    ← OpenAPI 3.1 (~42 نقطة نهاية)
└── specs/               ← مواصفات الميزات (wave-based)
```

### التوثيق / Documentation

| الملف | المحتوى |
|-------|---------|
| `docs/openapi.json` | مواصفة OpenAPI 3.1 لكل نقاط النهاية |
| `/api/docs` | Swagger UI (فعّله بـ `SWAGGER_ENABLED=true`) |
| `AGENTS.md` | إرشادات الوكالات البرمجية |
| `DESIGN.md` | نظام التصميم البصري (ألوان، مكونات، طباعة) |
| `TEST_CASES.md` | اختبارات يدوية |
| `DEPLOY_NOTES.md` | ملاحظات النشر |

### إضافة مزوّد ترجمة / Adding a Provider

1. أضف الملف في `server/translate.js` (سجل المزوّدات)
2. أضف المتغير في `server/config.js`
3. أضف المفتاح في `.env.example`
4. اكتب اختبار في `tests/provider.test.js`

### لوحة التحكم / Admin Dashboard

`/admin.html` — محمية بـ `ADMIN_TOKEN` (ترويسة `x-admin-token`).
تعرض إحصائيات الاستخدام + جودة الترجمة + تكاليف العمليات.

### الوكالات البرمجية / Agentic Coding

المستودع يحتوي على مواصفات (`specs/`) ومهارات (`.agents/skills/`) لتنفيذ الميزات
عبر وكالات برمجية (Claude Code, Codex, etc.). راجع `AGENTS.md` للتفاصيل.

---

## متغيرات البيئة / Environment Variables

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `PORT` | `3000` | منفذ الخادم |
| `DB_FILE` | `cache/aralink.db` | مسار ملف SQLite |
| `STATS_DRIVER` | `sqlite` | `sqlite` أو `json` |
| `ADMIN_TOKEN` | *(معطّل)* | رمز لوحة التحكم الإدارية |
| `SWAGGER_ENABLED` | `false` | تفعيل Swagger UI على `/api/docs` |
| `CACHE_TTL_MS` | `2592000000` | صلاحية الكاش (30 يومًا، `0` لتعطيل الانتهاء) |
| `CORS_ORIGIN` | *(فارغ)* | أصول مسموحة (فاصلة) — فارغ = نفس الأصل فقط |
| `REDIS_URL` | *(معطّل)* | مشاركة عدّادات Rate-limit عبر Redis |
| `JOB_CONCURRENCY` | `2` | سقف الوظائف المتزامنة |
| `GEMINI_API_KEY` | | مفتاح Gemini (اختياري) |
| `DEEPL_API_KEY` | | مفتاح DeepL المجاني (اختياري) |
| `ZEN_API_KEY` | | مفتاح zen/Ollama (اختياري) |
| `ZEN_BASE_URL` | `https://opencode.ai/zen/v1` | بوابة zen (Ollama: `localhost:11434/v1`) |
| `YOUTUBE_API_KEY` | | YouTube Data API v3 (بيانات وصفية فقط) |

> 📄 الكاملة في `.env.example` (161 سطر من التعليقات التوضيحية).

---

## الأمان / Security

- **Helmet** مع CSP صارم (YouTube embed + Google Fonts + jsdelivr فقط)
- **CORS** افتراضيًا same-origin فقط (فارغ = لا أصول مسموحة خارجية)
- **Rate-limit** لكل IP — ذاكرة (نسخة واحدة) أو Redis (توسّع أفقي)
- **`trust proxy`** في وضع الإنتاج (خلف Render)
- لا أسرار محفوظة في المستودع

---

## الخطط المستقبلية / Roadmap

- [ ] تصدير PPTX/EPUB بالصيغة الأصلية (حاليًا txt/md/docx فقط)
- [ ] طابور وظائف Redis للتوسّع الأفقي (`QUEUE_DRIVER=redis`)
- [ ] شارة جودة ترجمة مرئية لكل نتيجة
- [ ] نشر Docker Hub رسمي

---

<p align="center">
  <sub>صُنع بحب للمحتوى العربي — <em>Built with ❤️ for Arabic content</em></sub>
</p>
