#!/usr/bin/env node
// scripts/perf-translate.js — قياس أداء محرك الترجمة **بلا شبكة وبلا حصص**
//
// ⚠️ ليست بديلًا عن scripts/bench-translate.js (قياس الجودة WER عبر المزوّدين
// الحقيقيين — يستهلك الحصص ولا يُشغَّل في CI). هذا السكريبت يقيس الأداء المحلي:
//   1) سرعة تقسيم النص (chunkText) قصير/طويل
//   2) كلفة اكتشاف الأسطر غير القابلة للترجمة (isUntranslatable)
//   3) الكاش: إصابة (hit) مقابل إخفاق (miss) عبر translateText
//   4) حمل سلسلة الاحتياط (fallback chain) عبر مسارها الكامل
//   5) منحنى الذاكرة على 1000 ترجمة
//   6) إنتاجية الترجمات المتزامنة (concurrency)
//
// النتائج تُكتب في cache/perf-report.json (وحدة قياس: ms لكل 1000 حرف).
// التشغيل: npm run perf:translate
const fs = require('fs');
const path = require('path');

// عزل الكاش عن ملف الإنتاج قبل أي require للوحدات التي تقرأ env
const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aralink-perf-'));
process.env.CACHE_FILE = path.join(tmpDir, 'perf-cache.json');
process.env.DB_FILE = path.join(tmpDir, 'perf.db');
process.env.STATS_DRIVER = 'json'; // لا داعي لقاعدة بيانات في القياس
process.env.STATS_LOG = path.join(tmpDir, 'stats-log.json');
process.env.USAGE_FILE = path.join(tmpDir, 'usage.json');
process.env.COST_FILE = path.join(tmpDir, 'cost.json');

const { translateText, chunkText, isUntranslatable, registerProvider } = require('../server/translate');
const cache = require('../server/cache');

// ===== مزوّد مزيّف سريع: يحاكي زمن شبكة واقعي بلا شبكة =====
const SIMULATED_LATENCY_MS = Number(process.env.PERF_FAKE_LATENCY_MS) || 40;
let fakeCalls = 0;
registerProvider({
  id: 'perf-fake',
  label: 'Perf Fake (offline)',
  requiresKey: false,
  isAvailable: () => true,
  translate: async (text) => {
    fakeCalls++;
    // تأخير شبه واقعي: 40ms + تذبذب بسيط حسب الطول
    await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS + (text.length % 7)));
    // "ترجمة" معكوسة — تختلف عن الأصل دائمًا
    return `⟨${text.split('').reverse().join('')}⟩`;
  },
});

const OUT_FILE = path.join(__dirname, '..', 'cache', 'perf-report.json');
const kb = (n) => (n / 1024).toFixed(1);

function makeParagraphs(count, wordsPerPara = 60) {
  const word = 'كلمة';
  const paras = [];
  for (let i = 0; i < count; i++) {
    paras.push(Array.from({ length: wordsPerPara }, (_, j) => `${word}${i}_${j}`).join(' '));
  }
  return paras.join('\n\n');
}

async function measure(name, fn, iterations = 1) {
  fn(); // تدفئة واحدة خارج القياس (JIT + تحميل الوحدات)
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / iterations;
  return { name, ms: Number(ms.toFixed(3)) };
}

