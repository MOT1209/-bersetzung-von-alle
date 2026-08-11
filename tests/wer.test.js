// tests/wer.test.js — قياس نسبة خطأ الكلمات (البند I1)
// بلا هذا القياس تبقى كل مقارنة بين النماذج انطباعًا لا رقمًا.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, wordErrorRate, levenshtein } = require('../server/wer');

// ===== ليفنشتاين =====

test('levenshtein: الحالات الحدّية', () => {
  assert.equal(levenshtein([], []), 0);
  assert.equal(levenshtein([], ['a', 'b']), 2);
  assert.equal(levenshtein(['a', 'b'], []), 2);
  assert.equal(levenshtein(['a'], ['a']), 0);
});

test('levenshtein: استبدال وحذف وإدراج', () => {
  assert.equal(levenshtein(['a', 'b', 'c'], ['a', 'x', 'c']), 1); // استبدال
  assert.equal(levenshtein(['a', 'b', 'c'], ['a', 'c']), 1);      // حذف
  assert.equal(levenshtein(['a', 'c'], ['a', 'b', 'c']), 1);      // إدراج
});

// ===== التطبيع العربي =====

test('العربية: التشكيل لا يُحتسب خطأً', () => {
  const r = wordErrorRate('مَرْحَبًا بِالْعَالَمِ', 'مرحبا بالعالم', 'ar');
  assert.equal(r.wer, 0, 'التشكيل وحده يجب ألا ينتج خطأً');
});

test('العربية: صور الألف والياء والتاء المربوطة موحّدة', () => {
  assert.equal(normalize('أحمد إبراهيم آمال', 'ar'), 'احمد ابراهيم امال');
  assert.equal(normalize('على', 'ar'), normalize('علي', 'ar'));
  assert.equal(normalize('مدرسة', 'ar'), normalize('مدرسه', 'ar'));
});

test('العربية: التطويل يُزال', () => {
  assert.equal(wordErrorRate('كتاب', 'كـــتاب', 'ar').wer, 0);
});

test('العربية: خطأ حقيقي يُحتسب', () => {
  // ثلاث كلمات في المرجع، كلمة واحدة مختلفة ⇒ 1/3
  const r = wordErrorRate('ذهب الولد الى المدرسة', 'ذهب الرجل الى المدرسة', 'ar');
  assert.equal(r.ref, 4);
  assert.equal(r.distance, 1);
  assert.ok(Math.abs(r.wer - 0.25) < 1e-9, `wer=${r.wer}`);
});

// ===== التطبيع التركي =====

test('التركية: I تُصغَّر إلى ı لا إلى i', () => {
  // toLowerCase العام يعطي 'i' وهو خطأ في التركية — لولا المعالجة لاحتُسب خطأ
  assert.equal(normalize('IŞIK', 'tr'), 'ışık');
  assert.equal(normalize('İSTANBUL', 'tr'), 'istanbul');
});

test('التركية: اختلاف حالة الأحرف وحده لا ينتج خطأً', () => {
  assert.equal(wordErrorRate('IŞIK İSTANBUL', 'ışık istanbul', 'tr').wer, 0);
});

test('غير التركية: I تبقى i (السلوك العام)', () => {
  assert.equal(normalize('BIG', 'en'), 'big');
});

// ===== عام =====

test('الترقيم والمسافات الزائدة لا تُحتسب', () => {
  assert.equal(wordErrorRate('Hello, world!', '  hello   world  ', 'en').wer, 0);
  assert.equal(wordErrorRate('مرحبا، كيف حالك؟', 'مرحبا كيف حالك', 'ar').wer, 0);
});

test('الألمانية: اختلاف حالة الأحرف لا يُحتسب', () => {
  assert.equal(wordErrorRate('Guten Morgen', 'guten morgen', 'de').wer, 0);
});

test('مرجع فارغ: ناتج فارغ ⇒ 0، وناتج غير فارغ ⇒ 1', () => {
  assert.equal(wordErrorRate('', '', 'ar').wer, 0);
  assert.equal(wordErrorRate('   ', 'كلام زائد', 'ar').wer, 1);
});

test('WER قد يتجاوز 1 عند الهلوسة (سلوك مقصود لا خطأ حسابي)', () => {
  // النماذج الضعيفة تكرّر وتضيف كلامًا — الأرقام المنشورة عن whisper-tiny
  // على العربية تجاوزت 100% لهذا السبب بالضبط
  const r = wordErrorRate('نعم', 'نعم نعم نعم نعم نعم', 'ar');
  assert.ok(r.wer > 1, `wer=${r.wer} يجب أن يتجاوز 1`);
});

test('تطابق تام ⇒ صفر مهما كانت اللغة', () => {
  for (const [ref, lang] of [['مرحبا بك', 'ar'], ['merhaba dünya', 'tr'], ['hallo welt', 'de'], ['hello world', 'en']]) {
    assert.equal(wordErrorRate(ref, ref, lang).wer, 0, lang);
  }
});
