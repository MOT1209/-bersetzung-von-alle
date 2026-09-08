# Task 05: Subtitle editor backend — PATCH a segment's translation + re-generate its TTS

## Status

complete

## Wave

2

## Description

Refines the dubbing project experience: users often need to fix a machine-translated subtitle. This task adds a backend endpoint that edits a specific segment's `translated` text in a project's `translation-{lang}.json` and **regenerates only that segment's TTS clip** (and leaves all other segments untouched). It builds on the existing lifecycle where segments are persisted as `translation-{lang}.json` in `projects/{projectId}/` and TTS clips live in `projects/{projectId}/tts-{lang}/seg-NNN.mp3`.

## Dependencies

**Depends on:** task-04 (optional — cost hook can be added later; the endpoint itself does not require it)
**Blocks:** task-07 (subtitle editor frontend)

## Files to Create

- None.

## Files to Modify

- `server/routes-youtube-dub.js` — add `PATCH /api/dub/projects/:projectId/segments/:index`.
- `server/dubbing/dubbing-service.js` (or a new small helper `server/dubbing/segment-edit.js`) — core logic: load `.json`, validate index, edit `translated`, regenerate TTS, re-run fit, update file, return fresh segment.

## Technical Details

### Current data layout (from `dubbing-pipeline.js`)

- `projects/{projectId}/translation-{targetLang}.json` — array of segments.
- Each segment: `{ start, end, duration, text, speaker, original, translated, voice, audio }` where `audio` is the TTS clip **basename** (`seg-NNN.mp3`).
- TTS clips: `projects/{projectId}/tts-{targetLang}/seg-NNN.mp3` plus `seg-NNN-raw.mp3`.
- Pipeline uses `tts.textToMp3BufferWithVoice(translated, lang, voice)` then `fitAudioToSlot(rawPath, fitPath, slotSec)`.

### New endpoint

```
PATCH /api/dub/projects/:projectId/segments/:index
Body: { lang: "ar", translated: "النص المصحح" }
```

Behavior:
1. Validate `projectId` (`/^[a-zA-Z0-9_-]{1,40}$/`) and `lang` (`LANG_RE`). Else 400.
2. Read `projects/{projectId}/translation-{lang}.json`. If missing → 404 `{ error: 'translation-not-found' }`.
3. `index` integer, within bounds → else 400 `{ error: 'invalid-index' }`.
4. `translated` non-empty string (max length e.g. 1500) → else 400 `{ error: 'invalid-text' }`.
5. Load the segment. Keep `start/end/duration/original/voice/speaker`. Update `translated`.
6. Regenerate audio for **this segment only**:
   - raw path: `tts-{lang}/seg-NNN-raw.mp3` (existing naming from pipeline).
   - fit path: `.../seg-NNN.mp3`.
   - `const buf = await tts.textToMp3BufferWithVoice(translated, lang, seg.voice);`
   - `await fitAudioToSlot(rawPath, fitPath, slotSec)` where `slotSec = Math.max(1, (seg.end - seg.start))`.
   - Update `seg.audio = 'seg-NNN.mp3'`.
7. Write `translation-{lang}.json` back with the mutated segment.
8. Return `res.json({ projectId, lang, index, segment })` (200).

If TTS/ffmpeg fails for the segment: still **save the text edit** (user's fix must not be lost) but return the segment with `audio: null` and `audioError: code`. The frontend (task-07) will show "تم الحفظ — تعذر إعادة توليد الصوت".

### Also update derived artifacts?

The final `dubbed-{lang}.mp4`, `dubbing-{lang}.mp3`, `.srt`, `.vtt` are **out of date** after an edit. Options:
- **V1 (scope):** do NOT re-mix/mux. Return the updated segment plus a warning `derivedStale: true` so the UI can tell the user "الملف النهائي قديم — أعد الدبلجة لإنشائه". This keeps the task small and safe (no re-download of source).
- The task explicitly documents that re-mux is future work.

## Acceptance Criteria

- [ ] Editing a valid segment saves the new `translated` text in `translation-{lang}.json` and regenerates only that one segment's `seg-NNN.mp3`.
- [ ] The endpoint reports the saved segment and `derivedStale: true`.
- [ ] Invalid index, lang, projectId, or empty text → 400/404 as specified.
- [ ] A TTS failure still persists the text and returns `audio: null` + an error code (200, not 500).
- [ ] New route is mounted in `server.js` and covered by `tests/smoke.test.js` (add the path); a new or existing dub test (`tests/youtube-dub.test.js`) asserts success + the no-crash TTS-failure path.
- [ ] `node --check` passes; `npm run lint` passes.

## Notes

- `routes-youtube-dub.js` already includes `SAFE_FILE` handling for `translation-*.json` reads; reuse its sanitization idioms for projectId.
- Do not modify the running job pipeline in this task — this is a standalone edit that operates on completed projects (or projects whose job finished). Guard: if a `GET /api/dub/projects/:id/jobs` shows a job still `processing`, return 409 `{ error: 'job-running' }` to avoid mid-write races.
- Wire cost tracking via `server/cost.js` (task-04) for the regenerated TTS segment if task-04 is landed; otherwise leave a TODO comment.