// public/js/stream.js — SSE client wrapper for POST streaming
// Browser EventSource only supports GET, so we use fetch + ReadableStream

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
        const { parsed, remaining } = parseSSE(buffer);
        buffer = remaining;

        for (const event of parsed) {
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

  const lastNewline = buffer.lastIndexOf('\n');
  const remaining = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : '';

  return { parsed, remaining };
}

export function supportsStreaming() {
  return typeof fetch !== 'undefined'
    && typeof ReadableStream !== 'undefined'
    && typeof TextDecoder !== 'undefined';
}
