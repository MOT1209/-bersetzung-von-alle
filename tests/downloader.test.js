// tests/downloader.test.js — البند B1: تحديد ثنائي yt-dlp حسب المنصة والبيئة
//
// الخلل الأصلي: مسار ثابت على node_modules/.../yt-dlp.exe. صورة Docker على
// لينكس تفشل بـ ENOENT في كل مسار يوتيوب، بينما Dockerfile يثبّت yt-dlp عبر
// pip3 في مكان مختلف — تثبيتان متنافسان ولا واحد موصول بالكود.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { resolveYtDlp, ytDlpBin, ytDownload } = require('../server/downloader');

const savedPath = process.env.YTDLP_PATH;
afterEach(() => {
  if (savedPath === undefined) delete process.env.YTDLP_PATH;
  else process.env.YTDLP_PATH = savedPath;
});

// ===== أولوية YTDLP_PATH =====

test('YTDLP_PATH يتقدّم على كل شيء', () => {
  process.env.YTDLP_PATH = '/opt/custom/yt-dlp';
  assert.equal(resolveYtDlp(), '/opt/custom/yt-dlp');
  assert.equal(ytDlpBin(), '/opt/custom/yt-dlp');
});

test('تغيير YTDLP_PATH بعد التحميل يُحترم (لا تخزين يتجاوزه)', () => {
  process.env.YTDLP_PATH = '/first/yt-dlp';
  assert.equal(ytDlpBin(), '/first/yt-dlp');
  process.env.YTDLP_PATH = '/second/yt-dlp';
  assert.equal(ytDlpBin(), '/second/yt-dlp', 'قيمة مخزَّنة تجاوزت متغير البيئة');
});

// ===== الرجوع إلى الثنائي المحلي أو PATH =====

test('بلا YTDLP_PATH: إمّا ثنائي محلي موجود فعلًا وإمّا الاسم المجرّد من PATH', () => {
  delete process.env.YTDLP_PATH;
  const got = resolveYtDlp();

  if (got === 'yt-dlp') return; // لا ثنائي محلي — يعتمد على PATH (سلوك Docker)

  // وإلا فلا بد أن يكون مسارًا موجودًا فعلًا داخل node_modules
  assert.ok(fs.existsSync(got), `أعاد مسارًا غير موجود: ${got}`);
  assert.ok(got.includes('youtube-dl-exec'), got);
});

test('اسم الثنائي المحلي يطابق المنصة (لا .exe على لينكس)', () => {
  delete process.env.YTDLP_PATH;
  const got = resolveYtDlp();
  if (got === 'yt-dlp') return;

  const base = path.basename(got);
  const expected = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  assert.equal(base, expected, `اسم غير مناسب للمنصة ${process.platform}`);
});

test('لا يُرجع أبدًا .exe على منصة غير ويندوز', () => {
  delete process.env.YTDLP_PATH;
  if (process.platform === 'win32') return;
  assert.ok(!resolveYtDlp().endsWith('.exe'), 'مسار .exe على منصة غير ويندوز');
});

// ===== فشل واضح عند غياب الثنائي =====

test('ثنائي مفقود → خطأ ytdlp-missing صريح لا ENOENT غامض', async () => {
  process.env.YTDLP_PATH = path.join(__dirname, 'لا-يوجد-ملف-كهذا-yt-dlp');
  await assert.rejects(
    () => ytDownload('https://example.com/v', '/tmp/out.mp4', [], 5000),
    (e) => {
      assert.equal(e.code, 'ytdlp-missing');
      assert.match(e.message, /YTDLP_PATH/);
      return true;
    }
  );
});
