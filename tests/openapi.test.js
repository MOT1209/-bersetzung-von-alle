// tests/openapi.test.js — توثيق API بلا انحراف عن الكود (الميزة 4)
//
// درس من routes-sse.js: التوثيق والكود ينفصلان فيصيران كذبين متوازيين. هذا
// الاختبار يجعل docs/openapi.json مسؤولًا أمام التطبيق الفعلي:
//   1) الملف JSON صالح OpenAPI 3.1 ويغطي 40+ مسارًا
//   2) كل مسار في المواصفة مسجَّل فعلاً في تطبيق Express (تأمّل مكدس الراوترات
//      — نفس تقنية smoke.test.js — لا طلبات شبكة)
//   3) GET /api/docs يعمل عند SWAGGER_ENABLED=true
//
// ⚠️ SWAGGER_ENABLED يُضبط هنا قبل require('server') — الوحدة تقرأه مرة عند الإقلاع.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SWAGGER_ENABLED = 'true';
process.env.RATE_LIMIT_MAX = '10000';
process.env.RATE_LIMIT_MAX_HEAVY = '10000';
process.env.CACHE_FILE = path.join(os.tmpdir(), 'aralink-test-openapi-cache-' + Date.now() + '.json');
process.env.ADMIN_TOKEN = 'openapi-admin-token';

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.json'), 'utf8'));
const app = require('../server/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  try { fs.rmSync(process.env.CACHE_FILE, { force: true }); } catch { /* لا شيء */ }
});

// ===== تأمّل مكدس Express (نفس تقنية smoke.test.js) =====

function mountPath(layer) {
  const src = layer.regexp && layer.regexp.source;
  if (!src || src === '^\\/?$') return '';
  return src.replace(/^\^/, '').replace(/\\\/\?\(\?=.*$/, '').replace(/\\(.)/g, '$1');
}

// method → Set(paths) لكل ما هو مسجَّل فعلاً
function registeredRoutes(expressApp) {
  const found = new Map(); // 'GET' → Set
  const add = (m, p) => {
    if (!found.has(m)) found.set(m, new Set());
    found.get(m).add(p);
  };
  (function walk(stack, prefix) {
    for (const l of stack) {
      if (l.route) {
        const p = prefix + l.route.path;
        for (const m of Object.keys(l.route.methods || {})) {
          if (l.route.methods[m]) add(m.toUpperCase(), p);
        }
      } else if (l.name === 'router' && l.handle && l.handle.stack) {
        walk(l.handle.stack, prefix + mountPath(l));
      }
    }
  })(expressApp._router.stack, '');
  return found;
}

test('المواصفة صالحة الشكل OpenAPI 3.1 وتغطي 40+ عملية', () => {
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.info && spec.info.title, 'info.title مفقود');
  const operations = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  assert.ok(operations >= 40, `المواصفة تغطي ${operations} عملية فقط — متوقع 40+`);
  // كل $ref يشير إلى مكوّن موجود
  const refs = JSON.stringify(spec).match(/"#\/components\/(schemas|parameters)\/([^"]+)"/g) || [];
  for (const r of refs) {
    const [, kind, name] = r.match(/"#\/components\/(schemas|parameters)\/([^"]+)"$/);
    assert.ok(spec.components[kind][name], `مرجع مفقود في المواصفة: ${r}`);
  }
});

test('كل مسار في المواصفة مسجَّل فعلاً في Express بالطريقة نفسها', () => {
  const registered = registeredRoutes(app);
  const norm = (p) => p.replace(/\/+$/, '') || '/';
  const missing = [];
  for (const [specPath, methods] of Object.entries(spec.paths)) {
    // /api/video/{videoId} → /api/video/:videoId (صيغة Express)
    const expressPath = norm(specPath.replace(/\{([^}]+)\}/g, ':$1'));
    for (const method of Object.keys(methods)) {
      const set = registered.get(method.toUpperCase());
      if (!set || !([...set].some((r) => norm(r) === expressPath))) {
        missing.push(`${method.toUpperCase()} ${specPath}`);
      }
    }
  }
  assert.deepEqual(
    missing, [],
    `مسارات موثَّقة في openapi.json لكنها غير مسجَّلة في الخادم: ${missing.join(', ')}`,
  );
});

test('GET /api/docs يخدم Swagger UI عند SWAGGER_ENABLED=true', async () => {
  const res = await fetch(`${baseUrl}/api/docs`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const html = await res.text();
  assert.match(html, /swagger-ui-bundle\.js/);
  assert.match(html, /\/api\/docs\/swagger\.json/);

  const specRes = await fetch(`${baseUrl}/api/docs/swagger.json`);
  assert.equal(specRes.status, 200);
  const served = await specRes.json();
  assert.equal(served.openapi, '3.1.0');
});
