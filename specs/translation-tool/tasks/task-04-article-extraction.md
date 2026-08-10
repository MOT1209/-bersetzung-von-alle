# Task 04: Article & Website Extraction

## Status

completed — server/fetchContent.js + مسار المقال: جلب بخادم وكيل، تنظيف، استخراج `heading`/`text`، أخطاء `fetch-failed`/`content-empty`/`pdf-unsupported`. تم التحقق: wikipedia Translation → 538 كتلة + عنوان.

## Wave

2

## Description

Build `server/fetchContent.js` to fetch any article/website URL server-side, strip
navigation/ads/scripts, extract the main readable content (headings, paragraphs, lists,
blockquotes), and return structured text. Then add the `/api/translate` route that
combines extraction + translation and returns the final response shape the frontend
expects. PDF links get basic text extraction.

## Dependencies

**Depends on:** task-01-project-setup.md, task-02-translation-engine.md
**Blocks:** None

**Context from dependencies:** Task-01 gives the Express app + `server/config.js`;
this task must mount its routes in `server/server.js`. Task-02 gives
`translateText(text, targetLang, sourceLang)` and `detectLanguage(text)` — used here to
translate extracted content and report the detected source language.

## Files to Create

- `server/fetchContent.js` — exports `fetchArticleContent(url)` and `extractMainText(html)`
- `server/routes-translate.js` — Express router with `POST /api/translate` and `POST /api/translate-text`

## Files to Modify

- `server/server.js` — mount the router (`app.use('/api', translateRouter)`)

## Technical Details

### fetchArticleContent(url)
1. Validate URL (must start `http://` or `https://`); throw `{ code: 'invalid-url' }` otherwise.
2. `fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })`.
3. If `content-type` includes `application/pdf`, fetch as buffer and extract text crudely
   (accept a `pdf-parse`-free approach: buffer to string for text PDFs; if binary garbage,
   return `{ code: 'pdf-unsupported' }`).
4. Non-200 → `{ code: 'fetch-failed' }`. HTML → pass to `extractMainText`.
5. Return `{ title, paragraphs: [{ heading, text }] or string[], html? }`.

### extractMainText(html)
- Parse with `cheerio` (add dependency). Remove `script, style, nav, footer, header,
  aside, iframe, form, button, svg, [class*=ad], [id*=ad], [aria-hidden="true"]`.
- Prefer `article` selector if present, else `main`, else `body`.
- Walk child nodes: collect `h1-h3` as headings and `p`, `li`, `blockquote` as text
  blocks. Trim whitespace; drop blocks shorter than 3 chars. Keep order.
- Return `{ title, blocks: [{ type: 'heading'|'text'|'list', content: string }] }`.

### POST /api/translate
Body: `{ url, targetLang }`. Steps:
1. Detect YouTube via regex `(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})` → if match,
   delegate to the youtube route logic (task-05) when it exists; for now return
   `{ error: 'youtube-pending' }` gracefully.
2. Else `fetchArticleContent(url)` → on thrown `{code}`, respond 400/422 with that code.
3. `detectLanguage(joinedBlocks.slice(0, 500))` → `sourceLang`.
4. `translateText` per block (headings and text), preserving block order and types.
5. Respond `{ type: 'article', sourceLang, translatedBlocks, originalBlocks, meta: { title } }`.

### POST /api/translate-text
Body: `{ text, targetLang }` → detect + translate → `{ type: 'text', sourceLang, translated, original }`.

## Verification

1. `node --check` passes on both new files and `server/server.js`.
2. `curl -X POST localhost:3000/api/translate -H 'Content-Type: application/json' -d '{"url":"https://en.wikipedia.org/wiki/Translation","targetLang":"ar"}'` returns translated Arabic blocks with `sourceLang: 'en'`.
3. Invalid URL (`"not-a-url"`) returns `error: 'invalid-url'` with 400.
4. A non-existent domain returns `error: 'fetch-failed'` (graceful, no crash).
5. Article headings appear as translated headings in the response.
