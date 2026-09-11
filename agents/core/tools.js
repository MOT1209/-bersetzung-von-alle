// agents/core/tools.js — أدوات الوكلاء
//
// كل أداة دالة async من الشكل (args, ctx) → نتيجة. النتائج الصغيرة تُعاد
// مباشرة، والنتائج الكبيرة (نص طويل، تقرير…) تُخزَّن في ملف artifact
// داخل cache/agents/artifacts/ وتُعاد إشارة إليها — حتى لا تُغرق الذاكرة
// ولا سجل الرسائل. ctx يوفر التخزين والمسار والمعرّف.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ── حفظ المخرجات الكبيرة كـ artifact وإرجاع إشارة إليها ──
function saveArtifact(name, content, ctx) {
  const dir = path.join(process.cwd(), 'cache', 'agents', 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // تنظيف الاسم: بلا فواصل مسار ولا نقاط متتالية (دفاع عميق ضد التجوال)
  const safe = String(name || 'artifact').replace(/[^\w.-]/g, '_').replace(/\.{2,}/g, '.').replace(/^[.\-]+/, '');
  const file = path.join(dir, `${stamp}_${safe}`);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return { artifact: path.relative(process.cwd(), file), bytes: Buffer.byteLength(String(content)) };
}

// عرض النتيجة: إن كانت كبيرة → artifact، وإلا تُعاد كما هي
function maybeSpill(name, result, ctx) {
  const s = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  if (s.length <= 4000) return { ok: true, result };
  return { ok: true, result: saveArtifact(name, s, ctx) };
}

// ═══════════════════════════════════════════════════════════
// الأدوات — كل واحدة (args, ctx) → نتيجة
// ═══════════════════════════════════════════════════════════
const TOOLS = {
  // ── أدوات عامة ──
  // ── أدوات الوكلاء الفرعيين (args افتراضية آمنة) ──
  'read_file': async ({ path: p = 'server/translate.js' }) => {
    // الافتراضي: قلب محرك الترجمة — أدوات search/list تغطي الباقي
    const src = fs.readFileSync(path.resolve(p), 'utf8');
    return maybeSpill(`read_${path.basename(p)}`, src.slice(0, 100000));
  },

  'write_report': async ({ name, content }, ctx) =>
    ({ ok: true, result: saveArtifact(name || 'report', content || '', ctx) }),

  'list_files': async ({ dir = '.', pattern }) => {
    const out = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp);
        else if (!pattern || new RegExp(pattern).test(e.name)) out.push(path.relative(process.cwd(), fp));
      }
    })(dir);
    return maybeSpill('file-list', out);
  },

  // cmd الافتراضي: أمر آمن حقيقي حتى يعمل الوكيل الفرعي بلا args مخصصة
  'run_command': async ({ cmd = process.execPath, args = ['--version'] }) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve(maybeSpill('cmd-output', {
        ok: !err, code: err ? err.code : 0,
        stdout: String(stdout || '').slice(0, 50000),
        stderr: String(stderr || '').slice(0, 20000),
      }));
    });
  }),

  // ── أدوات جودة المشروع (تنفيذ حقيقي محلي) ──
  'run_lint': async () => new Promise((resolve) => {
    execFile('npm', ['run', 'lint'], { timeout: 180000, shell: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, result: { pass: !err, output: String(stdout || stderr || '').slice(-4000) } }));
  }),

  'run_tests': async () => new Promise((resolve) => {
    execFile('npm', ['test'], { timeout: 600000, shell: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      const out = String(stdout || '');
      const m = out.match(/pass (\d+)[\s\S]*?fail (\d+)/);
      resolve({ ok: !err, result: { pass: !err, testsPassed: m ? +m[1] : null, testsFailed: m ? +m[2] : null, tail: out.slice(-3000) } });
    });
  }),

  'syntax_check': async () => new Promise((resolve) => {
    execFile('npm', ['run', 'check'], { timeout: 120000, shell: true, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) =>
      resolve({ ok: !err, result: { pass: !err, output: String(stdout || '').slice(-2000) } }));
  }),

  'search_code': async ({ pattern = 'translate', dir = 'server' }) => new Promise((resolve) => {
    // grep متاح في Git Bash — لكنه غائب على Windows الخام، فيسقط الاختبار
    // search_code بصمت (0 نتائج). عند غياب الثنائية نسقط لمسح Node خالص
    // بنفس الشكل (matches + أسطر file:line:content) بدل كسر الأداة.
    const fallbackSearch = () => {
      try {
        const fs = require('fs');
        const path = require('path');
        const root = path.resolve(String(dir || 'server'));
        let re = null;
        try { re = new RegExp(String(pattern)); } catch { re = null; }
        const lines = [];
        const walk = (d) => {
          let entries = [];
          try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (lines.length >= 200) return;
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage') continue;
              walk(p);
            } else if (/\.(js|mjs|json|md)$/.test(e.name)) {
              let content = '';
              try { content = fs.readFileSync(p, 'utf8'); } catch { continue; }
              const rel = path.relative(process.cwd(), p) || p;
              content.split('\n').forEach((text, i) => {
                if (lines.length >= 200) return;
                const hit = re ? re.test(text) : text.includes(String(pattern));
                if (hit) lines.push(`${rel}:${i + 1}:${text.slice(0, 300)}`);
              });
            }
          }
        };
        walk(root);
        resolve({ ok: true, result: { matches: lines.length, lines } });
      } catch (e) {
        resolve({ ok: true, result: { matches: 0, lines: [], note: 'fallback failed: ' + (e && e.message) } });
      }
    };
    execFile('grep', ['-rn', '--include=*.{js,mjs,json,md}', pattern, dir], { timeout: 60000, shell: true, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      // grep الغائب على Windows يخرج بخطأ وstdout فارغ — تمامًا كبصمة «لا نتائج».
      // نميّزهما بنص الخطأ: «not recognized» تعني الثنائية مفقودة → fallback.
      if (!String(stdout || '').trim() && /not recognized|not found|ENOENT|command not found/i.test(String((err && err.message) || '') + String(stderr || ''))) {
        return fallbackSearch();
      }
      const lines = String(stdout || '').split('\n').filter(Boolean).slice(0, 200);
      resolve({ ok: true, result: { matches: lines.length, lines } });
    });
  }),

  // ── أدوات الترجمة (تشغّل محرك المشروع الحقيقي) ──
  'provider_health': async () => {
    const { getProviders } = require('../../server/translate');
    return { ok: true, result: getProviders().map((p) => ({ id: p.id, label: p.label, available: !!p.isAvailable?.() })) };
  },

  'detect_language': async ({ text = 'Hello world, this is a test.' }) => {
    const { detectLanguage } = require('../../server/translate');
    return { ok: true, result: { lang: await detectLanguage(String(text || '').slice(0, 500)) } };
  },

  'translate_text': async ({ text = 'Hello world, this is a translation test.', target = 'ar', source }) => {
    const { translateText } = require('../../server/translate');
    return maybeSpill('translation', await translateText(String(text || ''), target, source));
  },

  'extract_url': async ({ url = 'https://example.com' }) => {
    const { fetchArticleContent } = require('../../server/fetchContent');
    return maybeSpill('extraction', await fetchArticleContent(String(url || '')));
  },

  // ── أدوات البيانات ──
  'db_summary': async () => {
    const { getSummary } = require('../../server/stats');
    return { ok: true, result: await getSummary() };
  },

  'cache_stats': async () => {
    const { stats } = require('../../server/cache');
    return { ok: true, result: typeof stats === 'function' ? stats() : { note: 'cache stats غير متاحة' } };
  },

  // ── LLM (اختياري — يعمل فقط عند توفر مفتاح وحصة) ──
  // llmOptional: فشل LLM (حصة 429 أو مفتاح مفقود) لا يُفشل الوكيل —
  // عقد العمل الهجين: الأدوات المحلية هي الأساس، وLLM طبقة تحسين اختيارية.
  'llm_call': async ({ prompt = 'اختصر حالة نظام الترجمة في سطر واحد.' }) => {
    const { available, call } = require('./llm');
    if (!available()) return { ok: false, llmOptional: true, result: { skipped: 'LLM غير مفعّل — أضف GEMINI_API_KEY في .env' } };
    try {
      return maybeSpill('llm-response', await call(String(prompt || ''), undefined));
    } catch (e) {
      return { ok: false, llmOptional: true, result: { skipped: `LLM غير متاح الآن: ${e.message.slice(0, 120)}` } };
    }
  },
};

function hasTool(name) { return Object.prototype.hasOwnProperty.call(TOOLS, name); }

async function runTool(name, args = {}, ctx = {}) {
  const fn = TOOLS[name];
  if (!fn) return { ok: false, result: { error: `أداة غير معروفة: ${name}` } };
  try {
    return await fn(args, ctx);
  } catch (e) {
    return { ok: false, result: { error: e.message } };
  }
}

module.exports = { TOOLS, hasTool, runTool, saveArtifact };
