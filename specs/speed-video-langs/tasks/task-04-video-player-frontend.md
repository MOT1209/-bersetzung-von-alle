# Task 04: مشغل الفيديو المترجم + زر 130 لغة + شارة الكاش (الواجهة)

## Status

complete — مشغل يوتيوب + شريط متزامن + WebVTT محلي + بحث لغات + شارة كاش + routes-video.js (execFile). تحقق: /api/video 200 (614KB)؛ /api/languages 132.

pending

## Wave

2

## Description

أهم مهمة للمستخدم: بعد ترجمة فيديو يوتيوب يشتغل الفيديو داخل الصفحة والترجمة المترجمة تظهر
متزامنة. نضيف: (أ) مشغل يوتيوب مضمّن + شريط ترجمة متزامن أسفله، (ب) زر «تشغيل بترجمات مدمجة»
ينزّل الفيديو ويعرضه بترجمات WebVTT مرسومة فوقه، (ج) زر لغة بحث بـ130 لغة (من
`GET /api/languages`)، (د) شارة «⚡ من الذاكرة» عند `meta.cached`.

## Dependencies

**Depends on:** task-01-stt-speed.md, task-02-translation-cache.md, task-03-languages-api.md
**Blocks:** task-05-docs-polish.md

**Context from dependencies:**
- `GET /api/languages` → `{languages:[{code,nameAr}]}` (من task-03).
- استجابة `POST /api/translate` ليوتيوب: `{type:'youtube', videoId, sourceLang, captions:[{start,duration,original,translated}], meta:{title,source,cached?}}` (cached من task-02).
- `POST /api/srt` موجود: `{captions}` → نص SRT.
- `POST /api/tts` موجود: `{text,lang}` → mp3 — زر «استمع بالعربية» موجود مسبقًا في الواجهة.
- الواجهة الحالية: `index.html` (RTL عربي، قائمة لغات 19 خيارًا)، `style.css`، `script.js`
  (فيه `renderResult`، `postJson` بمهلة 1800000، `ERROR_MESSAGES` بالعربية، عناصر
  `#listen-btn`, `#srt-btn`, `#source-notice`, `#tts-player`).
- **بيئة**: yt-dlp على Windows يحتاج مسارات مطلقة؛ بعض الفيديوهات تفشل بالتنزيل (JS challenge) — عالجها برسالة عربية.

## Files to Create

- `server/routes-video.js` — تنزيل الفيديو وبثّه (لبث الفيديو المحلي، خيار ب)

## Files to Modify

- `server/server.js` — تثبيت `routes-video` تحت `/api`
- `index.html` — زر اللغة + حقل بحث + منطقة مشغل الفيديو وشريط الترجمة + أزرار (أ/ب)
- `style.css` — تنسيق المشغل والشريط المتزامن وبحث اللغة
- `script.js` — منطق كل شيء (انظر الأسفل)

## Technical Details

### A) زر اللغة (130 لغة + بحث)

- استبدل `<select id="targetLang">` بـ: `<select>` عادي يعبَّأ ديناميكيًا من `/api/languages`
  (احتياطي: قائمة مصغّرة مدمجة بـ 20 لغة شائعة إن فشل الجلب) + `<input type="search" id="lang-search">`
  صغير يفلتر الخيارات (اخفِ غير المطابق).
- القيمة الافتراضية `ar`. عرض `{nameAr}` فقط (RTL).

### B) مشغل يوتيوب مضمّن + شريط ترجمة متزامن (خيار أ — افتراضي)

- بعد نتيجة يوتيوب، اعرض:
  ```html
  <div id="video-wrap">
    <div id="player-embed"></div>  <!-- iframe youtube -->
    <div id="cap-bar"></div>       <!-- شريط الترجمة المترجمة المتزامن -->
  </div>
  ```
- أنشئ iframe: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&playsinline=1`
- حمّل YouTube IFrame API مرة واحدة: `<script src="https://www.youtube.com/iframe_api">`
  و`onYouTubeIframeAPIReady` → `new YT.Player('player-embed', { videoId, events })`.
- التزامن: `setInterval` كل 250ms → `player.getCurrentTime()` → اعثر على أول caption
  حيث `start <= t < start+duration` → اعرض `translated` في `#cap-bar` (مع ظل/خلفية داكنة،
  خط كبير). عند النقر على أي جملة في القائمة: `player.seekTo(start, true)`.
