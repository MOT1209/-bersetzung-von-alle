// tests/projectPipeline.test.js — خط الأنابيب المرئي كاملاً (رفع → ترجمة محفوظة)
// بلا شبكة ولا ffmpeg: نزيّف transcribeMediaFile وtranslateLines فقط، ويبقى كل
// ما عداه حقيقيًا (التخزين، القاعدة، الوظائف، بناء SRT/VTT).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-pipe-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.STORAGE_DIR = path.join(tmpDir, 'storage');
process.env.CACHE_FILE = path.join(tmpDir, 'cache.json');
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const audioMod = require('../server/audio');
const translateRoutes = require('../server/routes-translate');
const db = require('../server/db');
const repo = require('../server/db/projects');
const { storage } = require('../server/providers/storage');
const pipeline = require('../server/projectPipeline');
const app = require('../server/server');

const origTranscribe = audioMod.transcribeMediaFile;
const origTranslateLines = translateRoutes.translateLines;

let server;
let baseUrl;

const FAKE_CHUNKS = [
  { start: 0, duration: 2.5, text: 'Hello world' },
  { start: 2.5, duration: 3, text: 'Second line' },
];

before(async () => {
  audioMod.transcribeMediaFile = async () => ({ chunks: FAKE_CHUNKS });
  translateRoutes.translateLines = async (lines) => ({
    sourceLang: 'en',
    captions: lines.map((l) => ({ ...l, translated: 'تر: ' + l.original })),
    cached: false,
  });
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  audioMod.transcribeMediaFile = origTranscribe;
  translateRoutes.translateLines = origTranslateLines;
  if (server) await new Promise((r) => server.close(r));
  db.closeDb();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* تنظيف */ }
});

