// server/downloader.js — تنزيل من يوتيوب عبر yt-dlp.exe مباشرة (execFile، بدون غلاف نصي)
// لماذا: غلاف youtube-dl-exec يمرر الأوامر عبر shell (concatenation) فيكسر الصيغ
// (مثل best[height<=720]) ويعلّق أحيانًا — الثنائي المباشر يعمل موثوقًا (تحقق: 1 ثانية).
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);
const YTDLP_BIN = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');

/**
 * تنزيل من يوتيوب إلى مسار مطلق (Windows: لا /tmp/x — استخدم path.join(os.tmpdir(),'aralink',...))
 * @param {string} url رابط الفيديو
 * @param {string} outPath المسار المطلق للإخراج
 * @param {string[]} extraArgs وسائط إضافية (صيغة...)
 * @param {number} timeoutMs مهلة بالمللي ثانية
 */
async function ytDownload(url, outPath, extraArgs = [], timeoutMs = 180000) {
  const args = ['--no-warnings', '--no-playlist', '--no-cache-dir', '-o', outPath, ...extraArgs, url];
  await execFileAsync(YTDLP_BIN, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
}

/** تنزيل الصوت فقط (bestaudio — أصغر وأسرع) */
async function downloadAudio(url, outPath, timeoutMs = 180000) {
  await ytDownload(url, outPath, ['-f', 'bestaudio/best'], timeoutMs);
}

/** تنزيل فيديو بملف تقدمي واحد (22=720p، 18=360p) — بدون حاجة لدمج ffmpeg */
async function downloadVideo(url, outPath, timeoutMs = 300000) {
  await ytDownload(url, outPath, ['-f', '22/18/best'], timeoutMs);
}

module.exports = { ytDownload, downloadAudio, downloadVideo, YTDLP_BIN };
