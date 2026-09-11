// agents/core/squads.js — تعريف الفرق العشرين ومهامها وأدواتها ومهاراتها
//
// البنية: 20 فرقة × 5 وكلاء رئيسيين × 2 فرعي = 300 وكيل.
// الوكلاء الاثنا عشر في النظام القديم أصبحوا قادة فرق (S1..S20) حتى تستمر
// سير العمل القديمة (translate-youtube…) كما هي.
// كل فرقة لها: مهمة واحدة واضحة + أدوات حقيقية + مهارات + أدوات LLM اختيارية.
//
// realTools: أدوات حقيقية من core/tools.js تُنفَّذ محليًا بلا شبكة.
// skills:    قدرات معرفية (llm = يسمح باستدعاء Gemini عند توفر المفتاح).

const SQUADS = {
  // ═══ فرق الترجمة واللغة ═══
  S1: {
    id: 'S1', name: 'فرقة محرك الترجمة', icon: '🔌', color: '#2f6b4f',
    mission: 'مراقبة وتحسين محرك الترجمة متعدد المزوّدات والتبديل التلقائي بينهم',
    skills: ['llm', 'benchmarking', 'fallback-design'],
    leaders: {
      T1:  { name: 'مراقب المزوّدات',      nameEn: 'Provider Watcher',   oldId: 'A1.1', realTools: ['provider_health'],              tools: ['health-check', 'cooldown'],              skills: ['llm'] },
      T2:  { name: 'مهندس التقسيم',         nameEn: 'Chunking Engineer',  oldId: 'A1.2', realTools: ['search_code'],                  tools: ['chunking', 'reassemble'],                skills: ['llm'] },
      T3:  { name: 'مدقق الجودة اللغوية',   nameEn: 'Quality Auditor',    oldId: null,   realTools: ['translate_text', 'llm_call'],   tools: ['wer-eval', 'back-translation'],          skills: ['llm', 'arabic-qa'] },
      T4:  { name: 'كاشف اللغات',           nameEn: 'Language Detector',  oldId: null,   realTools: ['detect_language'],              tools: ['detection', 'encoding-fix'],             skills: [] },
      T5:  { name: 'أمين المسرد',           nameEn: 'Glossary Keeper',    oldId: null,   realTools: ['search_code', 'read_file'],     tools: ['glossary-mgmt', 'term-consistency'],     skills: ['llm'] },
    },
  },
  S2: {
    id: 'S2', name: 'فرقة استخراج المحتوى', icon: '📥', color: '#3d5a99',
    mission: 'استخراج المحتوى من أي رابط: يوتيوب، مقالات، مواقع — باحترام المصادر',
    skills: ['llm', 'scraping-ethics'],
    leaders: {
      T1: { name: 'أخصائي يوتيوب',      nameEn: 'YouTube Specialist',  oldId: 'A2.1', realTools: ['search_code'],                tools: ['transcript', 'metadata'],      skills: ['llm'] },
      T2: { name: 'مهندس الكشط',        nameEn: 'Web Scraper',         oldId: 'A2.2', realTools: ['extract_url'],                tools: ['readability', 'clean-html'],   skills: ['llm'] },
      T3: { name: 'حارس الاستخراج',     nameEn: 'Extraction Guardian', oldId: null,   realTools: ['run_command'],                tools: ['error-mapping', 'retries'],    skills: [] },
      T4: { name: 'كاشف السياق',        nameEn: 'Context Detector',    oldId: null,   realTools: ['search_code', 'read_file'],   tools: ['url-classify'],                skills: [] },
      T5: { name: 'مذيّع الملفات',      nameEn: 'Format normalizer',   oldId: null,   realTools: ['read_file', 'write_report'],  tools: ['srt-vtt', 'pdf-text'],         skills: [] },
    },
  },

  // ═══ فرق الواجهة والتجربة ═══
  S3: {
    id: 'S3', name: 'فرقة الواجهة العربية', icon: '🎨', color: '#C62828',
    mission: 'واجهة RTL عربية متجاوبة ومتاحة للجميع حسب نظام التصميم DESIGN.md',
    skills: ['llm', 'design-system'],
    leaders: {
      T1: { name: 'أخصائي RTL',        nameEn: 'RTL Specialist',    oldId: 'A3.1', realTools: ['search_code', 'read_file'],  tools: ['rtl-css', 'logical-props'],   skills: [] },
      T2: { name: 'مهندس الوصولية',    nameEn: 'A11y Engineer',     oldId: 'A3.2', realTools: ['search_code'],               tools: ['aria', 'keyboard-nav'],       skills: [] },
      T3: { name: 'مصمم المكوّنات',    nameEn: 'Component Stylist', oldId: null,   realTools: ['read_file', 'write_report'], tools: ['tokens', 'theming'],          skills: ['llm'] },
      T4: { name: 'مدقق التجاوب',      nameEn: 'Responsive Auditor',oldId: null,   realTools: ['run_command'],               tools: ['breakpoints', 'mobile-first'],skills: [] },
      T5: { name: 'حارس الأداء البصري',nameEn: 'Render Guardian',   oldId: null,   realTools: ['search_code'],               tools: ['paint-audit', 'no-backdrop'], skills: [] },
    },
  },
  S4: {
    id: 'S4', name: 'فرقة تجربة المستخدم', icon: '🧭', color: '#8a6116',
    mission: 'سلاسة التدفقات: ترجمة، رفع، مشاركة — وتقليل الاحتكاك في كل خطوة',
    skills: ['llm', 'ux-writing'],
    leaders: {
      T1: { name: 'كاتب النصوص العربية', nameEn: 'UX Writer',        oldId: null, realTools: ['search_code'],               tools: ['microcopy', 'tone'],          skills: ['llm'] },
      T2: { name: 'محلّل التدفقات',      nameEn: 'Flow Analyst',     oldId: null, realTools: ['read_file'],                 tools: ['journey-map', 'drop-off'],    skills: [] },
      T3: { name: 'مهندس الإشعارات',     nameEn: 'Toast Engineer',   oldId: null, realTools: ['search_code'],               tools: ['toast', 'progress'],          skills: [] },
      T4: { name: 'مدقق النماذج',        nameEn: 'Form Auditor',     oldId: null, realTools: ['read_file'],                 tools: ['validation-ux'],              skills: [] },
      T5: { name: 'باحث المستخدم',       nameEn: 'User Researcher',  oldId: null, realTools: ['write_report'],              tools: ['personas', 'feedback-loop'],  skills: ['llm'] },
    },
  },

  // ═══ فرق الخادم والبيانات ═══
  S5: {
    id: 'S5', name: 'فرقة الخادم والمسارات', icon: '⚙️', color: '#339933',
    mission: 'مسارات API نظيفة وموثّقة ومصنّعة بأخطاء موحّدة — بلا مسار يتيم',
    skills: ['llm', 'express'],
    leaders: {
      T1: { name: 'مهندس المسارات',   nameEn: 'Route Architect',   oldId: 'A4.1', realTools: ['search_code', 'syntax_check'], tools: ['routing', 'middleware'],     skills: [] },
      T2: { name: 'أخصائي التكوين',   nameEn: 'Config Specialist', oldId: 'A4.2', realTools: ['read_file'],                   tools: ['env', 'secrets'],            skills: [] },
      T3: { name: 'حارس الأخطاء',     nameEn: 'Error Guardian',    oldId: null,   realTools: ['search_code', 'read_file'],    tools: ['error-map', 'status-codes'], skills: [] },
      T4: { name: 'موثّق الـ API',    nameEn: 'API Documenter',    oldId: null,   realTools: ['read_file', 'write_report'],   tools: ['openapi', 'examples'],       skills: ['llm'] },
      T5: { name: 'مدقق الوسائط',     nameEn: 'Middleware Auditor',oldId: null,   realTools: ['search_code'],                 tools: ['order-audit', 'helmet'],     skills: [] },
    },
  },
  S6: {
    id: 'S6', name: 'فرقة البيانات والتخزين', icon: '🗄️', color: '#5a3d99',
    mission: 'SQLite والكاش والتخزين بالمفتاح — سلامة البيانات أولًا',
    skills: ['llm', 'sqlite'],
    leaders: {
      T1: { name: 'أخصائي الترحيلات',  nameEn: 'Migration Specialist', oldId: 'A6.1', realTools: ['search_code'],              tools: ['migrations', 'pragmas'],    skills: [] },
      T2: { name: 'مهندس الكاش',       nameEn: 'Cache Engineer',       oldId: 'A6.2', realTools: ['cache_stats', 'read_file'], tools: ['ttl', 'atomic-write'],      skills: [] },
      T3: { name: 'حارس السلامة',      nameEn: 'Integrity Guardian',   oldId: null,   realTools: ['db_summary'],               tools: ['fk-cascade', 'vacuum'],     skills: [] },
      T4: { name: 'مهندس التخزين',     nameEn: 'Storage Engineer',     oldId: null,   realTools: ['search_code'],              tools: ['s3', 'keys-not-paths'],     skills: [] },
      T5: { name: 'جامع الإحصاءات',    nameEn: 'Stats Collector',      oldId: null,   realTools: ['db_summary', 'write_report'],tools: ['timeseries', 'aggregation'],skills: [] },
    },
  },
  S7: {
    id: 'S7', name: 'فرقة الوسائط', icon: '🎵', color: '#993d5a',
    mission: 'خط إنتاج الصوت والفيديو: TTS، STT، دبلجة، OCR — من الملف إلى النتيجة',
    skills: ['llm', 'ffmpeg'],
    leaders: {
      T1: { name: 'مهندس الدبلجة',    nameEn: 'Dubbing Engineer',  oldId: 'A5.1', realTools: ['search_code'],              tools: ['segmenting', 'mixing'],  skills: [] },
      T2: { name: 'أخصائي TTS',       nameEn: 'TTS Specialist',    oldId: 'A5.2', realTools: ['search_code'],              tools: ['gtts', 'edge-tts'],      skills: [] },
      T3: { name: 'أخصائي STT',       nameEn: 'STT Specialist',    oldId: null,   realTools: ['search_code'],              tools: ['whisper', 'sherpa'],     skills: [] },
      T4: { name: 'أخصائي OCR',       nameEn: 'OCR Specialist',    oldId: null,   realTools: ['search_code'],              tools: ['tesseract', 'ar-ocr'],   skills: [] },
      T5: { name: 'حارس التنظيف',     nameEn: 'Cleanup Guardian',  oldId: null,   realTools: ['run_command'],              tools: ['tmp-purge', 'ttl'],      skills: [] },
    },
  },

  // ═══ فرق الجودة والأمان ═══
  S8: {
    id: 'S8', name: 'فرقة ضمان الجودة', icon: '✅', color: '#2f6b4f',
    mission: '624+ اختبارًا أخضر دائمًا — ولا ميزة بلا اختبار يغطيها',
    skills: ['llm', 'node-test'],
    leaders: {
      T1: { name: 'مشغّل الاختبارات',   nameEn: 'Test Runner',      oldId: 'A7.1', realTools: ['run_tests'],                  tools: ['node-test', 'coverage'],  skills: [] },
      T2: { name: 'بنّاء الاختبارات',   nameEn: 'Test Builder',     oldId: 'A7.2', realTools: ['search_code', 'write_report'],tools: ['integration', 'mocking'], skills: ['llm'] },
      T3: { name: 'مدقق الدخان',        nameEn: 'Smoke Auditor',    oldId: null,   realTools: ['run_tests'],                  tools: ['route-coverage'],         skills: [] },
      T4: { name: 'حارس التغطية',       nameEn: 'Coverage Guardian',oldId: null,   realTools: ['run_command'],                tools: ['c8', 'thresholds'],       skills: [] },
      T5: { name: 'مدقق الانحدار',      nameEn: 'Regression Auditor',oldId: null,  realTools: ['run_tests', 'write_report'],  tools: ['flaky-hunt'],             skills: [] },
    },
  },
  S9: {
    id: 'S9', name: 'فرقة التقبيط الأمني', icon: '🛡️', color: '#C62828',
    mission: 'حماية OWASP Top 10: SSRF، حقن، مفاتيح، حدود — أمان بلا تنازلات',
    skills: ['llm', 'owasp'],
    leaders: {
      T1: { name: 'ماسح الثغرات',      nameEn: 'Vuln Scanner',       oldId: 'A8.1', realTools: ['search_code', 'run_command'], tools: ['owasp', 'xss'],        skills: ['llm'] },
      T2: { name: 'مدقق المصادقة',     nameEn: 'Auth Auditor',       oldId: 'A8.2', realTools: ['search_code'],                tools: ['token', 'timing-safe'], skills: [] },
      T3: { name: 'حارس المفاتيح',     nameEn: 'Secrets Guardian',   oldId: null,   realTools: ['search_code'],                tools: ['scrub', 'env-hygiene'], skills: [] },
      T4: { name: 'مدقق الحدود',       nameEn: 'Rate-Limit Auditor', oldId: null,   realTools: ['read_file'],                  tools: ['limiter', 'redis'],     skills: [] },
      T5: { name: 'حارس CORS/CSP',     nameEn: 'Policy Guardian',    oldId: null,   realTools: ['read_file'],                  tools: ['cors', 'csp'],          skills: [] },
    },
  },

  // ═══ فرق النشر والأداء والتوثيق والتكامل ═══
  S10: {
    id: 'S10', name: 'فرقة النشر', icon: '🚀', color: '#3d5a99',
    mission: 'نشر موثوق: Docker، Render، إقلاع صحي، واستعادة من الأعطال',
    skills: ['llm', 'docker'],
    leaders: {
      T1: { name: 'مهندس Docker',      nameEn: 'Docker Engineer',   oldId: 'A9.1', realTools: ['read_file', 'run_command'], tools: ['multi-stage', 'compose'], skills: [] },
      T2: { name: 'مدير المهام',       nameEn: 'Job Queue Manager', oldId: 'A9.2', realTools: ['search_code'],              tools: ['concurrency', 'ttl'],     skills: [] },
      T3: { name: 'حارس الإقلاع',      nameEn: 'Boot Guardian',     oldId: null,   realTools: ['read_file'],                tools: ['preboot-check'],          skills: [] },
      T4: { name: 'مهندس الاستعادة',   nameEn: 'Recovery Engineer', oldId: null,   realTools: ['search_code'],              tools: ['restart', 'dr'],          skills: [] },
      T5: { name: 'مدقق render.yaml',  nameEn: 'Render Auditor',    oldId: null,   realTools: ['read_file'],                tools: ['render-blueprint'],       skills: [] },
    },
  },
  S11: {
    id: 'S11', name: 'فرقة الأداء', icon: '⚡', color: '#8a6116',
    mission: 'قياس كل شيء: زمن الاستجابة، الكاش، الذاكرة — ثم تحسين ما يبطئ',
    skills: ['llm', 'profiling'],
    leaders: {
      T1: { name: 'مشغّل المقاييس',    nameEn: 'Benchmark Runner',  oldId: 'A11.1', realTools: ['run_command'],               tools: ['perf-bench'],            skills: [] },
      T2: { name: 'مهندس التحسين',     nameEn: 'Optimization Eng',  oldId: 'A11.2', realTools: ['search_code'],               tools: ['hot-path', 'caching'],   skills: [] },
      T3: { name: 'حارس الذاكرة',      nameEn: 'Memory Guardian',   oldId: null,    realTools: ['search_code'],               tools: ['leak-hunt', 'maps'],     skills: [] },
      T4: { name: 'مدقق الشبكة',       nameEn: 'Network Auditor',   oldId: null,    realTools: ['search_code'],               tools: ['compression', 'sse'],    skills: [] },
      T5: { name: 'محلّل التكلفة',     nameEn: 'Cost Analyst',      oldId: null,    realTools: ['db_summary'],                tools: ['quota', 'usage'],        skills: [] },
    },
  },
  S12: {
    id: 'S12', name: 'فرقة التوثيق', icon: '📖', color: '#5a3d99',
    mission: 'توثيق صادق ومحدّث: README، OpenAPI، CHANGELOG — بلا ادعاءات غير مُتحقق منها',
    skills: ['llm', 'tech-writing'],
    leaders: {
      T1: { name: 'كاتب الـ API',        nameEn: 'API Writer',        oldId: 'A10.1', realTools: ['read_file', 'write_report'], tools: ['openapi', 'curl'],     skills: ['llm'] },
      T2: { name: 'كاتب الدليل',         nameEn: 'Guide Writer',      oldId: 'A10.2', realTools: ['write_report'],              tools: ['user-guide', 'faq'],   skills: ['llm'] },
      T3: { name: 'أمين السجل',          nameEn: 'Changelog Keeper',  oldId: null,    realTools: ['run_command', 'write_report'],tools: ['git-log', 'semver'],   skills: [] },
      T4: { name: 'مدقق التوثيق',        nameEn: 'Docs Auditor',      oldId: null,    realTools: ['search_code'],               tools: ['docs-drift'],          skills: [] },
      T5: { name: 'مترجم التوثيق',       nameEn: 'Docs Translator',   oldId: null,    realTools: ['translate_text'],            tools: ['bilingual'],           skills: [] },
    },
  },
  S13: {
    id: 'S13', name: 'فرقة الإضافة والتكامل', icon: '🔗', color: '#993d5a',
    mission: 'إضافة Chrome MV3 والتكامل مع الخدمات الخارجية (YouTube API…)',
    skills: ['llm', 'mv3'],
    leaders: {
      T1: { name: 'مطوّر الإضافة',      nameEn: 'Extension Dev',      oldId: 'A12.1', realTools: ['search_code'],              tools: ['mv3', 'popup'],        skills: [] },
      T2: { name: 'متكامل الـ API',     nameEn: 'API Integrator',     oldId: 'A12.2', realTools: ['search_code', 'run_command'],tools: ['youtube-api', 'oauth'],skills: [] },
      T3: { name: 'مدقق manifest',      nameEn: 'Manifest Auditor',   oldId: null,    realTools: ['read_file'],                tools: ['mv3-compliance'],      skills: [] },
      T4: { name: 'حارس الصلاحيات',     nameEn: 'Permissions Guardian',oldId: null,   realTools: ['read_file'],                tools: ['least-privilege'],     skills: [] },
      T5: { name: 'مختبِر المتصفح',     nameEn: 'Browser Tester',     oldId: null,    realTools: ['run_command'],              tools: ['chrome-load'],         skills: [] },
    },
  },

  // ═══ الفرق السبع الجديدة — امتداد طبيعي لنطاقات المشروع ═══
  S14: {
    id: 'S14', name: 'فرقة الدبلجة الذكية', icon: '🎙️', color: '#2f6b4f',
    mission: 'جودة الدبلجة الصوتية: مزامنة الشفاه، التوقيت، أصوات طبيعية بالعربية',
    skills: ['llm', 'audio'],
    leaders: {
      T1: { name: 'مهندس التوقيت',     nameEn: 'Timing Engineer',    oldId: null, realTools: ['search_code'],             tools: ['timing-engine', 'stretch'], skills: [] },
      T2: { name: 'أخصائي الأصوات',    nameEn: 'Voice Specialist',   oldId: null, realTools: ['search_code'],             tools: ['voice-map', 'gender-fit'],  skills: ['llm'] },
      T3: { name: 'مدقق المزج',        nameEn: 'Mix Auditor',        oldId: null, realTools: ['run_command'],             tools: ['loudness', 'ducking'],      skills: [] },
      T4: { name: 'حارس المزامنة',     nameEn: 'Sync Guardian',      oldId: null, realTools: ['search_code'],             tools: ['lip-sync', 'offset'],       skills: [] },
      T5: { name: 'مهندس التصدير',     nameEn: 'Export Engineer',    oldId: null, realTools: ['search_code'],             tools: ['mux', 'formats'],           skills: [] },
    },
  },
  S15: {
    id: 'S15', name: 'فرقة العربية أولاً', icon: '🕌', color: '#C62828',
    mission: 'تشكيل النص العربي وتصحيحه إملائيًا ومراعاة خصوصية اللغة في كل مكان',
    skills: ['llm', 'arabic-nlp'],
    leaders: {
      T1: { name: 'أخصائي التشكيل',    nameEn: 'Tashkeel Specialist',oldId: null, realTools: ['search_code', 'llm_call'], tools: ['gemini-tashkeel', 'rules'], skills: ['llm'] },
      T2: { name: 'مدقق الإملاء',      nameEn: 'Spelling Auditor',   oldId: null, realTools: ['llm_call'],                tools: ['hamza', 'ta-marbuta'],      skills: ['llm'] },
      T3: { name: 'حارس الـ RTL',      nameEn: 'Bidi Guardian',      oldId: null, realTools: ['search_code'],             tools: ['bidi', 'numbers'],          skills: [] },
      T4: { name: 'أخصائي الصرف',      nameEn: 'Morphology Analyst', oldId: null, realTools: ['llm_call'],                tools: ['roots', 'affixes'],         skills: ['llm'] },
      T5: { name: 'مدقق اللهجات',      nameEn: 'Dialect Auditor',    oldId: null, realTools: ['llm_call'],                tools: ['msa', 'dialect-map'],       skills: ['llm'] },
    },
  },
  S16: {
    id: 'S16', name: 'فرقة الذكاء الاصطناعي', icon: '🧠', color: '#3d5a99',
    mission: 'طبقة الذكاء: Gemini smart-translate، تضمينات، وحراسة استهلاك الحصة',
    skills: ['llm', 'prompt-eng'],
    leaders: {
      T1: { name: 'مهندس البرومبتات',  nameEn: 'Prompt Engineer',    oldId: null, realTools: ['llm_call'],                tools: ['prompt-design', 'eval'],    skills: ['llm'] },
      T2: { name: 'حارس الحصة',        nameEn: 'Quota Guardian',     oldId: null, realTools: ['db_summary'],              tools: ['budget', 'cooldown'],       skills: [] },
      T3: { name: 'مدقق المخرجات',     nameEn: 'Output Auditor',     oldId: null, realTools: ['llm_call'],                tools: ['hallucination', 'format'],  skills: ['llm'] },
      T4: { name: 'مهندس التضمينات',   nameEn: 'Embeddings Engineer',oldId: null, realTools: ['search_code'],             tools: ['xenova', 'similarity'],     skills: [] },
      T5: { name: 'باحث النماذج',      nameEn: 'Model Scout',        oldId: null, realTools: ['write_report'],            tools: ['model-eval', 'cost'],       skills: ['llm'] },
    },
  },
  S17: {
    id: 'S17', name: 'فرقة المشاريع', icon: '📂', color: '#8a6116',
    mission: 'مسار المشاريع: رفع فيديو، تفريغ، ترجمة، أصول — بحالة قابلة للاستئناف',
    skills: ['llm', 'pipelines'],
    leaders: {
      T1: { name: 'مهندس الخط الإنتاجي',nameEn: 'Pipeline Engineer', oldId: null, realTools: ['search_code'],               tools: ['stages', 'resume'],        skills: [] },
      T2: { name: 'حارس الأصول',        nameEn: 'Assets Guardian',   oldId: null, realTools: ['search_code'],               tools: ['asset-keys', 'meta'],      skills: [] },
      T3: { name: 'مدقق التقدّم',       nameEn: 'Progress Auditor',  oldId: null, realTools: ['search_code'],               tools: ['sse-progress', 'persist'], skills: [] },
      T4: { name: 'مهندس الإلغاء',      nameEn: 'Cancellation Eng',  oldId: null, realTools: ['search_code'],               tools: ['abort', 'cleanup'],        skills: [] },
      T5: { name: 'مدقق المشاركة',      nameEn: 'Share Auditor',     oldId: null, realTools: ['search_code'],               tools: ['share-hash', 'expiry'],    skills: [] },
    },
  },
  S18: {
    id: 'S18', name: 'فرقة المراقبة', icon: '📊', color: '#5a3d99',
    mission: 'ملاحظة النظام الحي: سجلات، أخطاء، لوحة الإدارة — لكل شيء رقيم',
    skills: ['llm', 'observability'],
    leaders: {
      T1: { name: 'حارس السجلات',      nameEn: 'Logs Guardian',     oldId: null, realTools: ['run_command'],             tools: ['logger', 'rotation'],     skills: [] },
      T2: { name: 'محلّل الأخطاء',     nameEn: 'Error Analyst',     oldId: null, realTools: ['search_code'],             tools: ['error-rates', 'alerts'],  skills: ['llm'] },
      T3: { name: 'مدقق اللوحة',       nameEn: 'Dashboard Auditor', oldId: null, realTools: ['read_file'],               tools: ['admin-ui', 'charts'],     skills: [] },
      T4: { name: 'حارس الصحة',        nameEn: 'Health Guardian',   oldId: null, realTools: ['run_command'],             tools: ['heartbeat', 'uptime'],    skills: [] },
      T5: { name: 'جامع الأحداث',      nameEn: 'Events Collector',  oldId: null, realTools: ['db_summary'],              tools: ['funnel', 'metrics'],      skills: [] },
    },
  },
  S19: {
    id: 'S19', name: 'فرقة الاختبار الذاتي', icon: '🔬', color: '#993d5a',
    mission: 'النظام يختبر نفسه: فحوصات مستمرة، بنية سليمة، تراجعات مبكرة',
    skills: ['llm', 'meta-testing'],
    leaders: {
      T1: { name: 'مدقق البنية',       nameEn: 'Structure Auditor', oldId: null, realTools: ['list_files', 'search_code'], tools: ['arch-rules', 'deps'],     skills: [] },
      T2: { name: 'حارس الجهاز',       nameEn: 'Env Guardian',      oldId: null, realTools: ['run_command'],             tools: ['node-version', 'deps'],   skills: [] },
      T3: { name: 'مدقق اللاحقات',     nameEn: 'Hook Auditor',      oldId: null, realTools: ['search_code'],             tools: ['git-hooks', 'ci'],        skills: [] },
      T4: { name: 'مشغّل الفحص الذاتي',nameEn: 'Self-Check Runner', oldId: null, realTools: ['syntax_check'],            tools: ['node-check', 'imports'],  skills: [] },
      T5: { name: 'محلّل الفشل',       nameEn: 'Failure Analyst',   oldId: null, realTools: ['run_tests', 'write_report'],tools: ['flaky', 'root-cause'],    skills: ['llm'] },
    },
  },
  S20: {
    id: 'S20', name: 'فرقة الهندسة العكسية', icon: '🧪', color: '#2f6b4f',
    mission: 'أفكار جديدة مبنية على أدلة: تجارب صغيرة تقاس ثم تُعتمد أو تُهدر',
    skills: ['llm', 'research'],
    leaders: {
      T1: { name: 'باحث التقنيات',     nameEn: 'Tech Scout',        oldId: null, realTools: ['write_report'],            tools: ['spike', 'poc'],             skills: ['llm'] },
      T2: { name: 'مهندس التجارب',     nameEn: 'Experiment Engineer',oldId: null,realTools: ['write_report'],            tools: ['ab-test', 'metrics'],       skills: [] },
      T3: { name: 'محلّل المنافسين',   nameEn: 'Competitor Analyst',oldId: null, realTools: ['write_report'],            tools: ['feature-parity'],           skills: ['llm'] },
      T4: { name: 'مدقق الفكرة',       nameEn: 'Idea Auditor',      oldId: null, realTools: ['llm_call'],                tools: ['feasibility', 'effort'],    skills: ['llm'] },
      T5: { name: 'كاتب الموجزات',     nameEn: 'Brief Writer',      oldId: null, realTools: ['write_report'],            tools: ['rfc', 'decision-log'],      skills: ['llm'] },
    },
  },
};

module.exports = { SQUADS };
