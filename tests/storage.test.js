// tests/storage.test.js — طبقة التخزين (P3a)
// التركيز الأمني: المفتاح شبيه بمسار لكنه يأتي من المستدعي، فتطبيعه هو خط
// الدفاع الوحيد ضد الكتابة خارج جذر التخزين.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeKey } = require('../server/providers/storage/keys');
const { createLocalStorage } = require('../server/providers/storage/local');

let root;
let store;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-storage-'));
  store = createLocalStorage({ root });
});
after(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* تنظيف */ }
});

// ===== 1) تطبيع المفاتيح — الحاجز الأمني =====

test('normalizeKey: يقبل المفاتيح السليمة ويوحّدها', () => {
  assert.equal(normalizeKey('projects/p1/media/a.mp4'), 'projects/p1/media/a.mp4');
  assert.equal(normalizeKey('a//b///c'), 'a/b/c');       // مقاطع فارغة تُطوى
  assert.equal(normalizeKey('./a/./b'), 'a/b');           // '.' تُسقط
  assert.equal(normalizeKey('a\\b\\c'), 'a/b/c');         // فواصل ويندوز تُوحَّد
});

test('normalizeKey: يرفض اجتياز المسار بكل صوره', () => {
  const bad = [
    '../etc/passwd',
    'a/../../etc/passwd',
    'a/b/..',
    '..\\..\\windows\\system32',   // بصيغة ويندوز
    '/etc/passwd',                  // مطلق
    'C:/Windows/system32',          // مطلق بصيغة أخرى
    '',
    '   ',
    'a\0b',                         // بايت صفري
  ];
  for (const key of bad) {
    assert.throws(() => normalizeKey(key), (e) => e.code === 'invalid-storage-key', `مرّ مفتاح خطير: ${JSON.stringify(key)}`);
  }
});

test('normalizeKey: يرفض المفتاح الأطول من الحد', () => {
  assert.throws(() => normalizeKey('a/'.repeat(400)), (e) => e.code === 'invalid-storage-key');
});

// ===== 2) دورة حياة الملف =====

test('put/get/stat: يكتب ويقرأ ويعيد الحجم', async () => {
  const data = Buffer.from('مرحبا بالعالم');
  const put = await store.put('projects/p1/media/a.txt', data);
  assert.equal(put.bytes, data.length);

  const got = await store.get('projects/p1/media/a.txt');
  assert.deepEqual(got, data);

  const st = await store.stat('projects/p1/media/a.txt');
  assert.equal(st.bytes, data.length);
  assert.ok(st.modifiedAt > 0);
  assert.equal(await store.exists('projects/p1/media/a.txt'), true);
});

test('get/stat لمفتاح غير موجود → null لا استثناء', async () => {
  assert.equal(await store.get('projects/nope/x.txt'), null);
  assert.equal(await store.stat('projects/nope/x.txt'), null);
  assert.equal(await store.exists('projects/nope/x.txt'), false);
});

test('put: ينشئ المجلدات الوسيطة تلقائيًا', async () => {
  await store.put('deep/a/b/c/d/file.txt', Buffer.from('x'));
  assert.equal((await store.get('deep/a/b/c/d/file.txt')).toString(), 'x');
});

test('put: الكتابة المتكررة تستبدل ولا تترك ملفات مؤقتة', async () => {
  await store.put('over/w.txt', Buffer.from('first'));
  await store.put('over/w.txt', Buffer.from('second'));
  assert.equal((await store.get('over/w.txt')).toString(), 'second');
  const leftovers = fs.readdirSync(path.join(root, 'over')).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, [], 'بقيت ملفات .tmp بعد الكتابة');
});

test('remove: يعيد true عند الحذف وfalse إن لم يوجد (متكرّر آمن)', async () => {
  await store.put('del/x.txt', Buffer.from('bye'));
  assert.equal(await store.remove('del/x.txt'), true);
  assert.equal(await store.remove('del/x.txt'), false);
  assert.equal(await store.get('del/x.txt'), null);
});

test('removePrefix: يحذف الشجرة كاملة (حذف مشروع)', async () => {
  await store.put('projects/p9/media/a.txt', Buffer.from('a'));
  await store.put('projects/p9/subtitle/b.srt', Buffer.from('b'));
  assert.equal((await store.list('projects/p9')).length, 2);
  assert.equal(await store.removePrefix('projects/p9'), true);
  assert.deepEqual(await store.list('projects/p9'), []);
});

test('list: يعيد المفاتيح الكاملة مرتّبة، والبادئة الغائبة تعطي قائمة فارغة', async () => {
  await store.put('ls/one.txt', Buffer.from('1'));
  await store.put('ls/sub/two.txt', Buffer.from('2'));
  assert.deepEqual(await store.list('ls'), ['ls/one.txt', 'ls/sub/two.txt']);
  assert.deepEqual(await store.list('does/not/exist'), []);
});

// ===== 3) الحاجز فعّال عبر الواجهة كاملة =====

test('العمليات ترفض المفاتيح الخطيرة ولا تكتب خارج الجذر', async () => {
  const outside = path.join(os.tmpdir(), 'aralink-escape-proof.txt');
  fs.rmSync(outside, { force: true });
  await assert.rejects(
    () => store.put('../aralink-escape-proof.txt', Buffer.from('pwned')),
    (e) => e.code === 'invalid-storage-key',
  );
  assert.equal(fs.existsSync(outside), false, 'كُتب ملف خارج جذر التخزين');
  await assert.rejects(() => store.get('../../etc/passwd'), (e) => e.code === 'invalid-storage-key');
  await assert.rejects(() => store.remove('/etc/passwd'), (e) => e.code === 'invalid-storage-key');
});
