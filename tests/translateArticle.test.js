// tests/translateArticle.test.js — اختبار مقال لضمان إصلاح handleArticle (وصول وقت التنفيذ)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const os = require('node:os');

// رفع حدود الطلبات قبل تحميل الإعدادات حتى لا تتأثر الاختبارات بحد 20/دقيقة/IP
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
// عزل الكاش عن الملف الحقيقي (T1)
process.env.CACHE_FILE = path.join(os.tmpdir(), 'aralink-test-article-' + Date.now() + '.json');

const translate = require('../server/translate');
const fetchContent = require('../server/fetchContent');
const app = require('../server/server');

// حفظ الأصلي للترميم
const origDetect = translate.detectLanguage;
const origTranslateWithMeta = translate.translateTextWithMeta;
const origFetch = fetchContent.fetchArticleContent;

let server;
let baseUrl;

before(async () => {
  // تزييف وقت التنفيذ — handleArticle يجب أن يستخدم translate.detectLanguage و translate.translateTextWithMeta و require('./fetchContent').fetchArticleContent
  translate.detectLanguage = async () => 'en';
  translate.translateTextWithMeta = async (text) => {
    const txt = String(text || '');
    if (!txt.trim()) return { translated: '', chunksFromCache: 0, chunksTotal: 1 };
    // حافظ على عدد القطع عند وجود \n\n (robust للـ batch)
    if (txt.includes('\n\n')) {
      const parts = txt.split('\n\n');
      const translated = parts.map((p) => p.split(' ').join(' مترجم ') || 'مترجم').join('\n\n');
      return { translated, chunksFromCache: 0, chunksTotal: 1 };
    }
    return { translated: txt.split(' ').join(' مترجم ') || 'مترجم', chunksFromCache: 0, chunksTotal: 1 };
  };
  fetchContent.fetchArticleContent = async () => ({
    title: 'Test Article',
    blocks: [
      { type: 'p', content: 'Hello world' },
      { type: 'h2', content: 'Title two' },
    ],
  });

  server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  // ترميم التزييف
  if (origDetect) translate.detectLanguage = origDetect;
  if (origTranslateWithMeta) translate.translateTextWithMeta = origTranslateWithMeta;
  if (origFetch) fetchContent.fetchArticleContent = origFetch;
});

test('POST /api/translate مقال → 200 مع translatedBlocks', async () => {
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/article', targetLang: 'ar' }),
  });
  assert.equal(res.status, 200, `expected 200 got ${res.status} body=${await res.clone().text().catch(()=>'' )}`);
  const body = await res.json();
  assert.equal(body.type, 'article');
  assert.ok(body.sourceLang, 'sourceLang موجود');
  assert.ok(Array.isArray(body.translatedBlocks), 'translatedBlocks مصفوفة');
  assert.equal(body.translatedBlocks.length, 2);
  assert.ok(body.meta && body.meta.title === 'Test Article');
});

test('POST /api/translate مقال مع مسرد → 200 ولا يكسر المسار', async () => {
  const res = await fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/article', targetLang: 'ar', glossary: [{ from: 'Hello', to: 'مرحبا' }] }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, 'article');
  assert.equal(body.translatedBlocks.length, 2);
});
