# Task 01: Wire EdgeTTS (with voice) into the `/api/tts` listen endpoint

## Status

complete

## Wave

1

## Description

The in-app "listen" button calls `POST /api/tts` which currently uses `tts.textToMp3Buffer` — the robotic free Google gTTS voice. The dubbing pipeline already uses the natural EdgeTTS voices via `tts.textToMp3BufferWithVoice` (default configured by `TTS_ENGINE=edge`). This task makes the listen endpoint use EditEdgeTTS voices too, so users hear natural male/female/speed-adjustable audio instead of robot speech. Long text (>1500 chars) and any Edge failure gracefully fall back to gTTS — this behavior already exists in `textToMp3BufferWithVoice`.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task only touches the TTS route/engine that already exists and works for dubbing; we simply direct the listen endpoint through the voice-aware path.

## Files to Create

- None.

## Files to Modify

- `server/routes-tts.js` — switch to the voice-aware call and accept optional `voice`/`gender`/`rate` body fields.
- `server/tts.js` — (small) ensure `textToMp3BufferWithVoice` accepts and honors a `rate` (speed) option when present, forwarding it to the Edge `synthesize` call. Verify no change is needed if rate is already threaded through.

## Technical Details

### Current behavior

`server/routes-tts.js` currently does:

```js
const { textToMp3Buffer } = require('./tts');
// ...
router.post('/tts', async (req, res) => {
  const { text, lang } = req.body || {};
  const buffer = await textToMp3Buffer(text, lang || 'ar');
  // ...
});
```

`server/tts.js` already exposes `textToMp3BufferWithVoice(text, lang, voice)`:

```js
const EDGE_TEXT_LIMIT = 1500;
async function textToMp3BufferWithVoice(text, lang = 'ar', voice = null) {
  // clean/validate
  const engine = (config && config.TTS_ENGINE) || 'edge';
  if (engine !== 'gtts' && clean.length <= EDGE_TEXT_LIMIT) {
    try {
      const { edgeVoiceFor } = require('./dubbing/voice-manager');
      const edge = require('./edge-tts');
      const voiceName = typeof voice === 'string' ? voice
        : edgeVoiceFor(lang, voice && voice.gender);
      if (voiceName) return await edge.synthesize(clean, { voice: voiceName });
    } catch (e) {
      if (e && (e.code === 'invalid-text' || e.code === 'text-too-long')) throw e;
    }
  }
  return textToMp3Buffer(clean, lang);
}
```

`server/edge-tts.js` `synthesize(text, { voice, rate = 1 })` already supports `rate` and passes it to `toStream(..., { rate })`.

### Implementation Steps

1. In `server/routes-tts.js`, import `textToMp3BufferWithVoice` instead of (or in addition to) `textToMp3Buffer`.
2. Read optional body fields: `voice` (a string Edge ShortName), `gender` (`'male'`/`'female'`), and `rate` (number, default 1).
3. Build a `voiceOption`:
   - If `voice` string provided → pass the string.
   - Else if `gender` provided → pass `{ gender }` so `edgeVoiceFor` picks the right Edge voice for the language.
   - Else → pass `null` (default voice selection by language).
4. If a `rate` was provided, extend the call to honor speed. `edge-tts.js` `synthesize` already accepts `{ voice, rate }`; check whether `textToMp3BufferWithVoice` forwards `rate`. If it does not, add an optional `rate` parameter to `textToMp3BufferWithVoice` and pass it through to `edge.synthesize(clean, { voice, rate })`. Keep gTTS fallback path unaffected (gTTS has no rate; do not apply rate there).
5. Preserve the existing response contract: on success return `audio/mpeg` buffer; on `invalid-text`/`text-too-long` return 422; otherwise 502 with `{ error }`.
6. Keep the client contract backward compatible: `POST /api/tts` with only `{ text, lang }` must behave exactly as before (defaults to Edge voice for the language when available, gTTS otherwise).

### Code Snippets

```js
// server/routes-tts.js
const { textToMp3BufferWithVoice } = require('./tts');

router.post('/tts', async (req, res) => {
  const { text, lang, voice, gender, rate } = req.body || {};
  try {
    const voiceOption = voice
      ? voice
      : (gender ? { gender } : null);
    const buffer = await textToMp3BufferWithVoice(text, lang || 'ar', voiceOption, {
      rate: Number(rate) || 1,
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    const code = err && err.code ? err.code : 'tts-failed';
    const status = code === 'invalid-text' || code === 'text-too-long' ? 422 : 502;
    res.status(status).json({ error: code });
  }
});
```

The signature of `textToMp3BufferWithVoice` should become: `textToMp3BufferWithVoice(text, lang, voice, opts = {})` where `opts.rate` defaults to 1 and is only applied on the Edge path.

### Environment Variables

- `TTS_ENGINE` — already exists; `edge` (default) or `gtts`. No new variable needed.

### API Endpoints

- `POST /api/tts` — body `{ text, lang?, voice?, gender?, rate? }` → `audio/mpeg` (200) or error (422/502).

## Acceptance Criteria

- [ ] `POST /api/tts` with `{ text: "مرحبا", lang: "ar" }` returns `audio/mpeg` and uses EdgeTTS (verify via test double or by confirming the Edge path is taken for short text when `TTS_ENGINE=edge`).
- [ ] Passing `gender: "female"` (or `voice: "ar-SA-ZariyahNeural"`) changes the voice selection.
- [ ] Passing `rate: 1.2` is forwarded to the Edge synthesizer (or is a no-op when gTTS fallback is used).
- [ ] Text longer than `EDGE_TEXT_LIMIT` (1500) falls back to gTTS without error.
- [ ] Empty/invalid text returns 422 `invalid-text`; the fallback still returns 502 on engine failure.
- [ ] `node --check server/routes-tts.js server/tts.js` passes; `npm run lint` passes.

## Notes

- `server/edge-tts.js` has a 10-minute circuit breaker (`tripBreaker`) — when tripped, `synthesize` throws `edge-cooling` and the caller already falls back to gTTS. Keep that behavior; do not remove it.
- There is no dedicated TTS route test; `/api/tts` is covered by `tests/smoke.test.js` and `tests/rateLimitCoverage.test.js` (both assert the path exists). Keep both passing after your change.
