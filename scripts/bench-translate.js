#!/usr/bin/env node
// scripts/bench-translate.js — قياس جودة الترجمة (WER) لكل مزوّد ولغة
//
// الغرض: تحويل «أي مزوّد أفضل؟» من انطباع إلى رقم. يترجم مجموعة جُمل مرجعية
// عبر كل مزوّد متاح، يقارن الناتج بالترجمة المرجعية، ويكتب:
//   cache/quality-report.json   → تقرأه لوحة التحكم عبر GET /api/stats/quality
//
// الاستعمال:
//   node scripts/bench-translate.js                       # كل المزوّدين المتاحين
//   node scripts/bench-translate.js --provider google     # مزوّد واحد
//   node scripts/bench-translate.js --lang ar,fr          # لغات محددة
//   node scripts/bench-translate.js --delay 500           # مهلة بين الطلبات (مللي ث)
//   node scripts/bench-translate.js --out report.json     # مسار إخراج مخصّص
//
// ⚠️ يستهلك حصص الترجمة المجانية — شغّله يدويًا لا في CI.

const path = require('path');
const { getProviders, getProvider } = require('../server/translate');
const { runBenchmark, saveReport, loadRefset, REPORT_FILE } = require('../server/quality');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const langs = args.lang ? args.lang.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const delayMs = args.delay ? Number(args.delay) : 300;
  const outFile = args.out ? path.resolve(args.out) : REPORT_FILE;

  let providers;
  if (args.provider) {
    const p = getProvider(args.provider);
    if (!p) { console.error(`مزوّد غير معروف: ${args.provider}`); process.exit(1); }
    providers = [p];
  } else {
    providers = getProviders().filter((p) => p.isAvailable());
  }

  const refset = loadRefset();
  console.log(`▶ القياس: ${providers.length} مزوّد × ${refset.length} جملة${langs ? ` × [${langs.join(', ')}]` : ''} — مهلة ${delayMs}ms`);
  console.log(`  المزوّدون: ${providers.map((p) => p.id).join(', ')}\n`);

  const t0 = Date.now();
  const report = await runBenchmark({ providers, refset, langs, delayMs });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // جدول موجز
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('المزوّد', 14), pad('درجة', 8), pad('WER', 8), pad('نجاح', 8), 'حسب اللغة');
  console.log('-'.repeat(60));
  for (const s of report.summary) {
    const perLang = Object.entries(s.perLang).map(([l, v]) => `${l}:${v}`).join(' ');
    console.log(
      pad(s.provider, 14),
      pad(s.avgScore ?? '—', 8),
      pad(s.avgWer ?? '—', 8),
      pad(`${s.succeeded}/${s.samples}`, 8),
      perLang,
    );
  }

  saveReport(report, outFile);
  console.log(`\n✓ التقرير: ${outFile}  (${secs}s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
