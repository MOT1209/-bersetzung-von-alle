// tests/epub.test.js — قراءة EPUB عبر JSZip (بلا epub2/adm-zip)
//
// لماذا هذا الملف: استيراد EPUB كان بلا أي تغطية اختبارية إطلاقًا، بينما يمرّ
// عبره ملف يرفعه المستخدم مباشرةً (/api/translate-file). وقد أُزيلت التبعية
// epub2 → adm-zip لثغرة تجعل ملف ZIP مُصاغًا يستهلك 4GB — فالبديل يحتاج حراسة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

const {
  extractEpubText, resolveZipPath, htmlToPlainText, makeZipReader,
} = require('../server/files');

// ===== بنّاء EPUB بسيط في الذاكرة =====
// opts: { spine?: string[], omitContainer?, omitSpine?, baseDir? }
async function buildEpub(chapters, opts = {}) {
  const baseDir = opts.baseDir === undefined ? 'OEBPS/' : opts.baseDir;
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');

  if (!opts.omitContainer) {
    zip.file('META-INF/container.xml',
      '<?xml version="1.0"?><container version="1.0"><rootfiles>' +
      `<rootfile full-path="${baseDir}content.opf" media-type="application/oebps-package+xml"/>` +
      '</rootfiles></container>');
  }

  const manifestItems = chapters
    .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join('');
  const spineIds = opts.spine || chapters.map((c) => c.id);
  const spineXml = opts.omitSpine
    ? '<spine></spine>'
    : `<spine>${spineIds.map((id) => `<itemref idref="${id}"/>`).join('')}</spine>`;

  zip.file(`${baseDir}content.opf`,
    `<?xml version="1.0"?><package version="3.0"><manifest>${manifestItems}</manifest>${spineXml}</package>`);

  for (const c of chapters) {
    zip.file(baseDir + c.href, `<html><body>${c.body}</body></html>`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ===== المسار السعيد =====

test('EPUB: يستخرج نص الفصول بترتيب spine', async () => {
  const buf = await buildEpub([
    { id: 'c1', href: 'ch1.xhtml', body: '<p>First chapter.</p>' },
    { id: 'c2', href: 'ch2.xhtml', body: '<p>Second chapter.</p>' },
  ]);
  const text = await extractEpubText(buf);
  assert.match(text, /First chapter\./);
  assert.match(text, /Second chapter\./);
  assert.ok(text.indexOf('First') < text.indexOf('Second'), 'الترتيب غير صحيح');
});

test('EPUB: spine هو ترتيب القراءة لا ترتيب manifest', async () => {
  // manifest يسرد c1 ثم c2، لكن spine يعكس الترتيب — يجب اتّباع spine
  const buf = await buildEpub([
    { id: 'c1', href: 'ch1.xhtml', body: '<p>Alpha.</p>' },
    { id: 'c2', href: 'ch2.xhtml', body: '<p>Beta.</p>' },
  ], { spine: ['c2', 'c1'] });
  const text = await extractEpubText(buf);
  assert.ok(text.indexOf('Beta') < text.indexOf('Alpha'), 'لم يُتّبع ترتيب spine');
});

test('EPUB: يعمل حين يكون OPF في جذر الأرشيف (بلا مجلد)', async () => {
  const buf = await buildEpub([{ id: 'c1', href: 'ch1.xhtml', body: '<p>Root level.</p>' }], { baseDir: '' });
  assert.match(await extractEpubText(buf), /Root level\./);
});

test('EPUB: يفكّ الكيانات ويُسقط script/style', async () => {
  const buf = await buildEpub([{
    id: 'c1',
    href: 'ch1.xhtml',
    body: '<script>var leak = 1;</script><style>p{color:red}</style><p>Caf&#39;e &amp; bar</p>',
  }]);
  const text = await extractEpubText(buf);
  assert.match(text, /Caf'e & bar/);
  assert.doesNotMatch(text, /leak/, 'تسرّب نص script إلى الترجمة');
  assert.doesNotMatch(text, /color:red/, 'تسرّب نص style إلى الترجمة');
});

// ===== الفشل الصريح =====

test('EPUB: أرشيف تالف → invalid-file', async () => {
  await assert.rejects(
    () => extractEpubText(Buffer.from('not a zip at all')),
    (e) => e.code === 'invalid-file',
  );
});

test('EPUB: بلا container.xml → invalid-file', async () => {
  const buf = await buildEpub([{ id: 'c1', href: 'ch1.xhtml', body: '<p>x</p>' }], { omitContainer: true });
  await assert.rejects(() => extractEpubText(buf), (e) => e.code === 'invalid-file');
});

test('EPUB: spine فارغ → invalid-file', async () => {
  const buf = await buildEpub([{ id: 'c1', href: 'ch1.xhtml', body: '<p>x</p>' }], { omitSpine: true });
  await assert.rejects(() => extractEpubText(buf), (e) => e.code === 'invalid-file');
});

test('EPUB: فصول بلا نص → invalid-file لا سلسلة فارغة', async () => {
  const buf = await buildEpub([{ id: 'c1', href: 'ch1.xhtml', body: '   ' }]);
  await assert.rejects(() => extractEpubText(buf), (e) => e.code === 'invalid-file');
});

// ===== ميزانية فكّ الضغط (الحماية من قنبلة ZIP) =====

test('makeZipReader: تجاوز الميزانية → input-too-large', async () => {
  const zip = new JSZip();
  zip.file('big.txt', 'a'.repeat(5000));
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  const read = makeZipReader(1000); // ميزانية 1000 بايت فقط
  await assert.rejects(() => read(loaded, 'big.txt'), (e) => e.code === 'input-too-large');
});

test('makeZipReader: الميزانية تراكمية عبر عدة مدخلات', async () => {
  const zip = new JSZip();
  zip.file('a.txt', 'a'.repeat(400));
  zip.file('b.txt', 'b'.repeat(400));
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  const read = makeZipReader(600); // يكفي للأول لا للاثنين
  assert.equal((await read(loaded, 'a.txt')).length, 400);
  await assert.rejects(() => read(loaded, 'b.txt'), (e) => e.code === 'input-too-large');
});

test('makeZipReader: مدخل غير موجود يعيد سلسلة فارغة لا خطأ', async () => {
  const zip = new JSZip();
  zip.file('a.txt', 'x');
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(await makeZipReader()(loaded, 'missing.txt'), '');
});

// ===== تطبيع المسارات =====

test('resolveZipPath: يحلّ النسبي و".." ويُسقط الشظية', () => {
  assert.equal(resolveZipPath('OEBPS/', 'ch1.xhtml'), 'OEBPS/ch1.xhtml');
  assert.equal(resolveZipPath('OEBPS/text/', '../images/a.xhtml'), 'OEBPS/images/a.xhtml');
  assert.equal(resolveZipPath('OEBPS/', 'ch1.xhtml#part2'), 'OEBPS/ch1.xhtml');
  assert.equal(resolveZipPath('OEBPS/', './ch1.xhtml'), 'OEBPS/ch1.xhtml');
  assert.equal(resolveZipPath('', 'content.opf'), 'content.opf');
});

test('resolveZipPath: ".." الزائدة لا تخرج خارج الأرشيف', () => {
  assert.equal(resolveZipPath('OEBPS/', '../../../etc/passwd'), 'etc/passwd');
});

test('htmlToPlainText: حدود الفقرات تصبح أسطرًا', () => {
  assert.equal(htmlToPlainText('<p>one</p><p>two</p>'), 'one\ntwo');
  assert.equal(htmlToPlainText('a<br/>b'), 'a\nb');
});
