// tests/fetchPinned.test.js — تثبيت اتصال المقالات على عناوين مُتحقَّق منها (SSRF)
//
// الثغرة: كان البرنامج يتحقق من DNS (validatePublicUrl) ثم يعيد `fetch()` حلّ DNS
// ثانيًا وقت الاتصال — فمن يملك DNS يستطيع قلب السجل بين الفحص والاتصال نحو عنوان
// داخلي (rebinding). الإصلاح: requestPinned يفتح المقبس على عنوان من قائمة مُتحقَّق
// منها مسبقًا فقط، ولا يوجد أي قرار DNS عند الاتصال. نختبر هنا القطعتين:
//   1) المقبس يذهب حرفيًا للعنوان الممرَّر (وأن DNS لا يُستدعى أصلًا وقت الاتصال)
//   2) تحقق fetchArticleContent من رفض اسم مضيف يقلبه DNS إلى عنوان داخلي
// القفزات (redirects) تسلك المسار نفسه: validatePublicUrl قبل كل قفزة + requestPinned،
// لذا تغطي الاختبارات الثلاثة الحلقة كاملة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const dns = require('node:dns');

const { fetchArticleContent, requestPinned } = require('../server/fetchContent');

// خادم محلي يستقبل ويُعيد اسم المضيف الذي رأته الخادم والمسار
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const body = JSON.stringify({ host: req.headers.host, url: req.url });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

test('requestPinned يفتح المقبس على العنوان الممرَّر فقط — بلا أي اتصال DNS وقت الاتصال', async () => {
  const srv = await startServer();
  const origLookup = dns.promises.lookup;
  // لو حاول أحد إعادة حلّ الاسم وقت الاتصال (عود طفيلي للثغرة) تفشل الاختبار فورًا
  dns.promises.lookup = async () => { throw new Error('DNS must not run at connect time'); };
  try {
    const port = srv.address().port;
    // Host مقصود مختلف عن العنوان المثبَّت — نتحقق أن الاسم الأصلي ما زال يُرسَل
    const u = new URL(`http://site.test:${port}/hello?x=1`);
    const res = await requestPinned(u, [{ address: '127.0.0.1', family: 4 }], 5000);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(await readStream(res));
    assert.equal(data.host, `site.test:${port}`); // Host الأصلي للمواقع الافتراضية
    assert.equal(data.url, '/hello?x=1');
  } finally {
    dns.promises.lookup = origLookup;
    srv.close();
  }
});

test('requestPinned يُجرب عنوانًا تاليًا من القائمة إن فشل الاتصال بالأول (بدون DNS)', async () => {
  const srv = await startServer();
  const origLookup = dns.promises.lookup;
  dns.promises.lookup = async () => { throw new Error('DNS must not run at connect time'); };
  try {
    const port = srv.address().port;
    const u = new URL(`http://site.test:${port}/`);
    // 0.0.0.0 عنوان هدف غير صالح يرفض النظام الاتصال به فورًا — الثاني هو خادمنا المحلي
    const res = await requestPinned(u, [
      { address: '0.0.0.0', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ], 3000);
    assert.equal(res.statusCode, 200);
  } finally {
    dns.promises.lookup = origLookup;
    srv.close();
  }
});

test('fetchArticleContent يحجب اسم مضيف يقلبه DNS إلى عنوان داخلي (blocked-url)', async () => {
  const origLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [{ address: '127.0.0.1', family: 4 }];
  try {
    await assert.rejects(
      () => fetchArticleContent('http://rebind.example/x'),
      (e) => e.code === 'blocked-url',
      'يجب أن يُحجب قبل أي اتصال',
    );
  } finally {
    dns.promises.lookup = origLookup;
  }
});