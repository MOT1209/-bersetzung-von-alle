// tests/sse.test.js — بثّ الترجمة عبر SSE (routes-sse.js) بلا شبكة
//
// لماذا هذا الملف موجود: الراوتر كُتب في الموجة 3 ولم يُركَّب في server.js قط،
// فظل /api/translate-stream يُرجع 404 بينما الواجهة تعتمده كمسارها الافتراضي.
// لم يمسك ذلك أي اختبار لأن لا اختبار كان يصيب المسار. هذه الاختبارات تمنع
// تكرار ذلك: التركيب، وترتيب الأحداث، وغياب الضغط (الذي يبطل البثّ صامتًا).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const os = require('node:os');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.CACHE_FILE = path.join(os.tmpdir(), 'aralink-test-sse-' + Date.now() + '.json');
process.env.USAGE_FILE = path.join(os.tmpdir(), 'aralink-test-sse-usage-' + Date.now() + '.json');
process.env.STATS_LOG = path.join(os.tmpdir(), 'aralink-test-sse-stats-' + Date.now() + '.json');

const translate = require('../server/translate');
const fetchContent = require('../server/fetchContent');
const app = require('../server/server');

const origDetect = translate.detectLanguage;
const origWithMeta = translate.translateTextWithMeta;
const origFetchArticle = fetchContent.fetchArticleContent;

let server;
let baseUrl;

before(async () => {
  // تزييف وقت التنفيذ — لا شبكة
  translate.detectLanguage = async () => 'en';
  translate.translateTextWithMeta = async (text) => ({
    translated: 'تر:' + String(text || ''),
    chunksFromCache: 0,
    chunksTotal: 1,
  });
  fetchContent.fetchArticleContent = async () => ({
    title: 'عنوان',
    blocks: [{ type: 'p', content: 'First para.' }, { type: 'p', content: 'Second para.' }],
  });

  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  translate.detectLanguage = origDetect;
  translate.translateTextWithMeta = origWithMeta;
  fetchContent.fetchArticleContent = origFetchArticle;
  if (server) await new Promise((r) => server.close(r));
});

// ===== مساعد: يقرأ البثّ كاملاً ويحلّل أحداث SSE =====
async function readStream(body) {
  const res = await fetch(`${baseUrl}/api/translate-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const events = [];
  for (const block of raw.split('\n\n')) {
    const ev = /^event: (.+)$/m.exec(block);
    const dt = /^data: (.+)$/m.exec(block);
    if (ev && dt) {
      let parsed = null;
      try { parsed = JSON.parse(dt[1]); } catch { /* تجاهل */ }
      events.push({ type: ev[1].trim(), data: parsed });
    }
  }
  return { res, raw, events };
}

test('المسار مركَّب: POST /api/translate-stream ليس 404', async () => {
  const { res } = await readStream({ text: 'Hello.', targetLang: 'ar' });
  assert.notEqual(res.status, 404, 'routes-sse.js غير مركَّب في server.js');
  assert.equal(res.status, 200);
});

test('ترويسات SSE صحيحة', async () => {
  const { res } = await readStream({ text: 'Hello.', targetLang: 'ar' });
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
});

// الحارس الأهم: 'text/event-stream' نوع قابل للضغط، فلو رُكِّب الراوتر بعد
// compression() لخزّن الضاغط الأحداث وتصل دفعة واحدة — يعمل الطلب ويضيع البثّ.
test('لا ضغط على البثّ (يجب أن يبقى الراوتر قبل compression)', async () => {
  const { res } = await readStream({ text: 'Hello.', targetLang: 'ar' });
  assert.equal(
    res.headers.get('content-encoding'),
    null,
    'البثّ مضغوط — رُكِّب routes-sse بعد compression() فتُخزَّن الأحداث مؤقتًا',
  );
});

test('نص: تسلسل init → chunk* → done مع محتوى مترجم', async () => {
  const { events } = await readStream({
    text: 'First sentence. Second sentence.',
    targetLang: 'ar',
  });
  assert.ok(events.length > 0, 'لم يصل أي حدث — البثّ فارغ');
  assert.equal(events[0].type, 'init');
  assert.equal(events[0].data.type, 'text');
  assert.equal(events[0].data.sourceLang, 'en');

  const chunks = events.filter((e) => e.type === 'chunk');
  assert.ok(chunks.length >= 2, `توقعنا قطعتين على الأقل، وصل ${chunks.length}`);
  assert.match(chunks[0].data.text, /^تر:/);
  // الفهارس متسلسلة من الصفر
  chunks.forEach((c, i) => assert.equal(c.data.index, i));

  assert.equal(events[events.length - 1].type, 'done');
});

test('رابط مقال: يبثّ ويُنهي بـ done', async () => {
  const { events } = await readStream({ url: 'https://example.com/a', targetLang: 'ar' });
  assert.equal(events[0].type, 'init');
  assert.ok(events.some((e) => e.type === 'chunk'));
  assert.equal(events[events.length - 1].type, 'done');
});

test('رابط غير صالح → حدث error لا رمز HTTP', async () => {
  const { res, events } = await readStream({ url: 'ftp://x', targetLang: 'ar' });
  assert.equal(res.status, 200); // الترويسات أُرسلت قبل اكتشاف الخطأ
  assert.equal(events[0].type, 'error');
  assert.equal(events[0].data.error, 'invalid-url');
});

test('نص فارغ / بلا مدخل → حدث error', async () => {
  const empty = await readStream({ text: '   ', targetLang: 'ar' });
  assert.equal(empty.events[0].type, 'error');

  const none = await readStream({ targetLang: 'ar' });
  assert.equal(none.events[0].type, 'error');
  assert.equal(none.events[0].data.error, 'invalid-input');
});

test('نص أطول من الحد → input-too-large كحدث', async () => {
  const { events } = await readStream({ text: 'a'.repeat(200001), targetLang: 'ar' });
  assert.equal(events[0].type, 'error');
  assert.equal(events[0].data.error, 'input-too-large');
});
