# Task 03: Frontend — استمع بالعربية + notice for audio-sourced results

## Status

completed — زر «🔊 استمع بالعربية» + مشغل <audio> + إشعار «تم التفريغ من الصوت تلقائيًا» عند meta.source='audio' + رفع مهلة الجلب إلى 5 دقائق. node --check سليم.

## Wave

2

## Description

Add the "استمع بالعربية" (Listen in Arabic) feature to the RTL UI: a button that sends the
translated content to `POST /api/tts` and plays the returned Arabic mp3. Also show a clear
notice when a YouTube result was transcribed from audio (no captions), and raise the fetch
timeout for long audio-transcribed requests. The result flow (renderResult/renderTab in
script.js) must keep working for all three types (youtube / article / text).

## Dependencies

**Depends on:** task-01-audio-backend.md, task-02-tts-backend.md

**Context from dependencies:** task-01 makes `POST /api/translate` return
`meta.source: 'audio'` (or `'captions'`) for YouTube results, plus the existing
`captions:[{start,duration,original,translated}]`, `translatedBlocks`, `originalBlocks`,
`sourceLang`, `meta.title`. task-02 provides `POST /api/tts` accepting
`{text, lang}` and returning `audio/mpeg` bytes (single mp3; long text is concatenated
server-side). Existing frontend files: `index.html` (RTL shell, result section with
`#result-header` containing tabs + `#srt-btn`, `#result-body`, `#meta-line`, `#error`
card), `style.css` (DESIGN.md tokens: --primary, --accent, --success, --danger, btn-srt
style etc.), `script.js` (state machine, `renderResult`, `renderTab`, `downloadSrt`,
`postJson`, `ERROR_MESSAGES`, `mapError`). `dir="rtl"` everywhere, all UI text Arabic.

## Files to Modify

- `index.html` — add a "استمع بالعربية" button next to the SRT button in `#result-header`
  (only visible when there is translated content)
- `style.css` — style the new button (mirror `.btn-srt` look, accent color), plus a small
  "source notice" style
- `script.js` — listen logic, audio playback, source notice, timeout bump, error mapping

## Technical Details

### HTML

In `#result-header` (which currently holds `.tabs` and `#srt-btn`), add:
```html
<button type="button" id="listen-btn" class="btn-listen" hidden>🔊 استمع بالعربية</button>
```
Place it next to `#srt-btn`. It is shown only when the current result has translated
content to speak (always for youtube/article/text results).

### script.js

1. **Reference + listener**: grab `#listen-btn`, add click → `listenToResult()`.
2. **listenToResult()**:
   - Guard: if `state.running` return; set a local busy flag to prevent double clicks
     (disable button, re-enable in finally).
   - Build text per type from `state.current` (the CURRENT TAB's content? No — always the
     translated content):
     - youtube → join `captions.map(c => c.translated || c.original).join(' ')`
     - article → `translatedBlocks.map(b => b.content).join(' ')`
     - text → `data.translated`
   - If empty → return.
   - Lang: `targetLang.value` (user's chosen target language — usually 'ar').
   - `const res = await fetch('/api/tts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text, lang: targetLang.value }), signal: AbortSignal.timeout(60000)});`
   - If `!res.ok` → parse `{error}` → show error card via existing `showError(code)` with
     a new mapping for `tts-failed` → "تعذر توليد الصوت — حاول مجددًا" and
     `text-too-long` → "النص طويل جدًا للقراءة الصوتية".
   - Else → `const blob = await res.blob(); const url = URL.createObjectURL(blob);`
     create an `<audio>` element (or reuse a module-level one), set `src=url`,
     `controls=false`, call `.play()`; on `ended`/`error` revoke the URL. Keep it simple:
     one hidden `<audio id="tts-player">` in index.html is cleanest.
3. **Timeout bump for translate**: the existing `postJson` uses `AbortSignal.timeout(120000)`
   — audio transcription can exceed 2 minutes on long videos. Change to 300000 (5 min).
4. **Source notice**: in `renderResult`, after `metaLine` is set, if
   `data.type === 'youtube' && data.meta && data.meta.source === 'audio'`, show a notice
   element (add `<p id="source-notice" class="source-notice" hidden></p>` in index.html
   under `#meta-line`; fill text: "تم التفريغ من الصوت تلقائيًا — لا توجد ترجمات نصية").
   Hide it otherwise.
5. **Listen button visibility**: in `renderResult`, `listenBtn.hidden = false` for all
   types (there is always translated content). In the mode-toggle handler that hides
   results, also hide the listen button (it already hides `#srt-btn`; do the same).

### style.css

- `.btn-listen`: same base as `.btn-srt` (transparent bg, 1px accent border, accent text,
  radius 12px, padding 8px 16px, hover glow) — differentiate slightly (use `--success`
  tint so users distinguish listen from download).
- `.source-notice`: small muted/warning line (color `--warning`), font-size 0.85rem,
  margin-top 6px, maybe a light warning-tinted pill background.
- Ensure `#result-header` flex wrap already accommodates a third element (it uses
  `flex-wrap: wrap`).

### Error messages (ERROR_MESSAGES additions)

- `'tts-failed': 'تعذر توليد الصوت — حاول مجددًا بعد قليل'`
- `'text-too-long': 'النص طويل جدًا للقراءة الصوتية'`

## Acceptance Criteria

- [ ] "استمع بالعربية" button appears for youtube/article/text results and plays Arabic
      audio (verify with a short article result or by calling `/api/tts` directly first).
- [ ] YouTube result with `meta.source:'audio'` shows the notice text; captions-sourced
      results show nothing.
- [ ] Double-clicking the listen button does not fire two requests.
- [ ] `node --check script.js` passes; no visible English UI strings added.
- [ ] Layout still clean at 375px (buttons wrap).

## Notes

- Do NOT modify any `server/*.js` files.
- If Google/Gemini translation quotas are still exhausted (429), the listen feature can
  still be verified with an article/text quick-translation IF translation works, or by
  temporarily testing `/api/tts` directly with curl. The UI logic itself is the deliverable.
- Keep the design consistent with DESIGN.md (dark theme, Cairo font, RTL).
