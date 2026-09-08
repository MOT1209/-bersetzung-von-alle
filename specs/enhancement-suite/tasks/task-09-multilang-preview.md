# Task 09: Parallel multi-language preview — per-language progress grid + players in the studio

## Status

pending

## Wave

4

## Description

The backend already accepts up to **5 target languages** per dubbing request (`routes-youtube-dub.js:30` — `targetLangs` slices to 5, and returns `jobs: created` = one job per language). But the frontend (`public/js/youtube-studio.js`) only tracks the **first** `jobId`, so a multi-language dub silently produces multiple jobs while the UI shows one. This task makes the studio render a **per-language grid**: one progress card per language (live via its own SSE/poll), and once that language's job completes, that card becomes a playable video with the language's own download buttons — without disturbing the existing single-player layout.

## Dependencies

**Depends on:** task-07 (editable timeline renderer per language — the grid reuses `renderTimeline`)
**Blocks:** None

## Files to Modify

- `public/js/youtube-studio.js` — multi-job orchestration: track all `jobs` from the POST response, poll each, render a per-language grid.
- `public/index.html` — a grid container for language cards (below the main result, or replacing the single timeline when >1 language).
- `public/style.css` — grid layout cards (RTL), progress states.

## Technical Details

### Backend contract (already implemented)

`POST /api/youtube/dub` body `{ url, targetLangs: ['ar','en','tr'], targetLang: 'ar', mode }` responds:

```json
{
  "jobId": "<first>",
  "projectId": "<pid>",
  "status": "queued",
  "jobs": [
    { "jobId": "…", "projectId": "…", "status": "queued", … },
    { "jobId": "…", "projectId": "…", "status": "queued", … }
  ]
}
```

`startDubJobs` (dubbing-service) dispatches one job per lang, each writing to the **same project** `projects/{projectId}/` with `translation-{lang}.json`, `dubbed-{lang}.mp4`, etc.

### What to change

1. **Track all jobs** — after the POST, iterate `data.jobs` (fallback to `[{ jobId: data.jobId, projectId: data.projectId }]` if absent). For each, start a `pollJob` (existing SSE+poll helper) writing into that language's card. Keep the primary (first) job also driving the main player as today (no regression for single-language UX).
2. **Grid container** — add `<div id="yt-multilang" class="yt-multilang">` inside the studio-side result area. Each language renders a card:
   - header: language label (map `ar→العربية`, `en→الإنجليزية`, `de→الألمانية`, `fr→الفرنسية`, `tr→التركية`; unknown → code);
   - a progress bar + label (same as main) while running;
   - when completed: a `<video>` (or `<audio>` + optional poster) using that lang's `videoUrl`, the download links (`videoUrl/audioUrl/srtUrl`), and (via task-07) that language's editable timeline.
3. **Per-language result object** — the completed job's `result` already includes `projectId/targetLang/videoUrl/audioUrl/srtUrl/segments…`. Reuse `renderResult` per card by giving it the language's `result` and a target container — restrict it so it writes into the card's sub-container instead of the shared `yt-player`/`yt-dl-*` IDs (extract the shared bits into a `renderLangCard(result, container)` used by each card; keep the single-language path delegating to it too, for DRY consistency).
4. **Guard against client disconnect** — follow the established SSE pattern (`res.on('close')` on server; the existing `pollJob` fallback timer already guards). Do not leak timers: the existing `settled` guard closes everything on terminal state.
5. **Edge cases**:
   - Zero/one language → behave exactly as today (no grid; single player).
   - A language job fails → the card shows the Arabic error + retry semantics, other cards continue independently.
   - Mode `subtitles` is rejected by the backend already (400 `use-translate-endpoint`) — do not special-case it.

## Acceptance Criteria

- [ ] With 2–5 languages selected and `full-dub`, the studio shows one progress card per language, each live-updating independently.
- [ ] Each completed language card shows its own player + download links + (task-07) editable timeline, without disturbing other cards or the main single-language flow.
- [ ] Single-language flow is visually unchanged (no grid).
- [ ] A failing language doesn't block the others.
- [ ] No leaked timers/EventSource after all jobs settle.
- [ ] RTL Arabic layout per DESIGN.md; `npm run lint` passes; manual browser test with 2 languages.

## Notes

- The backend max is 5 languages; the UI already limits choices to the 5 checkboxes (`ar/en/de/fr/tr`), so no extra validation needed — but clamp to 5 defensively when building the grid.
- This task intentionally does **not** add translation of *new* languages back to the server; it surfaces existing per-language job results. If `targetLangs` is later extended beyond 5, the grid scales automatically.