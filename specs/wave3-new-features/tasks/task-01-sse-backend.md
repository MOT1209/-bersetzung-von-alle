# Task 01: SSE Backend Endpoint

## Status

pending

## Wave

1

## Description

إنشاء endpoint جديد `POST /api/translate-stream` يُعيد تدفق Server-Sent Events (SSE) بدلاً من JSON واحد. كل سطر مترجم يُرسل كحدث فوري مباشرة بعد اكتماله. هذا يقلل Time-to-first-token بشكل كبير ويعطي المستخدم إحساسًا بالتقدم.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-sse-client.md, task-07-streaming-ui.md

**Context from dependencies:** هذا الـendpoint هو الأساس الذي يعتمد عليه كل من client wrapper والـUI integration. لا يوجد شيء مسبق يحتاجه — هو يعيد بناءً على الترجمة الحالية في `server/routes-translate.js`.

## Files to Create

- `server/routes-sse.js` — SSE streaming route handler

## Files to Modify

- `server/server.js` — تسجيل الـ new route مع rate limiter

## Technical Details

### Implementation Steps

1. إنشاء `server/routes-sse.js` بـ Express Router
2. نسخ منطق `POST /api/translate` في `routes-translate.js` لكن مع تعديلات SSE:
   - بدلاً من `res.json(result)`، نرسل كل سطر عبر `res.write()`
   - استخدام `Content-Type: text/event-stream` + `Cache-Control: no-cache` + `Connection: keep-alive`
   - إرسال `res.flushHeaders()` في البداية
3. لكل سطر مترجم بعد chunking، نرسل:
   ```
   event: chunk
   data: {"index":0,"text":"الترجمة الأولى","total":5}
   
   ```
4. في البداية نرسل `event: init` مع metadata
5. في النهاية نرسل `event: done` مع النتيجة الكاملة
6. معالجة الأخطاء عبر `event: error`
7. تسجيل الـroute في `server/server.js` مع `heavyLimiter`

### SSE Event Format

```javascript
// Init event — يُرسل أولاً
event: init
data: {"type":"article","sourceLang":"en","targetLang":"ar","totalChunks":5,"title":"Article Title"}

// Chunk event — لكل سطر مترجم
event: chunk
data: {"index":0,"text":"الترجمة الأولى","total":5}

// Progress event — تحديث التقدم
event: progress
data: {"processed":3,"total":5,"percent":60}

// Done event — عند الاكتمال
event: done
data: {"type":"article","sourceLang":"en","translated":"...full text...","captions":null,"meta":{...}}

// Error event — عند الخطأ
event: error
data: {"error":"server-error","status":500}
```

### Code Pattern

```javascript
// server/routes-sse.js
const express = require('express');
const router = express.Router();

router.post('/translate-stream', async (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx proxy support
  res.flushHeaders();

  // Send init event
  res.write(`event: init\ndata: ${JSON.stringify({ type, sourceLang, targetLang, totalChunks })}\n\n`);

  // For each translated chunk:
  res.write(`event: chunk\ndata: ${JSON.stringify({ index: i, text: translatedChunk, total: totalChunks })}\n\n`);

  // On complete:
  res.write(`event: done\ndata: ${JSON.stringify(fullResult)}\n\n`);
  res.end();
});
```

### Key Implementation Details

- **Chunking**: reuse existing `chunkText()` from `server/translate.js`
- **Translation**: reuse existing `translateTextWithMeta()` from `server/translate.js`
- **Provider chain**: same fallback logic as current translation
- **Caching**: check cache first for each chunk, send cached chunks immediately
- **Glossary**: apply glossary after translation (same as current)
- **Abort**: handle client disconnect via `req.on('close', () => { aborted = true; })`
- **Rate limiting**: use existing `heavyLimiter`
- **Timeout**: 300 seconds (same as current translate endpoint)

### API Endpoint

- `POST /api/translate-stream`
- **Request body**: same as `/api/translate` — `{ url, targetLang, glossary?, provider? }`
- **Response**: `text/event-stream` with SSE events

## Acceptance Criteria

- [ ] `POST /api/translate-stream` returns `Content-Type: text/event-stream`
- [ ] `event: init` is sent first with metadata
- [ ] `event: chunk` is sent for each translated chunk with index, text, total
- [ ] `event: done` is sent with full result when complete
- [ ] `event: error` is sent on failure
- [ ] Client disconnect aborts translation (no wasted work)
- [ ] Rate limiting works via heavyLimiter
- [ ] Cache is checked per-chunk (cached chunks sent instantly)
- [ ] Works with all6 translation providers (Google, MyMemory, Libre, Gemini, DeepL, Zen)

## Notes

- **YouTube handled separately**: YouTube translations should use the same SSE pattern but send captions line-by-line instead of chunks
- **Text mode**: `POST /api/translate-stream` should also accept `{ text, targetLang }` for raw text translation
- **Compression**: `res.flushHeaders()` is important — without it, gzip buffering delays the first event
- **nginx/Cloudflare**: `X-Accel-Buffering: no` prevents proxy buffering
