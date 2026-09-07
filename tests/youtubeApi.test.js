// tests/youtubeApi.test.js — عميل YouTube Data API الرسمي (بلا شبكة)
//
// خادم stub محلي على 127.0.0.1:0 يُنشأ أولاً ثم يُضبط env ثم يُستورد config
// (config يقرأ env وقت الاستيراد) — نفس نمط tests/provider.test.js.
//
// ما يحرسه هذا الملف تحديدًا: أن المسار المتوافق **لا يدّعي أبدًا** أن نص
// الترجمات متاح. captions.download يتطلب OAuth بحساب المالك ويعيد 403 لطرف
// ثالث، فأي استجابة توحي بغير ذلك هي انحدار في العقد لا مجرد خطأ عرض.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { once } = require('node:events');

const requests = [];
let server;
let baseUrl;
let youtubeApi;
let app;

// استجابة videos.list واقعية مختصرة
function videoItem(overrides = {}) {
  return {
    items: [{
      id: 'dQw4w9WgXcQ',
      snippet: {
        title: 'Test Video',
        description: 'A description',
        channelTitle: 'Test Channel',
        channelId: 'UC123',
        publishedAt: '2024-01-15T10:00:00Z',
        defaultAudioLanguage: 'en',
        thumbnails: {
          default: { url: 'http://img/default.jpg' },
          high: { url: 'http://img/high.jpg' },
          maxres: { url: 'http://img/maxres.jpg' },
        },
      },
      contentDetails: { duration: 'PT4M13S', caption: 'true' },
      ...overrides,
    }],
  };
}

let respond = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(videoItem()));
};

