#!/usr/bin/env node
// scripts/bench-stt.js — قياس دقة التفريغ الصوتي (WER) وزمنه
//
// الغرض (البند I1): تحويل اختيار النموذج من انطباع إلى رقم. بلا هذا القياس
// كل ما يُبنى فوق محرك التفريغ تخمين.
//
// الاستعمال:
//   node scripts/bench-stt.js                        # كل العيّنات
//   node scripts/bench-stt.js --lang ar              # لغة واحدة
//   node scripts/bench-stt.js --model Xenova/whisper-small
//   node scripts/bench-stt.js --engine transformers  # أو sherpa
//
// العيّنات: samples/stt/manifest.json
//   [{ "file": "ar-levantine-1.mp3", "lang": "ar", "reference": "النص الصحيح" }]
// المسارات نسبية إلى مجلد المانيفست. أضف عيّنة شامية واحدة على الأقل —
// اللهجات هي نقطة الضعف الحقيقية لا الفصحى.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'samples', 'stt', 'manifest.json');

// ===== وسائط سطر الأوامر =====
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

const args = parseArgs(process.argv.slice(2));

// يجب ضبط البيئة قبل تحميل config/audio (تُقرأ وقت الاستيراد)
if (args.model) process.env.WHISPER_MODEL = args.model;
if (args.engine) process.env.STT_ENGINE = args.engine;

const { wordErrorRate } = require(path.join(ROOT, 'server', 'wer'));

function fail(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) {
    fail(
      'لا يوجد ملف عيّنات: ' + MANIFEST + '\n' +
      'أنشئه بهذا الشكل:\n' +
      '  [\n' +
      '    { "file": "ar-levantine-1.mp3", "lang": "ar", "reference": "النص الصحيح كما نُطق" },\n' +
      '    { "file": "tr-1.mp3",           "lang": "tr", "reference": "..." }\n' +
      '  ]\n' +
      'وضع ملفات الصوت بجانبه. مصدر مقترح للعيّنات: Common Voice\n' +
      '  https://hf.co/datasets/fsicoli/common_voice_22_0  (يشمل ar/de/tr/en)'
    );
  }
  let items;
  try {
    items = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    fail('ملف العيّنات ليس JSON صالحًا: ' + e.message);
  }
  if (!Array.isArray(items) || !items.length) fail('ملف العيّنات فارغ.');
  return items;
}

function pct(x) {
  return (x * 100).toFixed(1) + '%';
}

// جدول بسيط بمحاذاة يسارية (الأرقام لاتينية فيقرأها الطرفان)
function printTable(rows, headers) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log('\n' + line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
}

(async () => {
  const items = loadManifest();
  const filtered = args.lang ? items.filter((s) => s.lang === args.lang) : items;
  if (!filtered.length) fail('لا عيّنات للّغة: ' + args.lang);

  const config = require(path.join(ROOT, 'server', 'config'));
  const { transcribeMediaFile } = require(path.join(ROOT, 'server', 'audio'));

  console.log('المحرك : ' + (config.STT_ENGINE || 'sherpa'));
  console.log('النموذج: ' + config.WHISPER_MODEL);
  console.log('العيّنات: ' + filtered.length);

  const rows = [];
  const byLang = new Map(); // lang → { werSum, n, secs, audio }

  for (const s of filtered) {
    const file = path.isAbsolute(s.file) ? s.file : path.join(path.dirname(MANIFEST), s.file);
    if (!fs.existsSync(file)) {
      rows.push([s.file, s.lang, 'ملف مفقود', '-', '-']);
      continue;
    }

    const t0 = Date.now();
    let text = '';
    let err = null;
    try {
      const { chunks } = await transcribeMediaFile(file, 'bench', s.lang);
      text = chunks.map((c) => c.text).join(' ');
    } catch (e) {
      err = (e && e.code) || (e && e.message) || 'فشل';
    }
    const secs = (Date.now() - t0) / 1000;

    if (err) {
      rows.push([s.file, s.lang, 'فشل: ' + err, '-', secs.toFixed(1)]);
      continue;
    }

    const r = wordErrorRate(s.reference, text, s.lang);
    rows.push([s.file, s.lang, pct(r.wer), `${r.distance}/${r.ref}`, secs.toFixed(1)]);

    const acc = byLang.get(s.lang) || { werSum: 0, n: 0, secs: 0 };
    acc.werSum += r.wer;
    acc.n += 1;
    acc.secs += secs;
    byLang.set(s.lang, acc);

    // النص الكامل يفيد عند قراءة الأخطاء بالعين لا بالرقم وحده
    if (args.verbose === 'true') {
      console.log('\n[' + s.file + ']');
      console.log('  المرجع : ' + s.reference);
      console.log('  الناتج : ' + text);
    }
  }

  printTable(rows, ['الملف', 'اللغة', 'WER', 'أخطاء/كلمات', 'ثوانٍ']);

  const summary = [...byLang.entries()].map(([lang, a]) => [
    lang,
    String(a.n),
    pct(a.werSum / a.n),
    (a.secs / a.n).toFixed(1),
  ]);
  if (summary.length) {
    printTable(summary, ['اللغة', 'عيّنات', 'متوسط WER', 'متوسط الثواني']);
  }

  console.log(
    '\nملاحظة: WER فوق 100% ممكن ويعني هلوسة/تكرارًا — سلوك معروف للنماذج\n' +
    'الصغيرة على العربية. قارن نموذجين بالأمر نفسه لتعرف أيّهما أفضل فعلًا.\n'
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
