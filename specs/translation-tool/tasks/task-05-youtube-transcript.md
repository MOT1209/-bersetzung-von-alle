# Task 05: YouTube Transcript Translation

## Status

completed — server/youtube.js + مسار يوتيوب: استخراج معرف الفيديو، ترانسكريبت بترتيب لغات، بناء SRT. تم التحقق: dQw4w9WgXcQ → 61 سطرًا. الترجمة الحية موثقة في yt_test.json (نجحت قبل استنفاد الحصص).

## Wave

2

## Description

Add YouTube support: extract the video transcript (captions) from any YouTube URL,
translate it line by line with timestamps preserved, and return the structure the
frontend renders as an embedded player + timestamped captions + SRT download.
Registers the `/api/translate` handler for YouTube URLs.

## Dependencies

**Depends on:** task-01-project-setup.md, task-02-translation-engine.md
**Blocks:** None

**Context from dependencies:** Task-01 provides the Express app and `server/config.js`.
Task-02 provides `translateText(text, targetLang)` — called per caption line (batched
where safe). Task-04's `server/routes-translate.js` detects YouTube URLs; if it already
mounts, this task replaces its `'youtube-pending'` stub with real logic.

## Files to Create

- `server/youtube.js` — exports `getTranscript(videoId)` and `extractVideoId(url)`

## Files to Modify

- `server/routes-translate.js` — wire YouTube path (if the stub from task-04 exists)
- `server/package.json` dependencies — add `youtube-transcript`

## Technical Details

### extractVideoId(url)
- Regex: `/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/`
- No match → return null (caller treats as article link).

### getTranscript(videoId)
- Use `youtube-transcript` (v1.x): `import { YoutubeTranscript } from 'youtube-transcript'`,
  `await YoutubeTranscript.fetchTranscript(videoId)`.
- Prefer language order: the `lang` passed by caller (from a new optional body field
  `videoLang`) → `'en'` → `'en.auto'` → first available. Wrap in try/catch per attempt.
- Returns `[{ text, start: number, duration: number }]` (start in seconds).
- No captions at all → throw `{ code: 'no-transcript' }`.

### POST /api/translate (YouTube branch)
1. `extractVideoId(url)` → if null, treat as article (hand off to article logic).
2. `getTranscript(videoId)` → on `{code:'no-transcript'}` respond 422 `{ error: 'no-transcript' }`.
3. Batch: join caption texts into chunks ≤ 4500 chars (respecting caption boundaries),
   `translateText` each chunk to `targetLang`, split back per caption line (keep 1:1
   mapping via an array of line counts per chunk — simplest: translate each caption line
   individually if total lines ≤ 120, else batch 20 lines per request).
4. Respond:
   `{ type: 'youtube', videoId, sourceLang, captions: [{ start, duration, original, translated }], meta: { title: 'YouTube video' } }`.

### SRT format note (for frontend)
Frontend builds `.srt` from captions:
```
00:00:01,000 --> 00:00:04,000
Translated text
```
Format seconds → `HH:MM:SS,mmm`.

## Verification

1. `node --check server/youtube.js` passes.
2. `curl -X POST localhost:3000/api/translate -H 'Content-Type: application/json' -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","targetLang":"ar"}'` returns captions with `translated` Arabic text and numeric `start`.
3. A known no-captions video returns `{ error: 'no-transcript' }` with 422.
4. `extractVideoId` handles `watch?v=`, `youtu.be/`, `shorts/`, and `embed/` forms.
5. Timestamps are preserved in the translated captions (start/duration unchanged).
