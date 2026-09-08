// tests/srtCap.test.js — تحقق من سقف مصفوفة captions في POST /api/srt
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';

const translateRouter = require('../server/routes-translate');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((err, req, res, _next) => {
  const status = err && (err.status || err.statusCode);
  if (status === 413) return res.status(413).json({ error: 'input-too-large' });
  throw err;
});
app.use('/api', translateRouter);

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api/srt', method: 'POST',
        headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('POST /api/srt: يرفض مصفوفة تتجاوز 50000 عنصر → 400/413', async () => {
  const { server, port } = await startServer();
  try {
    const captions = Array.from({ length: 50001 }, (_, i) => ({
      start: i, duration: 1, original: `line ${i}`,
    }));
    const res = await post(port, { captions });
    assert.ok(res.status === 400 || res.status === 413, 'status=' + res.status);
    assert.ok(res.body.includes('invalid-captions') || res.body.includes('input-too-large'), res.body);
  } finally {
    server.close();
  }
});

test('POST /api/srt: يقبل مصفوفة ضمن السقف ويُعيد SRT', async () => {
  const { server, port } = await startServer();
  try {
    const captions = [
      { start: 0, duration: 2, translated: 'مرحبا' },
      { start: 2, duration: 3, original: 'World' },
    ];
    const res = await post(port, { captions });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('مرحبا'), res.body);
    assert.ok(res.body.includes('1\n'), res.body);
  } finally {
    server.close();
  }
});