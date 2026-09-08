# Task 07: Subtitle editor frontend — editable timeline in the YouTube studio

## Status

pending

## Wave

3

## Description

Makes the dubbing studio's timeline (currently read-only: click a segment to seek the player at `public/js/youtube-studio.js:141` `renderTimeline`) editable. Each segment row becomes an inline-edit field so users can fix a machine-translated subtitle, then save via the new `PATCH /api/dub/projects/:projectId/segments/:index` endpoint (task-05). After a successful edit, the row shows a confirmation and flags that the final MP4/SRT/VTT are now stale (`derivedStale`).

## Dependencies

**Depends on:** task-05 (backend PATCH endpoint)
**Blocks:** task-09 (multi-language preview reuses the timeline renderer)

## Files to Modify

- `public/js/youtube-studio.js` — `renderTimeline`: add edit affordance, save handler, and success/stale feedback.
- `public/index.html` — timeline section (`yt-timeline`) minor markup for the edit state and a small "derived-stale" notice element if not already present.
- `public/style.css` — styles for editable rows (focus ring, save/error states), following `DESIGN.md`.

## Technical Details

### Current `renderTimeline` (lines 141–171)

- Fetches `/api/dub/projects/{projectId}/translation-{targetLang}.json` → `segments` array.
- Each row: time, speaker, translated text; click seeks the player.

### What to change

1. **Keep the seek-on-click** and the `ontimeupdate` highlighting. But make the text content editable:
   - Render the translated text in a `<textarea>` (or `<input>`, single-line panels are short; textarea is safer for Arabic multi-line) styled to look like plain text until hover/focus (see DESIGN.md forms).
   - Stop the click-to-seek when the user is editing (avoid hijacking drags/selections). Give the row a dedicated edit/save affordance: either an inline ✎ that toggles edit mode, or "make the textarea editable always and expose only a save button". Prefer: **click on the text area focuses/edits; a separate ✔ save button** (fits RTL touch UX better than a hidden-until-hover pencil).
2. **Save flow**:
   - On save: `PATCH /api/dub/projects/:projectId/segments/:index` body `{ lang: <r.targetLang>, translated: <newText> }`.
   - While in-flight: disable the save button, show a spinner class.
   - On success (200): update the local row from `segment` in the response; show a transient green toast/checkmark "تم حفظ التعديل" (inline in the row, not a global toast — localized and minimal). If `derivedStale: true` is present, show a notice "الملف النهائي قديم — أعد الدبلجة لتحديثه".
   - On failure (409 job-running / 404 / 4xx): show inline Arabic error from `errorAr` or a generic "تعذر الحفظ — أعد المحاولة."
3. **Stale notice**: add a small always-shown (or update-on-first-edit) `<p class="yt-stale muted">` under the timeline once edits happen, per task-05's `derivedStale`.
4. **Cleanup**: `renderTimeline` is re-invoked by `renderResult` on every load; make sure listeners are attached per-build and not duplicated (current code reassigns `player.ontimeupdate` each call — that's fine, but guard against duplicate `click`/save listeners on the container).

### API contract (from task-05)

```
PATCH /api/dub/projects/:projectId/segments/:index
{ lang: "ar", translated: "..." }
→ 200 { projectId, lang, index, segment: {...}, derivedStale: true }
   400 invalid-project / invalid-index / invalid-text
   404 translation-not-found
   409 job-running
```

## Acceptance Criteria

- [ ] Opening the studio for a completed project renders editable segments.
- [ ] Editing a segment's text and clicking save PATCHes the backend and shows the updated text inline.
- [ ] A successful save shows "تم حفظ التعديل" plus the stale-notice "الملف النهائي قديم…" when `derivedStale`.
- [ ] Errors show inline in Arabic (usually from `errorAr`), and the edit text is NOT lost on failure (keep the textarea value).
- [ ] Clicking a non-editing area of a row still seeks the player; editing does not trigger a seek.
- [ ] Style follows DESIGN.md (RTL, Cairo/Tajawal, dark, accent color), `dir="rtl"`.
- [ ] Manual browser test: paste link → dub → edit a segment → saved. `npm run lint` passes (no frontend test suite exists; rely on the browser test).

## Notes

- This is frontend-only; rely on the task-05 backend test for endpoint correctness.
- Keep the ARIA/label basics: the textarea should have an accessible label (e.g. `مقطع N`) — not strictly required but consistent with the studio's existing `role="button"` rows.