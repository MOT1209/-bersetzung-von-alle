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
test('GET /api/dub/jobs/nope → 404', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/jobs/nope`);
    assert.equal(r.status, 404);
  } finally { srv.close(); }
});

// ===== E2E مصغر حقيقي: tone + فيديو لوني → mix → mux → MP4 قابل للتشغيل =====
// يحتاج ffmpeg/ffprobe فعليًا. CI يثبّتهما (راجع .github/workflows/ci.yml) فيعمل
// الاختبار هناك حقيقةً؛ وعلى جهاز تطوير بلا ffmpeg يتخطّى نفسه **معلنًا السبب**
// بدل أن يفشل ويبدو المشروع مكسورًا وهو سليم.
let ffmpegAvailable = null;
async function hasFfmpeg() {
  if (ffmpegAvailable === null) {
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 10000 });
      ffmpegAvailable = true;
    } catch { ffmpegAvailable = false; }
  }
  return ffmpegAvailable;
}

test('E2E: mix + mux ينتج MP4 قابلًا للتشغيل', async (t) => {
  if (!(await hasFfmpeg())) return t.skip('ffmpeg غير مثبَّت في هذه البيئة');
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

// ===== البند 4: استمرارية المهام =====
test('jobs: تُحفظ المهمة على القرص وتُستعاد بعد محاكاة إعادة التشغيل', async () => {
  const jobs = require('../server/jobs/job-manager');
  const pid = 'test-persist-' + Date.now().toString(36);
  const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } });
  jobs.updateJob(job.id, { status: 'completed', stage: 'مكتمل ✓', progress: 100, result: { ok: true } });
  const file = require('path').join(jobs.PROJECTS_DIR, pid, `job-${job.id}.json`);
  assert.ok(fs.existsSync(file), 'ملف المهمة موجود على القرص');
  jobs._testClear();
  assert.equal(jobs.getJob(job.id), null);
  const { restored } = jobs.reloadFromDisk();
  assert.ok(restored >= 1);
  const back = jobs.getJob(job.id);
  assert.equal(back.status, 'completed');
  assert.deepEqual(back.result, { ok: true });
  fs.rmSync(require('path').join(jobs.PROJECTS_DIR, pid), { recursive: true, force: true });
  jobs._testClear();
  jobs.reloadFromDisk();
});
test('jobs: مهمة جارية وقت الإقلاع تُعلَّم interrupted لا تُفقد بصمت', async () => {
  const jobs = require('../server/jobs/job-manager');
  const pid = 'test-interrupt-' + Date.now().toString(36);
  const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
  jobs._testClear();
  const { interrupted } = jobs.reloadFromDisk();
  assert.ok(interrupted >= 1);
  const back = jobs.getJob(job.id);
  assert.equal(back.status, 'failed');
  assert.equal(back.error, 'interrupted');
  assert.ok(back.errorAr.includes('إعادة تشغيل الخادم'));
  fs.rmSync(require('path').join(jobs.PROJECTS_DIR, pid), { recursive: true, force: true });
  jobs._testClear();
  jobs.reloadFromDisk();
});
// كان هذا الاختبار يؤكّد أن الزائر المجهول يحصل على 200 — وهو السلوك الذي أُغلق
// في §20: مهام المشروع لا تُقرأ إلا بتوكن المالك. التغطية الكاملة للعزل في
// tests/dubOwnership.test.js؛ هنا نثبّت أن المسار لم يعد مفتوحًا.
test('GET /api/dub/projects/:id/jobs: بلا توكن مالك → 404 لا 200', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/somepid/jobs`);
    assert.equal(r.status, 404, 'مهام مشروع غيرك يجب ألّا تُقرأ بلا توكن');
  } finally { srv.close(); }
});

// ===== البند 5: أصوات Edge =====
test('voices: صوت عصبي لكل لغة وجنس، ولغة مجهولة → null', () => {
  const { edgeVoiceFor } = require('../server/dubbing/voice-manager');
  assert.equal(edgeVoiceFor('ar', 'male'), 'ar-SA-HamedNeural');
  assert.equal(edgeVoiceFor('ar', 'female'), 'ar-SA-ZariyahNeural');
  assert.equal(edgeVoiceFor('de', 'female'), 'de-DE-KatjaNeural');
  assert.equal(edgeVoiceFor('xx', 'male'), null);
});
test('tts: نص فارغ → invalid-text بلا شبكة', async () => {
  const tts = require('../server/tts');
  await assert.rejects(() => tts.textToMp3BufferWithVoice('   ', 'ar', { gender: 'male' }), /invalid-text/);
});

