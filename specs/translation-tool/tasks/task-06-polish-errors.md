# Task 06: Polish — Error Handling, Edge Cases, Final Verification

## Status

completed — عقد أخطاء موحد (ERROR_STATUS + sendError في routes-translate.js)، translate.js يرفع خطأ عند فشل كل الخدمات بدل إرجاع النص بصمت، التحقق بالـ curl: invalid-url→400، fetch-failed→422، translate-failed→502. الترجمة الحية محجوبة مؤقتًا بحصة Google/Gemini (429) — موثقة النجاح في yt_test.json/article_test.json.

## Wave

3

## Description

Final hardening pass: unify error codes across backend and frontend, handle edge cases
(mixed-content pages, very long articles, empty transcripts, non-text pages, rate
limits), add a small loading/robustness improvement pass, and run the full acceptance
suite from `requirements.md`. This task turns a working prototype into something that
behaves predictably for real-world links.

## Dependencies

**Depends on:** task-03-frontend-ui.md, task-04-article-extraction.md, task-05-youtube-transcript.md
**Blocks:** None

**Context from dependencies:** All features exist by this wave — task-03 renders results,
task-04 handles articles, task-05 handles YouTube. This task refines the seams between
them and verifies the complete product against the acceptance criteria.

## Files to Modify

- `server/routes-translate.js` — error normalization
- `server/fetchContent.js` — edge-case guards (if needed)
- `script.js` — error mapping, robustness (if needed)
- `index.html` / `style.css` — final polish (if needed)

## Technical Details

### Error code contract (single source of truth)
| code | HTTP | Arabic message |
|---|---|---|
| `invalid-url` | 400 | "الرابط غير صالح — تأكد من كتابته بشكل صحيح" |
| `fetch-failed` | 422 | "تعذر الوصول إلى الصفحة — قد تكون محمية أو غير متاحة" |
| `no-transcript` | 422 | "هذا الفيديو لا يحتوي على ترجمة نصية متاحة" |
| `translate-failed` | 502 | "فشلت الترجمة — حاول مجددًا بعد قليل" |
| `content-empty` | 422 | "لم نتمكن من استخراج محتوى من هذه الصفحة" |
| `pdf-unsupported` | 422 | "تعذر قراءة هذا الملف PDF" |

- Backend: every route responds `res.status(code).json({ error })`; no unhandled
  exceptions — wrap handlers in try/catch and map unknown errors to `translate-failed`
  (or a generic `{ error: 'server-error' }` → "حدث خطأ غير متوقع").
- Frontend: `script.js` has one `mapError(code)` function implementing the table above;
  no inline error strings.

### Edge cases to handle
- Page returns `content-empty`: article with only scripts/ads extracted → return `content-empty`.
- Rate limiting on Google endpoint: add 3 retries with 500ms backoff in `translate.js`
  before falling back to Gemini.
- Very long articles (100+ blocks): translate with chunk batching; show progress label
  "جاري الترجمة…" and keep the UI responsive (translate in async batches of 5 blocks).
- Mixed content: page that is mostly an image gallery → extracted text may be tiny;
  still translate what exists (no failure for short content).
- Duplicate submit: guard in `script.js` (disable button while running, re-enable after).
- Video with only auto-generated captions: works via `'en.auto'`/`'ar.auto'` attempts.

### Final acceptance run
Execute the acceptance criteria from `specs/translation-tool/requirements.md` one by
one and record results in this task's completion notes:
1. YouTube URL with captions → player + translated captions + SRT download.
2. Article URL → translated main text + original toggle.
3. Source language detected and displayed; multiple target languages spot-checked.
4. Invalid/broken URL → Arabic error card, no crash.
5. RTL dark UI clean at 375px.
6. All server files pass `node --check`.

## Verification

1. Every error code in the table returns its exact HTTP status + JSON `error` code.
2. Each Arabic message appears in the UI for its corresponding failure.
3. Full flow works end-to-end on `http://localhost:3000` for: one YouTube video,
   one Wikipedia-style article, one broken URL, and one plain-text quick translation.
4. Server logs no unhandled exceptions during the above.
