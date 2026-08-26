# Task 10: Testing & Polish

## Status

pending

## Wave

4

## Description

إكمال اختبار شامل لكل الميزات الثلاثة، إصلاح المشاكل، وتحسين الأداء. يشمل: اختبارات وحدة جديدة للـ SSE و context detection و dashboard stats، اختبارات تكامل للتدفق الكامل، وتحسينات أداء.

## Dependencies

**Depends on:** task-07-streaming-ui.md, task-08-dashboard-ui.md, task-09-context-ui.md
**Blocks:** None (final task)

**Context from dependencies:** هذا الـ task يأتي بعد اكتمال كل الميزات الثلاثة. يعتمد على كل المكوناتヂالية المكتملة.

## Files to Create

- `tests/sse.test.js` — SSE endpoint tests
- `tests/context-detect.test.js` — Context detection tests
- `tests/dashboard-stats.test.js` — Dashboard stats API tests
- `tests/smart-context.test.js` — Smart translation with context tests

## Files to Modify

- `tests/ui.test.js` — إضافة اختبارات للملفات الجديدة
- `tests/securityHeaders.test.js` — التأكد من عمل CSP مع Chart.js CDN
- `server/server.js` — أي إصلاحات بسيطة مطلوبة

## Technical Details

### Implementation Steps

1. **SSE Endpoint Tests** (`tests/sse.test.js`):
   ```javascript
   test('POST /api/translate-stream returns SSE headers', async () => {
     const res = await fetch(`${baseUrl}/api/translate-stream`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: 'Hello world', targetLang: 'ar' }),
     });
     assert.equal(res.headers.get('content-type'), 'text/event-stream');
     assert.equal(res.headers.get('cache-control'), 'no-cache');
   });
   
   test('SSE stream sends init event first', async () => {
     const res = await fetch(`${baseUrl}/api/translate-stream`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: 'Hello', targetLang: 'ar' }),
     });
     const text = await res.text();
     assert.match(text, /event: init/);
     assert.match(text, /event: done/);
   });
   
   test('SSE stream sends chunk events', async () => {
     const longText = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
     const res = await fetch(`${baseUrl}/api/translate-stream`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: longText, targetLang: 'ar' }),
     });
     const text = await res.text();
     assert.match(text, /event: chunk/);
   });
   ```

2. **Context Detection Tests** (`tests/context-detect.test.js`):
   ```javascript
   const { detectContext, getContextPrompt } = require('../server/context-detect');
   
   test('detectContext identifies GitHub as technical', () => {
     const ctx = detectContext('https://github.com/user/repo', '');
     assert.equal(ctx.contentType, 'technical');
     assert.ok(ctx.confidence > 0.7);
   });
   
   test('detectContext identifies code patterns', () => {
     const ctx = detectContext('', 'function hello() { return "world"; } const x = 1;');
     assert.equal(ctx.contentType, 'code');
   });
   
   test('detectContext identifies medical content', () => {
     const ctx = detectContext('', 'The patient was diagnosed with hypertension and prescribed medication.');
     assert.equal(ctx.contentType, 'medical');
   });
   
   test('detectContext returns general for unknown content', () => {
     const ctx = detectContext('https://example.com', 'Hello world');
     assert.equal(ctx.contentType, 'general');
   });
   
   test('getContextPrompt returns string for each content type', () => {
     for (const type of ['technical', 'code', 'medical', 'legal', 'news', 'academic', 'general']) {
       const prompt = getContextPrompt({ contentType: type });
       assert.ok(typeof prompt === 'string');
       assert.ok(prompt.length > 50);
     }
   });
   ```