// ===== البند 8: التنظيف =====
test('cleanup: يحذف المشاريع القديمة ويحمي الجارية', async () => {
  const { cleanupProjects } = require('../server/dubbing/cleanup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-'));
  const oldP = path.join(dir, 'old-proj');
  const newP = path.join(dir, 'new-proj');
  fs.mkdirSync(oldP); fs.writeFileSync(path.join(oldP, 'a.mp4'), Buffer.alloc(100));
  fs.mkdirSync(newP); fs.writeFileSync(path.join(newP, 'a.mp4'), Buffer.alloc(100));
  const ancient = Date.now() - 30 * 24 * 60 * 60 * 1000;
  fs.utimesSync(oldP, new Date(ancient), new Date(ancient));
  const r = cleanupProjects({ dir, maxAgeDays: 7, maxBytes: 10 ** 12 });
  assert.ok(r.removed.includes('old-proj'));
  assert.ok(fs.existsSync(newP));
  assert.ok(!fs.existsSync(oldP));
  fs.rmSync(dir, { recursive: true, force: true });
});
test('DELETE /api/dub/projects/:id: معرّف سيئ → 400، مفقود → 404', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const bad = await fetch(`http://127.0.0.1:${port}/api/dub/projects/bad!pid`, { method: 'DELETE' });
    assert.equal(bad.status, 400);
    const missing = await fetch(`http://127.0.0.1:${port}/api/dub/projects/no-such-proj-zzz`, { method: 'DELETE' });
    assert.equal(missing.status, 404);
  } finally { srv.close(); }
});

// ===== Subtitle editor: PATCH /api/dub/projects/:projectId/segments/:index =====
// Helper: generate a short valid mp3 buffer via ffmpeg (for stubbing TTS in success tests)
function makeFakeMp3Buffer() {
  const tmpFile = path.join(os.tmpdir(), `fake-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libmp3lame', '-b:a', '64k', tmpFile],
      { timeout: 10000 }, (err) => {
        if (err) return reject(err);
        const buf = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        resolve(buf);
      });
  });
}

test('PATCH segments: تعديل ناجح — يحفظ النص ويولّد الصوت', async () => {
  const app = require('../server/server');
  const { PROJECTS_DIR } = require('../server/dubbing/dubbing-pipeline');
  const pid = 'patch-ok-' + Date.now().toString(36);
  const lang = 'ar';
  const dir = path.join(PROJECTS_DIR, pid);
  fs.mkdirSync(dir, { recursive: true });
  const segsPath = path.join(dir, `translation-${lang}.json`);
  const segments = [
    { start: 0, end: 3, duration: 3, text: 'Hello', speaker: 'speaker_1', original: 'Hello', translated: 'مرحبا', voice: { id: 'ar-SA-HamedNeural', gender: 'male' }, audio: 'seg-000.mp3' },
    { start: 3, end: 6, duration: 3, text: 'World', speaker: 'speaker_1', original: 'World', translated: 'عالم', voice: { id: 'ar-SA-HamedNeural', gender: 'male' }, audio: 'seg-001.mp3' },
  ];
  fs.writeFileSync(segsPath, JSON.stringify(segments));

  // Stub TTS to return a valid mp3 buffer
  const tts = require('../server/tts');
  const origTts = tts.textToMp3BufferWithVoice;
  const fakeBuf = await makeFakeMp3Buffer();
  tts.textToMp3BufferWithVoice = async () => fakeBuf;

  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/${pid}/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, translated: 'مرحبا بك' }),
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.projectId, pid);
    assert.equal(data.lang, lang);
    assert.equal(data.index, 0);
    assert.equal(data.segment.translated, 'مرحبا بك');
    assert.equal(data.derivedStale, true);
    assert.ok(!data.audioError, 'لا يوجد خطأ صوتي');
    // The file was actually updated on disk
    const saved = JSON.parse(fs.readFileSync(segsPath, 'utf8'));
    assert.equal(saved[0].translated, 'مرحبا بك');
    assert.equal(saved[1].translated, 'عالم'); // untouched
  } finally {
    tts.textToMp3BufferWithVoice = origTts;
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH segments: معرّف مشروع سيئ → 400', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/bad!pid/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: 'test' }),
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.error, 'invalid-project');
  } finally { srv.close(); }
});

test('PATCH segments: لغة غير صالحة → 400', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/p-test/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'INVALID-LANG!!', translated: 'test' }),
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.error, 'invalid-lang');
  } finally { srv.close(); }
});

test('PATCH segments: نص فارغ → 400', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/p-test/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: '   ' }),
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.error, 'invalid-text');
  } finally { srv.close(); }
});

test('PATCH segments: نص طويل جدًا (>1500) → 400', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/p-test/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: 'أ'.repeat(1501) }),
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.error, 'invalid-text');
  } finally { srv.close(); }
});

test('PATCH segments: فهرس خارج النطاق → 400', async () => {
  const app = require('../server/server');
  const { PROJECTS_DIR } = require('../server/dubbing/dubbing-pipeline');
  const pid = 'patch-oob-' + Date.now().toString(36);
  const dir = path.join(PROJECTS_DIR, pid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'translation-ar.json'), JSON.stringify([
    { start: 0, end: 3, duration: 3, text: 'Hi', speaker: 's1', original: 'Hi', translated: 'أهلا', voice: { id: 'ar-SA-HamedNeural', gender: 'male' }, audio: null },
  ]));
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/${pid}/segments/5`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: 'test' }),
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.error, 'invalid-index');
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH segments: ملف ترجمة مفقود → 404', async () => {
  const app = require('../server/server');
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/nonexistent-proj/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: 'test' }),
    });
    assert.equal(r.status, 404);
    const data = await r.json();
    assert.equal(data.error, 'translation-not-found');
  } finally { srv.close(); }
});

