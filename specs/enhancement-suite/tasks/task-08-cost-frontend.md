# Task 08: Cost counter frontend — cost/quota cards in the admin dashboard

## Status

complete

## Wave

3

## Description

Adds three cost/quota stat cards to the admin dashboard (`public/admin.html` + `public/js/dashboard.js`): **TTS segments** (`ttsSegments`), **translation characters** (`translationChars`), and **ffmpeg render seconds** (`ffmpegSec`), all fed by the new admin-only `GET /api/stats/cost` endpoint (task-04). The cards display the totals with human-friendly units and a `byType` breakdown (where the backend tracks per-type sub-counters).

## Dependencies

**Depends on:** task-04 (backend `GET /api/stats/cost`)
**Blocks:** None

## Files to Modify

- `public/js/dashboard.js` — fetch cost, render three cards + a per-type table.
- `public/admin.html` — markup for the cost cards + `byType` table, matching the existing dashboard layout.

## Technical Details

### Endpoint (from task-04)

```
GET /api/stats/cost   (x-admin-token header)
→ { ttsSegments: 123, translationChars: 456000, ffmpegSec: 789, byType: { "dub": {...} }, updatedAt: "ISO" }
```

### What to add

1. In `init()`'s `Promise.all`, add `fetchStats('cost')` (wrap in try/catch so a missing report never breaks the dashboard — same pattern as `renderQuality`).
2. Render three cards, next to the existing total/today/week counts:
   - 🎙️ **مقاطع TTS**: `ttsSegments.toLocaleString('ar')` — e.g. `1,234`.
   - ✍️ **أحرف الترجمة**: `translationChars.toLocaleString('ar')` — compact form `1.2M` / `45k` (Arabic-friendly: use `Intl.NumberFormat('ar', { notation: 'compact' })`).
   - 🎞️ **ثواني المعالجة (ffmpeg)**: `fmtDuration(ffmpegSec)` → e.g. `13:10` (mm:ss) or hours `2س 05د` — match the dashboard's existing compact style.
3. A small `byType` breakdown table under the cards, only when present: rows = type → per-type `ttsSegments`/`translationChars`/`ffmpegSec`. Columns RTL-aligned. If `byType` is empty, show a muted "لا توجد بيانات بعد".
4. `updatedAt` shown as a muted caption: `آخر تحديث: <toLocaleString('ar')>`.
5. Handle missing/zero gracefully: default all values to 0.

### TTS/labels note

Use the same font-weight/color system as the existing cards (`total-count` etc.) which live in `admin.html`. Follow DESIGN.md dark accent style. All labels are Arabic, RTL.

## Acceptance Criteria

- [ ] With a valid ADMIN_TOKEN, the dashboard shows the three cost cards.
- [ ] Values formatted sensibly (Arabic locale numerals, compact for large char counts).
- [ ] The `byType` table renders per-type sub-totals and hides gracefully when absent.
- [ ] A failing/missing `cost` fetch does not break the rest of the dashboard (same pattern as `renderQuality`).
- [ ] Manual browser test on `admin.html` with a stubbed/real `/api/stats/cost`. `npm run lint` passes.

## Notes

- This is frontend-only; the backend contract is defined and tested in task-04. If `byType`/`updatedAt` are absent, code must default gracefully (older/newer backend).
- There is no JS test harness for the frontend; verify via manual browser test and keep the code pattern consistent with the existing chart renderers.