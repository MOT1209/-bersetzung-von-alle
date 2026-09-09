# AraLink — تخطيط التطوير الشامل

> **الحالة:** ✅ الميزات 1–5 مكتملة  
> 1) تغطية c8 (موجودة مسبقًا) · 2) stats/usage عبر SQLite · 3) perf:translate بدون شبكة · 4) docs/openapi.json · 5) Docker/Render جاهزان  
> **آخر تحديث:** 9 سبتمبر 2026  
> **الأولوية:** وفقاً لتقرير الفحص الشامل

---

##نظرة عامة

هذا الملف يحدد خطط التطوير للأولويات الخمس المستفادة من تقرير الفحص الشامل. كل ميزة مقسمة إلى موجات (waves) قابلة للتنفيذ بشكل مستقل، مع اختبارات لكل موجة.

---

## الميزة 1: أداة قياس تغطية الاختبارات (c8) — أولوية متوسطة

### الهدف

قياس نسبة الكود المُختبَر فعلياً عبر 55 ملف اختبار موجودة. حالياً لا توجد أي أداة قياس تغطية — هذا أكبر فجوة في بنية الجودة.

### القرارات

- **الأداة:** `c8` (تمتد V8 coverage — لا تحتاج تعديل كود)
- **البديل المدروس:** `--experimental-test-coverage` المدمج في Node 22 (إخراج نصي فقط، لا HTML reports)
- **القرار:** `c8` — يوفر LCOV + HTML + thresholds

### الموجات

#### الموجة 1 — التثبيت والتكوين

- تثبيت `c8` كـ devDependency:
  ```bash
  npm install --save-dev c8
  ```
- إضافة سكريبتات جديدة في `package.json`:
  ```json
  "test:coverage": "c8 node --test \"tests/*.test.js\" \"tests/*.test.mjs\"",
  "test:coverage:html": "c8 --reporter=html node --test \"tests/*.test.js\" \"tests/*.test.mjs\"",
  "test:coverage:lcov": "c8 --reporter=lcov node --test \"tests/*.test.js\" \"tests/*.test.mjs\""
  ```
- إنشاء ملف `.c8rc.json` في جذر المشروع:
  ```json
  {
    "all": true,
    "include": ["server/**/*.js"],
    "exclude": [
      "node_modules/**",
      "tests/**",
      "scripts/**",
      "public/**",
      "extension/**",
      "specs/**",
      "cache/**",
      "models/**",
      "projects/**"
    ],
    "reporter": ["text", "html", "lcov"],
    "check-coverage": true,
    "branches": 60,
    "lines": 70,
    "functions": 70,
    "statements": 70
  }
  ```

#### الموجة 2 — التحقق

- تشغيل `npm run test:coverage` — يجب أن تمر جميع الاختبارات
- التحقق من أن النسب تحقق الحد الأدنى
- تشغيل `npm run test:coverage:html` — فحص تقرير HTML في `coverage/index.html`
- التحقق من `node --check server/*.js` بعد التغييرات

#### الموجة 3 — التوثيق

- إضافة سطر في `README.md` يشرح كيفية تشغيل قياس التغطية
- إضافة `.gitignore` للملفات: `coverage/`

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `package.json` | إضافة devDependency + 3 سكريبتات |
| `.c8rc.json` | ملف جديد — إعدادات c8 |
| `.gitignore` | إضافة `coverage/` |
| `README.md` | وثيقة قياس التغطية |

### المخاطر

- `c8` خفيف جداً (~50KB) — لا يؤثر على وقت الاختبار بشكل ملحوظ
- الحد الأدنى 60-70% قد يحتاج تعديلاً حسب النتائج الفعلية

---

## الميزة 2: نقل stats/usage إلى SQLite — أولوية متوسطة

### الهدف

استبدال ملفات JSON (`cache/stats-log.json` و `cache/usage.json`) بقاعدة SQLite لدعم multi-instance وتحسين الأداء. المشروع يملك بالفعل `node:sqlite` مع نظام ترحيل يعمل.

### القرارات

- **قاعدة البيانات:** SQLite عبر `node:sqlite` (موجود بالفعل)
- **الملفات المستهدفة:** `server/stats.js` + `server/usage.js`
- **التوافق:** `\`config.js\` يوفر مسار DB مشترك عبر \`DB_FILE\``
- **أعلى متوافق:** لا يزال يدعم JSON كبديل عبر `STATS_DRIVER=sqlite|json`

### الموجات

#### الموجة 1 — Migration الجديد

- إنشاء `stats-entries` migration جديد في `server/db/migrations.js`:
  ```sql
  CREATE TABLE IF NOT EXISTS stats_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    source_lang TEXT,
    target_lang TEXT,
    provider TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stats_created ON stats_entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_stats_type ON stats_entries(type);

  CREATE TABLE IF NOT EXISTS usage_counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
  ```
