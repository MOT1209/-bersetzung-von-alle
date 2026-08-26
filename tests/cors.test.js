// tests/cors.test.js — Wave 1: CORS allowlist via CORS_ORIGIN
//
// Verified behaviors:
//   * preflight from a disallowed origin -> NO Access-Control-Allow-Origin
//   * preflight from an allowed origin  -> origin reflected
//   * request without Origin header (same-origin / non-browser) -> passes, no CORS headers
//   * GET from a disallowed origin -> 200 but no CORS headers (browser blocks reading)
//   * comma-separated list and '*' both work
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');

// Isolated env: temp .env + generous rate limit + a known allowed origin
process.env.CORS_ORIGIN = 'https://allowed.example.com';
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-cors-'));
process.env.ENV_FILE = path.join(tmpDir, '.env');
fs.writeFileSync(process.env.ENV_FILE, 'GEMINI_API_KEY=abcdef1234567890\n');

const app = require('../server/server');
const config = require('../server/config');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup only
  }
});

const ALLOWED = 'https://allowed.example.com';
const DISALLOWED = 'https://evil.example.com';

function preflight(origin) {
  return fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
    },
  });
}

test('preflight from disallowed origin gets no Access-Control-Allow-Origin', async () => {
  const res = await preflight(DISALLOWED);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('preflight from allowed origin reflects the origin', async () => {
  const res = await preflight(ALLOWED);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED);
});

test('request without Origin header still works (same-origin / non-browser)', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('GET from disallowed origin returns data but no CORS headers', async () => {
  const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: DISALLOWED } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('comma-separated list allows each listed origin', async () => {
  const saved = config.CORS_ORIGIN;
  config.CORS_ORIGIN = 'https://a.example.com, https://b.example.com';
  try {
    const resA = await preflight('https://a.example.com');
    assert.equal(resA.headers.get('access-control-allow-origin'), 'https://a.example.com');
    const resB = await preflight('https://b.example.com');
    assert.equal(resB.headers.get('access-control-allow-origin'), 'https://b.example.com');
    const resC = await preflight('https://c.example.com');
    assert.equal(resC.headers.get('access-control-allow-origin'), null);
  } finally {
    config.CORS_ORIGIN = saved;
  }
});

test('* wildcard allows any origin', async () => {
  const saved = config.CORS_ORIGIN;
  config.CORS_ORIGIN = '*';
  try {
    const res = await preflight('https://anything.example.com');
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://anything.example.com');
  } finally {
    config.CORS_ORIGIN = saved;
  }
});