// tests/tashkeel.test.js — اختبارات وحدة لمحرك التشكيل (بلا شبكة إطلاقًا — لا Gemini أبدًا)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');

// إجبار: نُفرغ المفتاح فورًا قبل استيراد التاشكيل حتى لا يُستدعى Gemini في أي اختبار
// (حتى لو وُجد مفتاح حقيقي في .env) — يُستعاد في after()
const config = require('../server/config');
const originalKey = config.GEMINI_API_KEY;
config.GEMINI_API_KEY = '';

const { diacritize, diacritizeBasic } = require('../server/tashkeel');

after(() => {
  config.GEMINI_API_KEY = originalKey;
});

// ===== diacritizeBasic =====

test('diacritizeBasic: يضيف سكونًا ويحفظ عدد الكلمات', () => {
  const out = diacritizeBasic('مرحبا بالعالم');
  assert.ok(/[\u0600-\u06FF]/.test(out), 'النتيجة يجب أن تحوي حروفًا عربية');
  assert.ok(out.includes('\u0652'), `ينقص السكون: ${JSON.stringify(out)}`);
  assert.equal(out.split(/\s+/).length, 2, 'عدد الكلمات محفوظ');
});

test('diacritizeBasic: لا يلمس اللاتيني/الأرقام', () => {
  assert.equal(diacritizeBasic('hello 123'), 'hello 123');
  assert.equal(diacritizeBasic(''), '');
  assert.equal(diacritizeBasic('https://example.com/نص'), 'https://example.com/نص');
});

test('diacritizeBasic: شدة على الحرف المكرر', () => {
  // ش د د ة — الدال مكررة (هروب يونيكود لضمان التكرار عبر الترميزات)
  const out = diacritizeBasic('\u0634\u062F\u062F\u0629');
  assert.ok(out.includes('\u0651'), `ينقص الشدة: ${JSON.stringify(out)}`);
});

// ===== diacritize =====

test('diacritize بلا مفتاح يعمل قواعديًا (engine: basic)', async () => {
  const saved = config.GEMINI_API_KEY;
  config.GEMINI_API_KEY = ''; // ضمان: لا شبكة في هذا الاختبار
  try {
    const res = await diacritize('مرحبا بالعالم');
    assert.equal(res.engine, 'basic');
    assert.ok(res.diacritized.includes('\u0652'), `ينقص السكون: ${JSON.stringify(res.diacritized)}`);
  } finally {
    config.GEMINI_API_KEY = saved;
  }
});

test('diacritize: الأسطر غير العربية تبقى حرفيًا', async () => {
  const { diacritized } = await diacritize('hello\nمرحبا بالعالم\n123');
  const lines = diacritized.split('\n');
  assert.equal(lines[0], 'hello', 'السطر اللاتيني يجب أن يبقى حرفيًا');
  assert.equal(lines[2], '123', 'سطر الأرقام يجب أن يبقى حرفيًا');
  assert.ok(/[\u0600-\u06FF]/.test(lines[1]), 'السطر العربي يجب أن يُعالج');
  assert.ok(lines[1].includes('\u0652'), 'السطر العربي يجب أن يُشكَّل');
});

// ===== نقطة API عبر HTTP (خادم محلي بلا server.js — يُركَّب الراوتر مباشرة) =====
const app = express();
app.use('/api', require('../server/routes-tashkeel'));

test('POST /api/tashkeel: نص عربي → 200 + diacritized؛ فارغ → 400', async () => {
  const server = app.listen(0);
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;

    const ok = await fetch(`${base}/api/tashkeel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'مرحبا بالعالم' }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(typeof body.diacritized, 'string');
    assert.ok(body.diacritized.length > 0, 'diacritized يجب ألا تكون فارغة');
    assert.equal(body.engine, 'basic');

    const bad = await fetch(`${base}/api/tashkeel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    assert.equal(bad.status, 400);
    const errBody = await bad.json();
    assert.equal(errBody.error, 'invalid-text');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
