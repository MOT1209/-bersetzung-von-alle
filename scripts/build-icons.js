#!/usr/bin/env node
/**
 * build-icons.js — توليد كل أيقونات أرا لينك PNG من الملفات المصدر SVG.
 *
 * لا يعتمد على أي حزم خارجية: يكتب SVG مصغّرًا في مجلد مؤقت ويستدعي Chrome
 * headless لتحويله إلى PNG، ثم يتحقق من المخرجات (أبعاد صحيحة + بكسلات
 * ملونة في مواضع الحبر المتوقعة، بما فيها فجوة النسج بين الساق والحلقة —
 * درس تحويل SVG إلى PNG الفارغة في كروم).
 *
 * الاستخدام:  node scripts/build-icons.js
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');

// (ملف SVG المصدر، البنية: [x, y] بنِسَب مئوية من عرض الصورة، اللون المتوقع RGB)
const JOBS = [
  {
    src: 'public/icons/icon.svg',
    out: [
      { file: 'public/icons/icon-512.png', size: 512, checks: [
        { x: 0.15, y: 0.15, color: [28, 26, 23] },     // داخل اللوح قرب الزاوية — يكشف أي هامش viewport
        { x: 0.5, y: 0.34, color: [251, 250, 248] },   // الساق داخل فتحة الحلقة (فوقها القوس عند 0.25)
        { x: 0.23, y: 0.5, color: [143, 171, 224] },   // الحلقة يسارًا
        { x: 0.5, y: 0.94, color: [28, 26, 23] },      // فجوة النسج — لا حبر تحت الساق
      ] },
      { file: 'public/icons/icon-192.png', size: 192, checks: [
        { x: 0.5, y: 0.34, color: [251, 250, 248] },
        { x: 0.23, y: 0.5, color: [143, 171, 224] },
      ] },
    ],
  },
  {
    src: 'public/icons/icon-maskable.svg',
    out: [
      { file: 'public/icons/maskable-512.png', size: 512, checks: [
        { x: 0.5, y: 0.36, color: [251, 250, 248] },   // الساق — أسفل القوس العلوي المُصغّر (0.85)
        { x: 0.28, y: 0.5, color: [143, 171, 224] },
      ] },
    ],
  },
  {
    src: 'public/icons/favicon.svg',
    out: [
      { file: 'public/icons/favicon-16.png', size: 16, checks: [] },
      { file: 'public/icons/favicon-32.png', size: 32, checks: [] },
      { file: 'public/icons/favicon-48.png', size: 48, checks: [] },
    ],
  },
  {
    src: 'extension/icons/icon.svg',
    out: [
      { file: 'extension/icons/icon16.png', size: 16, checks: [
        { x: 0.5, y: 0.4, color: [251, 250, 248] },   // الساق أسفل القوس — أعلاه ضيّق جدًا على هذا المقياس
      ] },
      { file: 'extension/icons/icon48.png', size: 48, checks: [
        { x: 0.5, y: 0.4, color: [251, 250, 248] },
        { x: 0.23, y: 0.5, color: [143, 171, 224] },
        { x: 0.5, y: 0.87, color: [28, 26, 23] },      // فجوة 90° — لوح بلا حبر
      ] },
      { file: 'extension/icons/icon128.png', size: 128, checks: [
        { x: 0.5, y: 0.4, color: [251, 250, 248] },
        { x: 0.23, y: 0.5, color: [143, 171, 224] },
        { x: 0.5, y: 0.87, color: [28, 26, 23] },
      ] },
    ],
  },
  {
    src: 'public/icons/favicon.svg',
    out: [
      { file: 'public/icons/favicon-16.png', size: 16, checks: [] },
      { file: 'public/icons/favicon-32.png', size: 32, checks: [] },
      { file: 'public/icons/favicon-48.png', size: 48, checks: [] },
    ],
  },
];

function findChrome() {
  const candidates = process.env.CHROME_PATH
    ? [process.env.CHROME_PATH]
    : process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe' });
      return c;
    } catch { /* try next */ }
  }
  console.error('✗ لم أجد Chrome/Edge — مرّر المسار عبر CHROME_PATH');
  process.exit(1);
}