before(async () => {
  server = http.createServer((req, res) => {
    requests.push({ url: req.url });
    respond(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  process.env.YOUTUBE_API_KEY = 'test-yt-key';
  process.env.YOUTUBE_API_BASE = baseUrl;
  process.env.RATE_LIMIT_MAX = '1000';
  process.env.RATE_LIMIT_MAX_HEAVY = '1000';

  youtubeApi = require('../server/youtubeApi');
  app = require('../server/server');
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

// ===== 1) دوال نقية =====

test('parseIsoDuration: صيغ ISO 8601 المختلفة', () => {
  const { parseIsoDuration } = youtubeApi;
  assert.equal(parseIsoDuration('PT4M13S'), 253);
  assert.equal(parseIsoDuration('PT1H2M10S'), 3730);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('PT2H'), 7200);
  assert.equal(parseIsoDuration('P1DT2H'), 93600); // بث طويل
  assert.equal(parseIsoDuration('غير صالح'), 0);
  assert.equal(parseIsoDuration(''), 0);
  assert.equal(parseIsoDuration(null), 0);
});

test('bestThumbnail: يتدرّج نزولًا ولا ينهار على الغائب', () => {
  const { bestThumbnail } = youtubeApi;
  assert.equal(bestThumbnail({ maxres: { url: 'a' }, high: { url: 'b' } }), 'a');
  assert.equal(bestThumbnail({ high: { url: 'b' }, default: { url: 'c' } }), 'b');
  assert.equal(bestThumbnail({ default: { url: 'c' } }), 'c');
  assert.equal(bestThumbnail({}), null);
  assert.equal(bestThumbnail(null), null);
});

test('toVideoId: يقبل الرابط والمعرّف ويرفض ما عداهما', () => {
  const { toVideoId } = youtubeApi;
  assert.equal(toVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(toVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(toVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ'); // معرّف مباشر
  assert.equal(toVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(toVideoId('too-short'), null);
  assert.equal(toVideoId(''), null);
});

// ===== 2) جلب البيانات الوصفية =====

test('getVideoMetadata: يستخرج الحقول ويطلب videos.list بالجزأين الصحيحين', async () => {
  const start = requests.length;
  const meta = await youtubeApi.getVideoMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(requests.length - start, 1, 'يجب أن يصل طلب واحد بالضبط');
  const q = requests[requests.length - 1].url;
  assert.match(q, /\/videos\?/);
  assert.match(q, /part=snippet%2CcontentDetails|part=snippet,contentDetails/);
  assert.match(q, /id=dQw4w9WgXcQ/);
  assert.match(q, /key=test-yt-key/);

  assert.equal(meta.videoId, 'dQw4w9WgXcQ');
  assert.equal(meta.title, 'Test Video');
  assert.equal(meta.channel, 'Test Channel');
  assert.equal(meta.durationSec, 253);
  assert.equal(meta.thumbnail, 'http://img/maxres.jpg');
  assert.equal(meta.hasCaptions, true);
  assert.equal(meta.defaultLanguage, 'en');
});

test('getVideoMetadata: رابط غير صالح → invalid-url بلا أي طلب شبكة', async () => {
  const start = requests.length;
  await assert.rejects(
    () => youtubeApi.getVideoMetadata('https://example.com/not-youtube'),
    (e) => e.code === 'invalid-url',
  );
  assert.equal(requests.length, start, 'لا يجوز إرسال طلب لرابط غير صالح');
});

test('getVideoMetadata: مصفوفة items فارغة → video-not-found', async () => {
  const prev = respond;
  respond = (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items: [] })); };
  try {
    await assert.rejects(
      () => youtubeApi.getVideoMetadata('dQw4w9WgXcQ'),
      (e) => e.code === 'video-not-found',
    );
  } finally { respond = prev; }
});

test('getVideoMetadata: 403 → youtube-quota (لا خطأ عام)', async () => {
  const prev = respond;
  respond = (req, res) => { res.statusCode = 403; res.end('quotaExceeded'); };
  try {
    await assert.rejects(
      () => youtubeApi.getVideoMetadata('dQw4w9WgXcQ'),
      (e) => e.code === 'youtube-quota',
    );
  } finally { respond = prev; }
});

test('getVideoMetadata: 500 → youtube-api-failed', async () => {
  const prev = respond;
  respond = (req, res) => { res.statusCode = 500; res.end('boom'); };
  try {
    await assert.rejects(
      () => youtubeApi.getVideoMetadata('dQw4w9WgXcQ'),
      (e) => e.code === 'youtube-api-failed',
    );
  } finally { respond = prev; }
});

test('isAvailable: يتبع المفتاح وقت الاستدعاء لا وقت الاستيراد', () => {
  const config = require('../server/config');
  assert.equal(youtubeApi.isAvailable(), true);
  const orig = config.YOUTUBE_API_KEY;
  config.YOUTUBE_API_KEY = ''; // كما يفعل حفظ الإعدادات وقت التشغيل
  try {
    assert.equal(youtubeApi.isAvailable(), false);
  } finally { config.YOUTUBE_API_KEY = orig; }
});

test('getVideoMetadata: بلا مفتاح → youtube-api-disabled', async () => {
  const config = require('../server/config');
  const orig = config.YOUTUBE_API_KEY;
  config.YOUTUBE_API_KEY = '';
  try {
    await assert.rejects(
      () => youtubeApi.getVideoMetadata('dQw4w9WgXcQ'),
      (e) => e.code === 'youtube-api-disabled',
    );
  } finally { config.YOUTUBE_API_KEY = orig; }
});

// ===== 3) المسار عبر HTTP =====

test('GET /api/youtube/metadata: يعيد البيانات ولا يدّعي توفّر الترجمات', async () => {
  const srv = app.listen(0);
  await once(srv, 'listening');
  try {
    const url = `http://127.0.0.1:${srv.address().port}`;
    const res = await fetch(`${url}/api/youtube/metadata?url=https://youtu.be/dQw4w9WgXcQ`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.title, 'Test Video');
    assert.equal(body.durationSec, 253);
    // العقد الحرج: للفيديو ترجمات، لكنها **ليست** متاحة لنا رسميًا
    assert.equal(body.hasCaptions, true);
    assert.equal(body.captionsAvailableToUs, false, 'ادّعى المسار أن نص الترجمات متاح لنا');
    assert.equal(body.contentSource, 'upload-required');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('GET /api/youtube/metadata: بلا معامل url → 400', async () => {
  const srv = app.listen(0);
  await once(srv, 'listening');
  try {
    const url = `http://127.0.0.1:${srv.address().port}`;
    const res = await fetch(`${url}/api/youtube/metadata`);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid-url' });
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('GET /api/youtube/metadata: فيديو غير موجود → 404', async () => {
  const prev = respond;
  respond = (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items: [] })); };
  const srv = app.listen(0);
  await once(srv, 'listening');
  try {
    const url = `http://127.0.0.1:${srv.address().port}`;
    const res = await fetch(`${url}/api/youtube/metadata?url=dQw4w9WgXcQ`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'video-not-found' });
  } finally {
    respond = prev;
    await new Promise((r) => srv.close(r));
  }
});