test('PATCH segments: فشل TTS لا يُفقد التعديل — يُحفظ النص مع audio: null', async () => {
  const app = require('../server/server');
  const { PROJECTS_DIR } = require('../server/dubbing/dubbing-pipeline');
  const pid = 'patch-ttsfail-' + Date.now().toString(36);
  const lang = 'ar';
  const dir = path.join(PROJECTS_DIR, pid);
  fs.mkdirSync(dir, { recursive: true });
  const segsPath = path.join(dir, `translation-${lang}.json`);
  const segments = [
    { start: 0, end: 3, duration: 3, text: 'Hello', speaker: 's1', original: 'Hello', translated: 'مرحبا', voice: { id: 'ar-SA-HamedNeural', gender: 'male' }, audio: 'seg-000.mp3' },
  ];
  fs.writeFileSync(segsPath, JSON.stringify(segments));

  // Stub textToMp3BufferWithVoice to throw
  const tts = require('../server/tts');
  const orig = tts.textToMp3BufferWithVoice;
  tts.textToMp3BufferWithVoice = async () => { throw Object.assign(new Error('tts-offline'), { code: 'tts-offline' }); };

  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/${pid}/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, translated: 'مرحبا بك أيها العالم' }),
    });
    assert.equal(r.status, 200); // NOT 500
    const data = await r.json();
    assert.equal(data.segment.translated, 'مرحبا بك أيها العالم'); // text saved
    assert.equal(data.segment.audio, null); // audio cleared
    assert.equal(data.audioError, 'tts-offline');
    assert.equal(data.derivedStale, true);
    // Verify on disk
    const saved = JSON.parse(fs.readFileSync(segsPath, 'utf8'));
    assert.equal(saved[0].translated, 'مرحبا بك أيها العالم');
    assert.equal(saved[0].audio, null);
  } finally {
    tts.textToMp3BufferWithVoice = orig;
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH segments: مهمة جارية → 409', async () => {
  const app = require('../server/server');
  const { PROJECTS_DIR } = require('../server/dubbing/dubbing-pipeline');
  const jobs = require('../server/jobs/job-manager');
  const pid = 'patch-running-' + Date.now().toString(36);
  const dir = path.join(PROJECTS_DIR, pid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'translation-ar.json'), JSON.stringify([
    { start: 0, end: 3, duration: 3, text: 'Hi', speaker: 's1', original: 'Hi', translated: 'أهلا', voice: { id: 'ar-SA-HamedNeural', gender: 'male' }, audio: null },
  ]));
  // Create a processing job for this project
  const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
  jobs.updateJob(job.id, { status: 'processing', stage: 'TTS…', progress: 50 });
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/dub/projects/${pid}/segments/0`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ar', translated: 'test' }),
    });
    assert.equal(r.status, 409);
    const data = await r.json();
    assert.equal(data.error, 'job-running');
  } finally {
    srv.close();
    jobs._testClear();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
