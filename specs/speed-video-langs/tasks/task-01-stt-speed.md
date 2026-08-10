# Task 01: سرعة التفريغ الصوتي (STT) + m4a→f32 مباشر

## Status

complete — STT عبر sherpa-onnx (whisper-tiny متعدد اللغات) + m4a→f32 مباشر + تنزيل موثوق عبر downloader.js (execFile). تحقق: النموذج نُزّل من HF، تنزيل صوت/فيديو يعمل (ثانية واحدة للفيديو القصير).

pending

## Wave

1

## Description

أبطأ خطوة في AraLink هي التفريغ الصوتي: حاليًا `server/audio.js` ينزّل صوت يوتيوب كـ wav ضخم
(حتى 350MB) عبر yt-dlp `extractAudio`, ثم يحوّله ffmpeg إلى f32، ثم يشغّله عبر
`@xenova/transformers` (onnxruntime-node 1.14 قديم) بنموذج whisper-tiny بسرعة ~5x مدة الفيديو.
هذه المهمة: (1) تحويل m4a مباشرة إلى f32 بدون ملف wav وسيط، (2) محاولة محرك STT أسرع
(sherpa-onnx) مع إبقاء whisper-tiny الحالي احتياطيًا.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-video-player-frontend.md

**Context from dependencies:** لا شيء — الملفات حالياً: `server/audio.js` (يصدّر `transcribeVideoAudio(videoId)` → `{chunks:[{start,duration,text}]}`)، `server/config.js` (فيه `WHISPER_MODEL`)، `package.json`.

## Files to Create

- لا ملفات جديدة (تعديلات فقط)

## Files to Modify

- `server/audio.js` — تحويل m4a→f32 مباشر + محرك sherpa-onnx مع احتياطي transformers
- `server/config.js` — ثوابت اختيارية: `STT_ENGINE` (`'sherpa'|'transformers'`), `WHISPER_MODEL`
- `package.json` — إضافة `sherpa-onnx` (أو ترقية `onnxruntime-node`)
- `.env.example` — توثيق `STT_ENGINE`

## Technical Details

### خلفية مهمة

- بيئة: Windows بطيء، Node 24، ffmpeg في PATH، npm install بطيء جدًا (5-15 دقيقة) → ثبّت في الخلفية:
  `npm install sherpa-onnx > install-sherpa.log 2>&1 &` ثم راقب `tail install-sherpa.log`.
- دالة `transcribeVideoAudio` الحالية (لا تغيّر توقيعها!): تستقبل videoId، تنشئ مجلد مؤقت
  `path.join(os.tmpdir(),'aralink')` بمسارات مطلقة (لا `/tmp/x` — على Windows يُحل إلى C:\tmp)،
  تحميل عبر `youtube-dl-exec`، تحويل ffmpeg، تشغيل Whisper، تنظيف في `finally`.
- إدخال المحرك الجديد: ملف f32 (16kHz أحادي) — يجب أن يخرج `chunks` بالتوقيتات نفسها.

### الخطوات

1. **تثبيت sherpa-onnx** في الخلفية. تحقق من النجاح بـ `node -e "const s=require('sherpa-onnx'); console.log(Object.keys(s).slice(0,8))"`.
   - إن فشل التثبيت (شبكة/ثنائيات): بديل معتمد = ترقية `onnxruntime-node` إلى `^1.27.0`
     (`npm install onnxruntime-node@1.27.0` في الخلفية) — لا تغيير في كود STT نفسه سوى أن ORT
     الأحدث أسرع، ثم ضبط الخيوط في `server/audio.js`:
     ```js
     const { env } = require('@xenova/transformers');
     if (env?.backends?.onnx) env.backends.onnx.numThreads = 4;
     ```
