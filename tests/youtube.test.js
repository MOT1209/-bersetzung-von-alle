// tests/youtube.test.js — اختبارات وحدة لمقتطفات يوتيوب (استخراج المعرف + بناء SRT)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractVideoId, buildSrt, formatSrtTime } = require('../server/youtube');

// ===== extractVideoId =====

test('extractVideoId: رابط قياسي youtube.com/watch?v=', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: رابط قصير youtu.be/', () => {
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: رابط بمعاملات إضافية', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s&ab_channel=RickAstley';
  assert.equal(extractVideoId(url), 'dQw4w9WgXcQ');
});

test('extractVideoId: صيغ embed و shorts و live و v/', () => {
  assert.equal(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: نطاق m.youtube.com (جوال)', () => {
  assert.equal(extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: روابط غير يوتيوب تعيد null', () => {
  assert.equal(extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractVideoId('https://vimeo.com/12345'), null);
});

test('extractVideoId: مدخلات غير صالحة', () => {
  assert.equal(extractVideoId(''), null);
  assert.equal(extractVideoId(null), null);
  assert.equal(extractVideoId(123), null);
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=short'), null);
});

// ===== formatSrtTime =====

test('formatSrtTime: تنسيق HH:MM:SS,mmm', () => {
  assert.equal(formatSrtTime(0), '00:00:00,000');
  assert.equal(formatSrtTime(2), '00:00:02,000');
  assert.equal(formatSrtTime(65.5), '00:01:05,500');
  assert.equal(formatSrtTime(3661.25), '01:01:01,250');
});

// ===== buildSrt =====

test('buildSrt: فقرة واحدة بالفهرس والتوقيت والنص', () => {
  const srt = buildSrt([{ start: 0, duration: 2, translated: 'مرحبا' }]);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:02,000\nمرحبا\n');
});

test('buildSrt: ينسق فقرات متعددة ويفصل بينها بسطر فارغ', () => {
  const srt = buildSrt([
    { start: 0, duration: 1.5, translated: 'أول' },
    { start: 2, duration: 2, original: 'hello', translated: '' },
  ]);
  assert.equal(
    srt,
    '1\n00:00:00,000 --> 00:00:01,500\nأول\n\n2\n00:00:02,000 --> 00:00:04,000\nhello\n'
  );
});

test('buildSrt: يعتمد على original عند غياب translated', () => {
  const srt = buildSrt([{ start: 0, duration: 2, original: 'fallback text' }]);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:02,000\nfallback text\n');
});