- إضافة `STATS_DRIVER` في `server/config.js`:
  ```js
  STATS_DRIVER: process.env.STATS_DRIVER || 'sqlite', // 'sqlite' | 'json'
  ```
- اختبار الترحيل: تشغيل الخادم مع قاعدة فارغة → إنشاء الجداول تلقائياً

#### الموجة 2 — نقل stats.js

- إنشاء `server/db/stats-repository.js`:
  ```js
  // CRUD عبر SQL بدل JSON
  // insertEntry(type, sourceLang, targetLang, provider)
  // getSummary(from, to)
  // getTimeseries(days)
  // getProviders()
  // getLanguages()
  // getHourly()
  // getCost()
  // pruneOldEntries(maxAge)
  ```
- تعديل `server/stats.js` ليقرأ `STATS_DRIVER` ويحول إلى SQLite
- الحفاظ على JSON كمسار بديل (للتوافق مع النسخ القديمة)
- تسجيل تلقائي عند كل ترجمة عبر SQLite

#### الموجة 3 — نقل usage.js

- استخدام `usage_counters` table بدلاً من JSON
- الدوال:
  ```js
  // increment(type, target, source)
  // getSummary()
  // reset()
  ```
- اختبار: التأكد من أنّ `logEntry()` في usage.js لا يزال يعمل مع SQLite stats

#### الموجة 4 — اختبارات الترحيل

- اختبار `tests/statsSqlite.test.js`:
  - إدراج entries → استعلامタイムスタンプ → تحقق من النتائج
  - اختبار `getTimeseries()` عبر SQL بدلاً من Date filtering
  - اختبار `getSummary()` مع date ranges
  - اختبار `pruneOldEntries()` يحذف entries قديمة
- اختبار `tests/usageSqlite.test.js`:
  - `increment()` → `getSummary()` → تحقق من العدادات
  - اختبار concurrent increments (محاكاة multi-request)
- اختبار `tests/statsMigration.test.js`:
  - بدء من SQLite فارغ → تشغيل Migration → التحقق من المخطط
  - اختبار هبوط Migration (ROLLBACK)

#### الموجة 5 — التحقق الشامل

- `node --check server/*.js`
- `npm test` — جميع الاختبارات (القديمة والجديدة)
- اختبار يدوي: ترجمة رابط → فحص `cache/aralink.db` → التأكد من الإدخال في `stats_entries`
- فحص لوحة التحكم `/api/stats/summary` — يجب أن تُرجع بيانات صحيحة

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `server/db/migrations.js` | Migration v3: stats_entries + usage_counters |
| `server/db/stats-repository.js` | ملف جديد — CRUD عبر SQL |
| `server/config.js` | إضافة STATS_DRIVER |
| `server/stats.js` | تعديل ليقرأ STATS_DRIVER ويحول |
| `server/usage.js` | تعديل ليستخدم SQLite |
| `.env.example` | وثائق STATS_DRIVER |
| `tests/statsSqlite.test.js` | اختبارات جديدة |
| `tests/usageSqlite.test.js` | اختبارات جديدة |
| `tests/statsMigration.test.js` | اختبارات جديدة |

### المخاطر

- `node:sqlite` لا يزال تجريبياً — بيانات الإنتاج قد تحتاج نسخ احتياطي
-\Migration v3 يجب أن يكون متوافقاً مع v1/v2 (لا يكسر المخطط الحالي)
- Junction JSON كخيار بديل يضمن التراجع عند المشاكل

---

## الميزة 3: اختبارات أداء المترجم — أولوية منخفضة

### الهدف

قياس أداء محرك الترجمة (زمن الاستجابة، استهلاك الذاكرة، سرعة المعالجة) لتحديد bottlenecks وضمان عدم تراجع الأداء.

### القرارات

- **الأداة:** سكريبت `node:benchmark` بسيط + مقارنة يدوية
- **النطاق:** `server/translate.js` + `server/providers/translation/*`
- **المخرجات:** تقرير في `cache/benchmark-report.json`

### الموجات

#### الموجة 1 — إنشاء سكريبت المقارنة

- إنشاء `scripts/bench-translate.js` (يوجد بالفعل كقالب في `package.json`)
- اختبارات مقترحة:
  ```
  1. Translation speed per provider (ms per 1000 chars)
  2. Chunking performance (short vs long text)
  3. Cache hit vs miss latency
  4. Fallback chain overhead
  5. Memory usage over 1000 translations
  6. Concurrent translation throughput
  ```
- إضافة سكريبت في `package.json`:
  ```json
  "bench:translate": "node scripts/bench-translate.js"
  ```
