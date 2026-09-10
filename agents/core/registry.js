// agents/core/registry.js — سجل الوكلاوات الرئيسيين والفرعيين
// يحتوي على 12 وكيل رئيسي × 2 فرعي = 36 وكيل

const AGENTS = {
  // ═══════════════════════════════════════════════════════════
  // 1. Translation Core — محرك الترجمة المتعدد المزوّدين
  // ═══════════════════════════════════════════════════════════
  A1: {
    id: 'A1',
    name: 'Translation Core',
    nameAr: 'محرك الترجمة',
    icon: '🔌',
    description: 'إدارة مزوّدي الترجمة والكشف التلقائي عن اللغة والfallback',
    subagents: ['A1.1', 'A1.2'],
    dependencies: [],
    outputs: ['translated-text', 'detected-language'],
  },
  'A1.1': {
    id: 'A1.1',
    name: 'Provider Health Monitor',
    nameAr: 'مراقب صحة المزوّدين',
    icon: '💓',
    description: 'فحص توافر مزوّدي الترجمة وتنقل تلقائي بينهم عند الفشل',
    parent: 'A1',
    capabilities: ['health-check', 'cooldown-management', 'failover'],
    tasks: [
      'فحص Google Translate API',
      'فحص MyMemory API',
      'فحص LibreTranslate API',
      'فحص Gemini API',
      'فحص DeepL API',
      'إدارة cooldown لكل مزوّد',
    ],
  },
  'A1.2': {
    id: 'A1.2',
    name: 'Chunking & Fallback Engineer',
    nameAr: 'مهندس التقسيم والبديل',
    icon: '🧩',
    description: 'تقسيم النصوص الطويلة وإعادة التجميع مع fallback ذكي',
    parent: 'A1',
    capabilities: ['text-chunking', 'reassemble', 'context-preservation'],
    tasks: [
      'تقسيم النصوص более من 4500 حرف',
      'الحفاظ على سياق الفقرات',
      'إعادة تجميع المقاطع المترجمة',
      'التعامل مع أخطاء الشبكة',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 2. Content Extractor — استخراج المحتوى من الروابط
  // ═══════════════════════════════════════════════════════════
  A2: {
    id: 'A2',
    name: 'Content Extractor',
    nameAr: 'مستخرج المحتوى',
    icon: '📥',
    description: 'استخراج المحتوى من روابط YouTube والمواقع الإلكترونية',
    subagents: ['A2.1', 'A2.2'],
    dependencies: [],
    outputs: ['extracted-content', 'content-metadata'],
  },
  'A2.1': {
    id: 'A2.1',
    name: 'YouTube Specialist',
    nameAr: 'أخصائي يوتيوب',
    icon: '🎬',
    description: 'استخراج transcripts من فيديوهات يوتيوب والتعامل مع API يوتيوب',
    parent: 'A2',
    capabilities: ['transcript-extraction', 'video-metadata', 'caption-parsing'],
    tasks: [
      'استخراج الترانسكريبت من فيديو يوتيوب',
      'التعامل مع الترجمات التلقائية والمدفوعة',
      'استخراج معلومات الفيديو (العنوان، القناة، المدة)',
      'معالجة أخطاء عدم توفر الترانسكريبت',
    ],
  },
  'A2.2': {
    id: 'A2.2',
    name: 'Web Scraper Engineer',
    nameAr: 'مهندس كشط المواقع',
    icon: '🌐',
    description: 'استخراج النصوص من المواقع الإلكترونية والمقالات',
    parent: 'A2',
    capabilities: ['html-fetch', 'text-extraction', 'readability'],
    tasks: [
      'جلب HTML من المواقع',
      'إزالة الإعلانات والقائمة والعناصر غير الضرورية',
      'استخراج النص الرئيسي للمقال',
      'التعامل مع المواقع المحمية بـ Cloudflare',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 3. Frontend UI — واجهة المستخدم العربية RTL
  // ═══════════════════════════════════════════════════════════
  A3: {
    id: 'A3',
    name: 'Frontend UI',
    nameAr: 'واجهة المستخدم',
    icon: '🎨',
    description: 'بناء وتحسين واجهة المستخدم العربية مع دعم RTL',
    subagents: ['A3.1', 'A3.2'],
    dependencies: ['A4'],
    outputs: ['ui-components', 'styles'],
  },
  'A3.1': {
    id: 'A3.1',
    name: 'RTL Layout Specialist',
    nameAr: 'أخصائي التخطيط RTL',
    icon: '📐',
    description: 'تصميم وتخطيط واجهات عربية من اليمين لليسار',
    parent: 'A3',
    capabilities: ['rtl-css', 'responsive-design', 'flexbox-grid'],
    tasks: [
      'تصميم التخطيطات RTL',
      'التأكد من الاتجاه الصحيح للنصوص',
      'تحسين العرض على الأجهزة المحمولة',
      'إدارة الأيقونات والرموز في RTL',
    ],
  },
  'A3.2': {
    id: 'A3.2',
    name: 'Interaction & Accessibility',
    nameAr: 'التفاعل وإمكانية الوصول',
    icon: '♿',
    description: 'تحسين التفاعلات وإمكانية الوصول للمستخدمين',
    parent: 'A3',
    capabilities: ['keyboard-nav', 'aria-labels', 'focus-management'],
    tasks: [
      'إضافة التنقل بلوحة المفاتيح',
      'تحسين ARIA labels',
      'إدارة التركيز عند تغيير التبويبات',
      'تحسين سرعة الاستجابة',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. Backend API — الخادم وواجهات API
  // ═══════════════════════════════════════════════════════════
  A4: {
    id: 'A4',
    name: 'Backend API',
    nameAr: 'الخادم وAPI',
    icon: '⚙️',
    description: 'بناء وإدارة الخادم وواجهات API والكلاّيات',
    subagents: ['A4.1', 'A4.2'],
    dependencies: [],
    outputs: ['api-routes', 'server-config'],
  },
  'A4.1': {
    id: 'A4.1',
    name: 'Route Architect',
    nameAr: 'مهندس المسارات',
    icon: '🗺️',
    description: 'تصميم وبناء مسارات API Express',
    parent: 'A4',
    capabilities: ['express-routes', 'middleware', 'error-handling'],
    tasks: [
      'إنشاء مسارات API جديدة',
      'إدارة الوسيطات (middleware)',
      'معالجة الأخطاء بشكل موحد',
      'إدارة rate limiting',
    ],
  },
  'A4.2': {
    id: 'A4.2',
    name: 'Config & Auth Specialist',
    nameAr: 'أخصائي الإعدادات والمصادقة',
    icon: '🔐',
    description: 'إدارة التكوين والمصادقة والصلاحيات',
    parent: 'A4',
    capabilities: ['env-config', 'admin-auth', 'token-management'],
    tasks: [
      'إدارة ملف .env',
      'نظام Admin Token',
      'كلاّيات rate limiting',
      'إعدادات CORS',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. Media Pipeline — TTS/STT/Dubbing/OCR
  // ═══════════════════════════════════════════════════════════
  A5: {
    id: 'A5',
    name: 'Media Pipeline',
    nameAr: 'خط أنابيب الوسائط',
    icon: '🎵',
    description: 'معالجة الوسائط الصوتية والفيديو والترجمة الصوتية',
    subagents: ['A5.1', 'A5.2'],
    dependencies: ['A1', 'A2'],
    outputs: ['dubbed-video', 'audio-files', 'ocr-text'],
  },
  'A5.1': {
    id: 'A5.1',
    name: 'Dubbing Pipeline Engineer',
    nameAr: 'مهندس خط الدبلجة',
    icon: '🎙️',
    description: 'إدارة خط دبلجة الفيديو بالكامل',
    parent: 'A5',
    capabilities: ['dubbing', 'audio-mixing', 'video-muxing'],
    tasks: [
      'تقطيع الفيديو إلى مقاطع',
      'تبديل الأصوات (voice swapping)',
      'مزج الصوت الأصلي والمدبلج',
      'دمج الفيديو النهائي',
    ],
  },
  'A5.2': {
    id: 'A5.2',
    name: 'TTS/OCR/Files Specialist',
    nameAr: 'أخصائي TTS/OCR/الملفات',
    icon: '🔊',
    description: 'تحويل النص إلى كلام وقراءة الصور وإدارة الملفات',
    parent: 'A5',
    capabilities: ['tts', 'ocr', 'file-conversion'],
    tasks: [
      'تحويل النص إلى صوت (gTTS/Edge TTS)',
      'قراءة النص من الصور (OCR)',
      'استخراج النص من ملفات PDF',
      'تصدير الملفات بصيغ مختلفة',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 6. Data & Storage — قاعدة البيانات والتخزين
  // ═══════════════════════════════════════════════════════════
  A6: {
    id: 'A6',
    name: 'Data & Storage',
    nameAr: 'البيانات والتخزين',
    icon: '🗄️',
    description: 'إدارة قاعدة البيانات SQLite والتخزين والكاش',
    subagents: ['A6.1', 'A6.2'],
    dependencies: [],
    outputs: ['db-schema', 'cached-data'],
  },
  'A6.1': {
    id: 'A6.1',
    name: 'DB Migration Specialist',
    nameAr: 'أخصائي ترحيل قاعدة البيانات',
    icon: '🔄',
    description: 'إدارة المخططات والترحيلات في SQLite',
    parent: 'A6',
    capabilities: ['sqlite', 'migrations', 'schema-design'],
    tasks: [
      'إنشاء ترحيلات جديدة',
      'إدارة مخططات SQLite',
      'التأكد من foreign keys',
      'تحسين الاستعلامات',
    ],
  },
  'A6.2': {
    id: 'A6.2',
    name: 'Cache & Storage Engineer',
    nameAr: 'مهندس الكاش والتخزين',
    icon: '💾',
    description: 'إدارة التخزين المؤقت والتخزين المحلي/S3',
    parent: 'A6',
    capabilities: ['caching', 'local-storage', 's3-storage'],
    tasks: [
      'إدارة كاش الترجمة',
      'تخزين الملفات محلياً أو S3',
      'تنظيف الملفات القديمة',
      'إدارة TTL للكاش',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 7. Quality Assurance — الاختبار والجودة
  // ═══════════════════════════════════════════════════════════
  A7: {
    id: 'A7',
    name: 'Quality Assurance',
    nameAr: 'ضمان الجودة',
    icon: '✅',
    description: 'كتابة وتشغيل الاختبارات والتحقق من الجودة',
    subagents: ['A7.1', 'A7.2'],
    dependencies: ['A1', 'A2', 'A3', 'A4'],
    outputs: ['test-reports', 'bug-reports'],
  },
  'A7.1': {
    id: 'A7.1',
    name: 'Test Suite Runner',
    nameAr: 'مشغّل مجموعة الاختبارات',
    icon: '🏃',
    description: 'تشغيل مجموعة الاختبارات الكاملة والتحقق من النتائج',
    parent: 'A7',
    capabilities: ['unit-tests', 'integration-tests', 'smoke-tests'],
    tasks: [
      'تشغيل اختبارات smoke',
      'تشغيل اختبارات التكامل',
      'التحقق من تغطية الكود',
      'الكشف عن الأخطاء الجديدة',
    ],
  },
  'A7.2': {
    id: 'A7.2',
    name: 'Integration Test Builder',
    nameAr: 'بناء اختبارات التكامل',
    icon: '🔧',
    description: 'كتابة اختبارات تكامل جديدة للمسارات والميزات',
    parent: 'A7',
    capabilities: ['test-writing', 'mocking', 'assertions'],
    tasks: [
      'كتابة اختبارات لمسارات API الجديدة',
      'إنشاء mock للخدمات الخارجية',
      'اختبار سيناريوهات الفشل',
      'تحسين تغطية اختبارات الأ＾＾',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 8. Security Hardening — الحماية والأمان
  // ═══════════════════════════════════════════════════════════
  A8: {
    id: 'A8',
    name: 'Security Hardening',
    nameAr: 'التقبيط الأمني',
    icon: '🛡️',
    description: 'فحص الثغرات الأمنية وتقبيط التطبيق',
    subagents: ['A8.1', 'A8.2'],
    dependencies: ['A4'],
    outputs: ['security-reports', 'hardened-config'],
  },
  'A8.1': {
    id: 'A8.1',
    name: 'Vulnerability Scanner',
    nameAr: 'ماسح الثغرات',
    icon: '🔍',
    description: 'فحص الثغرات الأمنية OWASP Top 10',
    parent: 'A8',
    capabilities: ['owasp-scan', 'xss-check', 'injection-detection'],
    tasks: [
      'فحص ثغرات XSS',
      'فحص ثغرات SQL Injection',
      'فحص ثغرات CSRF',
      'فحص تسريب المفاتيح',
    ],
  },
  'A8.2': {
    id: 'A8.2',
    name: 'Auth & Rate Limit Auditor',
    nameAr: 'مدقق المصادقة وحدود الطلبات',
    icon: '🔑',
    description: 'مراجعة أنظمة المصادقة وحدود الطلبات',
    parent: 'A8',
    capabilities: ['auth-review', 'rate-limit', 'token-security'],
    tasks: [
      'مراجعة نظام Admin Token',
      'فحص rate limiting',
      'التأكد من عدم تسريب المفاتيح',
      'مراجعة أمان ملف .env',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 9. Deployment — النشر والبنية التحتية
  // ═══════════════════════════════════════════════════════════
  A9: {
    id: 'A9',
    name: 'Deployment',
    nameAr: 'النشر',
    icon: '🚀',
    description: 'نشر التطبيق وإدارة Docker و queues',
    subagents: ['A9.1', 'A9.2'],
    dependencies: ['A7'],
    outputs: ['deployed-app', 'docker-config'],
  },
  'A9.1': {
    id: 'A9.1',
    name: 'Docker Engineer',
    nameAr: 'مهندس Docker',
    icon: '🐳',
    description: 'إدارة Docker وحاويات النشر',
    parent: 'A9',
    capabilities: ['docker', 'dockerfile', 'docker-compose'],
    tasks: [
      'كتابة Dockerfile',
      'إدارة docker-compose',
      'تحسين حجم الصور',
      'إدارة المتغيرات البيئية في Docker',
    ],
  },
  'A9.2': {
    id: 'A9.2',
    name: 'Job Queue Manager',
    nameAr: 'مدير قائمة المهام',
    icon: '📋',
    description: 'إدارة قائمة مهام المعالجة في الخلفية',
    parent: 'A9',
    capabilities: ['job-queue', 'concurrency', 'ttl-cleanup'],
    tasks: [
      'إدارة job queue للمهام الثقيلة',
      'ضبط التزامن',
      'تنظيف المهام المنتهية',
      'مراقبة حالة المهام',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 10. Documentation — التوثيق والمطوية
  // ═══════════════════════════════════════════════════════════
  A10: {
    id: 'A10',
    name: 'Documentation',
    nameAr: 'التوثيق',
    icon: '📖',
    description: 'كتابة وتحديث التوثيق التقني والمستخدم',
    subagents: ['A10.1', 'A10.2'],
    dependencies: ['A4'],
    outputs: ['api-docs', 'user-guide'],
  },
  'A10.1': {
    id: 'A10.1',
    name: 'API Documentation Writer',
    nameAr: 'كاتب توثيق API',
    icon: '📝',
    description: 'كتابة توثيق واجهات API',
    parent: 'A10',
    capabilities: ['api-docs', 'openapi', 'code-samples'],
    tasks: [
      'توثيق مسارات API',
      'كتابة أمثلة الاستخدام',
      'تحديث OpenAPI specs',
      'توثيق أكواد الأخطاء',
    ],
  },
  'A10.2': {
    id: 'A10.2',
    name: 'User Guide Writer',
    nameAr: 'كاتب دليل المستخدم',
    icon: '📚',
    description: 'كتابة دليل المستخدم بالعربية',
    parent: 'A10',
    capabilities: ['user-docs', 'tutorials', 'screenshots'],
    tasks: [
      'كتابة دروس تعليمية',
      'إنشاء دليل البدء السريع',
      'توثيق الميزات الجديدة',
      'إنشاء FAQs',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 11. Performance — الأداء والتحسين
  // ═══════════════════════════════════════════════════════════
  A11: {
    id: 'A11',
    name: 'Performance',
    nameAr: 'الأداء',
    icon: '⚡',
    description: 'قياس وتحسين أداء التطبيق',
    subagents: ['A11.1', 'A11.2'],
    dependencies: ['A4', 'A6'],
    outputs: ['benchmarks', 'optimizations'],
  },
  'A11.1': {
    id: 'A11.1',
    name: 'Benchmark Runner',
    nameAr: 'مشغّل المقارنات',
    icon: '📊',
    description: 'تشغيل اختبارات الأداء وقياس الأوقات',
    parent: 'A11',
    capabilities: ['benchmarking', 'profiling', 'timing'],
    tasks: [
      'قياس أوقات استجابة API',
      'قياس استهلاك الذاكرة',
      'مقارنة أداء مزوّدي الترجمة',
      'إنشاء تقارير أداء',
    ],
  },
  'A11.2': {
    id: 'A11.2',
    name: 'Optimization Engineer',
    nameAr: 'مهندس التحسين',
    icon: '🔧',
    description: 'تحسين الأداء وتقليل الاستهلاك',
    parent: 'A11',
    capabilities: ['caching', 'lazy-loading', 'code-splitting'],
    tasks: [
      'تحسين الكاش',
      'تقليل حجم الحزم',
      'تحسين الاستعلامات',
      'تحسين وقت التشغيل الأول',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 12. Integration & Extension — الإضافات والتكامل الخارجي
  // ═══════════════════════════════════════════════════════════
  A12: {
    id: 'A12',
    name: 'Integration & Extension',
    nameAr: 'التكامل والإضافات',
    icon: '🔗',
    description: 'بناء إضافات المتصفح والتكامل مع خدمات خارجية',
    subagents: ['A12.1', 'A12.2'],
    dependencies: ['A3', 'A4'],
    outputs: ['chrome-extension', 'integrations'],
  },
  'A12.1': {
    id: 'A12.1',
    name: 'Chrome Extension Dev',
    nameAr: 'مطوّر إضافة المتصفح',
    icon: '🧩',
    description: 'تطوير وإدارة إضافة Chrome',
    parent: 'A12',
    capabilities: ['chrome-api', 'manifest-v3', 'content-scripts'],
    tasks: [
      'إدارة manifest.json',
      'بناء popup و background scripts',
      'إضافة content scripts للمواقع',
      'نشر الإضافة في Chrome Web Store',
    ],
  },
  'A12.2': {
    id: 'A12.2',
    name: 'External API Integrator',
    nameAr: 'متكامل APIs خارجية',
    icon: '🌍',
    description: 'التكامل مع APIs خارجية مثل YouTube API',
    parent: 'A12',
    capabilities: ['api-integration', 'oauth', 'webhooks'],
    tasks: [
      'التكامل مع YouTube Data API',
      'إدارة OAuth tokens',
      'معالجة webhooks',
      'التكامل مع خدمات الترجمة外部',
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// Guardians — وكلاء متجوّلون
// ═══════════════════════════════════════════════════════════
const GUARDIANS = {
  'G1': {
    id: 'G1',
    name: 'Security Guardian',
    nameAr: 'حارس الأمان',
    icon: '🛡️',
    description: 'يراقب بشكل مستمر أي تهديدات أمنية',
    monitors: ['A4', 'A8'],
    alertOn: ['vulnerability-detected', 'key-leak', 'unauthorized-access'],
  },
  'G2': {
    id: 'G2',
    name: 'Quality Guardian',
    nameAr: 'حارس الجودة',
    icon: '🏆',
    description: 'يتحقق من جودة الكود قبل الدمج',
    monitors: ['A7', 'A11'],
    alertOn: ['test-failure', 'coverage-drop', 'performance-regression'],
  },
  'G3': {
    id: 'G3',
    name: 'Metrics Collector',
    nameAr: 'جامع المقاييس',
    icon: '📈',
    description: 'يجمع مقاييس الأداء والاستخدام',
    monitors: ['A1', 'A5', 'A6'],
    alertOn: ['api-slow', 'cache-miss-rate-high', 'db-slow-query'],
  },
};

// ═══════════════════════════════════════════════════════════
// Workflows — سير عمل جاهز
// ═══════════════════════════════════════════════════════════
const WORKFLOWS = {
  'translate-youtube': {
    name: 'ترجمة فيديو يوتيوب',
    waves: [
      { name: 'استخراج', agents: ['A2.1', 'A6.1'], mode: 'parallel' },
      { name: 'فحص المزوّدين', agents: ['A1.1'], mode: 'sequential' },
      { name: 'ترجمة + TTS', agents: ['A1.2', 'A5.2'], mode: 'parallel' },
      { name: 'عرض النتيجة', agents: ['A3.2', 'A6.2'], mode: 'parallel' },
      { name: 'فحص الجودة', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'translate-article': {
    name: 'ترجمة مقال',
    waves: [
      { name: 'استخراج', agents: ['A2.2'], mode: 'sequential' },
      { name: 'ترجمة', agents: ['A1.1', 'A1.2'], mode: 'sequential' },
      { name: 'عرض', agents: ['A3.2'], mode: 'sequential' },
      { name: 'فحص', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'dub-video': {
    name: 'دبلجة فيديو يوتيوب',
    waves: [
      { name: 'استخراج', agents: ['A2.1'], mode: 'sequential' },
      { name: 'ترجمة', agents: ['A1.1', 'A1.2'], mode: 'sequential' },
      { name: 'STT', agents: ['A5.2'], mode: 'sequential' },
      { name: 'TTS', agents: ['A5.2'], mode: 'sequential' },
      { name: 'دمج', agents: ['A5.1'], mode: 'sequential' },
      { name: 'فحص', agents: ['A7.1'], mode: 'sequential' },
    ],
  },
  'security-audit': {
    name: 'مسح أمني شامل',
    waves: [
      { name: 'فحص الثغرات', agents: ['A8.1'], mode: 'sequential' },
      { name: 'مراجعة المصادقة', agents: ['A8.2'], mode: 'sequential' },
      { name: 'مراجعة الكود', agents: ['A4.1', 'A4.2'], mode: 'parallel' },
      { name: 'تقرير', agents: ['A10.1'], mode: 'sequential' },
    ],
  },
  'deploy': {
    name: 'نشر التطبيق',
    waves: [
      { name: 'اختبارات', agents: ['A7.1', 'A7.2'], mode: 'parallel' },
      { name: 'أمان', agents: ['A8.1'], mode: 'sequential' },
      { name: 'أداء', agents: ['A11.1'], mode: 'sequential' },
      { name: 'بناء Docker', agents: ['A9.1'], mode: 'sequential' },
      { name: 'نشر', agents: ['A9.2'], mode: 'sequential' },
    ],
  },
};

module.exports = { AGENTS, GUARDIANS, WORKFLOWS };
