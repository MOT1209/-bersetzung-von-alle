// server/dubbing/timing-engine.js — محرك التوقيت: مطابقة مدة TTS مع المقطع الأصلي
// لا نقطع الكلمات الأخيرة عشوائيًا: نحسب عامل السرعة ثم نستخدم atempo في ffmpeg.
const { ffmpeg, ffprobe } = require('./ffmpeg');

async function probeDuration(filePath) {
  try {
    const { stdout } = await ffprobe(
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 15000 });
    const d = Number(String(stdout).trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}

// سلسلة atempo لعامل ما بين 0.5 و 2.0 (atempo يقبل 0.5–2.0 لكل مرشح)
function atempoChain(rate) {
  const r = Math.min(2.0, Math.max(0.5, rate));
  if (Math.abs(r - 1) < 0.03) return null;
  if (r <= 2.0 && r >= 0.5) return `atempo=${r.toFixed(3)}`;
  return null;
}

// يقرر الإجراء: ok | stretch (تسريع/إبطاء محدود) | repad (إعادة توليد مختصرة لاحقًا)
function planTiming(originalSec, ttsSec) {
  const o = Math.max(0.5, Number(originalSec) || 0);
  const t = Math.max(0.1, Number(ttsSec) || 0);
  const ratio = t / o;
  if (ratio <= 1.15) return { action: 'ok', rate: 1, ratio };
  if (ratio <= 1.8) return { action: 'stretch', rate: ratio, ratio }; // نسرّع الصوت المولّد
  return { action: 'overflow', rate: ratio, ratio }; // أطول بكثير — يحتاج إعادة صياغة
}

async function fitAudioToSlot(inPath, outPath, originalSec) {
  const ttsSec = await probeDuration(inPath);
  const plan = planTiming(originalSec, ttsSec);
  const filter = plan.action === 'stretch' ? atempoChain(plan.rate) : null;
  if (!filter) {
    // بدون تعديل: ننسخ (أو نقصّ الزائد الطفيف فقط عند النهاية مع تلاشٍ)
    if (plan.action === 'overflow') {
      await ffmpeg(['-y', '-i', inPath, '-t', String(originalSec.toFixed(2)),
        '-af', 'afade=t=out:st=0:d=0.3', '-c:a', 'libmp3lame', '-b:a', '96k', outPath], { timeout: 30000 });
    } else {
      await ffmpeg(['-y', '-i', inPath, '-c:a', 'libmp3lame', '-b:a', '96k', outPath], { timeout: 30000 });
    }
    return { ...plan, ttsSec };
  }
  await ffmpeg(['-y', '-i', inPath, '-filter:a', filter,
    '-c:a', 'libmp3lame', '-b:a', '96k', outPath], { timeout: 30000 });
  return { ...plan, ttsSec };
}

module.exports = { probeDuration, planTiming, fitAudioToSlot, atempoChain };
