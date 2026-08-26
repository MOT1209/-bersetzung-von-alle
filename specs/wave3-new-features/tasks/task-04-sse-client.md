# Task 04: SSE Client Wrapper

## Status

pending

## Wave

2

## Description

إنشاء client-side wrapper لـ EventSource يتعامل مع SSE streaming من `POST /api/translate-stream`. المتصفح لا يدعم `EventSource` مع POST requests مباشرة (فقط GET)، لذا نستخدم `fetch` مع `ReadableStream` لقراءة الـ SSE events. الـ wrapper يوفر واجهة بسيطة: `onInit`, `onChunk`, `onProgress`, `onDone`, `onError`.

## Dependencies

**Depends on:** task-01-sse-backend.md
**Blocks:** task-07-streaming-ui.md

**Context from dependencies:** task-01 ينشئ `POST /api/translate-stream` الذي يُعيد `text/event-stream`. هذا الـ wrapper يقرأ هذا التدفق ويحوّله لاستدعاءات callback بسيطة.他知道 الـ event format (event: init/chunk/done/error, data: JSON).

## Files to Create

- `public/js/stream.js` — SSE client wrapper

## Files to Modify

- None (يُستخدم بواسطة app.js في Wave 3)

## Technical Details

### Implementation Steps

1. إنشاء `public/js/stream.js` بـ ES module
2. تنفيذ `streamTranslate(options)` using fetch + ReadableStream
3. معالجة SSE events بـ TextDecoder
4. تغليف النتائج في callbacks بسيطة

### API Design

```javascript
// public/js/stream.js

/**
 * Stream translation via SSE
 * @param {Object} options
 * @param {string} options.url - Translation URL (or null for text)
 * @param {string} options.text - Raw text (or null for URL)
 * @param {string} options.targetLang - Target language code
 * @param {Array}  options.glossary - Glossary pairs
 * @param {string} options.provider - Preferred provider
 * @param {Object} callbacks
 * @param {Function} callbacks.onInit - Called with metadata
 * @param {Function} callbacks.onChunk - Called with each translated chunk
 * @param {Function} callbacks.onProgress - Called with progress update
 * @param {Function} callbacks.onDone - Called with full result
 * @param {Function} callbacks.onError - Called on error
 * @returns {Function} abort function
 */
export function streamTranslate(options, callbacks) {
  const controller = new AbortController();
  
  (async () => {
    try {
      const res = await fetch('/api/translate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: options.url,
          text: options.text,
          targetLang: options.targetLang,
          glossary: options.glossary,
          provider: options.provider,
        }),
        signal: controller.signal,
      });
      
      if (!res.ok) {
        callbacks.onError?.({ error: 'stream-failed', status: res.status });
        return;
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const events = parseSSE(buffer);
        buffer = events.remaining;
        
        for (const event of events.parsed) {
          switch (event.type) {
            case 'init':     callbacks.onInit?.(event.data); break;
            case 'chunk':    callbacks.onChunk?.(event.data); break;
            case 'progress': callbacks.onProgress?.(event.data); break;
            case 'done':     callbacks.onDone?.(event.data); break;
            case 'error':    callbacks.onError?.(event.data); break;
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        callbacks.onError?.({ error: 'network-error', status: 0 });
      }
    }
  })();
  
  return () => controller.abort();
}
```

### SSE Parser

```javascript
function parseSSE(buffer) {
  const lines = buffer.split('\n');
  const parsed = [];
  let currentEvent = null;
  let currentData = [];
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData.push(line.slice(6));
    } else if (line === '') {
      // Empty line = end of event
      if (currentEvent && currentData.length) {
        try {
          parsed.push({
            type: currentEvent,
            data: JSON.parse(currentData.join('\n')),
          });
        } catch {}
      }
      currentEvent = null;
      currentData = [];
    }
  }
  
  // Remaining unparsed data
  const lastNewline = buffer.lastIndexOf('\n');
  const remaining = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : '';
  
  return { parsed, remaining };
}
```

### Fallback Strategy

```javascript
// If fetch ReadableStream is not available (old browsers):
export async function translateFallback(options) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await res.json();
  return data;
}

// Check if streaming is supported:
function supportsStreaming() {
  return typeof fetch !== 'undefined' 
    && typeof ReadableStream !== 'undefined'
    && typeof TextDecoder !== 'undefined';
}
```

## Acceptance Criteria

- [ ] `streamTranslate()` sends POST to `/api/translate-stream`
- [ ] Reads response body as ReadableStream
- [ ] Parses SSE events correctly (event:, data:, blank line separator)
- [ ] Calls `onInit`, `onChunk`, `onProgress`, `onDone`, `onError` callbacks
- [ ] Returns abort function to cancel translation
- [ ] Handles network errors gracefully
- [ ] Fallback to `/api/translate` (JSON) for old browsers
- [ ] No memory leaks (reader is properly closed)
- [ ] Works with Arabic RTL text (no encoding issues)

## Notes

- **POST not GET**: `EventSource` API only supports GET. We use `fetch` + `ReadableStream` for POST SSE.
- **Text decoder**: Must handle UTF-8 correctly for Arabic text
- **Reconnection**: Not needed — translation is a single request-response flow
- **Buffer management**: The parser must handle partial events across chunks correctly
