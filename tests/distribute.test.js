// tests/distribute.test.js — اختبارات وحدة لتوزيع الترجمة على الأسطر (distributeByRatio)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const router = require('../server/routes-translate');
const { distributeByRatio } = router;

test('distributeByRatio: تطابق 1:1 عندما يساوي عدد الأجزاء عدد الأسطر', () => {
  const lines = [{ original: 'مرحبا' }, { original: 'كيف حالك' }];
  const out = distributeByRatio('Hello\n\nWorld', lines);
  assert.deepEqual(out, ['Hello', 'World']);
});

test('distributeByRatio: عدد أسطر الناتج = عدد الأسطر الأصلية دائمًا', () => {
  const lines = [{ original: 'aaaa' }, { original: 'aa' }, { original: 'a' }];
  const out = distributeByRatio('one two three four five six', lines);
  assert.equal(out.length, lines.length);
});

test('distributeByRatio: توزيع نسبي حسب طول كل سطر أصلي', () => {
  // خطوط بأطوال 4 و1 → النسبة 4:1 → 4 كلمات تُقسم 3 للخط الأول و1 للثاني
  const lines = [{ original: 'aaaa' }, { original: 'a' }];
  const out = distributeByRatio('w1 w2 w3 w4', lines);
  assert.deepEqual(out, ['w1 w2 w3', 'w4']);
});

test('distributeByRatio: كلمات أقل من الأسطر — يبقى عدد الأسطر ثابتًا', () => {
  const lines = [{ original: 'x' }, { original: 'y' }];
  const out = distributeByRatio('solo', lines);
  assert.equal(out.length, 2);
  assert.equal(out[0], 'solo');
  assert.equal(out[1], '');
});
