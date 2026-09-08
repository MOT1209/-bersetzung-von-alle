// tests/jobsApi.test.js — واجهة الوظائف عبر HTTP + وضع الفيديو المحلي غير المتزامن
// بلا شبكة: تزييف transcribeMediaFile وtranslateLines وprobeDuration.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const os = require('node:os');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.CACHE_FILE = path.join(os.tmpdir(), 'aralink-jobs-' + Date.now() + '.json');

const audioMod = require('../server/audio');
const translateRoutes = require('../server/routes-translate');
const localVideo = require('../server/routes-local-video');
const jobs = require('../server/jobs');
const app = require('../server/server');

const origTranscribe = audioMod.transcribeMediaFile;
const origTranslateLines = translateRoutes.translateLines;
const origProbe = localVideo.impl.probeDuration;

let server;
let baseUrl;

// base64 صغير صالح (المحتوى لا يُقرأ فعليًا — ffprobe وSTT مُزيَّفان)
const FAKE_MEDIA = Buffer.from('fake media bytes').toString('base64');

before(async () => {
  audioMod.transcribeMediaFile = async () => ({
    chunks: [{ start: 0, duration: 2, text: 'Hello' }],
  });
  translateRoutes.translateLines = async (lines) => ({
    sourceLang: 'en',
    captions: lines.map((l) => ({ ...l, translated: 'تر: ' + l.original })),
    cached: false,
  });
  localVideo.impl.probeDuration = async () => 5;

  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  audioMod.transcribeMediaFile = origTranscribe;
  translateRoutes.translateLines = origTranslateLines;
  localVideo.impl.probeDuration = origProbe;
  if (server) await new Promise((r) => server.close(r));
});

