// tests/sttProviders.test.js — طبقة محرّكات التفريغ (P1c)
//
// لماذا: محرّكا التفريغ لم يكن لهما اختبار واحد — لا سلسلة الاختيار ولا توحيد
// المقاطع. المحرّكان نفساهما يحتاجان نماذج وحزمًا أصلية (لا يمكن تشغيلهما هنا)،
// لكن **منطق الاختيار والتوحيد نقيّ وقابل للاختبار بالكامل** — وهو ما يحرسه هذا الملف.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const audio = require('../server/audio');
const { normalizeLang, SUPPORTED_STT_LANGS } = require('../server/providers/stt/lang');
const sherpa = require('../server/providers/stt/sherpa');
const transformers = require('../server/providers/stt/transformers');

// ===== 1) السجل =====

test('سجل STT: يضمّ sherpa وtransformers بالترتيب', () => {
  const ids = audio.getProviders().map((p) => p.id);
  assert.deepEqual(ids, ['sherpa', 'transformers']);
  assert.ok(audio.getProvider('sherpa'));
  assert.equal(audio.getProvider('unknown'), undefined);
  // getProviders يعيد نسخة — التعديل عليها لا يمسّ السجل
  const copy = audio.getProviders();
  copy.length = 0;
  assert.equal(audio.getProviders().length, 2);
});

test('كل محرك يحقّق واجهة TranscriptionProvider', () => {
  for (const p of audio.getProviders()) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.label, 'string');
    assert.equal(typeof p.isAvailable, 'function');
    assert.equal(typeof p.transcribe, 'function');
  }
});

// ===== 2) سلسلة الاختيار =====

test('resolveSttChain: المفضّل أولًا ثم الباقي كاحتياطي', () => {
  const chain = audio.resolveSttChain();
  assert.ok(chain.length >= 1, 'يجب أن يتوفر محرك واحد على الأقل');
  // transformers متاح دائمًا، فلا يجوز أن تعود السلسلة فارغة
  assert.ok(chain.some((p) => p.id === 'transformers'));
  // كل عنصر في السلسلة متاح فعلًا
  assert.ok(chain.every((p) => p.isAvailable()));
});

test('resolveSttChain: المحرك غير المتاح يسقط من السلسلة', () => {
  const orig = sherpa.isAvailable;
  sherpa.isAvailable = () => false; // محاكاة غياب الحزمة الأصلية
  try {
    const ids = audio.resolveSttChain().map((p) => p.id);
    assert.ok(!ids.includes('sherpa'), 'محرك غير متاح ما زال في السلسلة');
    assert.ok(ids.includes('transformers'));
  } finally {
    sherpa.isAvailable = orig;
  }
});

// ===== 3) توحيد المقاطع =====

test('normalizeChunks: يحوّل المقاطع إلى start/duration/text', () => {
  const chunks = audio.normalizeChunks(
    [{ start: 0, end: 3, text: 'hello' }, { start: 3, end: 6, text: 'world' }], '');
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0], { start: 0, duration: 3, text: 'hello' });
  assert.deepEqual(chunks[1], { start: 3, duration: 3, text: 'world' });
});

test('normalizeChunks: المقطع الفارغ يمدّد سابقه بدل إنشاء جزء فارغ', () => {
  const chunks = audio.normalizeChunks(
    [{ start: 0, end: 2, text: 'hello' }, { start: 2, end: 5, text: '   ' }], '');
  assert.equal(chunks.length, 1, 'أُنشئ جزء فارغ');
  assert.equal(chunks[0].duration, 5, 'لم يُمدَّد الجزء السابق ليشمل الصمت');
});

test('normalizeChunks: الترقيم وحده يُعامل كفراغ', () => {
  assert.equal(audio.normalizeChunks([{ start: 0, end: 2, text: '... !!' }], '').length, 0);
});

test('normalizeChunks: المدة محصورة بين 2 و10 ثوانٍ', () => {
  const short = audio.normalizeChunks([{ start: 0, end: 0.2, text: 'hi' }], '');
  assert.equal(short[0].duration, 2, 'لم تُرفع المدة القصيرة إلى الحد الأدنى');
  const long = audio.normalizeChunks([{ start: 0, end: 90, text: 'long' }], '');
  assert.equal(long[0].duration, 10, 'لم تُقصّ المدة الطويلة إلى الحد الأعلى');
});

test('normalizeChunks: نص كامل بلا مقاطع زمنية → جزء واحد', () => {
  const chunks = audio.normalizeChunks([], 'full transcript text');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, 'full transcript text');
  assert.equal(chunks[0].start, 0);
});

test('normalizeChunks: لا مقاطع ولا نص → مصفوفة فارغة (يرفعها المنسّق كـ audio-empty)', () => {
  assert.deepEqual(audio.normalizeChunks([], ''), []);
  assert.deepEqual(audio.normalizeChunks(null, null), []);
});

// ===== 4) توحيد مخرجات كل محرك =====

test('sherpa.toSegments: يقرأ صيغة segments', () => {
  const segs = sherpa.toSegments({ segments: [{ start: 1, duration: 3, text: 'a' }] });
  assert.deepEqual(segs, [{ start: 1, end: 4, text: 'a' }]);
});

test('sherpa.toSegments: يقرأ المصفوفات المتوازية', () => {
  const segs = sherpa.toSegments({
    segment_timestamps: [0, 5],
    segment_durations: [2, 3],
    segment_texts: ['first', 'second'],
  });
  assert.deepEqual(segs, [
    { start: 0, end: 2, text: 'first' },
    { start: 5, end: 8, text: 'second' },
  ]);
});

test('transformers.toSegments: يقرأ timestamp المزدوج', () => {
  const segs = transformers.toSegments({ chunks: [{ timestamp: [0, 2.5], text: ' hi ' }] });
  assert.deepEqual(segs, [{ start: 0, end: 2.5, text: ' hi ' }]);
});

test('transformers.toSegments: نهاية غائبة → افتراضي +2', () => {
  const segs = transformers.toSegments({ chunks: [{ timestamp: [4, null], text: 'x' }] });
  assert.deepEqual(segs, [{ start: 4, end: 6, text: 'x' }]);
});

// ===== 5) اللغات =====

test('normalizeLang: المدعومة تمرّ وغيرها تصير auto', () => {
  for (const l of SUPPORTED_STT_LANGS) assert.equal(normalizeLang(l), l);
  assert.equal(normalizeLang('ar-SA'), 'ar');
  assert.equal(normalizeLang('fr'), 'auto');
  assert.equal(normalizeLang(''), 'auto');
  assert.equal(normalizeLang(null), 'auto');
});

test('transformers.sttOptions: يمرّر اللغة المعروفة ويحذفها عند auto', () => {
  assert.equal(transformers.sttOptions('ar').language, 'ar');
  assert.equal(transformers.sttOptions('fr').language, undefined);
  // chunk_length_s إلزامي — بدونه يُخرج transformers قمامة فوق 30 ثانية
  assert.equal(transformers.sttOptions('ar').chunk_length_s, 30);
});
