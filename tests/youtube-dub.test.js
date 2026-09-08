// tests/youtube-dub.test.js — اختبارات YouTube Dubbing v2 (validation + units + E2E مصغر بـ ffmpeg)
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const execFileAsync = promisify(execFile);

const { extractVideoId } = require('../server/youtube');
const { buildTimeline } = require('../server/dubbing/segment-processor');
const { mapSpeakersToVoices } = require('../server/dubbing/voice-manager');
const { planTiming } = require('../server/dubbing/timing-engine');
const { buildSrt, buildVtt, muxVideo } = require('../server/dubbing/export-service');
const { mixSegments } = require('../server/dubbing/audio-mixer');

// ===== YouTube URL =====
test('extractVideoId: رابط قياسي', () => assert.equal(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ'));
test('extractVideoId: shorts', () => assert.equal(extractVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ'));
test('extractVideoId: youtu.be', () => assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ'));
test('extractVideoId: غير يوتيوب → null', () => assert.equal(extractVideoId('https://example.com/x'), null));

// ===== Dubbing units =====
test('segments: مقطع واحد', () => {
  const tl = buildTimeline([{ text: 'Hello', start: 0, duration: 2 }]);
  assert.equal(tl.length, 1);
  assert.ok(tl[0].speaker.startsWith('speaker_'));
});
test('segments: عدة مقاطع + عدة متحدثين عبر فجوة صمت', () => {
  const tl = buildTimeline([
    { text: 'Hi', start: 0, duration: 2 },
    { text: 'Hello', start: 10, duration: 2 },
    { text: 'Hey', start: 20, duration: 2 },
  ]);
  assert.equal(tl.length, 3);
  assert.ok(new Set(tl.map((s) => s.speaker)).size >= 2);
});
test('voices: كل متحدث بصوت مختلف', () => {
  const m = mapSpeakersToVoices(['speaker_1', 'speaker_2', 'speaker_3']);
  assert.equal(new Set(Object.values(m).map((v) => v.id)).size, 3);
});
test('timing: صوت أطول قليلًا → ok/stretch بلا قطع', () => {
  const p1 = planTiming(4.0, 4.2);
  assert.equal(p1.action, 'ok');
  const p2 = planTiming(4.0, 6.2);
  assert.equal(p2.action, 'stretch');
  assert.ok(p2.rate > 1 && p2.rate <= 2);
});
test('subtitles: SRT و VTT من نفس timeline', () => {
  const segs = [{ start: 1, end: 3, text: 'Hi', translated: 'مرحبا' }];
  const srt = buildSrt(segs);
  const vtt = buildVtt(segs);
  assert.ok(srt.includes('00:00:01,000 --> 00:00:03,000') && srt.includes('مرحبا'));
  assert.ok(vtt.startsWith('WEBVTT') && vtt.includes('00:00:01.000'));
});

// ===== API validation (عبر التطبيق مباشرة) =====
test('POST /api/youtube/dub: رابط غير صالح → 400', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/youtube/dub`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/x', targetLang: 'ar', mode: 'full-dub' }),
    });
    assert.equal(r.status, 400);
  } finally { srv.close(); }
});
test('GET /api/jobs/nope → 404', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/jobs/nope`);
    assert.equal(r.status, 404);
  } finally { srv.close(); }
});

// ===== E2E مصغر حقيقي: tone + فيديو لوني → mix → mux → MP4 قابل للتشغيل =====
test('E2E: mix + mux ينتج MP4 قابلًا للتشغيل', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-e2e-'));
  const tone = path.join(dir, 'tone.mp3');
  const video = path.join(dir, 'src.mp4');
  const mixed = path.join(dir, 'mixed.mp3');
  const out = path.join(dir, 'final.mp4');
  await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libmp3lame', tone], { timeout: 30000 });
  await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { timeout: 30000 });
  await mixSegments([{ file: tone, start: 0.5 }], mixed, { mode: 'full-dub', totalSec: 2 });
  assert.ok(fs.statSync(mixed).size > 1000);
  await muxVideo(video, mixed, out);
  assert.ok(fs.statSync(out).size > 1000);
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out], { timeout: 15000 });
  assert.ok(Number(stdout.trim()) > 1.0, 'المدة: ' + stdout);
  fs.rmSync(dir, { recursive: true, force: true });
});
