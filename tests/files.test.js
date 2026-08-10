// tests/files.test.js — اختبارات استيراد/تصدير الملفات (بلا شبكة — حقن دالة ترجمة)
// ملاحظة: files.js/routes-file.js يستدعيان translate.translateText وقت التنفيذ،
// لذا يمكن تزييفه هنا بنجاح (require('../server/translate') يقرأ config الذي يقرأ
// .env — لا مشكلة، لكن لا تُستدعى أي شبكة في الاختبارات أبدًا).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');

const files = require('../server/files');
const translate = require('../server/translate'); // للتزييف وقت التنفيذ

// دالة ترجمة مزيفة: ترفع النص إلى أحرف كبيرة (بلا شبكة)
const fakeTranslate = async (t) => String(t).toUpperCase();

// ===== 1) parseSubtitle — SRT =====

test('parseSubtitle: SRT (3 مقاطع) → توقيتات ونصوص صحيحة', () => {
  const srt =
    '1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n' +
    '2\n00:00:05,500 --> 00:00:07,250\nSecond line\nwith more\n\n' +
    '3\n00:01:00,000 --> 00:01:02,000\nThird';
  const { segments } = files.parseSubtitle(srt, 'srt');
  assert.equal(segments.length, 3);
  assert.equal(segments[0].start, 1);
  assert.equal(segments[0].end, 4);
  assert.equal(segments[0].text, 'Hello world');
  assert.equal(segments[1].start, 5.5);
  assert.equal(segments[1].end, 7.25);
  assert.equal(segments[1].text, 'Second line\nwith more');
  assert.equal(segments[2].start, 60);
  assert.equal(segments[2].end, 62);
});

// ===== 2) parseSubtitle — VTT (WEBVTT + NOTE) =====

test('parseSubtitle: VTT يتجاهل WEBVTT وNOTE وسمات التوقيت', () => {
  const vtt =
    'WEBVTT\n\n' +
    'NOTE this is a note\nthat spans lines\n\n' +
    '00:00:01.000 --> 00:00:04.000 align:start\nHello\n\n' +
    '00:00:05.000 --> 00:00:06.000\nWorld';
  const { segments } = files.parseSubtitle(vtt, 'vtt');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 1);
  assert.equal(segments[0].text, 'Hello');
  assert.equal(segments[1].start, 5);
  assert.equal(segments[1].text, 'World');
});

// ===== 3) buildSubtitle — تنسيق الوقت SRT/VTT =====

test('buildSubtitle: SRT بفاصلة وVTT بنقطة مع رأس WEBVTT', () => {
  const segments = [{ start: 1, end: 4, text: 'Hi' }];
  const srt = files.buildSubtitle(segments, 'srt');
  assert.ok(srt.includes('00:00:01,000 --> 00:00:04,000'), srt);
  assert.ok(srt.includes('Hi'));
  const vtt = files.buildSubtitle(segments, 'vtt');
  assert.ok(vtt.startsWith('WEBVTT'), vtt);
  assert.ok(vtt.includes('00:00:01.000 --> 00:00:04.000'), vtt);
});

// ===== 4) extractText — txt =====

test('extractText: txt يعيد النص كما هو', async () => {
  const { text, format } = await files.extractText(Buffer.from('مرحبا', 'utf8'), 'txt');
  assert.equal(text, 'مرحبا');
  assert.equal(format, 'txt');
});

// ===== 5) translateFileContent — txt عبر دالة مزيفة =====

test('translateFileContent: txt يُترجم النص الكامل عبر دالة مزيفة', async () => {
  const r = await files.translateFileContent('hello\nworld', 'txt', 'ar', fakeTranslate);
  assert.equal(r.translated, 'HELLO\nWORLD');
  assert.equal(r.stats.items, 1);
});

// ===== 6) translateFileContent — SRT (توقيتات محفوظة) =====

test('translateFileContent: SRT يحافظ على التوقيتات ويترجم النصوص', async () => {
  const srt = '1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:06,000\nBye';
  const r = await files.translateFileContent(srt, 'srt', 'ar', fakeTranslate);
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].start, 1);
  assert.equal(r.segments[0].end, 4);
  assert.equal(r.segments[0].text, 'HELLO WORLD');
  assert.equal(r.segments[1].text, 'BYE');
  assert.ok(r.translated.includes('00:00:01,000 --> 00:00:04,000'));
  assert.ok(r.translated.includes('HELLO WORLD'));
  assert.ok(r.translated.includes('BYE'));
});

// ===== 7) translateFileContent — JSON (مفاتيح وأرقام محفوظة) =====

