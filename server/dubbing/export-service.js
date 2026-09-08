// server/dubbing/export-service.js — التصدير النهائي: mux فيديو + صوت + ترجمات
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { timedExec } = require('./ffmpeg-cost');

function srtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
}
function vttTime(s) { return srtTime(s).replace(',', '.'); }

function buildSrt(segments) {
  return segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.translated || s.text}\n`).join('\n');
}
function buildVtt(segments) {
  return 'WEBVTT\n\n' + segments.map((s) => `${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.translated || s.text}\n`).join('\n');
}

async function muxVideo(videoPath, dubbedAudioPath, outMp4) {
  // -shortest: الصوت المولّد يحدد النهاية؛ الفيديو الأصلي هو المرجع البصري
  await timedExec(execFileAsync, 'ffmpeg', ['-y', '-i', videoPath, '-i', dubbedAudioPath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-map', '0:v:0', '-map', '1:a:0',
    '-shortest', '-movflags', '+faststart', outMp4], { timeout: 300000 });
  return outMp4;
}

async function extractOriginalAudio(videoPath, outWav) {
  await execFileAsync('ffmpeg', ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '44100', outWav], { timeout: 120000 });
  return outWav;
}

module.exports = { buildSrt, buildVtt, muxVideo, extractOriginalAudio };