3. **Dashboard Stats Tests** (`tests/dashboard-stats.test.js`):
   ```javascript
   test('GET /api/stats/summary requires admin token', async () => {
     const res = await fetch(`${baseUrl}/api/stats/summary`);
     assert.equal(res.status, 401);
   });
   
   test('GET /api/stats/summary with valid token returns data', async () => {
     const res = await fetch(`${baseUrl}/api/stats/summary`, {
       headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
     });
     assert.equal(res.status, 200);
     const data = await res.json();
     assert.ok(typeof data.total === 'number');
     assert.ok(typeof data.todayCount === 'number');
   });
   
   test('GET /api/stats/timeseries returns7 days', async () => {
     const res = await fetch(`${baseUrl}/api/stats/timeseries?days=7`, {
       headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
     });
     const data = await res.json();
     assert.ok(Array.isArray(data.days));
     assert.equal(data.days.length, 7);
   });
   ```

4. **Smart Context Tests** (`tests/smart-context.test.js`):
   ```javascript
   test('POST /api/translate-smart with URL returns context', async () => {
     const res = await fetch(`${baseUrl}/api/translate-smart`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         text: 'npm install react-router-dom',
         targetLang: 'ar',
         url: 'https://github.com/user/project',
       }),
     });
     const data = await res.json();
     assert.ok(data.context);
     assert.equal(data.context.contentType, 'technical');
   });
   
   test('POST /api/translate-smart without URL still works', async () => {
     const res = await fetch(`${baseUrl}/api/translate-smart`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: 'Hello world', targetLang: 'ar' }),
     });
     assert.equal(res.status, 200);
     const data = await res.json();
     assert.ok(data.translated);
   });
   ```

5. **UI Tests Update** (`tests/ui.test.js`):
   ```javascript
   test('admin.html exists and has required elements', () => {
     const html = fs.readFileSync(path.join(publicDir, 'admin.html'), 'utf8');
     assert.match(html, /id="auth-gate"/);
     assert.match(html, /id="dashboard"/);
     assert.match(html, /chart\.js/);
     assert.match(html, /id="timeseries-chart"/);
   });
   
   test('sw.js includes new files in precache', () => {
     const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
     assert.match(sw, /admin\.html/);
     assert.match(sw, /js\/dashboard\.js/);
     assert.match(sw, /js\/stream\.js/);
   });
   
   test('index.html has dashboard link in settings', () => {
     const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
     assert.match(html, /id="dashboard-link"/);
   });
   ```

6. **Performance Checks**:
   - Verify SSE Time-to-first-token < 2s for short text
   - Verify context detection < 10ms (no API calls)
   - Verify dashboard page loads < 1s
   - Verify Chart.js doesn't block page render

7. **Lint & Syntax Checks**:
   ```bash
   node --check server/routes-sse.js
   node --check server/stats.js
   node --check server/routes-stats.js
   node --check server/context-detect.js
   node --check public/js/stream.js
   node --check public/js/dashboard.js
   npm run lint
   ```

### Test Coverage Summary

| Feature | Unit Tests | Integration Tests |
|---------|-----------|-------------------|
| SSE Streaming | SSE headers, events, abort | Full translation flow |
| Context Detection | Domain detection, keyword scoring, prompts | translate-smart with context |
| Dashboard Stats | Timeseries, providers, languages | Admin auth, API responses |
| Smart Context | Enhanced prompts, backward compat | End-to-end smart translate |

## Acceptance Criteria

- [ ] All new test files pass (`node --check` + `node --test`)
- [ ] SSE endpoint returns correct events in correct order
- [ ] Context detection works for all7 content types
- [ ] Dashboard stats endpoints require admin token
- [ ] Dashboard stats return correct data shapes
- [ ] Smart translation with URL returns context info
- [ ] Smart translation without URL still works (backward compatible)
- [ ] UI tests pass for admin.html, sw.js, index.html updates
- [ ] ESLint passes with0 errors
- [ ] No memory leaks in SSE streams
- [ ] CSP works with Chart.js CDN
- [ ] All existing 230 tests still pass (no regressions)

## Notes

- **Test environment**: Tests use the same test server (no real Gemini calls for context tests — mock if needed)
- **SSE test timeout**: SSE tests may need longer timeouts (30s) since translation takes time
- **Chart.js in tests**: Chart.js is CDN-only — tests that check admin.html just verify the HTML structure, not rendering
- **Performance baseline**: Record current metrics before and after to measure improvement