const post = (p, body) => fetch(baseUrl + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function until(fn, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

// ===== 1) المسار المتزامن لم يتغيّر عقده =====

test('POST /api/video-local: المسار المتزامن يعيد النتيجة كاملة كما قبل', async () => {
  const res = await post('/api/video-local', { content: FAKE_MEDIA, ext: 'mp4', targetLang: 'ar' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, 'local-video');
  assert.equal(body.sourceLang, 'en');
  assert.equal(body.captions[0].translated, 'تر: Hello');
  assert.equal(body.meta.source, 'audio');
});

test('POST /api/video-local: صيغة غير مدعومة تُرفض قبل الطابور', async () => {
  const before = jobs.stats().tracked;
  const res = await post('/api/video-local', { content: FAKE_MEDIA, ext: 'exe' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-format');
  assert.equal(jobs.stats().tracked, before, 'مدخل غير صالح احتلّ مقعدًا في الطابور');
});

// ===== 2) الوضع غير المتزامن =====

test('POST /api/video-local {async:true} → 202 مع معرّف ومسارات متابعة', async () => {
  const res = await post('/api/video-local', { content: FAKE_MEDIA, ext: 'mp4', async: true });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.ok(body.jobId);
  assert.equal(body.status, 'queued');
  assert.equal(body.statusUrl, `/api/jobs/${body.jobId}`);
  assert.equal(body.streamUrl, `/api/jobs/${body.jobId}/stream`);

  // تنتهي لاحقًا بنتيجة كاملة
  assert.ok(await until(async () => {
    const j = await (await fetch(baseUrl + body.statusUrl)).json();
    return j.status === 'completed';
  }), 'لم تكتمل الوظيفة');
  const done = await (await fetch(baseUrl + body.statusUrl)).json();
  assert.equal(done.result.type, 'local-video');
  assert.equal(done.progress.percent, 100);
});

// ===== 3) متابعة الوظائف =====

test('GET /api/jobs/:id: معرّف مجهول → 404', async () => {
  const res = await fetch(`${baseUrl}/api/jobs/لا-وجود-له`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'job-not-found');
});

test('GET /api/jobs: إحصاءات الطابور', async () => {
  const res = await fetch(`${baseUrl}/api/jobs`);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(typeof s.concurrency, 'number');
  assert.equal(typeof s.running, 'number');
  assert.equal(typeof s.queued, 'number');
  assert.ok(s.concurrency >= 1);
});

test('DELETE /api/jobs/:id: إلغاء، ومجهول → 404', async () => {
  const res404 = await fetch(`${baseUrl}/api/jobs/ghost`, { method: 'DELETE' });
  assert.equal(res404.status, 404);

  const created = await (await post('/api/video-local', { content: FAKE_MEDIA, ext: 'mp4', async: true })).json();
  const del = await fetch(`${baseUrl}/api/jobs/${created.jobId}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  const body = await del.json();
  assert.ok(['cancelled', 'completed', 'running'].includes(body.status), `حالة غير متوقعة: ${body.status}`);
});

// ===== 4) بثّ SSE =====

test('GET /api/jobs/:id/stream: يبثّ التقدّم بلا ضغط وينتهي عند الاكتمال', async () => {
  // نبطّئ التفريغ عمدًا: بمعالج فوري تنتهي الوظيفة قبل أن يتصل عميل البثّ أصلًا
  // فلا يرى إلا الحالة النهائية — أثر توقيت اختباري لا سلوك منتج (في الإنتاج
  // يستغرق التفريغ دقائق). الإبطاء يجعل الاختبار يقيس ما يهمّ فعلًا: وصول
  // المراحل الوسيطة عبر البثّ.
  const fast = audioMod.transcribeMediaFile;
  audioMod.transcribeMediaFile = async () => {
    await new Promise((r) => setTimeout(r, 250));
    return { chunks: [{ start: 0, duration: 2, text: 'Hello' }] };
  };
  try {
    const created = await (await post('/api/video-local', { content: FAKE_MEDIA, ext: 'mp4', async: true })).json();
    const res = await fetch(`${baseUrl}${created.streamUrl}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    // الحارس الحاسم: الضغط يخزّن الأحداث فيصل البثّ دفعة واحدة في النهاية
    assert.equal(res.headers.get('content-encoding'), null, 'البثّ مضغوط — رُكِّب المسار بعد compression()');
    assert.equal(res.headers.get('x-accel-buffering'), 'no');

    const raw = await res.text(); // ينتهي البثّ تلقائيًا عند اكتمال الوظيفة
    const events = raw.split('\n\n').filter((b) => b.includes('data:')).map((b) => {
      const m = /^data: (.+)$/m.exec(b);
      return m ? JSON.parse(m[1]) : null;
    }).filter(Boolean);

    assert.ok(events.length > 0, 'لم يصل أي حدث');
    const last = events[events.length - 1];
    assert.equal(last.status, 'completed');
    assert.equal(last.result.type, 'local-video');
    // مرّت مراحل حقيقية لا حدث واحد
    const stages = events.map((e) => e.progress.stage);
    assert.ok(stages.includes('transcribing') || stages.includes('translating'), `المراحل: ${stages.join(',')}`);
  } finally {
    audioMod.transcribeMediaFile = fast;
  }
});

test('GET /api/jobs/:id/stream: وظيفة منتهية أصلًا تُرسل حالتها ثم تُغلق', async () => {
  const created = await (await post('/api/video-local', { content: FAKE_MEDIA, ext: 'mp4', async: true })).json();
  assert.ok(await until(async () => {
    const j = await (await fetch(baseUrl + created.statusUrl)).json();
    return j.status === 'completed';
  }));
  // الاشتراك بعد الاكتمال يجب ألا يعلّق الاتصال
  const raw = await (await fetch(`${baseUrl}${created.streamUrl}`)).text();
  assert.match(raw, /"status":"completed"/);
});

test('GET /api/jobs/:id/stream: معرّف مجهول → 404 لا بثّ معلّق', async () => {
  const res = await fetch(`${baseUrl}/api/jobs/ghost/stream`);
  assert.equal(res.status, 404);
});
