# Requirements: Audio Pipeline — STT fallback + Arabic TTS

## Summary

AraLink translates YouTube videos by extracting their captions. Videos without captions
currently show "هذا الفيديو لا يحتوي على ترجمة نصية متاحة" and cannot be translated. This
feature makes those videos work: the server downloads the audio track, transcribes it
locally with Whisper (no API key, via transformers.js ONNX), then translates the
transcription with the existing translation engine. Additionally, the tool gains a
"استمع بالعربية" (Listen in Arabic) feature: any translated result (YouTube captions,
article, plain text) can be spoken aloud in Arabic via a free Google TTS endpoint.

## Goals

- Videos WITHOUT captions are transcribed from audio automatically (no user action).
- Transcription preserves timestamps so captions + SRT download still work.
- The user can hear the translated content in Arabic (audio output).
- Everything works locally with no new API keys (Whisper is local; gTTS is a free endpoint).
- Existing caption-based flow is untouched when captions ARE available.

## Non-Goals

- No dubbing (replacing original audio track with a synthesized one inside the video).
- No UI to select the whisper model at runtime (model chosen via .env).
- No video duration cap for MVP (long videos just take longer to transcribe).

## Acceptance Criteria

- [ ] A YouTube video WITHOUT captions returns translated captions (source: audio),
      timestamped, with working SRT download — no error card.
- [ ] A YouTube video WITH captions behaves exactly as before (no audio download).
- [ ] Whisper model downloads on first use (Hugging Face) and is cached for later runs.
- [ ] "استمع بالعربية" plays the translated text in Arabic for: YouTube captions (whole
      translation), article results, and plain-text results.
- [ ] UI shows a clear notice when the source was transcribed from audio
      ("تم التفريغ من الصوت تلقائيًا — لا توجد ترجمات نصية").
- [ ] All server files pass `node --check`; full flow works on http://localhost:3000.
- [ ] If audio download/transcription fails, the user gets the existing Arabic error card
      (no crash, no hang).

## Assumptions

- ffmpeg is installed and in PATH (verified: Gyan.FFmpeg 8.1.2 via winget).
- Hugging Face is reachable for the one-time Whisper model download (~145MB for
  Xenova/whisper-base). Model is cached in node_modules cache dir afterwards.
- Google translate_tts endpoint remains reachable (verified working, ~28KB mp3).
- msedge-tts is NOT usable in this environment (WebSocket closes mid-synthesis — verified
  failing); gTTS is the primary TTS path. Do not use msedge-tts.

## Technical Constraints

- Backend: Node.js + Express. New files: `server/audio.js`, `server/tts.js`,
  `server/routes-tts.js` (own router; mounted in server.js — avoids touching
  routes-translate.js from two parallel tasks).
- Packages already installed: `youtube-dl-exec` (bundles yt-dlp.exe), `@xenova/transformers`,
  `msedge-tts` (installed but NOT used — see above).
- Whisper pipeline: `@xenova/transformers` v2, `env.allowLocalModels = false`, model id
  from `.env` WHISPER_MODEL (default `Xenova/whisper-base`). Audio must be decoded to a
  Float32Array in Node (no AudioContext) — read a raw f32 file produced by ffmpeg.
- Temp files: use `path.join(os.tmpdir(), 'aralink')` with Windows-style absolute paths
  (yt-dlp on Windows resolved `/tmp/x` to `C:\tmp\x` in testing — always pass absolute paths).
- API key for Gemini stays as translation fallback only — not used for STT/TTS.
