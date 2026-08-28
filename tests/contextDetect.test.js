// tests/contextDetect.test.js — كشف سياق المحتوى (server/context-detect.js)
// منطق خالص بلا شبكة — يحدّد نوع المحتوى ليُمرَّر كتوجيه للنموذج في الترجمة الذكية.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { detectContext, getContextPrompt, CONTENT_TYPES, SYSTEM_PROMPTS } = require('../server/context-detect');

// ===== الكشف بالنطاق (أعلى ثقة) =====
test('النطاق المعروف يحسم النوع بثقة 0.9', () => {
  const r = detectContext('https://github.com/user/repo', 'anything at all');
  assert.equal(r.contentType, 'technical');
  assert.equal(r.confidence, 0.9);
  assert.equal(r.domain, 'github.com');
});

test('نطاق أكاديمي يُكشف بغضّ النظر عن النص', () => {
  assert.equal(detectContext('https://arxiv.org/abs/1234', 'hello').contentType, 'academic');
});

test('نطاق طبي يُكشف', () => {
  assert.equal(detectContext('https://pubmed.ncbi.nlm.nih.gov/1', '').contentType, 'medical');
});

test('نطاق مُلمَّح إليه كـ general لا يحسم — يُترك لتحليل النص', () => {
  // wikipedia.org ملمَّح كـ general، فالنص هو الذي يقرّر
  const r = detectContext('https://wikipedia.org/wiki/Law', 'court statute defendant plaintiff jurisdiction');
  assert.equal(r.contentType, 'legal');
});

// ===== الكشف بالكلمات المفتاحية =====
test('نص طبي بلا نطاق → medical', () => {
  const r = detectContext('', 'The patient diagnosis requires treatment and clinical therapy dosage');
  assert.equal(r.contentType, 'medical');
  assert.ok(r.confidence > 0.5);
});

test('نص قانوني بلا نطاق → legal', () => {
  const r = detectContext('', 'The court found the defendant liable under the statute and regulation');
  assert.equal(r.contentType, 'legal');
});

test('نص إخباري → news', () => {
  const r = detectContext('', 'Officials announced and confirmed the statement according to the minister');
  assert.equal(r.contentType, 'news');
});

test('كود يفوز بأولوية عالية (+5)', () => {
  const r = detectContext('', 'const x = 1; function foo() { return await bar(); }');
  assert.equal(r.contentType, 'code');
});

// ===== الحالات الحدّية =====
test('نص فارغ ورابط فارغ → general بثقة 0.5', () => {
  const r = detectContext('', '');
  assert.equal(r.contentType, 'general');
  assert.equal(r.confidence, 0.5);
});

test('بلا معاملات إطلاقًا → لا يرمي', () => {
  const r = detectContext();
  assert.equal(r.contentType, 'general');
  assert.equal(r.domain, '');
});

test('رابط غير صالح لا يكسر الكشف', () => {
  const r = detectContext('not a url', 'patient diagnosis treatment clinical');
  assert.equal(r.contentType, 'medical');
});

test('الثقة لا تتجاوز 0.95 مهما كثرت الكلمات', () => {
  const many = CONTENT_TYPES.medical.keywords.join(' ');
  assert.ok(detectContext('', many).confidence <= 0.95);
});

// ===== البيانات الوصفية =====
test('metadata: يكشف كتل الكود وعدّ الكلمات', () => {
  const r = detectContext('', 'here is code:\n```\nconst a = 1\n```');
  assert.equal(r.metadata.hasCodeBlocks, true);
  assert.ok(r.metadata.wordCount > 0);
});

test('metadata: يكشف المصطلحات التقنية', () => {
  assert.equal(detectContext('', 'we deploy with Docker on AWS').metadata.hasTechnicalTerms, true);
  assert.equal(detectContext('', 'a quiet walk in the park').metadata.hasTechnicalTerms, false);
});

test('metadata: عدّ الكلمات صفر لنص فارغ', () => {
  assert.equal(detectContext('', '   ').metadata.wordCount, 0);
});

test('النص يُقتطع عند 2000 حرف (لا يُحلَّل ما بعده)', () => {
  // كلمة طبية بعد الحد لا يجب أن تؤثر
  const r = detectContext('', 'x'.repeat(2100) + ' patient diagnosis clinical therapy');
  assert.equal(r.contentType, 'general');
});

// ===== التوجيهات =====
test('كل نوع محتوى له توجيه نظام', () => {
  for (const type of Object.keys(CONTENT_TYPES)) {
    assert.equal(typeof SYSTEM_PROMPTS[type], 'string', `التوجيه مفقود للنوع ${type}`);
    assert.ok(SYSTEM_PROMPTS[type].length > 0);
  }
});

test('getContextPrompt يعيد توجيه السياق', () => {
  const ctx = detectContext('https://github.com/a/b', '');
  assert.equal(getContextPrompt(ctx), SYSTEM_PROMPTS.technical);
});

test('getContextPrompt يسقط إلى general عند غياب التوجيه', () => {
  assert.equal(getContextPrompt({}), SYSTEM_PROMPTS.general);
});