- النتائج تُحفظ في `cache/benchmark-report.json`

#### الموجة 2 — اختبارات التراجع

- اختبار fallback chain: Google → MyMemory → Libre → Gemini → DeepL → zen
- اختبار cooldown: 3 أخطاء → تجميد 60 ثانية
- اختبار timeout: 120 ثانية لكل استدعاء
- اختبار chunking: نص طويل (50,000 حرف) → تقسيم → ترجمة

#### الموجة 3 — تقرير الأداء

- مقارنة نتائج المرة الأولى مع المرة الثانية (regression detection)
- حفظ النتائج في `cache/benchmark-report.json`
- إضافة ملاحظات في التقرير: "الأداء مقبول" / "يحتاج تحسين"

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `scripts/bench-translate.js` | تعديل/إعادة كتابة benchmark كامل |
| `package.json` | سكريبت bench:translate (موجود بالفعل) |
| `cache/benchmark-report.json` | مخرجات الأداء |

### المخاطر

- اختبارات الأداء قد تستهلك quota من المزودين المجانيين
- النتائج تعتمد على الشبكة — لا تستخدمها في CI

---

## الميزة 4: توثيق API بـ OpenAPI — أولوية منخفضة

### الهدف

إنشاء توثيق تفاعلي لـ 40+ نقطة نهاية API في AraLink باستخدام OpenAPI 3.1. يُستخدم للتطوير والصيانة والتكامل المستقبلي.

### القرارات

- **التنسيق:** OpenAPI 3.1.0 (JSON + YAML)
- **الأداة:** ملف يدوي (no codegen — الأفضل للمشاريع الصغيرة)
- **العرض:** Swagger UI عبر `/api/docs` أو ملف ثابت
- **النطاق:** جميعنقاط النهاية العامة + نقاط نهاية المدير

### الموجات

#### الموجة 1 — هيكل الملفات

- إنشاء `docs/openapi.json`:
  ```json
  {
    "openapi": "3.1.0",
    "info": {
      "title": "AraLink API",
      "version": "1.0.0",
      "description": "AraLink Translation API — ترجم أي رابط إلى أي لغة"
    },
    "servers": [
      { "url": "http://localhost:3000", "description": "Development" }
    ],
    "paths": { ... },
    "components": {
      "schemas": { ... },
      "securitySchemes": { ... }
    }
  }
  ```
- تعريف المكونات المشتركة:
  - `TranslationRequest` (url, targetLang, sourceLang?)
  - `TranslationResponse` (type, sourceLang, translated, original, meta)
  - `TextTranslationRequest` (text, targetLang, sourceLang?)
  - `ErrorResponse` (error, message, code)
  - `HealthResponse` (status, version, uptime)
  - `Language` (code, name)
  - `Provider` (id, label, requiresKey, isAvailable)

#### الموجة 2 — تعريف جميع النقاط

- النقاط العامة (trilingual: عربي + إنجليزي + وصفي):
  ```
  GET  /api/health
  GET  /api/languages
  POST /api/translate
  POST /api/translate-text
  POST /api/translate-smart
  POST /api/translate-stream
  POST /api/srt
  GET  /api/providers
  POST /api/tts
  POST /api/translate-file
  POST /api/export
  POST /api/ocr
  POST /api/tashkeel
  GET  /api/video/:videoId
  POST /api/video-local
  POST /api/dub
  GET  /api/youtube/metadata
  POST /api/youtube/dub
  GET  /api/jobs
  GET  /api/jobs/:id
  GET  /api/jobs/:id/stream
  DELETE /api/jobs/:id
  ```
- النقاط المحمية (Admin):
  ```
  POST /api/admin/login
  POST /api/admin/logout
  GET  /api/settings
  POST /api/settings
  GET  /api/stats/summary
  GET  /api/stats/timeseries
  GET  /api/stats/providers
  GET  /api/stats/languages
  ```
- النقاط المعقدة (Dubb + Projects):
  ```
  POST /api/dub
  GET  /api/dub/jobs/:id
  GET  /api/dub/jobs/:id/stream
  GET  /api/dub/projects/:projectId/jobs
  PATCH /api/dub/projects/:projectId/segments/:index
  DELETE /api/dub/projects/:projectId
  POST /api/projects
  GET  /api/projects/:id
  PATCH /api/projects/:id
  DELETE /api/projects/:id
  POST /api/projects/:id/assets
  ```

#### الموجة 3 — عرض Swagger UI

- تثبيت `swagger-ui-express` (اختياري) أو خدمة ملف ثابت
- خيار 1 (مبسط): ملف `docs/openapi.json` يُقرأ مباشرة من Swagger UI Online
- خيار 2 (متكامل): route في `server.js`:
  ```js
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  ```
- إضافة في `.env.example`:
  ```
  SWAGGER_ENABLED=false  # true to enable /api/docs
  ```