function heapUsedMB() {
  global.gc && global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), simulatedLatencyMs: SIMULATED_LATENCY_MS, sections: {} };

  // ===== 1) تقسيم النص =====
  const short = makeParagraphs(2, 40);            // ~700 حرف
  const long = makeParagraphs(40, 120);           // ~90,000 حرف
  const longChars = long.length;
  console.log('▶ 1) chunkText — قصير vs طويل');
  report.sections.chunking = {
    shortChars: short.length,
    short: await measure('short', () => chunkText(short), 50),
    longChars,
    long: await measure('long', () => chunkText(long), 50),
  };
  report.sections.chunking.short.per1000Chars = Number(((report.sections.chunking.short.ms / short.length) * 1000).toFixed(4));
  report.sections.chunking.long.per1000Chars = Number(((report.sections.chunking.long.ms / longChars) * 1000).toFixed(4));
  console.log(`  قصير (${short.length} حرف): ${report.sections.chunking.short.ms}ms — طويل (${longChars} حرف): ${report.sections.chunking.long.ms}ms`);

  // ===== 2) isUntranslatable =====
  const lines = long.split('\n\n').slice(0, 200).map((p) => p.split(' ')[0]);
  lines.push('https://example.com/some/path', 'const x = 42;', '/usr/bin/ffmpeg');
  console.log('▶ 2) isUntranslatable — 203 سطرًا');
  report.sections.untranslatable = await measure('203 lines', () => { for (const l of lines) isUntranslatable(l); }, 100);
  console.log(`  ${report.sections.untranslatable.ms}ms لكل دورة كاملة`);

  // ===== 3) الكاش: miss ثم hit =====
  console.log('▶ 3) الكاش — إخفاق ثم إصابة');
  const cacheText = makeParagraphs(3, 50); // ~1,100 حرف → قطعة واحدة
  // إخفاق: مسار translateText الكامل (قطعة واحدة + مزوّد مزيّف)
  const miss = await measure('cache miss', () => translateText(cacheText, 'ar', 'en', { provider: 'perf-fake' }), 5);
  // إصابة: نفس النص واللغات — يجب أن يعود من الكاش بلا استدعاء مزوّد
  const callsBefore = fakeCalls;
  const hit = await measure('cache hit', () => translateText(cacheText, 'ar', 'en', { provider: 'perf-fake' }), 5);
  const hitUsedProvider = fakeCalls > callsBefore;
  report.sections.cache = {
    missMs: miss.ms,
    hitMs: hit.ms,
    speedup: Number((miss.ms / Math.max(hit.ms, 0.0001)).toFixed(1)),
    hitServedFromCache: !hitUsedProvider,
  };
  console.log(`  miss: ${miss.ms}ms — hit: ${hit.ms}ms (تسريع ×${report.sections.cache.speedup})${hitUsedProvider ? ' ⚠ الإصابة استدعت المزوّد!' : ''}`);

  // ===== 4) حمل سلسلة الاحتياط =====
  console.log('▶ 4) سلسلة الاحتياط (مزوّد فاشل ×5 → النجاح)');
  let failCalls = 0;
  registerProvider({
    id: 'perf-failing',
    label: 'Perf Failing',
    requiresKey: false,
    isAvailable: () => true,
    translate: async () => { failCalls++; throw new Error('boom'); },
  });
  const t0 = process.hrtime.bigint();
  // 'providers' (جمع) = سلسلة مرتبة تُجرَّب بالترتيب — الأول يفشل فينجح الثاني
  await translateText(short, 'ar', 'en', { providers: ['perf-failing', 'perf-fake'] });
  const chainMs = Number(process.hrtime.bigint() - t0) / 1e6;
  report.sections.fallbackChain = {
    failingProviders: 1,
    chainMs: Number(chainMs.toFixed(2)),
    note: 'فشل مزوّد واحد ثم نجاح perf-fake — الفارق عن المسار المباشر هو حمل السلسلة',
  };
  console.log(`  المسار الكامل: ${chainMs.toFixed(1)}ms`);

  // ===== 5) منحنى الذاكرة على 1000 ترجمة =====
  console.log('▶ 5) الذاكرة — 1000 ترجمة متتابعة');
  const memSamples = [{ i: 0, heapMB: Number(heapUsedMB().toFixed(1)) }];
  const t0Mem = Date.now();
  for (let i = 1; i <= 1000; i++) {
    await translateText(`${makeParagraphs(1, 20)} #${i}`, 'ar', 'en', { provider: 'perf-fake' });
    if (i % 250 === 0) memSamples.push({ i, heapMB: Number(heapUsedMB().toFixed(1)) });
  }
  report.sections.memory = {
    translations: 1000,
    samples: memSamples,
    totalMs: Date.now() - t0Mem,
    note: 'heapMB عبر global.gc() إن توفر (--expose-gc) وإلا بلا جمع قسري',
  };
  const growth = memSamples[memSamples.length - 1].heapMB - memSamples[0].heapMB;
  report.sections.memory.growthMB = Number(growth.toFixed(1));
  console.log(`  نمو الكومة: ${growth.toFixed(1)}MB على 1000 ترجمة (${memSamples.map((s) => `${s.i}→${s.heapMB}MB`).join(', ')})`);

  // ===== 6) إنتاجية متزامنة =====
  console.log('▶ 6) إنتاجية 20 ترجمة متزامنة');
  const t0c = process.hrtime.bigint();
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    translateText(`سطر متزامن ${i} — ${makeParagraphs(1, 15)}`, 'ar', 'en', { provider: 'perf-fake' })));
  const concMs = Number(process.hrtime.bigint() - t0c) / 1e6;
  report.sections.concurrency = { parallel: 20, totalMs: Number(concMs.toFixed(1)), perOpMs: Number((concMs / 20).toFixed(2)) };
  console.log(`  20 عملية متوازية في ${concMs.toFixed(0)}ms (${(concMs / 20).toFixed(1)}ms/عملية)`);

  // ===== حكم عام =====
  report.verdict = {
    chunkingFast: report.sections.chunking.long.per1000Chars < 5, // < 5ms لكل 1000 حرف
    cacheWorks: report.sections.cache.hitServedFromCache && report.sections.cache.speedup > 5,
    memoryStable: growth < 100, // أقل من 100MB نمو على 1000 ترجمة
  };
  report.verdict.summary = Object.values(report.verdict).every(Boolean)
    ? 'الأداء مقبول'
    : 'يحتاج تحسين — راجع الأقسام أعلاه';

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n✔ التقرير: ${OUT_FILE} — الحكم: ${report.verdict.summary}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
