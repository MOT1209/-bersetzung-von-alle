// tests/sttLang.test.js — تمرير لغة التفريغ صراحةً (البند I1)
//
// كان sherpa يُنشأ مرة واحدة بـ language:'auto' وtransformers بلا language.
// الكشف التلقائي يخطئ كثيرًا على العربية والتركية، والقياسات المنشورة تُظهر
// فجوة ضخمة بين النماذج على العربية — فتمرير اللغة أرخص مكسب في الدقة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SUPPORTED_STT_LANGS, normalizeLang } = require('../server/audio');

test('اللغات الأربع المستهدفة مدعومة', () => {
  assert.deepEqual([...SUPPORTED_STT_LANGS].sort(), ['ar', 'de', 'en', 'tr']);
});

test('normalizeLang: يقبل اللغات المستهدفة ويطبّعها', () => {
  for (const l of ['ar', 'de', 'tr', 'en']) {
    assert.equal(normalizeLang(l), l);
    assert.equal(normalizeLang(l.toUpperCase()), l, 'يجب ألا تتأثر بحالة الأحرف');
  }
  assert.equal(normalizeLang('ar-SA'), 'ar', 'يجب أخذ المقطع الأول من الوسم');
  assert.equal(normalizeLang('de-DE'), 'de');
});

test('normalizeLang: غير المدعوم يعود auto لا قيمة غير صالحة', () => {
  for (const l of ['fr', 'zz', '', null, undefined, 'xx-YY', 123]) {
    assert.equal(normalizeLang(l), 'auto', `فشل عند: ${JSON.stringify(l)}`);
  }
});
