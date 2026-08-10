// tests/alignment.test.js — البند B2: محاذاة 1:1 صارمة بين الأسطر والترجمة
//
// يحل محل tests/distribute.test.js المحذوف، الذي كان يُكرّس الخلل:
//   assert.equal(out.length, lines.length);  ← يفرض إنتاج مخرَج دائمًا
//   assert.equal(out[1], '');                ← ترجمة فارغة نتيجة «مقبولة»
// التوزيع النسبي القديم كان يقسّم الترجمة بعدد الكلمات بنسبة طول الأحرف
// الأصلي — لا علاقة بين الاثنين في زوج عربي/إنجليزي — فينتج عربية سليمة
// الشكل محطّمة المعنى موزّعة على طوابع زمنية: فشل غير قابل للكشف.
// العقد الجديد: مطابقة 1:1، أو تقسيم وإعادة محاولة، أو alignment-failed.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const translate = require('../server/translate');
const { translateBatch } = require('../server/routes-translate');

const realWithMeta = translate.translateTextWithMeta;
afterEach(() => {
  translate.translateTextWithMeta = realWithMeta;
});

// مزيّف: يستدعي fn على الأسطر الداخلة ويعيد الناتج بصيغة translateTextWithMeta
function stub(fn) {
  let calls = 0;
  translate.translateTextWithMeta = async (joined) => {
    calls++;
    return { translated: fn(joined.split('\n\n'), calls), chunksFromCache: 0, chunksTotal: 1 };
  };
  return () => calls;
}

const linesOf = (...arr) => arr.map((original) => ({ original }));

// ===== الحالة السعيدة =====

test('مطابقة 1:1 → تُعاد الأجزاء كما هي', async () => {
  stub((src) => src.map((s) => 'ت:' + s).join('\n\n'));
  const { parts } = await translateBatch(linesOf('one', 'two', 'three'), 'ar', 'en', {});
  assert.deepEqual(parts, ['ت:one', 'ت:two', 'ت:three']);
});

test('يجمع عدّادات الكاش عبر الاستدعاءات', async () => {
  stub((src) => src.map((s) => 'ت:' + s).join('\n\n'));
  const r = await translateBatch(linesOf('a', 'b'), 'ar', 'en', {});
  assert.equal(r.chunksTotal, 1);
  assert.equal(r.chunksFromCache, 0);
});

// ===== الرفض الصريح =====

test('سطر واحد بعدد أجزاء خاطئ → alignment-failed (لا إنقاذ)', async () => {
  stub(() => 'جزء أول\n\nجزء ثانٍ'); // جزآن مقابل سطر واحد
  await assert.rejects(
    () => translateBatch(linesOf('only'), 'ar', 'en', {}),
    (e) => e.code === 'alignment-failed'
  );
});

test('ترجمة فارغة لسطر واحد → alignment-failed لا سطر فارغ', async () => {
  stub(() => '   ');
  await assert.rejects(
    () => translateBatch(linesOf('only'), 'ar', 'en', {}),
    (e) => e.code === 'alignment-failed'
  );
});

test('مزوّد يدمج دائمًا → ينحدر إلى سطر-بسطر ولا يفشل', async () => {
  // جزء واحد مهما كان عدد الأسطر: يفشل للدفعات، لكن السطر المفرد يعطي
  // جزءًا واحدًا = مطابقة صحيحة. النتيجة: ترجمة كل سطر على حدة — سلوك مقصود.
  const calls = stub((src) => 'ت:' + src.join(' '));
  const { parts } = await translateBatch(linesOf('a', 'b', 'c', 'd'), 'ar', 'en', {});
  assert.deepEqual(parts, ['ت:a', 'ت:b', 'ت:c', 'ت:d']);
  // 4 أسطر → 1 + 2 + 4 = 7 استدعاءات (شجرة التقسيم كاملة)
  assert.equal(calls(), 7);
});

test('سطر مفرد بجزأين → alignment-failed (لا مخرج جزئي)', async () => {
  // الحالة الوحيدة التي لا يمكن إنقاذها: أصغر وحدة ما زالت غير مطابقة
  stub((src) => (src.length === 1 ? 'أ\n\nب' : 'مدموج'));
  await assert.rejects(
    () => translateBatch(linesOf('a', 'b', 'c'), 'ar', 'en', {}),
    (e) => e.code === 'alignment-failed'
  );
});

// ===== التعافي عبر التقسيم إلى نصفين =====

test('فشل الدفعة الكاملة ثم نجاح النصفين → مطابقة 1:1 سليمة', async () => {
  // الاستدعاء الأول (4 أسطر) يدمج كل شيء؛ الاستدعاءات التالية (نصفان) تنجح
  const calls = stub((src, n) => (n === 1 ? 'كتلة مدموجة' : src.map((s) => 'ت:' + s).join('\n\n')));
  const { parts } = await translateBatch(linesOf('a', 'b', 'c', 'd'), 'ar', 'en', {});
  assert.deepEqual(parts, ['ت:a', 'ت:b', 'ت:c', 'ت:d']);
  assert.equal(calls(), 3, 'استدعاء فاشل + نصفان ناجحان');
});

test('الترتيب محفوظ بعد التقسيم التكراري', async () => {
  // كل استدعاء بأكثر من سطرين يفشل → تقسيم متكرر حتى دفعات صغيرة
  stub((src) => (src.length > 2 ? 'مدموج' : src.map((s) => 'ت:' + s).join('\n\n')));
  const { parts } = await translateBatch(linesOf('1', '2', '3', '4', '5'), 'ar', 'en', {});
  assert.deepEqual(parts, ['ت:1', 'ت:2', 'ت:3', 'ت:4', 'ت:5']);
});

// ===== لا مخرَج ناقص أبدًا =====

test('لا مسار يُرجع سطرًا فارغًا أو غير مترجم', async () => {
  stub((src) => (src.length > 1 ? 'مدموج' : 'ت:' + src[0]));
  const { parts } = await translateBatch(linesOf('x', 'y', 'z'), 'ar', 'en', {});
  assert.equal(parts.length, 3);
  for (const p of parts) {
    assert.ok(p && p.trim().length, `جزء فارغ: ${JSON.stringify(p)}`);
    assert.ok(p.startsWith('ت:'), `جزء غير مترجم: ${p}`);
  }
});