- إن فشل تحميل API (شبكة): اعرض iframe عادي بدون شريط متزامن (لا تكسر الصفحة).
- شريط الترجمة: نص RTL، تنسيق حسب DESIGN.md (لون متباين، `--accent`).

### C) تشغيل بترجمات مدمجة (خيار ب)

- زر «▶ تشغيل بترجمات مدمجة» (بجانب زر SRT): يستدعي `GET /api/video/${videoId}` (تدفق mp4)
  ويشغّل:
  ```html
  <video id="local-player" controls></video>
  <track kind="subtitles" src="blob:..." srclang="ar" label="العربية" default>
  ```
- WebVTT: ابنِه في الواجهة من `captions` المترجمة (`start,duration,translated`) كـ blob
  (`new Blob([vtt], {type:'text/vtt'})` → URL.createObjectURL). مثال صيغة سطر:
  `00:00:01.000 --> 00:00:04.000` + النص.
- الـ `<track>` يظهر الترجمة مرسومة فوق الفيديو تلقائيًا (الترجمات الأصلية للمتصفح).
- التحذير: التنزيل قد يفشل لبعض الفيديوهات (JS challenge) — اعرض رسالة عربية واضحة عند فشل
  البث (`خطأ في تنزيل الفيديو — جرّب العرض المضمّن`).
- نص سابق عن `#srt-btn` — أبقِ زر تحميل SRT كما هو.

### D) server/routes-video.js

```js
// GET /api/video/:videoId → mp4 (720p كحد أقصى) عبر yt-dlp، بثّ تدريجي مع تنظيف لاحق
const { youtubeDl } = require('youtube-dl-exec');
const path = require('path'), os = require('os'), fs = require('fs');
// تنزيل إلى مسار مطلق: path.join(os.tmpdir(), 'aralink', `video-${videoId}.mp4`)
// صيغة: format: 'best[height<=720]/best', mergeOutputFormat: 'mp4'
// ثم res.sendFile أو قراءة وتدفق. انتهى → حذف الملف (setTimeout 1h كحد أقصى أو بعد finish).
```
- حد زمني للتنزيل (AbortSignal/مهلة 180s) ورسالة `video-download-failed` (422) عند الفشل.
- لا تحفظ الفيديو نهائيًا — مؤقت فقط.

### E) شارة الكاش

- في `renderResult`: إن كان `meta.cached === true` اعرض شارة صغيرة «⚡ من الذاكرة المؤقتة»
  بجانب `#meta-title`.

### F) رسائل أخطاء جديدة في `script.js` ERROR_MESSAGES

- `video-download-failed` → «تعذر تنزيل الفيديو — جرّب العرض المضمّن بدلاً منه»
- «جاري تنزيل الفيديو للعرض المدمج…» للزر.

## Acceptance Criteria

- [ ] `npm run check` سليم
- [ ] بعد ترجمة يوتيوب: الفيديو يظهر داخل الصفحة ويعمل، وشريط الترجمة المترجمة يتحدث مع الوقت
- [ ] النقر على جملة في قائمة الترجمة ينقل الفيديو لتلك اللحظة
- [ ] زر «تشغيل بترجمات مدمجة» يعرض فيديو محليًا والترجمة مرسومة فوقه (WebVTT)
- [ ] زر اللغة يعرض ≥120 لغة مع بحث يعمل
- [ ] عند `meta.cached` تظهر شارة «⚡ من الذاكرة»
- [ ] الواجهة RTL، لا نص إنجليزي ظاهر، تعمل عند 375px عرض

## Notes

- لا تلمس ملفات server الأخرى (audio/config/translate/cache/languages/routes-translate) — فقط `server/server.js` وملف `routes-video.js` الجديد.
- حافظ على `#listen-btn` و`#srt-btn` الحاليين ولا تكسرهما.
- YouTube API كائن عام `YT` — تحقق من وجوده قبل الاستخدام (قد يُحمَّل متأخرًا).
