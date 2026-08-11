// tests/geminiVideo.test.js — ترجمة فيديو يوتيوب عبر Gemini (بلا شبكة)
//
// الفكرة المختبَرة: تمرير رابط يوتيوب إلى Gemini عبر fileData.fileUri، فتجلبه
// خوادم Google لا خادمنا — وهو ما يتجاوز حجب يوتيوب لعناوين مراكز البيانات.
//
// كل الاختبارات تزيّف fetch: لا شبكة ولا مفاتيح ولا استهلاك حصة.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// كاش معزول قبل أي require حتى لا نلمس كاش المشروع
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-gv-'));
process.env.CACHE_FILE = path.join(tmpDir, 'cache.json');
process.env.GEMINI_API_KEY = 'test-key';
process.env.MAX_VIDEO_MINUTES = '20';

const config = require('../server/config');
const geminiVideo = require('../server/geminiVideo');
const { parseTimestamp, validateAndNormalize } = geminiVideo;

const realFetch = global.fetch;
let calls = 0;

afterEach(() => {
  global.fetch = realFetch;
});
beforeEach(() => {
  calls = 0;
  config.GEMINI_API_KEY = 'test-key';
  config.GEMINI_VIDEO = true;
});

// مزيّف يعيد نص الرد بصيغة Gemini
function stubGemini(bodies) {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  global.fetch = async () => {
    const body = list[Math.min(calls, list.length - 1)];
    calls++;
    if (body && body.__httpError) {
      return { ok: false, status: body.__httpError, text: async () => 'err' };
    }
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: body }] } }] }),
    };
  };
}

const GOOD = JSON.stringify([
  { start: '00:00', end: '00:03', original: 'Hello there', translated: 'مرحبا بك' },
  { start: '00:03', end: '01:05', original: 'How are you', translated: 'كيف حالك' },
]);

// مُعرِّف فيديو فريد لكل اختبار حتى لا يتداخل الكاش
let n = 0;
const vid = () => 'vid' + Date.now() + '_' + n++;

// ===== تحويل الطوابع الزمنية =====

test('parseTimestamp: MM:SS و HH:MM:SS', () => {
  assert.equal(parseTimestamp('00:00'), 0);
  assert.equal(parseTimestamp('01:05'), 65);
  assert.equal(parseTimestamp('1:00:00'), 3600);
  assert.equal(parseTimestamp('00:01.5'), 1.5);
  assert.equal(parseTimestamp(42), 42);
});

test('parseTimestamp: المدخل غير الصالح يعطي null لا NaN', () => {
  for (const bad of ['', null, undefined, 'abc', '12', 'a:b', '-1:00', {}]) {
    assert.equal(parseTimestamp(bad), null, JSON.stringify(bad));
  }
});

// ===== المسار الناجح =====

test('رد سليم ⇒ captions بالشكل الصحيح والطوابع بالثواني', async () => {
  stubGemini(GOOD);
  const r = await geminiVideo.translateYouTubeVideo(vid(), 'ar');
  assert.equal(r.captions.length, 2);
  assert.equal(r.captions[0].start, 0);
  assert.equal(r.captions[0].duration, 3);
  assert.equal(r.captions[0].translated, 'مرحبا بك');
  assert.equal(r.captions[1].start, 3);
  assert.equal(r.captions[1].duration, 62, '01:05 - 00:03 = 62 ثانية');
  assert.equal(r.cached, false);
});

test('سياج ```json يُزال إن أضافه النموذج', async () => {
  stubGemini('```json\n' + GOOD + '\n```');
  const r = await geminiVideo.translateYouTubeVideo(vid(), 'ar');
  assert.equal(r.captions.length, 2);
});

// ===== الرفض الصريح: لا مخرَج ناقص =====

test('ترجمة فارغة ⇒ رفض لا سطر فارغ', () => {
  assert.throws(
    () => validateAndNormalize([{ start: '00:00', end: '00:02', translated: '   ' }]),
    (e) => e.code === 'gemini-video-failed'
  );
});

test('طوابع متراجعة ⇒ رفض', () => {
  assert.throws(
    () => validateAndNormalize([
      { start: '00:10', end: '00:12', translated: 'أ' },
      { start: '00:05', end: '00:07', translated: 'ب' },
    ]),
    (e) => e.code === 'gemini-video-failed'
  );
});

test('مصفوفة فارغة أو رد غير مصفوفة ⇒ رفض', () => {
  for (const bad of [[], null, {}, 'نص']) {
    assert.throws(() => validateAndNormalize(bad), (e) => e.code === 'gemini-video-failed');
  }
});

