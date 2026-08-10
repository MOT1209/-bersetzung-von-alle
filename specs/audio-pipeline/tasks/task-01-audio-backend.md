# Task 01: Audio STT Backend — yt-dlp + ffmpeg + Whisper fallback

## Status

completed — server/audio.js (yt-dlp → ffmpeg → Whisper) + احتياطي no-transcript في handleYouTube مع meta.source='audio'. تم التحقق: تفريغ jNQXAC9IVRw (19ث) → نصوص وتوقيتات. WHISPER_MODEL افتراضي Xenova/whisper-tiny (whisper-base يتعطل على هذا الجهاز).

## Wave

1

## Description

Create `server/audio.js` that downloads a YouTube video's audio track, converts it to raw
16kHz mono PCM with ffmpeg, and transcribes it locally with Whisper (transformers.js ONNX,
no API key) into timestamped text chunks. Then wire it into the existing YouTube flow in
`server/routes-translate.js`: when `getTranscript()` throws `no-transcript`, fall back to
this audio pipeline and feed the transcribed lines through the SAME translation + caption
logic so the frontend and SRT download work unchanged. Tag results with
`meta.source: 'audio'` so the frontend can show a notice (task-03).

## Dependencies

**Depends on:** None (Wave 1). The base project (server skeleton, translate.js,
youtube.js, routes-translate.js) is already complete and working — see "Context from
dependencies" below for the current state you are modifying.

**Blocks:** task-03-frontend.md

**Context from dependencies:** The project already has `server/routes-translate.js` with
`handleYouTube(res, videoId, targetLang, videoLang)` which: (1) calls
`getTranscript(videoId, videoLang)` from `server/youtube.js` (throws `{code:'no-transcript'}`),
(2) maps transcript lines to `{start, duration, original}`, (3) batches them ≤4000 chars,
(4) detects source language, (5) translates each batch with `translateText(joined,
targetLang, sourceLang)` from `server/translate.js`, and (6) responds
`{type:'youtube', videoId, sourceLang, captions:[{start, duration, original, translated}],
meta:{title}}`. Errors are normalized by `sendError(res, e)` using an `ERROR_STATUS` map
(invalid-url→400, fetch-failed/no-transcript/content-empty/pdf-unsupported→422,
translate-failed→502, server-error→500). Your task plugs the audio path in where
`getTranscript` currently throws.

## Files to Create

- `server/audio.js` — audio download + PCM conversion + Whisper transcription

## Files to Modify

- `server/config.js` — add `WHISPER_MODEL` (read from .env, default `Xenova/whisper-base`)
- `server/routes-translate.js` — no-transcript → audio fallback inside `handleYouTube`
- `.env.example` — document `WHISPER_MODEL`

## Technical Details

### Verified environment facts (from testing — trust these)

- `youtube-dl-exec` npm package is installed; usage:
  `const { youtubeDl } = require('youtube-dl-exec');`
  `await youtubeDl('https://www.youtube.com/watch?v=' + videoId, { extractAudio: true,
  audioFormat: 'wav', audioQuality: 0, output: <absPath>, noPlaylist: true })`
  - yt-dlp resolves `/tmp/...` to `C:\tmp\...` on Windows — ALWAYS pass an absolute
    Windows path built with `path.join(os.tmpdir(), 'aralink', ...)`.
  - A 19s video produced a 3.6MB wav in testing. Output path must end in `.wav` (yt-dlp
    appends nothing if the extension matches audioFormat).
- ffmpeg is in PATH. Convert to raw PCM:
  `ffmpeg -y -i <input.wav> -ar 16000 -ac 1 -f f32le <output.f32>`
  (verified: 3.6MB wav → 1.2MB f32, 304089 samples = ~19s).
- `@xenova/transformers` v2 is installed. Pattern (verified working):
  ```js
  const { pipeline, env } = require('@xenova/transformers');
  env.allowLocalModels = false;
  const stt = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
  const buf = fs.readFileSync(pcmPath);
  const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const res = await stt(audio, { task: 'transcribe', return_timestamps: true });
  // res.text = full transcript; res.chunks = [{timestamp:[startSec,endSec], text}]
  ```
  No `language` option → whisper auto-detects. Node has no AudioContext, so you MUST pass
  the Float32Array (never a file path/URL).