/** PNG فكّ ضغطه (IDAT مجمّعة) → صفوف بكسلات RGB مع إزالة مرشّح كل صف */
function decodePNG(buf) {
  const b = buf;
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('ليس PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`صيغة غير مدعومة: bitDepth=${bitDepth} colorType=${colorType} (مطلوب 8/RGB أو 8/RGBA)`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const bb = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val = row[x];
      switch (filter) {
        case 1: val = (val + a) & 0xff; break;
        case 2: val = (val + bb) & 0xff; break;
        case 3: val = (val + ((a + bb) >> 1)) & 0xff; break;
        case 4: {
          const p = a + bb - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
          val = (val + pred) & 0xff;
          break;
        }
      }
      cur[x] = val;
    }
  }
  return { width, height, bpp, data: out };
}

function renderOne(chrome, svg, size, tmpDir) {
  // SVG بعرض/ارتفاع مطلقين + --screenshot: كروم يرسم مستند SVG 1:1 بحجم النافذة،
  // بلا JavaScript ولا dump-dom (نهج data-URL/dump-dom يعلّق في كروم على ويندوز).
  // user-data-dir مستقل لكل استدعاء: بدونه يعلّق الإطلاق على قفل الملف الشخصي
  // singleton لو بقيت عملية كروم سابقة حيّة.
  const sized = svg.replace(/width="[^"]*"\s+height="[^"]*"/, `width="${size}" height="${size}"`);
  const src = path.join(tmpDir, `icon-${size}.svg`);
  fs.writeFileSync(src, sized);
  const tmp = path.join(tmpDir, `icon-${size}.png`);
  const udd = path.join(tmpDir, `profile-${size}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(udd, { recursive: true });
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--disable-background-networking', '--disable-sync', '--mute-audio',
    '--force-color-profile=srgb', '--default-background-color=00000000',
    `--user-data-dir=${udd}`,
    `--screenshot=${tmp}`, `--window-size=${size},${size}`, `file:///${src.replace(/\\/g, '/')}`,
  ], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
  if (!fs.existsSync(tmp)) throw new Error(`كروم لم يكتب ${tmp}`);
  return tmp;
}

/** كروم headless على ويندوز يتعلّق أحيانًا عند الإقلاع — إعادة المحاولة تنجح دائمًا تقريبًا */
function renderOneRetry(chrome, svg, size, tmpDir) {
  for (let attempt = 1; ; attempt++) {
    try {
      return renderOne(chrome, svg, size, tmpDir);
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log(`  ⚠ محاولة ${attempt} لتوليد ${size}px تعلّقت (${err.code || 'timeout'}) — إعادة…`);
    }
  }
}

let failures = 0;
const chrome = findChrome();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-icons-'));
try {
  for (const job of JOBS) {
    const svg = fs.readFileSync(path.join(ROOT, job.src), 'utf8');
    for (const o of job.out) {
      const tmpFile = renderOneRetry(chrome, svg, o.size, tmpDir);
      const png = fs.readFileSync(tmpFile);
      const img = decodePNG(png);
      const dest = path.join(ROOT, o.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(tmpFile, dest);

      const problems = [];
      if (img.width !== o.size || img.height !== o.size) {
        problems.push(`الأبعاد ${img.width}×${img.height} بدل ${o.size}×${o.size}`);
      }
      for (const c of o.checks) {
      const px = (Math.round(c.y * (img.height - 1)) * img.width + Math.round(c.x * (img.width - 1))) * img.bpp;
      const got = [img.data[px], img.data[px + 1], img.data[px + 2]];
        const want = c.color;
        const near = got.every((v, i) => Math.abs(v - want[i]) <= 26);
        const label = near ? '✓' : '✗';
        if (!near) problems.push(`بكسل (${c.x}, ${c.y}) = rgb(${got}) بدل rgb(${want})`);
        console.log(`  ${label} ${path.relative(ROOT, dest)} (${c.x},${c.y}) rgb(${got.join(',')})`);
      }
      if (problems.length) {
        failures++;
        console.error(`✗ ${path.relative(ROOT, dest)}: ${problems.join(' | ')}`);
      } else {
        console.log(`✓ ${path.relative(ROOT, dest)} — ${o.size}×${o.size}`);
      }
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures) {
  console.error(`\nفشل ${failures} ملف`);
  process.exit(1);
}
console.log('\nكل الأيقونات تولّدت وتحققت ✅');