2. **تعديل التحويل في `server/audio.js`**:
   - استبدل `extractAudio:true, audioFormat:'wav'` بـ **تحميل m4a فقط**:
     ```js
     await youtubeDl(url, { output: m4aPath, noPlaylist: true, format: 'bestaudio/best' });
     ```
   - ثم ffmpeg مباشرة: `ffmpeg -y -i m4aPath -ar 16000 -ac 1 -f f32le f32Path`
   - حذف خطوة wav الوسيطة نهائيًا (توفير وقت وقرص).
3. **محرك sherpa-onnx** (إن ثبت): استخدم `createOfflineRecognizer` مع نموذج whisper:
   - النموذج: `sherpa-onnx-whisper-tiny.en` (English فقط، ~75MB) أو متعدد اللغات. حمّله من
     HuggingFace `csukuangfj/sherpa-onnx-whisper-tiny.en` (ملفات encoder/decoder/tokens).
     ضع مسارات النموذج في `server/config.js` كثوابت قابلة للتعديل (لا تُدرج النموذج في git).
   - بعد تحميل النموذج لأول مرة يُخزَّن محليًا؛ إن تعذّر التنزيل → اجعل `STT_ENGINE` يعود تلقائيًا
     إلى `'transformers'`.
   - وثائق: `npm i sherpa-onnx` ثم README يعرض `createOfflineRecognizer`:
     ```js
     const { createOfflineRecognizer, readWave } = require('sherpa-onnx');
     // config: model = { whisper: { encoder, decoder, tokens } }, featConfig = { sampleRate: 16000, featureDim: 80 }
     const recognizer = createOfflineRecognizer(config);
     // قراءة f32 → Int16 PCM (اقسم على 32768 واضرب في 32767 بعد clip)، أو استخدم ملف wav
     ```
   - ملاحظة: sherpa-onnx يتوقع int16 PCM — حول f32 إلى int16 قبل الاستدعاء.
   - المخرجات: `recognizer.createStream()` + `acceptWaveform` + `decode()`
     + `getResult()` → `{text, segments:[{start,duration,text}]}` — حوّلها إلى
     `chunks:[{start,duration,text}]` (أضف `text:''` فارغًا للفترات الصامتة إن أمكن).
4. **الاحتياطي**: إن كان `STT_ENGINE==='transformers'` أو فشل sherpa عند التنفيذ → المسار الحالي
   (Xenova whisper-tiny) كما هو، مع `env.backends.onnx.numThreads=4` إن أمكن.
5. **`.env.example`**: أضف سطر `STT_ENGINE=sherpa` مع تعليق عربي.

### Environment Variables

- `STT_ENGINE` — `'sherpa'` (افتراضي جديد إن ثبت) أو `'transformers'` (احتياطي)
- `WHISPER_MODEL` — موجود مسبقًا (`Xenova/whisper-tiny`)

## Acceptance Criteria

- [ ] `npm run check` سليم بعد التعديلات
- [ ] m4a→f32 مباشر بدون ملف wav (تحقق: مجلد مؤقت لا يحتوي wav أثناء التشغيل)
- [ ] `transcribeVideoAudio('jNQXAC9IVRw')` تعمل مباشرة عبر node وتعيد chunks بتوقيتات (اختبار يدوي؛ أول تشغيل يُنزّل النموذج)
- [ ] إن ثبت sherpa-onnx: `STT_ENGINE=sherpa` يعمل فعليًا (لا يعود للاحتياطي بصمت — سجّل المحرك المستخدم)
- [ ] لم يتغير توقيع `transcribeVideoAudio` ولا شكل `chunks`

## Notes

- لا تلمس `server/routes-translate.js` (خاص بمهمة task-02) ولا `server/server.js` (خاص task-03).
- القياس المرجعي الحالي: فيديو 19 ثانية jNQXAC9IVRw كامل ~2.5-4.5 دقيقة (تحميل ~125s + stt 104s) — سجّل الرقم الجديد للمقارنة.
- إن تعذّر sherpa نهائيًا (تثبيت أو نماذج): الاعتماد على ترقية onnxruntime مقبول — حدّث `action-required.md` بتوثيق السبب.
