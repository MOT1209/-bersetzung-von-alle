// tests/quality.test.js — قياس جودة الترجمة (server/quality.js) + /api/stats/quality
// بلا شبكة: مزوّدون وهميون + تقرير في ملف مؤقت.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-quality-'));
process.env.QUALITY_REPORT = path.join(tmpDir, 'quality-report.json');
process.env.STATS_LOG = path.join(tmpDir, 'stats-log.json');
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.ADMIN_TOKEN = 'test-admin-quality';
const ADMIN_HEADERS = { 'x-admin-token': process.env.ADMIN_TOKEN };

const quality = require('../server/quality');
const app = require('../server/server');

const REFSET = [
  { id: 's1', source: 'the cat sleeps', sourceLang: 'en', targets: { fr: 'le chat dort', ar: 'القطة تنام' } },
  { id: 's2', source: 'good morning', sourceLang: 'en', targets: { fr: 'bonjour', ar: 'صباح الخير' } },
];

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('scoreOne: ترجمة مطابقة → درجة 1 و WER 0', () => {
  const r = quality.scoreOne('le chat dort', 'le chat dort', 'fr');
  assert.equal(r.wer, 0);
  assert.equal(r.score, 1);
});

test('scoreOne: ترجمة مختلفة → درجة أقل من 1', () => {
  const r = quality.scoreOne('le chat dort', 'un chien court', 'fr');
  assert.ok(r.score < 1);
  assert.ok(r.wer > 0);
});

test('bestScore: يأخذ أفضل درجة من عدة صياغات مرجعية', () => {
  const refs = ['le chat dort', 'un chat qui dort'];
  const r = quality.bestScore(refs, 'un chat qui dort', 'fr');
  assert.equal(r.score, 1); // مطابق للصياغة الثانية
  const single = quality.bestScore('le chat dort', 'le chat dort', 'fr');
  assert.equal(single.score, 1); // نص واحد يعمل أيضًا
});

test('runBenchmark: يقبل مصفوفة مراجع لكل لغة', async () => {
  const rs = [{ id: 'm1', source: 'hello', sourceLang: 'en', targets: { fr: ['salut', 'bonjour'] } }];
  const p = { id: 'p', fn: async () => 'bonjour' };
  const report = await quality.runBenchmark({ providers: [p], refset: rs, delayMs: 0 });
  assert.equal(report.summary[0].avgScore, 1);
});

test('runBenchmark: مزوّد مثالي يتفوّق على مزوّد رديء', async () => {
  const perfect = { id: 'perfect', fn: async (text, lang) => REFSET.find((e) => e.source === text).targets[lang] };
  const garbage = { id: 'garbage', fn: async () => 'xxxxx yyyyy zzzzz' };
  const report = await quality.runBenchmark({ providers: [perfect, garbage], refset: REFSET, delayMs: 0 });

  assert.equal(report.summary.length, 2);
  assert.equal(report.summary[0].provider, 'perfect'); // مُرتّب تنازليًا بالدرجة
  assert.equal(report.summary[0].avgScore, 1);
  assert.ok(report.summary[1].avgScore < report.summary[0].avgScore);
  assert.deepEqual(new Set(report.langs), new Set(['fr', 'ar']));
  assert.equal(report.summary[0].succeeded, 4);
});

test('runBenchmark: فشل الترجمة يُحتسب failed لا يكسر التشغيل', async () => {
  const flaky = { id: 'flaky', fn: async () => { throw new Error('boom'); } };
  const report = await quality.runBenchmark({ providers: [flaky], refset: REFSET, delayMs: 0 });
  assert.equal(report.summary[0].succeeded, 0);
  assert.equal(report.summary[0].failed, 4);
  assert.equal(report.summary[0].avgScore, null);
});

test('saveReport/loadReport: دورة كاملة', () => {
  const rep = { generatedAt: 'now', summary: [{ provider: 'x', avgScore: 0.9 }] };
  quality.saveReport(rep);
  assert.deepEqual(quality.loadReport(), rep);
});

test('loadRefset: يرفض مجموعة غير صالحة', () => {
  const bad = path.join(tmpDir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify([{ source: 'x' }]));
  assert.throws(() => quality.loadRefset(bad), /invalid/);
});

test('GET /api/stats/quality: 401 بلا رمز، 200 بالرمز', async () => {
  const noAuth = await fetch(`${baseUrl}/api/stats/quality`);
  assert.equal(noAuth.status, 401);

  quality.saveReport({ generatedAt: '2026-01-01T00:00:00Z', refsetSize: 2, langs: ['fr'], summary: [{ provider: 'google', avgScore: 0.8, avgWer: 0.2, succeeded: 2, samples: 2, perLang: { fr: 0.8 } }], detail: [] });
  const res = await fetch(`${baseUrl}/api/stats/quality`, { headers: ADMIN_HEADERS });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.available, true);
  assert.equal(body.summary[0].provider, 'google');
});

test('GET /api/stats/quality: available:false حين لا تقرير', async () => {
  fs.rmSync(process.env.QUALITY_REPORT, { force: true });
  const res = await fetch(`${baseUrl}/api/stats/quality`, { headers: ADMIN_HEADERS });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { available: false });
});
