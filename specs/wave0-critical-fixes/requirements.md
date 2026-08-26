# متطلبات Wave-0

## 1) إنقاذ المقالات — server/routes-translate.js:367
- العطل: `translateTextWithMeta(...)` معرّف مجرد → ReferenceError → 500 لكل مقال.
- الإصلاح: `translate.translateTextWithMeta` + `translate.detectLanguage` + `require('./fetchContent').fetchArticleContent` (وصول وقت التنفيذ).
- اختبار: `tests/translateArticle.test.js` (عزل CACHE_FILE، تزييف المزودين، 2 حالات).

## 2) render.yaml:15-18
- RATE_LIMIT_MAX بلا value، CORS_ORIGIN يحمل "20".
- الإصلاح: إعادة value لـ RATE_LIMIT_MAX وحذف القيمة الشاردة.

## 3) مهلات العمليات الفرعية
- audio.js:248 ffmpeg بلا timeout → 180000ms
- tts.js:79,82 ffmpeg → 60000ms
- routes-local-video.js:92 fail-open → 400 invalid-file
- audio.js:316 m4a حتمي → لاحقة فريدة

## 4) PDF
- pdf.js: 32MB maxOutputLength ×3
- fetchContent.js:91 تنزيل بلا حد → readPdfBufferLimited 25MB، يعيد input-too-large (413)

## 5) يوتيوب — youtube.js
- 7 محاولات بلا مهلة → timedFetch مع AbortSignal.timeout(15000) عبر config.fetch

## 6) كاش Windows — cache.js
- persist/ syncSaveCurrent fallback copyFile عند EPERM/EACCES/EBUSY
- تنظيف *.tmp الأقدم من ساعة عند الإقلاع

## 7) الواجهة والإضافة
- sw.js: v2→v3، كاش /api/languages فقط
- popup.js: localStorage → chrome.storage.local
- manifest.json: حذف default_locale:null وتقليل permissions

## إيداعات
لكل مسار commit منفصل بعد نجاح البوابة.