test('translateFileContent: JSON يحفظ المفاتيح والأرقام ويترجم القيم النصية فقط', async () => {
  const json = JSON.stringify({ name: 'hello', meta: { tags: ['alpha', 'beta'], short: 'x' }, count: 3, active: true });
  const r = await files.translateFileContent(json, 'json', 'ar', fakeTranslate);
  assert.deepEqual(r.structure, { name: 'HELLO', meta: { tags: ['ALPHA', 'BETA'], short: 'x' }, count: 3, active: true });
  const parsed = JSON.parse(r.translated);
  assert.equal(parsed.name, 'HELLO');
  assert.equal(parsed.meta.tags[0], 'ALPHA');
  assert.equal(parsed.count, 3); // الأرقام لا تُترجم
  assert.equal(parsed.meta.short, 'x'); // النص القصير (حرف واحد) لا يُترجم
});

// ===== 8) translateFileContent — CSV (الخلايا المقتبسة تُبنى من جديد) =====

test('translateFileContent: CSV يعيد بناء الخلايا المقتبسة', async () => {
  const csv = 'alpha,beta\n"x,y",zeta';
  const r = await files.translateFileContent(csv, 'csv', 'ar', fakeTranslate);
  const lines = r.translated.split('\n');
  assert.equal(lines[0], 'ALPHA,BETA');
  assert.equal(lines[1], '"X,Y",ZETA'); // الفاصلة داخل الخلية تتطلب اقتباسًا
  assert.equal(r.stats.items, 4); // alpha,beta,x,y,zeta → 4 قيم فريدة
});

// ===== 9) buildExport — docx (PK + فك عبر jszip) =====

test('buildExport: docx يبدأ ببايتات PK ويفك عبر jszip ويحتوي النص', async () => {
  const { buffer, mime } = await files.buildExport('docx', { text: 'Hello docx' });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  assert.ok(mime.includes('wordprocessingml'));
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('Hello docx'));
});

// ===== 10) extractText — xlsx (مصنف صغير عبر exceljs) =====

test('extractText: xlsx يعيد محتوى الخلايا من مصنف صغير', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Name', 'Value']);
  ws.addRow(['Hello', 42]);
  const buf = await wb.xlsx.writeBuffer();
  const { rows, text } = await files.extractText(Buffer.from(buf), 'xlsx');
  assert.ok(rows.some((r) => r.includes('Hello')), JSON.stringify(rows));
  assert.ok(text.includes('Hello'));
  assert.ok(text.includes('42'));
});

// ===== 11+12) نقاط API عبر خادم محلي (تزييف translateText) =====

const app = require('../server/server');
const originalTranslateText = translate.translateText;
let server;
let baseUrl;

before(async () => {
  // تزييف محرك الترجمة بدالة محلية — لا شبكة أبدًا
  translate.translateText = async (t) => String(t).toUpperCase();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  translate.translateText = originalTranslateText; // استعادة المحرك الحقيقي
  if (server) await new Promise((r) => server.close(r));
});

test('POST /api/translate-file: يترجم txt مرسلاً base64 ويعيد البنية', async () => {
  const res = await fetch(`${baseUrl}/api/translate-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'txt', content: Buffer.from('hi').toString('base64'), targetLang: 'ar' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.format, 'txt');
  assert.equal(body.translated, 'HI');
  assert.equal(typeof body.stats, 'object');
  assert.ok(!('segments' in body) || body.segments === undefined, 'txt لا يحمل مقاطع');
});

test('POST /api/translate-file: صيغة غير مدعومة → 400 invalid-format', async () => {
  const res = await fetch(`${baseUrl}/api/translate-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'exe', content: Buffer.from('hi').toString('base64') }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'invalid-format');
});

test('POST /api/export: srt مع Content-Disposition attachment ونص صحيح', async () => {
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'srt', segments: [{ start: 1, end: 4, text: 'HELLO' }] }),
  });
  assert.equal(res.status, 200);
  const cd = res.headers.get('content-disposition') || '';
  assert.ok(cd.includes('attachment'), cd);
  const body = await res.text();
  assert.ok(body.includes('00:00:01,000 --> 00:00:04,000'), body);
  assert.ok(body.includes('HELLO'));
});

test('POST /api/export: docx يُحمَّل بنوع MIME صحيح ويحتوي النص', async () => {
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'docx', text: 'مرحبا', filename: 'translated.docx' }),
  });
  assert.equal(res.status, 200);
  const ct = res.headers.get('content-type') || '';
  assert.ok(ct.includes('wordprocessingml'), ct);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
});

test('POST /api/export: اسم ملف عربي → RFC 5987 filename* (لا ينهار الرأس)', async () => {
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'srt', segments: [{ start: 1, end: 4, text: 'HELLO' }], filename: 'نتيجة.srt' }),
  });
  assert.equal(res.status, 200);
  const cd = res.headers.get('content-disposition') || '';
  assert.ok(cd.includes('filename*=UTF-8'), cd); // رأس RFC 5987 لأسماء الملفات غير-ASCII
  const body = await res.text();
  assert.ok(body.includes('00:00:01,000 --> 00:00:04,000'), body);
});