const api = (p, opts = {}) => fetch(baseUrl + p, {
  ...opts,
  headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const post = (p, body, token) => api(p, {
  method: 'POST',
  body: JSON.stringify(body),
  headers: token ? { 'X-Project-Token': token } : {},
});

async function until(fn, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

// ينشئ مشروعًا وأصل وسائط جاهزًا للمعالجة.
// كل عملية على المشروع تحتاج توكن المالك (X-Project-Token) بعد §19.
async function seedProject(name = 'pipeline') {
  const project = await (await post('/api/projects', { name })).json();
  const token = project.ownerToken;
  const asset = await (await post(`/api/projects/${project.id}/assets`, {
    kind: 'media',
    content: Buffer.from('fake media bytes').toString('base64'),
    filename: 'lecture.mp4',
    mime: 'video/mp4',
  }, token)).json();
  return { project, asset, token };
}

// ===== 1) تحويل المقاطع =====

test('toVttSegments: يحوّل duration إلى end ويأخذ الترجمة', () => {
  const segs = pipeline.toVttSegments([
    { start: 0, duration: 2.5, original: 'Hi', translated: 'مرحبا' },
    { start: 2.5, duration: 3, original: 'Bye', translated: '' },
  ]);
  assert.deepEqual(segs[0], { start: 0, end: 2.5, text: 'مرحبا' });
  // ترجمة فارغة تسقط إلى الأصل بدل سطر فارغ في ملف الترجمة
  assert.equal(segs[1].text, 'Bye');
  assert.equal(segs[1].end, 5.5);
});

// ===== 2) الخط كاملاً =====

test('المسار الكامل: رفع → معالجة → أصول ترجمة محفوظة فعليًا', async () => {
  const { project, asset, token } = await seedProject('محاضرة');

  const started = await post(`/api/projects/${project.id}/process`, { assetId: asset.id, targetLang: 'ar' }, token);
  assert.equal(started.status, 202);
  const job = await started.json();
  assert.ok(job.jobId);

  assert.ok(await until(async () => {
    const j = await (await api(job.statusUrl)).json();
    return j.status === 'completed' || j.status === 'failed';
  }), 'لم تنتهِ الوظيفة');

  const done = await (await api(job.statusUrl)).json();
  assert.equal(done.status, 'completed', `فشلت: ${JSON.stringify(done.error)}`);

  const result = done.result;
  // الشكل الذي يتوقّعه public/js/result.js (renderResult → renderYouTubeResult/
  // renderLocalVideo) — إعادة استخدام واجهة النتيجة الموحّدة بعد دمج الاستوديو
  // داخل تبويب «ترجمة ملف» (CURRENT_STATE.md §18). videoId فارغ عمدًا: لا رابط
  // يوتيوب لتضمينه.
  assert.equal(result.type, 'local-video');
  assert.equal(result.videoId, null);
  assert.equal(result.meta.title, 'lecture.mp4');
  assert.equal(result.meta.source, 'upload');
  assert.equal(result.sourceLang, 'en');
  assert.equal(result.targetLang, 'ar');
  assert.equal(result.captions.length, 2);
  assert.equal(result.captions[0].translated, 'تر: Hello world');
  assert.ok(result.subtitles.srt && result.subtitles.vtt);

  // الأصول محفوظة في القاعدة **وملفاتها موجودة على التخزين**
  const srt = repo.getAsset(result.subtitles.srt);
  assert.equal(srt.kind, 'subtitle');
  assert.equal(srt.lang, 'ar');
  assert.ok(await storage().exists(srt.storageKey), 'ملف SRT غير موجود في التخزين');

  // حالة المشروع صارت جاهزة
  assert.equal(repo.getProject(project.id).status, 'ready');
});

test('محتوى SRT صالح: ترقيم وتوقيت وترجمة', async () => {
  const { project, asset, token } = await seedProject('srt');
  const job = await (await post(`/api/projects/${project.id}/process`, { assetId: asset.id, targetLang: 'ar' }, token)).json();
  await until(async () => (await (await api(job.statusUrl)).json()).status === 'completed');
  const result = (await (await api(job.statusUrl)).json()).result;

  const res = await api(`/api/projects/${project.id}/assets/${result.subtitles.srt}/content`, { headers: { 'X-Project-Token': token } });
  assert.equal(res.status, 200);
  const srt = await res.text();
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nتر: Hello world/m);
  assert.match(srt, /^2\n/m);
});

test('محتوى VTT يبدأ بترويسة WEBVTT', async () => {
  const { project, asset, token } = await seedProject('vtt');
  const job = await (await post(`/api/projects/${project.id}/process`, { assetId: asset.id, targetLang: 'ar' }, token)).json();
  await until(async () => (await (await api(job.statusUrl)).json()).status === 'completed');
  const result = (await (await api(job.statusUrl)).json()).result;

  const vtt = await (await api(`/api/projects/${project.id}/assets/${result.subtitles.vtt}/content`, { headers: { 'X-Project-Token': token } })).text();
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /تر: Second line/);
});

// ===== 3) الأخطاء =====

test('صوت بلا كلام → الوظيفة تفشل بـ audio-empty والمشروع يصير failed', async () => {
  const { project, asset, token } = await seedProject('صامت');
  const saved = audioMod.transcribeMediaFile;
  audioMod.transcribeMediaFile = async () => ({ chunks: [] });
  try {
    const job = await (await post(`/api/projects/${project.id}/process`, { assetId: asset.id }, token)).json();
    assert.ok(await until(async () => (await (await api(job.statusUrl)).json()).status === 'failed'));
    const done = await (await api(job.statusUrl)).json();
    assert.equal(done.error.code, 'audio-empty');
    // الفشل يظهر على المشروع نفسه لا في السجل وحده
    assert.equal(repo.getProject(project.id).status, 'failed');
  } finally {
    audioMod.transcribeMediaFile = saved;
  }
});

test('process: مشروع مجهول 404، وأصل من مشروع آخر 404', async () => {
  const a = await seedProject('أ');
  const b = await seedProject('ب');
  assert.equal((await post('/api/projects/ghost/process', { assetId: a.asset.id }, a.token)).status, 404);
  // أصل المشروع (أ) لا يُعالَج عبر المشروع (ب) حتى بتوكن (ب) الصحيح
  assert.equal((await post(`/api/projects/${b.project.id}/process`, { assetId: a.asset.id }, b.token)).status, 404);
});

test('process: أصل ليس وسائط (ترجمة مثلاً) → 400', async () => {
  const { project, token } = await seedProject('نوع خاطئ');
  const sub = await (await post(`/api/projects/${project.id}/assets`, {
    kind: 'subtitle', content: Buffer.from('x').toString('base64'),
  }, token)).json();
  const res = await post(`/api/projects/${project.id}/process`, { assetId: sub.id }, token);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-asset');
});

test('حذف المشروع بعد المعالجة يزيل ملفات الترجمة أيضًا (البند 59)', async () => {
  const { project, asset, token } = await seedProject('حذف');
  const job = await (await post(`/api/projects/${project.id}/process`, { assetId: asset.id }, token)).json();
  await until(async () => (await (await api(job.statusUrl)).json()).status === 'completed');
  const result = (await (await api(job.statusUrl)).json()).result;
  const srtKey = repo.getAsset(result.subtitles.srt).storageKey;

  assert.ok(await storage().exists(srtKey));
  await api(`/api/projects/${project.id}`, { method: 'DELETE', headers: { 'X-Project-Token': token } });
  assert.equal(await storage().exists(srtKey), false, 'بقي ملف ترجمة بعد حذف المشروع');
});

// ===== 4) لا صفحة منفصلة — كل شيء تحت الصفحة الرئيسية (CURRENT_STATE.md §18) =====

test('GET /studio.html: غير موجودة — دُمج المسار في تبويب «ترجمة ملف»', async () => {
  const res = await fetch(`${baseUrl}/studio.html`);
  assert.equal(res.status, 404, 'صفحة الاستوديو المنفصلة يجب ألّا تكون موجودة بعد الدمج');
});

test('GET /: الصفحة الرئيسية تحمّل سكربت رفع الوسائط (project upload)', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /js\/app\.js/);
  assert.equal((await fetch(`${baseUrl}/js/projectUpload.js`)).status, 200);
});
