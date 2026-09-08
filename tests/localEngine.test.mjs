// tests/localEngine.test.js — اختبارات وحدة لمحرك الترجمة المحلي
// الوحدة ES (public/js/localEngine.js) تُستورد مباشرة — public/package.json يعلن type:module
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, isWordToken, normalizeWord, stripDiacritics,
  normalizeDictionary, applyCapitalization, translateWithDictionary,
  isRtlText, suggest, setDebug,
} from '../public/js/localEngine.mjs';

setDebug(false); // لا إخراج مزعج في الاختبارات

/* ===== tokenize ===== */
test('tokenize: كلمات لاتينية وعلامات ترقيم', () => {
  assert.deepEqual(tokenize('Hello, world!'), ['Hello', ',', 'world', '!']);
});

test('tokenize: كلمات عربية وعلامات ترقيم', () => {
  assert.deepEqual(tokenize('مرحبا، بالعالم!'), ['مرحبا', '،', 'بالعالم', '!']);
});

test('tokenize: نص خالٍ يعيد مصفوفة فارغة', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('tokenize: أرقام تُعدّ كلمات', () => {
  assert.deepEqual(tokenize('2026'), ['2026']);
});

test('isWordToken: يميّز الكلمة عن الترقيم', () => {
  assert.equal(isWordToken('hello'), true);
  assert.equal(isWordToken('مرحبا'), true);
  assert.equal(isWordToken(','), false);
  assert.equal(isWordToken('!'), false);
});

/* ===== normalize ===== */
test('stripDiacritics: يزيل الحركات ويحفظ الحروف', () => {
  assert.equal(stripDiacritics('مُحَمَّد'), 'محمد');
  assert.equal(stripDiacritics('سلام'), 'سلام');
});

test('normalizeWord: lowercase', () => {
  assert.equal(normalizeWord('Hello'), 'hello');
  assert.equal(normalizeWord('WORLD'), 'world');
});

test('normalizeWord: lowercase + إزالة الحركات معًا', () => {
  assert.equal(normalizeWord('مُحَمَّد'), 'محمد');
});

test('normalizeWord: خيار إبقاء الحركات', () => {
  assert.equal(normalizeWord('مُحَمَّد', { stripDiacritics: false }), 'مُحَمَّد');
});

/* ===== normalizeDictionary ===== */
test('normalizeDictionary: يطبع المفاتيح إلى lowercase', () => {
  const d = normalizeDictionary({ Hello: 'مرحبا', WORLD: 'عالم' });
  assert.deepEqual(d, { hello: 'مرحبا', world: 'عالم' });
});

test('normalizeDictionary: يرفض القيم غير النصية والفارغة', () => {
  const d = normalizeDictionary({ ok: 'جيد', bad: 123, empty: '', nil: null });
  assert.deepEqual(d, { ok: 'جيد' });
});

test('normalizeDictionary: يرفض كائنًا غير كائن', () => {
  assert.throws(() => normalizeDictionary(null), /invalid-dictionary/);
  assert.throws(() => normalizeDictionary([['a', 'b']]), /invalid-dictionary/);
  assert.throws(() => normalizeDictionary('text'), /invalid-dictionary/);
});

test('normalizeDictionary: يرفض قاموسًا بلا أي مدخلة صالحة', () => {
  assert.throws(() => normalizeDictionary({ a: 1, b: null }), /invalid-dictionary/);
});

test('normalizeDictionary: يرفض تجاوز maxEntries', () => {
  const big = {};
  for (let i = 0; i < 25; i++) big['k' + i] = 'v' + i;
  assert.throws(() => normalizeDictionary(big, { maxEntries: 10 }), /invalid-dictionary/);
});

test('normalizeDictionary: يتجاهل المفاتيح المحجوزة (prototype pollution)', () => {
  const d = normalizeDictionary({ __proto__: 'x', ok: 'جيد' });
  assert.deepEqual(d, { ok: 'جيد' });
  assert.equal(Object.keys(d).includes('__proto__'), false);
});

/* ===== applyCapitalization ===== */
test('applyCapitalization: أول حرف كبير يُعاد تطبيقه', () => {
  assert.equal(applyCapitalization('مرحبا', 'Hello'), 'مرحبا'); // عربية بلا حالة — تبقى
  assert.equal(applyCapitalization('salam', 'Hello'), 'Salam');
});

test('applyCapitalization: كلمة كلها أحرف كبيرة تُترجم كبيرة', () => {
  assert.equal(applyCapitalization('nasa', 'NASA'), 'NASA');
  assert.equal(applyCapitalization('سلاح الفضاء', 'NASA'), 'سلاح الفضاء');
});

test('applyCapitalization: lowercase يبقى بدون تغيير', () => {
  assert.equal(applyCapitalization('Hello', 'hello'), 'Hello');
  assert.equal(applyCapitalization('مرحبا', 'hello'), 'مرحبا');
});

/* ===== translateWithDictionary ===== */
test('ترجمة أساسية مع قاموس', () => {
  const d = { hello: 'مرحبا', world: 'عالم' };
  assert.equal(translateWithDictionary('hello world', d), 'مرحبا عالم');
});

test('حساسية حالة الأحرف: HELLO/hello/Hello نفس النتيجة', () => {
  const d = { hello: 'مرحبا' };
  assert.equal(translateWithDictionary('hello', d), 'مرحبا');
  assert.equal(translateWithDictionary('HELLO', d), 'مرحبا');
  assert.equal(translateWithDictionary('Hello', d), 'مرحبا');
});

test('الحفاظ على علامات الترقيم والمسافات: Hello, world!', () => {
  const d = { hello: 'مرحبا', world: 'عالم' };
  assert.equal(translateWithDictionary('Hello, world!', d), 'مرحبا, عالم!');
});

test('الحفاظ على المسافات المتعددة والمسافات البادئة', () => {
  const d = { hello: 'مرحبا' };
  assert.equal(translateWithDictionary('  hello   world', d), '  مرحبا   world');
  assert.equal(translateWithDictionary('\thello\nworld', d), '\tمرحبا\nworld');
});

test('الكلمات غير الموجودة تبقى كما هي', () => {
  const d = { hello: 'مرحبا' };
  assert.equal(translateWithDictionary('hello xyz', d), 'مرحبا xyz');
});

test('قاموس فارغ/null يعيد النص كما هو', () => {
  assert.equal(translateWithDictionary('hello', null), 'hello');
  assert.equal(translateWithDictionary('hello', {}), 'hello');
});

test('حدود الكلمة: cloudy لا تُترجم بقاموس cloud', () => {
  const d = { cloud: 'سحابة' };
  assert.equal(translateWithDictionary('cloudy sky', d), 'cloudy sky');
});

test('نص عربي مختلط مع إنجليزي وعلامات ترقيم', () => {
  const d = { hello: 'مرحبا' };
  assert.equal(translateWithDictionary('مرحبا, Hello!', d), 'مرحبا, مرحبا!');
});

test('الترجمة مع حركات في المصدر: مُحَمَّد تطابق محمد', () => {
  const d = { محمد: 'Mohammed' };
  assert.equal(translateWithDictionary('مُحَمَّد', d), 'Mohammed');
});

test('قاموس بمفتاح مشكول يطابق النص الساكن', () => {
  const d = { مُحَمَّد: 'Mohammed' };
  assert.equal(translateWithDictionary('محمد', d), 'Mohammed');
});

/* ===== isRtlText ===== */
test('isRtlText: عربي → true', () => {
  assert.equal(isRtlText('مرحبا بالعالم'), true);
  assert.equal(isRtlText('سلام'), true);
});

test('isRtlText: لاتيني → false', () => {
  assert.equal(isRtlText('Hello world'), false);
  assert.equal(isRtlText('12345'), false);
  assert.equal(isRtlText(''), false);
});

test('isRtlText: خليط — أول حرف قوي يحسم', () => {
  assert.equal(isRtlText('مرحبا Hello'), true);
  assert.equal(isRtlText('Hello مرحبا'), false);
});

/* ===== suggest (fuzzy) ===== */
test('suggest: يقترح أقرب مفتاح', () => {
  const d = normalizeDictionary({ hello: 'مرحبا', help: 'مساعدة' });
  const s = suggest(d, 'helo');
  assert.ok(s.length >= 1);
  assert.equal(s[0].key, 'hello');
});

test('suggest: لا اقتراحات لكلمات قصيرة جدًا', () => {
  assert.deepEqual(suggest({ hello: 'x' }, 'he'), []);
});
