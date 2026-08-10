// tests/translate.test.js — اختبارات وحدة لمحرك الترجمة (تقسيم النص + قابلية الترجمة)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chunkText, isUntranslatable } = require('../server/translate');

// ===== chunkText =====

test('chunkText: يقسم الفقرات المنفصلة بسطرين فارغين', () => {
  // maxChars صغير (3) بحيث لا تتسع الفقرتان معًا في جزء واحد
  const chunks = chunkText('أ\n\nب', 3);
  assert.deepEqual(chunks, ['أ', 'ب']);
});

test('chunkText: يحترم حد maxChars في كل جزء', () => {
  // نص طويل من جمل قصيرة — كل جملة داخل الحد لكن المجموع أكبر بكثير
  const long = 'الجملة التجريبية رقم 000. '.repeat(30);
  const chunks = chunkText(long, 100);
  assert.ok(chunks.length > 1, 'يجب أن يُقسَّم النص إلى أكثر من جزء');
  for (const c of chunks) {
    assert.ok(c.length <= 100, `جزء طوله ${c.length} تجاوز الحد 100`);
  }
});

test('chunkText: يقسم الفقرة الطويلة على حدود الجمل', () => {
  const text = 'الجملة الأولى. الجملة الثانية! الجملة الثالثة؟';
  // maxChars = 14: كل جملة (13-14 حرفًا) وحدها، ولا تتسع جملتان معًا في جزء
  const chunks = chunkText(text, 14);
  assert.deepEqual(chunks, ['الجملة الأولى.', 'الجملة الثانية!', 'الجملة الثالثة؟']);
});

test('chunkText: نص فارغ يعيد جزءًا واحدًا فارغًا', () => {
  assert.deepEqual(chunkText(''), ['']);
  assert.deepEqual(chunkText('   '), ['   ']);
});

test('chunkText: نص قصير ضمن الحد يبقى جزءًا واحدًا', () => {
  assert.deepEqual(chunkText('مرحبا بالعالم'), ['مرحبا بالعالم']);
});

// ===== isUntranslatable =====

test('isUntranslatable: سطر فارغ', () => {
  assert.equal(isUntranslatable(''), true);
  assert.equal(isUntranslatable('   '), true);
});

test('isUntranslatable: رابط فقط', () => {
  assert.equal(isUntranslatable('https://example.com/page'), true);
  assert.equal(isUntranslatable('https://www.youtube.com/watch?v=abc'), true);
});

test('isUntranslatable: ختم زمني فقط', () => {
  assert.equal(isUntranslatable('12:34'), true);
  assert.equal(isUntranslatable('1:02:03'), true);
  assert.equal(isUntranslatable('00:00:01,500'), true);
});

test('isUntranslatable: وسم موسيقى', () => {
  assert.equal(isUntranslatable('[Music]'), true);
  assert.equal(isUntranslatable('[Applause]'), true);
  assert.equal(isUntranslatable('[♪]'), true);
});

test('isUntranslatable: نص عادي قابل للترجمة', () => {
  assert.equal(isUntranslatable('hello world'), false);
  assert.equal(isUntranslatable('مرحبا بالعالم'), false);
});

// ===== حماية من انحدار: كلمة واحدة تنتهي بنقطة ليست كودًا =====
// أسطر مثل "Yes." و"Okay." من أكثر أسطر الترجمة شيوعًا. قاعدة «المسار التقني»
// كانت تصنّفها كودًا (بلا مسافات + تحتوي '.') فتبقى إنجليزية داخل ترجمة عربية.
test('isUntranslatable: كلمة مفردة تنتهي بنقطة تُترجَم', () => {
  for (const s of ['Yes.', 'No.', 'Okay.', 'Hello.', 'Really.', 'Stop.', 'Mr.', 'U.S.']) {
    assert.equal(isUntranslatable(s), false, `صُنّف كودًا خطأً: ${s}`);
  }
});

test('isUntranslatable: مسار/ملف/كود حقيقي لا يُترجَم', () => {
  for (const s of ['/usr/bin/env', 'file.txt', 'src\\index.js', '<div>', 'const x = 1;', 'npm install']) {
    assert.equal(isUntranslatable(s), true, `كان يجب اعتباره كودًا: ${s}`);
  }
});