#### الموجة 4 — التحقق

- فحص `openapi.json` عبر أداة `swagger-cli validate`
- التأكد من أن جميع النقاط النهائية في server.js موجودة في الملف
- اختبار: `GET /api/docs` يعمل عند التفعيل

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `docs/openapi.json` | ملف جديد — 40+ نقطة نهاية |
| `server/server.js` | route اختياري `/api/docs` |
| `.env.example` | SWAGGER_ENABLED |
| `package.json` | swagger-ui-express (اختياري) |

### المخاطر

- التوثيق قد يتقدم عن الكود (docs drift) — يجب تحديثه مع كل تغيير في API
- `swagger-ui-express` خفيف (~200KB) — لا يؤثر على حجم Docker

---

## الميزة 5: تحسين بنية Docker و Render — أولوية مكتملة (جاهز)

### الهدف

تحسين Docker image و Render deployment بناءً على أفضل الممارسات. الحالة الحالية جيدة جداً — التحسينات اختيارية.

### القرارات

- **Docker:** صورة مدمجة الآن (42 سطر، node:22-slim)
- **Render:** Starter plan ($7/شهر) مع قرص 5GB
- **التحسينات:** اختيارية — لا تُكسر أي شيء موجود

### الموجات (اختيارية)

#### الموجة 1 — تحسينات Docker

- إنشاء `.dockerignore`:
  ```
  node_modules/
  .git/
  tests/
  cache/
  models/
  projects/
  coverage/
  *.md
  .env
  .env.example
  ```
- تحسين Dockerfile:
  ```dockerfile
  # Stage 1: Build
  FROM node:22-slim AS builder
  WORKDIR /app
  COPY package.json bun.lock ./
  RUN bun install --frozen-lockfile
  COPY . .

  # Stage 2: Runtime
  FROM node:22-slim
  RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip curl && \
    pip3 install --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*
  WORKDIR /app
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package.json ./
  COPY --from=builder /app/server ./server
  COPY --from=builder /app/public ./public
  COPY --from=builder /app/Dockerfile ./
  VOLUME /app/cache
  ENV NODE_ENV=production
  HEALTHCHECK --interval=60s CMD curl -fsS http://localhost:3000/api/health || exit 1
  EXPOSE 3000
  CMD ["node", "server/server.js"]
  ```
- ميزة: تقليل حجم الصورة بنسبة ~30-40% (إزالة ملفات الاختبار + .git من Runtime)

#### الموجة 2 — تحسينات Render

- إضافة `JEMALLOC` env var لتحسين الذاكرة في Render:
  ```
  LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
  ```
- ملاحظة: Render Starter (512MB) محدود — `JOB_CONCURRENCY=1` مناسب
- ترقية إلى Standard ($25/شهر، 1GB RAM) تسمح بـ `JOB_CONCURRENCY=2`

#### الموجة 3 — مراقبة القرص

- إنشاء سكريبت `scripts/disk-usage.js`:
  ```bash
  # Check disk usage of /app/cache
  du -sh /app/cache/
  # Alert if > 4GB (5GB disk)
  ```
- إضافة في Render healthcheck أو cron job

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `.dockerignore` | ملف جديد |
| `Dockerfile` | تحسينات اختيارية (multi-stage) |
| `render.yaml` | تحسينات بسيطة |
| `scripts/disk-usage.js` | ملف جديد (اختياري) |

### المخاطر

- Multi-stage build قد يبطئ Docker build في بعض الحالات
- `LD_PRELOAD` قد لا يعمل في بعض بيئة Render

---

## التسلسل المقترح

```
الميزة 1 (c8)          ← أسهل وأسرع — يبدأ فوراً
    ↓
الميزة 2 (SQLite)      ← الأكبر — يحتاج فحص دقيق
    ↓
الميزة 3 (Benchmarks)  ← مستقل — يمكن البدء في أي وقت
    ↓
الميزة 4 (OpenAPI)     ← مستقل — يمكن البدء في أي وقت
    ↓
الميزة 5 (Docker)      ← اختياري — لا يُكسر شيء
```

## التحقق العام (لكل ميزة)

- `node --check server/*.js` — فحص بناء الجملة
- `npm test` — جميع الاختبارات pass
- `npm run lint` — عدم وجود تحذيرات
- اختبار يدوي في المتصفح: paste link → ترجمة صحيحة

## ملاحظات عامة

- جميع التحسينات متوافقة مع بنية CommonJS الحالية
- لا تُغير APIs العامة (لا breaking changes)
- كل ميزة يمكن تعطيلها عبر .env
- JSON لا يزال كخيار بديل في الميزة 2 (للتراجع)
