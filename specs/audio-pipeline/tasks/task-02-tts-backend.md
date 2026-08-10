# Task 02: TTS Backend — POST /api/tts (gTTS + ffmpeg concat)

## Status

completed — server/tts.js (gTTS ≤180 حرف + دمج ffmpeg) + POST /api/tts مثبت في server.js. تم التحقق: عربي قصير → 200 mp3 (0.29ث)، 600 حرف → mp3 واحد 124ث، فارغ → 422 invalid-text.

## Wave

1

## Description

Create `server/tts.js` that converts Arabic (or any language) text into an mp3 using the
free Google `translate_tts` endpoint (gTTS), splitting long text into ≤180-char chunks and
concatenating the mp3s with ffmpeg (installed, in PATH). Expose it as a new route
`POST /api/tts` mounted in `server.js` through a dedicated router file so this task does
not touch `routes-translate.js` (task-01 owns that file in the same wave).

## Dependencies

**Depends on:** None (Wave 1). Existing base: `server/server.js` mounts routers like
`app.use('/api', translateRouter)` from `server/routes-translate.js`; static serving from
project root; errors are JSON `{error: code}`.

**Blocks:** task-03-frontend.md

**Context from dependencies:** The frontend (task-03) will call
`POST /api/tts` with `{text, lang}` and expect `audio/mpeg` bytes back. The `lang` values
are ISO codes the frontend already uses (ar, en, fr, ...) — same codes Google TTS accepts.

## Files to Create

- `server/tts.js` — gTTS fetch + chunking + mp3 concat via ffmpeg
- `server/routes-tts.js` — express Router with `POST /tts`

## Files to Modify

- `server/server.js` — mount the new router: `app.use('/api', ttsRouter);`
- (Do NOT modify `routes-translate.js` — task-01 owns it.)

## Technical Details

### Verified facts (from testing — trust these)

- gTTS endpoint works from this machine (HTTP 200, `audio/mpeg`, ~28KB for a short
  sentence) with a browser User-Agent:
  ```
  GET https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&q=<encodeURIComponent(text)>
  Headers: User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
  ```
- Text longer than ~180 chars per request risks 400/empty audio — split on sentence
  boundaries (.,!?؟…\n) into chunks ≤ 180 chars.
- ffmpeg concatenates mp3s (verified ffmpeg presence; use the concat demuxer):
  - Write chunk files `chunk-<i>.mp3` into the temp dir, write a `list.txt` with one
    `file 'chunk-0.mp3'` line per chunk, then
    `ffmpeg -y -f concat -safe 0 -i <list.txt> -c copy <out.mp3>`.
  - On Windows, escape single quotes in paths carefully; temp dir is
    `path.join(os.tmpdir(), 'aralink')` — avoid spaces (AppData\Local\Temp has none).
- Do NOT use msedge-tts — verified broken in this environment (WebSocket closes with
  "Stream closed before the synthesis completed").

### server/tts.js — API

```js
async function textToMp3Buffer(text, lang = 'ar') // → Buffer of a single concatenated mp3
```
- Trim, guard empty → throw `{code:'invalid-text'}`.
- Cap total text at ~5000 chars (return error `{code:'text-too-long'}` → 422 → frontend
  maps to Arabic "النص طويل جدًا").
- Chunk → fetch each chunk with browser UA + `AbortSignal.timeout(20000)` → collect
  Buffers → if 1 chunk, return it directly; else ffmpeg concat → return the mp3 Buffer.
- Any fetch failure → throw `{code:'tts-failed'}`.
- Clean up temp files in `finally`.
- Language pass-through: `tl=<lang>`; gTTS supports ar, en, fr, es, de, tr, fa, ur, hi,
  id, ru, zh (zh may need `zh-CN`; accept `zh` and let Google handle it) — just pass the
  code through as-is.

### routes-tts.js

```js
const express = require('express');
const { textToMp3Buffer } = require('./tts');
const router = express.Router();
router.post('/tts', async (req, res) => { ... });
module.exports = router;
```
- Body `{ text, lang }` (default lang `'ar'`).
- Success: `res.setHeader('Content-Type', 'audio/mpeg'); res.send(buffer)`.
- Errors: `res.status(code === 'invalid-text' || code === 'text-too-long' ? 422 : 502).json({ error: code })`.

### server.js

Add near the other router mount:
`const ttsRouter = require('./routes-tts');` and `app.use('/api', ttsRouter);`

## Acceptance Criteria

- [ ] `server/tts.js` and `server/routes-tts.js` pass `node --check`.
- [ ] `POST /api/tts` with `{"text":"مرحبا بكم","lang":"ar"}` returns HTTP 200,
      `Content-Type: audio/mpeg`, and non-empty bytes (playable mp3).
- [ ] A long text (~600 chars) returns ONE concatenated mp3 (all chunks audible,
      `ffmpeg` concat works).
- [ ] Empty text returns 422 `invalid-text`; >5000 chars returns 422 `text-too-long`.
- [ ] No temp files left behind.
- [ ] `server.js` still starts and serves existing routes (`/api/health` works).

## Notes

- Do NOT touch `server/routes-translate.js`, `server/youtube.js`, `server/audio.js`
  (task-01), or any frontend file (task-03).
- Google TTS has soft rate limits — a few dozen requests/min are fine; the frontend calls
  this once per "استمع" click, so load is low.
