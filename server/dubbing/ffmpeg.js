// server/dubbing/ffmpeg.js — غلاف موحّد لنداءات ffmpeg/ffprobe (CURRENT_STATE.md §21)
//
// المشكلة التي يحلّها: النداءات كانت `execFileAsync('ffmpeg', …)` عارية في ثلاثة
// ملفات. وNode يضع **رقم الخروج** في `err.code` عند فشل غير صفري، والمُمسِك
// الوحيد في dubbing-pipeline.js يفعل:
//     const code = (e && e.code) || 'server-error';
// فيصير رمز الخطأ المعروض للعميل `1` — وهي العلّة نفسها التي يوثّق
// downloader.js:53-54 إصلاحها سابقًا ({"error":1}). وعند المهلة يكون code فارغًا
// فيسقط إلى 'server-error' وتضيع معلومة أن السبب مهلة لا فشل حقيقي.
//
// هنا تتحوّل كل حالة إلى رمز نصّي ثابت، على نمط downloader.js تمامًا.
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function codeError(code, message, cause) {
  const e = new Error(message || code);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

/**
 * ينفّذ ffmpeg/ffprobe ويحوّل أي فشل إلى رمز نصّي ثابت.
 * @param {string} bin 'ffmpeg' أو 'ffprobe'
 * @param {string[]} args الوسائط (مصفوفة — لا shell، فلا حقن)
 * @param {{timeout?: number, maxBuffer?: number}} opts
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function run(bin, args, opts = {}) {
  try {
    return await execFileAsync(bin, args, { maxBuffer: 8 * 1024 * 1024, ...opts });
  } catch (e) {
    // الثنائي غير مثبَّت — رسالة صريحة بدل ENOENT غامض
    if (e && e.code === 'ENOENT') {
      throw codeError('ffmpeg-missing', `${bin} غير مثبَّت على الخادم`, e);
    }
    // انتهت المهلة: execFile يقتل العملية ويضع killed=true (وcode غالبًا null)
    if (e && (e.killed || e.signal === 'SIGTERM')) {
      throw codeError('ffmpeg-timeout', `${bin} تجاوز المهلة`, e);
    }
    const stderr = String((e && e.stderr) || '').slice(-300);
    throw codeError('ffmpeg-failed', `${bin} فشل: ${stderr}`, e);
  }
}

const ffmpeg = (args, opts) => run('ffmpeg', args, opts);
const ffprobe = (args, opts) => run('ffprobe', args, opts);

module.exports = { run, ffmpeg, ffprobe };
