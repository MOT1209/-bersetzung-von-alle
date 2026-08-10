# Task 02: فيديو محلي (Local Video Backend)

## Status
complete

## Wave
1

## Description
`POST /api/video-local`: رفع فيديو (base64) → حفظ مؤقت → ffprobe (حد مدة) → استخراج صوت ffmpeg → تفريغ sherpa-onnx (إعادة استخدام) → ترجمة مقاطع (محاذاة 1:1) → captions + تنظيف مؤقتات. **لا تلمس server.js ولا public/** — المنسّق يركّب الراوتر. أنت الوحيد الذي يعدّل `server/config.js` و`.env.example` (لا ينافسك أحد).

## Files to Create
- `server/routes-local-video.js`
- `tests/localvideo.test.js`

## Files to Modify
- `server/audio.js` — استخراج `transcribeMediaFile(mediaPath)` بلا تغيير توقيع `transcribeVideoAudio`
- `server/routes-translate.js` — استخراج `translateLines(lines, targetLang, opts)` من handleYouTube وتصديرها
- `server/config.js` — `LOCAL_VIDEO_MAX_MIN: Number(process.env.LOCAL_VIDEO_MAX_MIN) || 5`
- `.env.example` — توثيق `LOCAL_VIDEO_MAX_MIN`

## Technical Details

### 1) server/audio.js — إعادة هيكلة (اقرأ الملف أولاً — جلسة موازية قد تكون عدّلته)
- يوجد: `transcribeVideoAudio(videoId)` = تنزيل يوتيوب + ffmpeg→PCM→STT + `normalizeChunks` (يعيد `{start,duration,text}`) + `transcribeWithSherpa` + `getSherpaRecognizer` (singleton) + خطأ `audio-empty` (422).
- استخرج دالة **`transcribeMediaFile(mediaPath, label)`** تحتوي: ffmpeg `-y -i <mediaPath> -ar 16000 -ac 1 -f f32le <pcm>` → PCM Buffer → `transcribeWithSherpa`/`getSherpaRecognizer` → `normalizeChunks` → `{ chunks }`. (انقل الكود الفعلي الموجود لتفريغ يوتيوب بحيث يعيد استخدامه — لا تنسخه.)
- `transcribeVideoAudio` يصبح: تنزيل الصوت (الكود الموجود) ثم `transcribeMediaFile(audioPath)` — التوقيع والمخرجات متطابقتان، كل المستدعين (handleYouTube في routes-translate.js) يعملون بلا تغيير.
- صدّر `transcribeMediaFile` إضافياً.

### 2) server/routes-translate.js — استخراج translateLines (اقرأ الملف أولاً)
- `handleYouTube` حالياً يجمّع الأسطر (≤4000 حرف/دفعة) → `translateTextWithMeta` (كاش) → `distributeByRatio` للمحاذاة 1:1 → `{sourceLang, captions:[{start,duration,original,translated}], cached}`.
- استخرج ذلك كدالة **`translateLines(lines, targetLang, opts)`** (lines: `[{start,duration,text}]`) بنفس المنطق حرفياً، واجعل handleYouTube يستدعيها — صفر تغيير في السلوك.
- صدّرها من module.exports (ستستخدمها routes-local-video).

### 3) server/routes-local-video.js
- `express.Router()` + `express.json({ limit: '60mb' })` على الراوتر (نمط routes-file).
- **`POST /api/video-local`** body `{ content: base64, ext, targetLang='ar', provider?, providers? }`:
  1. تحقق `ext` في القائمة البيضاء: `['mp4','webm','mov','mkv','avi','m4v','3gp','mp3','wav','m4a','ogg']` — إلا `400 invalid-format`
  2. `content` سلسلة ≤ `40 * 1024 * 1024` (base64) — إلا `400 invalid-file`
  3. `Buffer.from(content,'base64')` → اكتب في `path.join(os.tmpdir(),'aralink-local-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext)` (mkdir أولاً)
  4. **ffprobe** المدة: `execFile('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1', file])` — إن كانت > `config.LOCAL_VIDEO_MAX_MIN * 60` → `422 { error:'video-too-long', maxMinutes }` (وأضف المفتاح لـ ERROR_MESSAGES في الواجهة لاحقاً)
  5. `transcribeMediaFile(file)` → `{ chunks }` (بلا chunks/فارغ → `422 audio-empty`)
  6. `translateLines(chunks, targetLang, { provider, providers })` → `{ sourceLang, captions, cached }`
  7. `finally`: احذف الملف المؤقت + ملف PCM (fs.unlink بلا await حاسم)
  8. نجاح: `{ type:'local-video', sourceLang, captions, meta: { source:'audio', durationSec, cached, maxMinutes } }`
- `sendError` محلي: `invalid-format:400, invalid-file:400, video-too-long:422, audio-empty:422, translate-failed:502, server-error:500`.

### 4) config.js + .env.example
- `LOCAL_VIDEO_MAX_MIN: Number(process.env.LOCAL_VIDEO_MAX_MIN) || 5` مع تعليق عربي.
- `.env.example`: `# أقصى مدة فيديو محلي بالدقائق (الافتراضي 5 — STT بطيء ~5.5x المدة)` + `LOCAL_VIDEO_MAX_MIN=5`

### tests/localvideo.test.js (بلا شبكة — لا STT حقيقي، لا يوتيوب)
- تزييف: عيّن `require('../server/audio').transcribeMediaFile` لدالة تعيد `{chunks:[{start:0,duration:2.5,text:'Hello'},...]}`؛ وعيّن `require('../server/routes-translate').translateLines` أو مرّرها (إن كانت routes-local-video تستدعيها وقت التنفيذ، التزييف ينجح — اجعلها تستدعي `require('./routes-translate').translateLines` وقت التنفيذ وليس تفكيكاً عند الاستيراد).
- 1) رفض صيغة غير مدعومة: POST `{ext:'exe'}` → 400
- 2) نقص content → 400
- 3) نجاح txt بسيط: أنشئ ملف فيديو وهمي صغير (مثلاً Buffer نصي بصيغة mp4 — ffmpeg سيفشل لكن نزيّف transcribeMediaFile قبلها؟ لا — نزيّف `require('./audio').transcribeMediaFile` لتتجاهل الملف وتعيد chunks) → 200 مع captions مترجمة عبر translateFn مزيفة أو عبر تزييف translateLines
- 4) حد المدة: نزيّف ffprobe؟ الأسهل: اجعل حد المدة قابلاً للتزييف — إن كانت routes-local-video تستدعي ffprobe عبر دالة داخلية، صدّرها أو افحص المدة عبر `transcribeMediaFile` المُزيّف؟ الأفضل: اختبر `video-too-long` بتعديل `config.LOCAL_VIDEO_MAX_MIN = 0.0001` مؤقتاً (كل فيديو أطول) — إن كان فحص المدة حقيقياً عبر ffprobe على ملف وهمي سيفشل... إذن صدّر دالة `probeDuration(file)` من routes-local-video وزيّفها في الاختبار.
- 5) ملفات مؤقتة تُنظَّف: بعد النجاح تأكد أن مجلد os.tmpdir()/aralink-* فارغ (أو أن المسار المؤقت حُذف).
- 6) `node --check` على الملفات الثلاثة.

## Acceptance Criteria
- [ ] `transcribeVideoAudio` توقيعه ومخرجاته كما هما (لا كسر)
- [ ] POST /api/video-local يعمل مع تزييفات بلا شبكة
- [ ] حد المدة/الحجم يعملان (422/400)
- [ ] التنظيف المؤقت يعمل
- [ ] node --test tests/localvideo.test.js + tests/youtube.test.js + tests/api.test.js → تمر
