// tests/dub.test.js — مسار الدبلجة POST /api/dub
// tts مُستبدَل وقت التشغيل: لا شبكة، ونتحقق من التحقّق والتوازي وتحمّل الفشل.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const tts = require('../server/tts');
const origTextToMp3 = tts.textToMp3Buffer;

let server, base;

before(async () => {
  const app = require('../server/server');
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  tts.textToMp3Buffer = origTextToMp3;
  if (server) server.close();
});

const post = (body) =>
  fetch(`${base}/api/dub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('يولّد مقطعًا صوتيًا لكل سطر مع الحفاظ على الترتيب والتوقيت', async () => {
  tts.textToMp3Buffer = async (text) => Buffer.from('AUDIO:' + text);

  const res = await post({
    lang: 'ar',
    segments: [
      { start: 0, text: 'first' },
      { start: 3.5, text: 'second' },
    ],
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.lang, 'ar');
  assert.equal(data.segments.length, 2);
  assert.equal(data.segments[0].start, 0);
  assert.equal(data.segments[1].start, 3.5);
  assert.equal(Buffer.from(data.segments[0].audio, 'base64').toString(), 'AUDIO:first');
  assert.equal(Buffer.from(data.segments[1].audio, 'base64').toString(), 'AUDIO:second');
});

test('فشل مقطع واحد لا يُسقط الدفعة — يعود audio=null فقط', async () => {
  tts.textToMp3Buffer = async (text) => {
    if (text === 'bad') throw new Error('gTTS HTTP 500');
    return Buffer.from('ok');
  };

  const res = await post({
    lang: 'ar',
    segments: [{ start: 0, text: 'good' }, { start: 1, text: 'bad' }, { start: 2, text: 'good' }],
  });
  assert.equal(res.status, 200);
  const { segments } = await res.json();
  assert.ok(segments[0].audio);
  assert.equal(segments[1].audio, null);
  assert.ok(segments[2].audio);
});

test('النص يُقصَّر إلى 180 حرفًا — فوقها يحتاج gTTS دمج ffmpeg وقد لا يكون مثبتًا', async () => {
  let seen = '';
  tts.textToMp3Buffer = async (text) => { seen = text; return Buffer.from('x'); };

  await post({ lang: 'ar', segments: [{ start: 0, text: ('كلمة '.repeat(100)) }] });
  assert.ok(seen.length <= 180, `طول النص ${seen.length} تجاوز الحد`);
});

test('المقطع الفارغ يُعاد بلا صوت ولا يُستدعى المحرّك', async () => {
  let calls = 0;
  tts.textToMp3Buffer = async () => { calls++; return Buffer.from('x'); };

  const res = await post({ lang: 'ar', segments: [{ start: 0, text: '   ' }] });
  const { segments } = await res.json();
  assert.equal(segments[0].audio, null);
  assert.equal(calls, 0);
});

test('لغة غير مدعومة تسقط إلى العربية بدل الفشل', async () => {
  tts.textToMp3Buffer = async () => Buffer.from('x');
  const res = await post({ lang: 'zz', segments: [{ start: 0, text: 'hi' }] });
  assert.equal((await res.json()).lang, 'ar');
});

test('مقاطع غائبة أو فارغة → 422', async () => {
  assert.equal((await post({ lang: 'ar' })).status, 422);
  assert.equal((await post({ lang: 'ar', segments: [] })).status, 422);
  assert.equal((await post({ lang: 'ar', segments: 'nope' })).status, 422);
});

test('أكثر من 40 مقطعًا → 422 (الواجهة تطلب دفعات صغيرة)', async () => {
  const many = Array.from({ length: 41 }, (_, i) => ({ start: i, text: 'x' }));
  const res = await post({ lang: 'ar', segments: many });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'too-many-segments');
});
