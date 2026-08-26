// tests/pdf.test.js — اختبارات مستخرج نصوص PDF (بدون مكتبات خارجية — zlib مدمج فقط)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { extractPdfText, extractPdfTitle } = require('../server/pdf');

// ===== بناء PDF مصغّر يدويًا داخل الاختبار =====
// يُنشئ ملف PDF فيه دفق محتوى واحد: مضغوطًا بـ FlateDecode أو نصًا خامًا
function buildTinyPdf(text, { compress = true, asArray = false } = {}) {
  let content;
  if (asArray) {
    // مصفوفة TJ: [ (كلمة) -100 (أخرى) ... ] TJ
    const arr = text.split(' ').map((w) => `(${w}) -100`).join(' ');
    content = `BT /F1 12 Tf 72 720 Td [ ${arr} ] TJ ET`;
  } else {
    content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  }

  const streamData = Buffer.from(content, 'latin1');
  const filter = compress ? '/Filter /FlateDecode ' : '';
  const streamBytes = compress ? zlib.deflateSync(streamData) : streamData;

  const head =
    '%PDF-1.4\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n' +
    `4 0 obj << /Length ${streamBytes.length} ${filter}>> stream\n`;
  const tail =
    '\nendstream endobj\n' +
    '5 0 obj << /Title (Test Doc) >> endobj\n' +
    'trailer << /Root 1 0 R /Info 5 0 R >>\n%%EOF\n';

  return Buffer.concat([Buffer.from(head, 'latin1'), streamBytes, Buffer.from(tail, 'latin1')]);
}

// نص أطول من حد 50 حرفًا حتى لا تُعتبر النتيجة فارغة
const LONG_TEXT = 'Hello World. This is a longer PDF text content that we expect to extract.';

test('extractPdfText: يستخرج النص من دفق FlateDecode مضغوط', () => {
  const pdf = buildTinyPdf(LONG_TEXT);
  const text = extractPdfText(pdf);
  assert.ok(text.includes('Hello World'), `النص المستخرج: "${text}"`);
  assert.ok(text.includes('longer PDF text content'), `النص المستخرج: "${text}"`);
});

test('extractPdfText: يستخرج النص من مصفوفة TJ', () => {
  const pdf = buildTinyPdf(LONG_TEXT, { asArray: true });
  const text = extractPdfText(pdf);
  assert.ok(text.includes('Hello World'), `النص المستخرج: "${text}"`);
  assert.ok(text.includes('expect to extract'), `النص المستخرج: "${text}"`);
});

test('extractPdfText: يدعم الدفق غير المضغوط (نص خام)', () => {
  const pdf = buildTinyPdf(LONG_TEXT, { compress: false });
  const text = extractPdfText(pdf);
  assert.ok(text.includes('Hello World'), `النص المستخرج: "${text}"`);
});

test('extractPdfText: نص قصير جدًا (< 50 حرفًا) يعيد سلسلة فارغة', () => {
  const pdf = buildTinyPdf('tiny text');
  assert.equal(extractPdfText(pdf), '');
});

test('extractPdfText: Buffer فارغ أو null يعيد سلسلة فارغة', () => {
  assert.equal(extractPdfText(Buffer.alloc(0)), '');
  assert.equal(extractPdfText(null), '');
});

test('extractPdfText: محتوى غير PDF يعيد سلسلة فارغة', () => {
  assert.equal(extractPdfText(Buffer.from('just some plain bytes, not a pdf at all', 'latin1')), '');
});

test('extractPdfTitle: يستخرج العنوان من قاموس معلومات PDF', () => {
  const pdf = buildTinyPdf(LONG_TEXT);
  assert.equal(extractPdfTitle(pdf), 'Test Doc');
});

test('extractPdfTitle: بدون عنوان يعيد سلسلة فارغة', () => {
  assert.equal(extractPdfTitle(Buffer.from('nothing here', 'latin1')), '');
});
