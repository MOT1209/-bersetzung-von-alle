# Task 04: Cost/quota tracking (TTS segments, translation chars, ffmpeg seconds) + `/api/stats/cost`

## Status

complete

## Wave

1

## Description

AraLink has a translation usage counter (`server/usage.js`) and a stats module (`server/stats.js` + `server/routes-stats.js`), but no cost/quota ledger for compute-heavy work that has real money/CPU cost: **TTS segment count**, **translation characters**, and **ffmpeg/render seconds**. This task adds a lightweight JSON-file cost ledger (`server/cost.js`) with best-effort accumulation (like `usage.js`), hooks the three main consumers, and exposes an admin-only aggregated endpoint `GET /api/stats/cost`.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-08 (admin dashboard cost cards)

## Files to Create

- `server/cost.js` — cost ledger module.

## Files to Modify

- `server/config.js` — add `COST_FILE` env (default `cache/cost.json`).
- `server/routes-stats.js` — add `GET /api/stats/cost`.
- `server/tts.js` — record TTS segments when a TTS buffer is produced.
- `server/translate.js` — record translation characters when text is translated.
- `server/audio.js` (or `server/dubbing/`) — record ffmpeg seconds for render/mix/mux operations.

## Technical Details

### Current behavior

`server/usage.js` counts completed translations (total, byType/byTarget/bySource). `server/stats.js` keeps a serialized `stats-log.json` (each entry: type, sourceLang, targetLang, provider, ts) used by `getSummary/getTimeseries/getProviders/getLanguages/getHourly`. `server/routes-stats.js` is admin-gated.

### Cost ledger shape

Follow the `usage.js` pattern exactly: JSON file, atomic write via tmp+rename, best-effort (never breaks a request). Schema:

```json
{
  "ttsSegments": 0,
  "translationChars": 0,
  "ffmpegSec": 0,
  "byType": { "youtube-dub": 1, "local-video": 2 },
  "updatedAt": "2026-09-08T12:00:00.000Z"
}
```

`server/cost.js` exposes:

```js
async function getCost()          // → full object (merged with zero defaults)
async function trackCost(incr)    // incr: { ttsSegments?, translationChars?, ffmpegSec?, type? } — atomic, never throws
module.exports = { getCost, trackCost }
```

All increments are numbers; `type` increments `byType[type].ttsSegments/translationChars/ffmpegSec` sub-counters too (so the admin can see per-type cost). Keep the totals flat at top level for quick cards.

### Hook points

1. **TTS segments** — in `server/tts.js`, inside `textToMp3BufferWithVoice` (and optionally `textToMp3Buffer`): after a successful buffer is produced, fire `trackCost({ ttsSegments: 1, type: 'tts' })`. Best-effort. Note: dubbing calls `textToMp3BufferWithVoice` once per segment, so this counts dubbing TTS too.
2. **Translation chars** — in `server/translate.js`, in the chunking/translate wrapper (`translateTextWithMeta` or its caller in `routes-translate.js`): after each successful provider translation, `trackCost({ translationChars: <input chars rounded up to 1000>, type: 'translate' })`. Use the *sent* text length (chunk), rounded to nearest 1000 so the ledger stays coarse and cheap. Rounding also hides per-chunk noise.
3. **ffmpegSec** — the render/mix/mux ffmpeg commands currently live in:
   - `server/dubbing/timing-engine.js` (`fitAudioToSlot` — per segment)
   - `server/dubbing/audio-mixer.js` (`mixSegments`)
   - `server/dubbing/export-service.js` (`muxVideo`, `extractOriginalAudio`)
   - `server/audio.js` (PCM conversion in `transcribeMediaFile`)
   - `server/downloader.js` (yt-dlp video/audio — optional; ffmpeg is the itemized cost, video download is bandwidth)
   
   For the initial version, instrument the **three dubbing heavyweights** (`fitAudioToSlot`, `mixSegments`, `muxVideo`) by timing the `execFileAsync` call and adding `Math.ceil(secs)` to `trackCost({ ffmpegSec: n, type: 'dub' })`. To avoid touching every file, consider a tiny helper `server/dubbing/ffmpeg-cost.js` — but if that feels over-engineered, inline the timer+`trackCost` in the three call sites. Keep it cheap: compute seconds, ceil, track, move on. Do NOT instrument every audio conversion in v1 (PCM prep is short). Document this scope in the module header.

### New endpoint

In `server/routes-stats.js`:

```js
const { getCost } = require('./cost');

// GET /api/stats/cost — cost/quota ledger (admin only)
router.get('/cost', async (req, res, next) => {
  try {
    res.json(await getCost());
  } catch (err) {
    next(err);
  }
});
```

Mounted under the existing admin middleware in `server/server.js` (all `/api/stats/*` routes are already admin-gated). Add the path to `tests/smoke.test.js`'s route check AND to `tests/rateLimitCoverage.test.js` if stats are asserted there.

## Acceptance Criteria

- [ ] `GET /api/stats/cost` (with ADMIN_TOKEN) returns `{ ttsSegments, translationChars, ffmpegSec, byType, updatedAt }` with zero defaults on first boot.
- [ ] Listening to a translated text increments `ttsSegments`.
- [ ] Translating text increments `translationChars` (rounded to 1000s).
- [ ] A dubbing job increments `ffmpegSec` across its render steps and its per-segment `fitAudioToSlot` work (best-effort; a failure to write the file never fails the job/request).
- [ ] `node --check` passes on all touched files; `npm run lint` passes; smoke/rateLimit tests still pass.

## Notes

- Follow `usage.js`'s proven atomic-write + `EPERM/EACCES/EBUSY` fallback to `copyFile`. Reuse this exact pattern (do not copy-paste a divergent version — small `require('./usage')` style duplication is acceptable; there is no shared low-level writer).
- File location: `cache/cost.json` (configurable via `COST_FILE`), same directory as `usage.json`.
- Do not touch SQLite/`server/db/` — this is a JSON best-effort ledger, consistent with the existing stats/usage precedent.