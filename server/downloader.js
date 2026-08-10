// server/downloader.js — تنزيل من يوتيوب عبر yt-dlp.exe مباشرة (execFile، بدون غلاف نصي)
// لماذا: غلاف youtube-dl-exec يمرر الأوامر عبر shell (concatenation) فيكسر الصيغ
// (مثل best[height<=720]) ويعلّق أحيانًا — الثنائي المباشر يعمل موثوقًا (تحقق: 1 ثانية).
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

// ===== تحديد ثنائي yt-dlp حسب البيئة =====
// كان المسار ثابتًا على yt-dlp.exe، فتفشل صورة Docker على لينكس بـ ENOENT في كل
// مسار يوتيوب. الترتيب هنا: متغير بيئة صريح ← ثنائي محلي داخل node_modules
// (باسم المنصة الصحيح) ← الاعتماد على PATH (صورة Docker تثبّته عبر pip3).
// يُحسب كسولًا ويُخزَّن، حتى يعمل تغيير YTDLP_PATH بعد التحميل وتبقى الوحدة
// قابلة للتحميل حتى لو غاب الثنائي.
let cachedBin = null;

function resolveYtDlp() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const localName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const local = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', localName);
  if (fs.existsSync(local)) return local;
  return 'yt-dlp'; // من PATH
}

function ytDlpBin() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH; // يتقدّم دائمًا على المخزَّن
  if (!cachedBin) cachedBin = resolveYtDlp();
  return cachedBin;
}

/**
 * تنزيل من يوتيوب إلى مسار مطلق (Windows: لا /tmp/x — استخدم path.join(os.tmpdir(),'aralink',...))
 * @param {string} url رابط الفيديو
 * @param {string} outPath المسار المطلق للإخراج
 * @param {string[]} extraArgs وسائط إضافية (صيغة...)
 * @param {number} timeoutMs مهلة بالمللي ثانية
 */
async function ytDownload(url, outPath, extraArgs = [], timeoutMs = 180000) {
  const args = ['--no-warnings', '--no-playlist', '--no-cache-dir', '-o', outPath, ...extraArgs, url];
  try {
    await execFileAsync(ytDlpBin(), args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    // ثنائي مفقود: رسالة صريحة بدل ENOENT غامض من execFile
    if (e && e.code === 'ENOENT') {
      const err = new Error(
        `لم يُعثر على yt-dlp (جُرِّب: ${ytDlpBin()}). ثبّته أو اضبط YTDLP_PATH.`
      );
      err.code = 'ytdlp-missing';
      throw err;
    }
    throw e;
  }
}

/** تنزيل الصوت فقط (bestaudio — أصغر وأسرع) */
async function downloadAudio(url, outPath, timeoutMs = 180000) {
  await ytDownload(url, outPath, ['-f', 'bestaudio/best'], timeoutMs);
}

/** تنزيل فيديو بملف تقدمي واحد (22=720p، 18=360p) — بدون حاجة لدمج ffmpeg */
async function downloadVideo(url, outPath, timeoutMs = 300000) {
  await ytDownload(url, outPath, ['-f', '22/18/best'], timeoutMs);
}

module.exports = { ytDownload, downloadAudio, downloadVideo, resolveYtDlp, ytDlpBin };
