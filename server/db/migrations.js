// server/db/migrations.js — ترحيلات المخطّط بترتيب ثابت
//
// كل ترحيل يُطبَّق مرة واحدة ويُسجَّل في جدول schema_migrations. الترتيب هنا
// **هو** ترتيب التطبيق: تُضاف الترحيلات في النهاية ولا تُعدَّل السابقة أبدًا
// (تعديل ترحيل مُطبَّق يعني قاعدتين مختلفتين بنفس رقم النسخة).
module.exports = [
  {
    version: 1,
    name: 'projects-and-assets',
    up: `
      CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        source_type TEXT,
        source_ref  TEXT,
        target_langs TEXT NOT NULL DEFAULT '[]',
        status      TEXT NOT NULL DEFAULT 'draft',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE assets (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL,
        lang        TEXT,
        storage_key TEXT NOT NULL,
        mime        TEXT,
        bytes       INTEGER NOT NULL DEFAULT 0,
        meta        TEXT NOT NULL DEFAULT '{}',
        created_at  INTEGER NOT NULL
      );

      CREATE INDEX idx_assets_project ON assets(project_id);
      CREATE INDEX idx_projects_created ON projects(created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'project-owner-token',
    // ملكية المشروع: قبل هذا كان أي زائر يسرد كل المشاريع وينزّل ملفات غيره
    // ويحذفها. نخزّن تجزئة التوكن لا التوكن نفسه — تسريب القاعدة لا يمنح وصولًا.
    // NULL مسموح للصفوف القديمة: تصبح بلا مالك، ويرفض المسار الوصول إليها
    // (fail-closed) بدل أن ينفتح عليها للجميع.
    up: `
      ALTER TABLE projects ADD COLUMN owner_hash TEXT;
    `,
  },
  {
    version: 3,
    name: 'stats-entries-and-usage-counters',
    // نقل إحصاءات لوحة التحكم وعدادات الاستخدام من ملفات JSON (stats-log.json
    // و usage.json) إلى SQLite. السبب: ملفا JSON يعانيان من سباق قراءة-ثم-كتابة
    // مع أي خادم ثانٍ (لا multi-instance)، وتجميع الإحصائيات يقرأ الملف كاملًا
    // ويفلتر في الذاكرة لكل طلب. الجداول هنا تعطي استعلامات نطاق زمني فورية
    // عبر الفهارس بدل فحص N صف في كل استدعاء.
    up: `
      CREATE TABLE stats_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL,
        source_lang TEXT,
        target_lang TEXT,
        provider    TEXT,
        created_at  INTEGER NOT NULL
      );

      CREATE INDEX idx_stats_created ON stats_entries(created_at);
      CREATE INDEX idx_stats_type ON stats_entries(type);

      CREATE TABLE usage_counters (
        key   TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
];
