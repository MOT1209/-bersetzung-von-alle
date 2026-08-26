// tests/localvideo.test.js — اختبارات فيديو محلي (routes-local-video.js) بلا شبكة
// تزييف: transcribeMediaFile + translateLines + impl.probeDuration — لا STT حقيقي، لا ffmpeg
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const audioMod = require('../server/audio');
const translateRoutes = require('../server/routes-translate');
const localVideo = require('../server/routes-local-video');

// ===== تزييفات عامة (تُستعاد بعد الاختبارات) =====
const origTranscribe = audioMod.transcribeMediaFile;
const origTranslateLines = translateRoutes.translateLines;
const origProbe = localVideo.impl.probeDuration;

const FAKE_CHUNKS = [
  { start: 0, duration: 2.5, text: 'Hello world' },
  { start: 2.5, duration: 3.0, text: 'Second line' },
];

before(() => {
  audioMod.transcribeMediaFile = async () => ({ chunks: FAKE_CHUNKS });
  translateRoutes.translateLines = async (lines, targetLang) => ({
    sourceLang: 'en',
    captions: lines.map((l) => ({ ...l, translated: 'تر: ' + l.original })),
    cached: false,
  });
  localVideo.impl.probeDuration = async () => 5.5;
});
after(() => {
  audioMod.transcribeMediaFile = origTranscribe;
  translateRoutes.translateLines = origTranslateLines;
  localVideo.impl.probeDuration = origProbe;
});

// تطبيق اختباري صغير (لا يعتمد على تركيب server.js)
const app = express();
app.use('/api', localVideo);

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

function b64(s) {
  return Buffer.from(s).toString('base64');
}

test('رفض صيغة غير مدعومة → 400 invalid-format', async () => {
  const res = await fetch(`${baseUrl}/api/video-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'exe', content: b64('x') }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-format');
});

test('نقص content → 400 invalid-file', async () => {
  const res = await fetch(`${baseUrl}/api/video-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ext: 'mp4' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-file');
});

test('نجاح: رفع mp4 → 200 مع captions مترجمة وميتا', async () => {
  const res = await fetch(`${baseUrl}/api/video-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ext: 'mp4', content: b64('fake-video-bytes'), targetLang: 'ar' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, 'local-video');
  assert.equal(body.sourceLang, 'en');
  assert.equal(body.captions.length, 2);
  assert.equal(body.captions[0].translated, 'تر: Hello world');
  assert.equal(body.captions[0].start, 0);
  assert.equal(body.meta.source, 'audio');
});

test('فيديو أطول من الحد → 422 video-too-long', async () => {
  localVideo.impl.probeDuration = async () => 60 * 60; // ساعة كاملة
  try {
    const res = await fetch(`${baseUrl}/api/video-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ext: 'webm', content: b64('x'), targetLang: 'ar' }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'video-too-long');
  } finally {
    localVideo.impl.probeDuration = async () => 5.5;
  }
});

test('تفريغ فارغ → 422 audio-empty', async () => {
  const orig = audioMod.transcribeMediaFile;
  audioMod.transcribeMediaFile = async () => ({ chunks: [] });
  try {
    const res = await fetch(`${baseUrl}/api/video-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ext: 'mov', content: b64('x'), targetLang: 'ar' }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'audio-empty');
  } finally {
    audioMod.transcribeMediaFile = orig;
  }
});

test('تنظيف الملفات المؤقتة بعد النجاح', async () => {
  const beforeFiles = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('aralink-local-'));
  await fetch(`${baseUrl}/api/video-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ext: 'm4a', content: b64('x'), targetLang: 'ar' }),
  });
  const afterFiles = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('aralink-local-'));
  assert.deepEqual(afterFiles, beforeFiles, 'لا ملفات مؤقتة جديدة متبقية');
});
