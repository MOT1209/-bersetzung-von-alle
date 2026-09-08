// server/dubbing/audio-mixer.js — مزج مقاطع TTS على timeline حقيقية عبر ffmpeg
// كل مقطع يوضع عند طابعه الزمني بـ adelay ثم تُجمع كلها بـ amix.
// الأوضاع: full-dub (استبدال) | voice-over (خلفية منخفضة -12dB) | mix (مزج متساوٍ).
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { timedExec } = require('./ffmpeg-cost');

async function mixSegments(clips, outPath, { mode = 'full-dub', totalSec = 0, originalAudio = null } = {}) {
  // clips: [{ file, start }]
  if (!clips.length) throw Object.assign(new Error('no-clips'), { code: 'dub-failed' });
  const end = Math.max(totalSec, ...clips.map((c) => c.start + 8));
  const args = ['-y'];
  const inputs = [];
  clips.forEach((c) => { args.push('-i', c.file); inputs.push(c); });
  let audioIdx = clips.length;
  if ((mode === 'voice-over' || mode === 'mix') && originalAudio) {
    args.push('-i', originalAudio);
    audioIdx = clips.length;
  }
  // بناء مرشح: كل مدخل → adelay → ثم amix
  const labels = inputs.map((c, i) => {
    const ms = Math.max(0, Math.round(c.start * 1000));
    return `[${i}:a]adelay=${ms}|${ms},apad=whole_dur=${end.toFixed(2)}[a${i}]`;
  });
  const mixInputs = inputs.map((_, i) => `[a${i}]`).join('');
  const n = inputs.length;
  let filter;
  if ((mode === 'voice-over' || mode === 'mix') && originalAudio) {
    const bgVol = mode === 'voice-over' ? 'volume=0.25' : 'volume=0.6';
    filter = `${labels.join(';')};[${audioIdx}:a]${bgVol},apad=whole_dur=${end.toFixed(2)}[bg];${mixInputs}[bg]amix=inputs=${n + 1}:normalize=0[aout]`;
  } else {
    filter = n === 1
      ? `${labels.join(';')};[a0]anull[aout]`
      : `${labels.join(';')};${mixInputs}amix=inputs=${n}:normalize=0[aout]`;
  }
  args.push('-filter_complex', filter, '-map', '[aout]', '-t', end.toFixed(2), '-c:a', 'libmp3lame', '-b:a', '128k', outPath);
  await timedExec(execFileAsync, 'ffmpeg', args, { timeout: 180000 });
  return outPath;
}

module.exports = { mixSegments };