### server/audio.js — API to export

```js
async function transcribeVideoAudio(videoId) // → { chunks: [{ start, duration, text }], detectedLang? }
```
- Create temp dir `path.join(os.tmpdir(), 'aralink')` (mkdir recursive).
- Download wav → `audio-<videoId>.wav`, convert → `audio-<videoId>.f32` (delete both at
  the end, in `finally`).
- Whisper pipeline is a module-level lazy singleton promise (load once, reuse):
  ```js
  let sttPromise = null;
  function getPipeline() { if (!sttPromise) sttPromise = pipeline('automatic-speech-recognition', process.env.WHISPER_MODEL || 'Xenova/whisper-base').catch(e => { sttPromise = null; throw e; }); return sttPromise; }
  ```
- Map chunks → `{ start: ts[0], duration: (ts[1]||ts[0]+2) - ts[0], text }` (cap duration
  at 2s min, 10s max; merge consecutive chunks whose text is empty or punctuation-only).
- Cleanup temp files. Errors: rethrow as `{code:'translate-failed'}`-style? NO — throw
  `{code:'audio-failed'}`-style generic → map in routes to `fetch-failed` Arabic message
  ("تعذر الوصول إلى الصفحة") — actually simpler: wrap failures as `{code:'fetch-failed'}`
  so the frontend already has an Arabic message. Decide in routes; keep audio.js errors
  as `Error` with `.code = 'fetch-failed'`.

### routes-translate.js — fallback wiring

In `handleYouTube`, wrap `getTranscript` in try/catch:
```js
let transcript;
try { transcript = await getTranscript(videoId, videoLang); }
catch (e) {
  if (e.code !== 'no-transcript') throw e;
  // fallback: transcribe from audio
  try {
    const { chunks } = await transcribeVideoAudio(videoId);
    transcript = chunks.map(c => ({ text: c.text, offset: Math.round(c.start * 1000), duration: Math.round(c.duration * 1000) }));
    metaSource = 'audio';
  } catch (e2) { throw e2; } // code fetch-failed → 422 Arabic error
}
```
Then the existing batching/translation code continues unchanged. Add `source:
metaSource || 'captions'` into the response `meta` object (keep existing `meta.title`).
Note: `transcribeVideoAudio` may take minutes on long videos — do NOT add a timeout to
the express route beyond the existing fetch handling; the frontend already uses a 120s
fetch timeout, extend it in task-03 if needed (do NOT modify script.js here).

### config.js

Add: `WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-base'` (and use it in
audio.js — read from config, not process.env directly).

### .env.example

Add a commented line: `# نموذج Whisper للتفريغ الصوتي (Xenova/whisper-base | whisper-small | whisper-tiny)` and `WHISPER_MODEL=Xenova/whisper-base`.

## Acceptance Criteria

- [ ] `server/audio.js` exports `transcribeVideoAudio(videoId)` returning
      `{ chunks: [{start, duration, text}] }`.
- [ ] `node --check` passes on all modified/created server files.
- [ ] Video WITHOUT captions (e.g. find one; if none handy, temporarily test by calling
      `transcribeVideoAudio` directly with a known videoId like `jNQXAC9IVRw`) → returns
      transcribed chunks with plausible timestamps matching the audio duration.
- [ ] `POST /api/translate` with a no-captions video returns `type:'youtube'` with
      `captions` array and `meta.source:'audio'` (translation may return
      `{error:'translate-failed'}` if Google/Gemini are rate-limited — that's OK; the
      pipeline itself must reach translation).
- [ ] No temp files left behind in the temp dir after a run.
- [ ] Captioned videos still work unchanged (`meta.source:'captions'`).

## Notes

- Do NOT modify `server/youtube.js`, `server/translate.js`, or `server/tts.js`
  (task-02's file).
- Do NOT modify `script.js`/`index.html`/`style.css` (task-03's files).
- First transcription run downloads the model from Hugging Face (~145MB) — slow on this
  connection; be patient in tests. Cache persists in `node_modules/@xenova/transformers/.cache` (or `transformers.js` cache dir).
- Google/Gemini translation quotas were exhausted during recent testing (429). If
  translation fails in your test, that is EXPECTED — verify the audio pipeline by logging
  the transcribed text before translation.
