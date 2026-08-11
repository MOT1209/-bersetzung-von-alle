// tests/bootResilience.test.js — البند D2: اعتمادية أصلية مفقودة لا تمنع الإقلاع
//
// كان audio.js يستورد @xenova/transformers عند القمة، فيتوقّف إقلاع الخادم كله
// على اعتمادية أصلية ثقيلة. ثبت هذا عمليًا داخل حاوية Docker: غياب
// onnxruntime-node (اعتمادية اختيارية لـ transformers) أعطى:
//   Cannot find package 'onnxruntime-node' … at server boot
// أي صورة تُبنى بنجاح ولا يقلع فيها الخادم إطلاقًا.
//
// العقد: فقدان محرّك التفريغ يعطّل ميزة التفريغ فقط، لا التطبيق.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// نشغّل في عملية فرعية: حجب وحدة على مستوى المُحمِّل لا يُلغى داخل نفس العملية
function bootWithBlocked(moduleName) {
  const script = `
    const M = require('module');
    const orig = M._resolveFilename;
    M._resolveFilename = function (r, ...a) {
      if (r === ${JSON.stringify(moduleName)}) {
        const e = new Error('blocked'); e.code = 'MODULE_NOT_FOUND'; throw e;
      }
      return orig.call(this, r, ...a);
    };
    const os = require('os'), fs = require('fs'), p = require('path');
    process.env.ENV_FILE = p.join(os.tmpdir(), 'aralink-d2.env');
    fs.writeFileSync(process.env.ENV_FILE, '');
    process.env.CACHE_FILE = p.join(os.tmpdir(), 'aralink-d2-cache.json');
    require(${JSON.stringify(path.join(__dirname, '..', 'server', 'server.js'))});
    console.log('BOOT_OK');
    process.exit(0);
  `;
  return execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    // إقلاع الخادم كاملًا مرة لكل حالة — مهلة سخية لأن الجهاز قد يكون مشغولًا
    timeout: 300000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('الخادم يقلع رغم غياب @xenova/transformers', () => {
  assert.match(bootWithBlocked('@xenova/transformers'), /BOOT_OK/);
});

test('الخادم يقلع رغم غياب sherpa-onnx', () => {
  assert.match(bootWithBlocked('sherpa-onnx'), /BOOT_OK/);
});

test('الخادم يقلع رغم غياب youtube-dl-exec (اختيارية)', () => {
  assert.match(bootWithBlocked('youtube-dl-exec'), /BOOT_OK/);
});
