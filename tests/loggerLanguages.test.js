// tests/loggerLanguages.test.js — آخر وحدتين بلا تغطية: logger.js و languages.js
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-logger-'));
process.env.LOG_FILE = path.join(tmpDir, 'errors.log');

const { logError, logInfo } = require('../server/logger');
const {
  getAllLanguages, isSupportedLang, isTtsSupported, langName, LANGUAGES, TTS_LANGS,
} = require('../server/languages');

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// ===== logger =====
test('logError: يكتب سطرًا بالسياق والرسالة والتوقيت', async () => {
  await logError('engine:google', 'HTTP 429');
  const txt = fs.readFileSync(process.env.LOG_FILE, 'utf8');
  assert.match(txt, /engine:google: HTTP 429/);
  assert.match(txt, /^\[\d{4}-\d{2}-\d{2}T/m); // طابع ISO
});

test('logError: يقتطع الرسائل الطويلة عند 300 حرف', async () => {
  await logError('ctx', 'x'.repeat(500));
  const lines = fs.readFileSync(process.env.LOG_FILE, 'utf8').trim().split('\n');
  assert.ok(lines[lines.length - 1].length < 400);
});

test('logInfo: يوسم السطر بـ [info]', async () => {
  await logInfo('smart', 'ok');
  assert.match(fs.readFileSync(process.env.LOG_FILE, 'utf8'), /smart: \[info\] ok/);
});

test('logError: لا يرمي أبدًا حتى بمسار غير صالح (احتياطي لا يكسر الطلب)', async () => {
  const orig = process.env.LOG_FILE;
  process.env.LOG_FILE = path.join(tmpDir, '\0bad', 'x.log');
  try {
    await logError('ctx', 'msg'); // يجب ألا يرمي
  } finally {
    process.env.LOG_FILE = orig;
  }
});

test('logError: يتحمّل رسالة فارغة/غائبة', async () => {
  await logError('ctx');
  await logError('ctx', null);
});

// ===== languages =====
test('getAllLanguages: قائمة بصيغة {code,nameAr} — الشكل الذي تتوقعه الواجهة', () => {
  const all = getAllLanguages();
  assert.ok(Array.isArray(all), 'يجب أن تكون مصفوفة (populateLangSelector يعتمد ذلك)');
  assert.ok(all.length >= 100, `توقعنا 100+ لغة، وجدنا ${all.length}`);
  for (const l of all) {
    assert.equal(typeof l.code, 'string');
    assert.equal(typeof l.nameAr, 'string');
    assert.ok(l.code.length > 0 && l.nameAr.length > 0);
  }
});

test('لا رموز مكرّرة', () => {
  const codes = LANGUAGES.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('اللغات المستهدفة موجودة', () => {
  for (const c of ['ar', 'en', 'fr', 'de', 'tr', 'es', 'ur']) {
    assert.ok(isSupportedLang(c), `اللغة ${c} مفقودة`);
  }
});

test('isSupportedLang: يرفض غير المدعوم', () => {
  assert.equal(isSupportedLang('xx'), false);
  assert.equal(isSupportedLang(''), false);
  assert.equal(isSupportedLang(undefined), false);
});

test('getAllLanguages: كل لغة تحمل علم tts — الواجهة تُخفي زر الدبلجة بناءً عليه', () => {
  const all = getAllLanguages();
  for (const l of all) assert.equal(typeof l.tts, 'boolean', `اللغة ${l.code} بلا علم tts`);
  assert.equal(all.find((l) => l.code === 'ar').tts, true);
  assert.equal(all.find((l) => l.code === 'bho').tts, false);
});

test('isTtsSupported: أضيق من isSupportedLang — لغات ترجمة بلا نطق', () => {
  // هذا الفارق هو سبب وجود الدالة: الخلط بينهما كان يعطي دبلجة صامتة
  for (const c of ['bho', 'ckb', 'mni', 'doi', 'nso', 'ee', 'kri', 'ilo', 'dv']) {
    assert.ok(isSupportedLang(c), `${c} يجب أن تكون لغة ترجمة مدعومة`);
    assert.equal(isTtsSupported(c), false, `${c} لا ينطقها gTTS`);
  }
  for (const c of ['ar', 'en', 'tr', 'fr', 'de', 'ur']) {
    assert.equal(isTtsSupported(c), true, `${c} يجب أن تكون مدعومة نطقًا`);
  }
  assert.equal(isTtsSupported(undefined), false);
});

test('كل لغة نطق هي أيضًا لغة ترجمة — لا رموز يتيمة', () => {
  for (const c of TTS_LANGS) {
    assert.ok(isSupportedLang(c), `رمز النطق ${c} غير موجود في قائمة الترجمة`);
  }
});

test('langName: اسم عربي للمدعوم، والرمز نفسه لغيره', () => {
  assert.equal(langName('ar'), 'العربية');
  assert.equal(langName('en'), 'الإنجليزية');
  assert.equal(langName('zz'), 'zz');
});
