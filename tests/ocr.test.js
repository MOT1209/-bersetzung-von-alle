// tests/ocr.test.js — اختبارات نقطة OCR (بلا شبكة إطلاقًا — لا tesseract حقيقي)
// نزيّف require('../server/ocr').recognizeImage و ensureTraineddata وقت التنفيذ
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const path = require('path');
const express = require('express');

// ===== تزييف محرك OCR — routes-ocr يصل إليه وقت التنفيذ (require داخل الدالة) =====
const ocr = require('../server/ocr');
const REAL = {
  recognizeImage: ocr.recognizeImage,
  ensureTraineddata: ocr.ensureTraineddata,
};
ocr.recognizeImage = async () => ({ text: 'مرحبا', confidence: 90 });
ocr.ensureTraineddata = () => {};

after(() => {
  ocr.recognizeImage = REAL.recognizeImage;
  ocr.ensureTraineddata = REAL.ensureTraineddata;
});

// ===== خادم HTTP محلي بلا server.js — يُركَّب الراوتر مباشرة =====
const app = express();
app.use('/api', require('../server/routes-ocr'));

// أدوات مساعدة
function post(base, body) {
  return fetch(`${base}/api/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function startServer() {
  const server = app.listen(0);
  await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function stopServer(server) {
  await new Promise((r) => server.close(r));
}

// ===== الاختبارات =====

test('POST /api/ocr: صيغة غير مدعومة (pdf) → 400 invalid-format', async () => {
  const { server, base } = await startServer();
  try {
    const res = await post(base, { content: 'aGVsbG8=', ext: 'pdf' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid-format');
  } finally {
    await stopServer(server);
  }
});

test('POST /api/ocr: نقص/فارغ content → 400 invalid-file', async () => {
  const { server, base } = await startServer();
  try {
    const missing = await post(base, { ext: 'png' });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error, 'invalid-file');

    const empty = await post(base, { content: '', ext: 'png' });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, 'invalid-file');
  } finally {
    await stopServer(server);
  }
});

test('POST /api/ocr: نجاح → 200 مع text و confidence من التزييف', async () => {
  const { server, base } = await startServer();
  try {
    const res = await post(base, { content: 'aGVsbG8=', ext: 'png' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.text, 'مرحبا');
    assert.equal(body.confidence, 90);
  } finally {
    await stopServer(server);
  }
});

test('POST /api/ocr: ocr-not-ready → 503 عندما ترمي ensureTraineddata', async () => {
  const { server, base } = await startServer();
  const orig = ocr.ensureTraineddata;
  ocr.ensureTraineddata = () => {
    const e = new Error('traineddata ناقصة');
    e.code = 'ocr-not-ready';
    throw e;
  };
  try {
    const res = await post(base, { content: 'aGVsbG8=', ext: 'png' });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'ocr-not-ready');
  } finally {
    ocr.ensureTraineddata = orig;
    await stopServer(server);
  }
});

test('POST /api/ocr: نتيجة فارغة → 422 ocr-empty', async () => {
  const { server, base } = await startServer();
  const orig = ocr.recognizeImage;
  ocr.recognizeImage = async () => ({ text: '', confidence: 0 });
  try {
    const res = await post(base, { content: 'aGVsbG8=', ext: 'png' });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'ocr-empty');
  } finally {
    ocr.recognizeImage = orig;
    await stopServer(server);
  }
});

test('node --check: ملفات OCR سليمة الصياغة', async () => {
  const files = [
    path.join(__dirname, '..', 'server', 'ocr.js'),
    path.join(__dirname, '..', 'server', 'routes-ocr.js'),
    path.join(__dirname, '..', 'scripts', 'download-ocr-data.js'),
  ];
  for (const f of files) {
    await new Promise((resolve, reject) => {
      execFile(process.execPath, ['--check', f], (err) => (err ? reject(err) : resolve()));
    });
  }
});
