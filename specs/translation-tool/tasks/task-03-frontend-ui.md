# Task 03: Frontend UI — RTL Arabic Interface

## Status

completed — index.html + style.css + script.js في جذر المشروع: واجهة RTL عربية كاملة (وضعا رابط/نص، 24 لغة، تقدم، تبويبات، خطأ، SRT). تم التحقق عبر curl أن الملفات تُخدم بنجاح وأن عقد الأخطاء يستجيب للرموز.

## Wave

1

## Description

Build the complete Arabic RTL single-page interface: the hero input card (URL field +
language dropdown + "ترجم الآن" button), the progress states (fetching, translating,
done), the two-tab result panel (الترجمة / النص الأصلي), error handling with Arabic
messages, and a quick text-translation box. Styling follows DESIGN.md exactly.

## Dependencies

**Depends on:** task-01-project-setup.md (shell, CSS variables)
**Blocks:** None

**Context from dependencies:** Task-01 created `index.html` (RTL shell + Cairo font),
`style.css` (design tokens), and `script.js` (health-check placeholder). This task fills
them with the real UI. The backend endpoints it calls are implemented by tasks 2/4/5,
so use graceful failure handling while those land.

## Files to Create

- None

## Files to Modify

- `index.html` — full page structure (sections below)
- `style.css` — all component styles using the existing design tokens
- `script.js` — fetch logic, state machine, rendering

## Technical Details

### HTML structure (index.html)
- Header: app name "أرا لينك" or "مترجم الروابط" + tagline "الصق أي رابط واحصل عليه مترجمًا".
- Main card: URL `<input type="url">`, `<select id="target-lang">` (list below), primary
  button "ترجم الآن".
- Secondary mode toggle: "ترجمة نص سريع" — collapses the URL input and shows a `<textarea>`.
- Progress area (hidden by default): three-dot pulse + step label in Arabic.
- Result panel (hidden by default): tabs "الترجمة" / "النص الأصلي", body container,
  meta line ("تمت الترجمة من الإنجليزية إلى العربية"), SRT download button (YouTube mode).
- Error area (hidden by default): `role="alert"` card + "إعادة المحاولة" button.

### Language list (target-lang select)
Include at least: العربية ar, الإنجليزية en, الفرنسية fr, الإسبانية es, الألمانية de,
الإيطالية it, البرتغالية pt, الروسية ru, الصينية zh, اليابانية ja, الكورية ko,
التركية tr, الفارسية fa, الأردية ur, الهندية hi, الإندونيسية id, السويدية sv,
الهولندية nl, البولندية pl, اليونانية el, العبرية he, التايلاندية th, الفيتنامية vi —
labels in Arabic, values ISO codes. Order: العربية first, then alphabetical Arabic.

### script.js behavior
- `POST /api/translate` with `{ url, targetLang }` → returns `{ type, sourceLang, translated, original, meta }`.
- `POST /api/translate-text` with `{ text, targetLang }` → same shape, `type: 'text'`.
- State machine: `idle → fetching → translating → done | error`. Update the Arabic
  progress label per phase. Guard against double-submits (disable button while running).
- Render: article/text → translated paragraphs in "الترجمة" tab, original in the other.
  YouTube → `<iframe src="https://www.youtube.com/embed/{id}">` + captions list, each line
  `[mm:ss] translated text`; SRT download button builds `.srt` from caption start/duration.
- Error: broken URL → `{ error: 'invalid-url' | 'no-transcript' | 'fetch-failed' | 'translate-failed' }`
  → map to Arabic messages, e.g. "الرابط غير صالح" / "هذا الفيديو لا يحتوي على ترجمة نصية"
  / "تعذر الوصول إلى الصفحة" / "فشلت الترجمة — حاول مجددًا".

### CSS (style.css)
- All components per DESIGN.md: hero card with blur, gradient primary button with hover
  lift, pill tabs, pulsing loader (keyframes), error card, SRT button, responsive @media
  (max-width 640px) collapsing padding and stacking tabs.
- RTL-safe: use `text-align: right` default, logical properties where possible, no fixed widths on text.

## Verification

1. Open `http://localhost:3000` → hero visible, RTL, Cairo font, dark theme.
2. Selecting a language + clicking "ترجم الآن" with an invalid URL shows the Arabic error card.
3. Quick-text mode: entering text and translating shows the result in tabs (works once task-02's endpoint or a stub exists).
4. Layout is clean at 375px and 1440px widths.
5. No English text visible anywhere in the UI.