test('نهاية غائبة ⇒ مدة افتراضية بدل رفض السطر', () => {
  const out = validateAndNormalize([{ start: '00:04', translated: 'أ' }]);
  assert.equal(out[0].start, 4);
  assert.ok(out[0].duration > 0);
});

test('فيديو يتجاوز الحد ⇒ video-too-long', () => {
  assert.throws(
    () => validateAndNormalize([{ start: '40:00', end: '40:05', translated: 'أ' }], 20 * 60),
    (e) => e.code === 'video-too-long'
  );
});

// ===== إعادة المحاولة =====

test('JSON تالف ⇒ إعادة محاولة واحدة ثم نجاح', async () => {
  stubGemini(['{ليس JSON', GOOD]);
  const r = await geminiVideo.translateYouTubeVideo(vid(), 'ar');
  assert.equal(calls, 2, 'يجب أن تكون هناك محاولتان بالضبط');
  assert.equal(r.captions.length, 2);
});

test('فشل متكرر ⇒ gemini-video-failed لا مخرَج مزيّف', async () => {
  stubGemini(['تالف', 'تالف أيضًا']);
  await assert.rejects(
    () => geminiVideo.translateYouTubeVideo(vid(), 'ar'),
    (e) => e.code === 'gemini-video-failed'
  );
});

test('خطأ HTTP ⇒ gemini-video-failed', async () => {
  stubGemini([{ __httpError: 400 }, { __httpError: 400 }]);
  await assert.rejects(
    () => geminiVideo.translateYouTubeVideo(vid(), 'ar'),
    (e) => e.code === 'gemini-video-failed'
  );
});

// ===== الكاش: أهم حماية للحصة =====

test('النداء الثاني لنفس الفيديو ⇒ من الكاش بلا استدعاء شبكة', async () => {
  const id = vid();
  stubGemini(GOOD);
  const first = await geminiVideo.translateYouTubeVideo(id, 'ar');
  assert.equal(first.cached, false);
  const afterFirst = calls;

  const second = await geminiVideo.translateYouTubeVideo(id, 'ar');
  assert.equal(second.cached, true, 'يجب أن يأتي من الكاش');
  assert.equal(calls, afterFirst, 'لا يجوز استدعاء Gemini مرة ثانية');
  assert.deepEqual(second.captions, first.captions);
});

test('لغة هدف مختلفة ⇒ استدعاء جديد (الكاش مفتاحه اللغة أيضًا)', async () => {
  const id = vid();
  stubGemini(GOOD);
  await geminiVideo.translateYouTubeVideo(id, 'ar');
  const afterAr = calls;
  await geminiVideo.translateYouTubeVideo(id, 'de');
  assert.ok(calls > afterAr, 'اللغة الأخرى تحتاج ترجمة جديدة');
});

// ===== التوفر =====

test('بلا مفتاح ⇒ المسار غير متاح ولا ينهار', async () => {
  config.GEMINI_API_KEY = '';
  assert.equal(geminiVideo.isAvailable(), false);
  await assert.rejects(
    () => geminiVideo.translateYouTubeVideo(vid(), 'ar'),
    (e) => e.code === 'gemini-video-disabled'
  );
});

test('GEMINI_VIDEO=false ⇒ المسار معطّل حتى مع وجود مفتاح', () => {
  config.GEMINI_VIDEO = false;
  assert.equal(geminiVideo.isAvailable(), false);
});

// ===== النموذج غير متاح: لا نضيّع محاولة على إعادة عمياء =====
// أسماء نماذج Gemini تتغيّر؛ لو كان GEMINI_VIDEO_MODEL غير متاح لهذا المفتاح
// يجب أن نجرّب GEMINI_MODEL العادي بدل إسقاط المسار كله.
test('HTTP 404 ⇒ يُجرَّب GEMINI_MODEL الاحتياطي وينجح', async () => {
  config.GEMINI_VIDEO_MODEL = 'model-does-not-exist';
  config.GEMINI_MODEL = 'gemini-2.0-flash';
  const urls = [];
  let i = 0;
  global.fetch = async (u) => {
    urls.push(String(u));
    if (i++ === 0) return { ok: false, status: 404, text: async () => 'model not found' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: GOOD }] } }] }) };
  };
  const r = await geminiVideo.translateYouTubeVideo(vid(), 'ar');
  assert.equal(r.captions.length, 2);
  assert.match(urls[0], /model-does-not-exist/, 'المحاولة الأولى بنموذج الفيديو');
  assert.match(urls[1], /gemini-2\.0-flash/, 'المحاولة الثانية بالنموذج الاحتياطي');
});
