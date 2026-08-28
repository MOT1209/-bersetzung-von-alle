// tests/ssrf.test.js — حماية SSRF (server/ssrf.js)
//
// أخطر وحدة في المشروع بلا تغطية: كل رابط يرسله المستخدم يمر بها، وثغرة فيها
// تعني وصولًا إلى شبكة الخادم الداخلية (بيانات وصفية للسحابة، خدمات محلية).
// العناوين الحرفية تُفحص بلا DNS، وحالات أسماء المضيفين تُزيَّف حتى لا تعتمد
// الاختبارات على شبكة أو محلّل أسماء.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');

const { validatePublicUrl } = require('../server/ssrf');

async function expectBlocked(url, code = 'blocked-url') {
  await assert.rejects(
    () => validatePublicUrl(url),
    (e) => e.code === code,
    `${url} كان يجب أن يُحجب بـ ${code}`,
  );
}

// ===== IPv4 الداخلية =====
const PRIVATE_V4 = [
  ['http://127.0.0.1/', 'حلقي loopback'],
  ['http://127.1.2.3/', 'حلقي كامل النطاق /8'],
  ['http://10.0.0.5/', 'خاص 10/8'],
  ['http://172.16.0.1/', 'خاص 172.16/12'],
  ['http://172.31.255.254/', 'حافة 172.16/12'],
  ['http://192.168.1.1/', 'خاص 192.168/16'],
  ['http://169.254.169.254/latest/meta-data/', 'بيانات السحابة الوصفية'],
  ['http://100.64.0.1/', 'CGNAT'],
  ['http://0.0.0.0/', 'غير محدد'],
  ['http://224.0.0.1/', 'multicast'],
  ['http://255.255.255.255/', 'محجوز'],
];
for (const [url, label] of PRIVATE_V4) {
  test(`يحجب ${label}: ${url}`, () => expectBlocked(url));
}

// ===== IPv6 الداخلية =====
const PRIVATE_V6 = [
  ['http://[::1]/', 'حلقي ::1'],
  ['http://[::]/', 'غير محدد ::'],
  ['http://[fd00::1]/', 'unique local fc00::/7'],
  ['http://[fe80::1]/', 'link-local fe80::/10'],
  ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped على حلقي'],
  ['http://[::ffff:169.254.169.254]/', 'IPv4-mapped على بيانات وصفية'],
];
for (const [url, label] of PRIVATE_V6) {
  test(`يحجب ${label}: ${url}`, () => expectBlocked(url));
}

// ===== صيغ الالتفاف =====
// عنوان عشري/ثماني ليس IP حرفيًا فيمر عبر DNS، ومحلّل النظام يفكّه إلى 127.0.0.1
// فيُحجب. هذا الاختبار يوثّق أن المسار الطويل يغطي هذه الحيلة أيضًا.
test('يحجب صيغة IP العشرية (2130706433 = 127.0.0.1)', () => expectBlocked('http://2130706433/'));
test('يحجب صيغة IP الثمانية (0177.0.0.1 = 127.0.0.1)', () => expectBlocked('http://0177.0.0.1/'));
test('يحجب اسم localhost', () => expectBlocked('http://localhost/'));

// ===== بروتوكولات ومدخلات غير صالحة =====
const INVALID = [
  'file:///etc/passwd',
  'ftp://example.com/x',
  'gopher://example.com/',
  'data:text/plain,hello',
  'javascript:alert(1)',
  'not a url at all',
  '',
];
for (const url of INVALID) {
  test(`يرفض مدخلاً غير صالح: ${JSON.stringify(url)}`, () => expectBlocked(url, 'invalid-url'));
}

// ===== أسماء المضيفين عبر DNS (مزيَّف — بلا شبكة) =====
test('اسم مضيف يُحلّ إلى عنوان داخلي → محجوب', async () => {
  const orig = dns.promises.lookup;
  dns.promises.lookup = async () => [{ address: '10.1.2.3', family: 4 }];
  try {
    await expectBlocked('http://intranet.example/');
  } finally {
    dns.promises.lookup = orig;
  }
});

test('اسم مضيف بعناوين متعددة وأحدها داخلي → محجوب كله', async () => {
  const orig = dns.promises.lookup;
  // DNS rebinding: عنوان عام يخفي خلفه عنوانًا داخليًا — يجب رفض المجموعة كلها
  dns.promises.lookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  try {
    await expectBlocked('http://rebind.example/');
  } finally {
    dns.promises.lookup = orig;
  }
});

test('اسم مضيف عام يُحلّ إلى عنوان عام → مسموح', async () => {
  const orig = dns.promises.lookup;
  dns.promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  try {
    const r = await validatePublicUrl('http://example.com/article');
    assert.ok(r.addresses.length >= 1);
  } finally {
    dns.promises.lookup = orig;
  }
});

test('فشل تحليل DNS → invalid-url لا تمرير', async () => {
  const orig = dns.promises.lookup;
  dns.promises.lookup = async () => { throw new Error('ENOTFOUND'); };
  try {
    await expectBlocked('http://does-not-exist.invalid/', 'invalid-url');
  } finally {
    dns.promises.lookup = orig;
  }
});

test('DNS يعيد قائمة فارغة → invalid-url (إغلاق آمن)', async () => {
  const orig = dns.promises.lookup;
  dns.promises.lookup = async () => [];
  try {
    await expectBlocked('http://empty.example/', 'invalid-url');
  } finally {
    dns.promises.lookup = orig;
  }
});

// ===== المسار السعيد بعنوان حرفي عام =====
test('عنوان IPv4 عام حرفي → مسموح بلا DNS', async () => {
  const r = await validatePublicUrl('http://93.184.216.34/');
  assert.equal(r.address, '93.184.216.34');
});

test('https مقبول مثل http', async () => {
  const r = await validatePublicUrl('https://93.184.216.34/x?y=1');
  assert.equal(r.address, '93.184.216.34');
});
