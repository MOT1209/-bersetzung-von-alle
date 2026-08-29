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

const decode = (parts) => parts.map((p) => Buffer.from(p, 'base64').toString()).join('|');

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
  assert.equal(data.failed, 0);
  assert.equal(data.segments.length, 2);
  assert.equal(data.segments[0].start, 0);
  assert.equal(data.segments[1].start, 3.5);
  assert.equal(decode(data.segments[0].audio), 'AUDIO:first');
  assert.equal(decode(data.segments[1].audio), 'AUDIO:second');
});

test('فشل مقطع واحد لا يُسقط الدفعة — يعود audio فارغًا ويُحصى في failed', async () => {
  tts.textToMp3Buffer = async (text) => {
    if (text === 'bad') throw new Error('gTTS HTTP 500');
    return Buffer.from('ok');
  };

  const res = await post({
    lang: 'ar',
    segments: [{ start: 0, text: 'good' }, { start: 1, text: 'bad' }, { start: 2, text: 'good' }],
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.failed, 1);
  assert.equal(data.segments[0].audio.length, 1);
  assert.deepEqual(data.segments[1].audio, []);
  assert.equal(data.segments[2].audio.length, 1);
});

test('السطر الطويل يُقسَّم إلى أجزاء ≤180 حرفًا بدل بتره', async () => {
  const seen = [];
  tts.textToMp3Buffer = async (text) => { seen.push(text); return Buffer.from('x'); };

  const long = 'كلمة '.repeat(100).trim(); // ~500 حرف
  const res = await post({ lang: 'ar', segments: [{ start: 0, text: long }] });
  const { segments } = await res.json();

  assert.ok(seen.length > 1, 'كان يجب تقسيم النص إلى أكثر من جزء');
  for (const t of seen) assert.ok(t.length <= 180, `طول الجزء ${t.length} تجاوز الحد`);
  assert.equal(segments[0].audio.length, seen.length);
  // الجوهر: لم يُبتر النص — الأجزاء مجتمعةً تغطي أكثر من 180 حرفًا
  assert.ok(seen.join('').length > 180);
});

test('السطر الطويل جدًا يُسقَف بثلاثة أجزاء — لا يلحق بتوقيته أصلًا', async () => {
  let calls = 0;
  tts.textToMp3Buffer = async () => { calls++; return Buffer.from('x'); };

  await post({ lang: 'ar', segments: [{ start: 0, text: 'كلمة '.repeat(400).trim() }] });
  assert.equal(calls, 3);
});

test('المقطع الفارغ يُعاد بلا صوت ولا يُستدعى المحرّك', async () => {
  let calls = 0;
  tts.textToMp3Buffer = async () => { calls++; return Buffer.from('x'); };

  const res = await post({ lang: 'ar', segments: [{ start: 0, text: '   ' }] });
  const { segments } = await res.json();
  assert.deepEqual(segments[0].audio, []);
  assert.equal(calls, 0);
});

test('لغة لا يدعمها محرّك النطق → 422 بدل دبلجة صامتة', async () => {
  tts.textToMp3Buffer = async () => Buffer.from('x');
  // bho لغة ترجمة مدعومة لكن gTTS لا ينطقها — كانت تسقط للعربية بصمت
  for (const lang of ['bho', 'ckb', 'zz', undefined]) {
    const res = await post({ lang, segments: [{ start: 0, text: 'hi' }] });
    assert.equal(res.status, 422, `اللغة ${lang} كان يجب رفضها`);
    assert.equal((await res.json()).error, 'dub-lang-unsupported');
  }
});

test('لغة مدعومة نطقًا تُستخدم كما هي بلا سقوط للعربية', async () => {
  let seenLang = null;
  tts.textToMp3Buffer = async (text, lang) => { seenLang = lang; return Buffer.from('x'); };
  const res = await post({ lang: 'tr', segments: [{ start: 0, text: 'merhaba' }] });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).lang, 'tr');
  assert.equal(seenLang, 'tr');
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
