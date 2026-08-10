// tests/glossary.test.js — اختبارات مسرد المصطلحات (applyGlossary)
const { test } = require('node:test');
const assert = require('node:assert');
const { applyGlossary } = require('../server/translate');

test('applyGlossary: استبدال أساسي', () => {
  const out = applyGlossary('The cloud stores data.', [{ from: 'cloud', to: 'سحابة' }]);
  assert.equal(out, 'The سحابة stores data.');
});

test('applyGlossary: حساسية حالة الأحرف (Cloud/CLOUD)', () => {
  const g = [{ from: 'cloud', to: 'سحابة' }];
  assert.equal(applyGlossary('Cloud and CLOUD and cloud.', g), 'سحابة and سحابة and سحابة.');
});

test('applyGlossary: حدود الكلمة — cloudy لا تتأثر بـ cloud', () => {
  const out = applyGlossary('The cloudy sky and a cloud.', [{ from: 'cloud', to: 'سحابة' }]);
  assert.equal(out, 'The cloudy sky and a سحابة.');
});

test('applyGlossary: الأطول أولاً يمنع الاستبدال الجزئي', () => {
  const g = [{ from: 'dog', to: 'كلب' }, { from: 'doghouse', to: 'بيت الكلب' }];
  assert.equal(applyGlossary('the dog and the doghouse', g), 'the كلب and the بيت الكلب');
});

test('applyGlossary: الروابط لا تُمس', () => {
  const out = applyGlossary('See https://example.com/cloud for cloud info.', [{ from: 'cloud', to: 'سحابة' }]);
  assert.equal(out, 'See https://example.com/cloud for سحابة info.');
});

test('applyGlossary: مسرد فارغ/null يعيد النص كما هو', () => {
  assert.equal(applyGlossary('hello world', null), 'hello world');
  assert.equal(applyGlossary('hello world', []), 'hello world');
  assert.equal(applyGlossary('', [{ from: 'a', to: 'b' }]), '');
});

test('applyGlossary: تجاهل الأزواج غير الصالحة والرموز الخطرة', () => {
  const g = [
    { from: 'ok', to: 'جيد' },
    { from: 'bad*term', to: 'x' }, // رموز regex خطرة — تُتجاهل
    { from: 'a', to: 'x' }, // أقصر من حرفين — تُتجاهل
    { from: 'foo', to: 123 }, // to غير نصي — يُتجاهل
  ];
  const out = applyGlossary('ok bad*term a foo', g);
  assert.equal(out, 'جيد bad*term a foo');
});

test('applyGlossary: استبدال متعدد لنفس الكلمة', () => {
  const out = applyGlossary('one two three', [{ from: 'two', to: 'اثنان' }]);
  assert.equal(out, 'one اثنان three');
});
