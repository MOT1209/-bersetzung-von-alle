# Requirements: Wave 2

## Summary

- **فيديو محلي**: المستخدم يرفع فيديو (≤5 دقائق / ≤40MB) → الخادم يستخرج الصوت (ffmpeg) → يفرّغه محلياً (sherpa-onnx whisper-tiny) → يترجم المقاطع (محاذاة 1:1 + كاش) → يعيد captions مترجمة. الواجهة تشغّل الفيديو من كائن المتصفح (object URL) بمسار WebVTT — بلا إعادة بث من الخادم وبلا حرق ترجمات.
- **تشكيل**: زر «تشكيل» بعد الترجمة — Gemini (نمط translateViaGemini: بلا systemInstruction، chunks ≤8000، تخطّي الفقرات بلا حروف عربية، Prompt يمنع تغيير الكلمات) + احتياطي قواعدي (سكون/شدة بلا اعتماديات).
- **OCR**: صيغ الصور png/jpg/webp/bmp → tesseract.js (ara+eng) على الخادم مع cache دائم لملفات traineddata (server/ocr/traineddata/). PDF الممسوح: غير مدعوم v1 (قيد موثّق — PDF النصي عبر pdf.js الموجود).

## Acceptance Criteria

- [ ] `POST /api/tashkeel` { text } → { diacritized, engine: 'gemini'|'basic' } — يرجع نصاً مشكولاً بلا تغيير الكلمات
- [ ] الاحتياطي القواعدي يعمل بلا مفتاح وبلا شبكة
- [ ] `POST /api/video-local` { content: base64, ext, targetLang, provider? } → { type:'local-video', sourceLang, captions: [{start,duration,original,translated}], meta } — يحذف الملفات المؤقتة بعد المعالجة
- [ ] حد المدة (LOCAL_VIDEO_MAX_MIN=5) وحد الحجم (40MB base64) ورفض الصيغ غير المدعومة بأخطاء عربية واضحة
- [ ] `POST /api/ocr` { content: base64, ext } → { text } — يرفض الصيغ غير المدعومة
- [ ] ملفات traineddata تُحمَّل مرة واحدة (سكربت) وتُخزَّن محلياً — لا إعادة تحميل عند كل طلب
- [ ] `npm test` يمر بالكامل و`npm run check` سليم — الاختبارات الجديدة بلا شبكة
- [ ] RTL عربي لكل الإضافات، بلا نصوص إنجليزية ظاهرة

## Non-Goals

- لا حرق ترجمات في الفيديو (x264 بطيء جداً على هذا الجهاز) — WebVTT overlay فقط
- لا OCR لـ PDF الممسوح ولا كتابة يدوية
- لا تشكيل حرفي لكل الكلمات (الاحتياطي القواعدي: سكون/شدة فقط — القبول: Gemini كامل، basic جودة أقل)
- لا تغيير واجهات audio.js القائمة (transcribeVideoAudio يبقى بنفس التوقيع)

## Technical Constraints

- ffmpeg/ffprobe على PATH (Gyan 8.1.2). sherpa-onnx مثبت والنموذج في models/.
- `translateLines` يُستخرج من handleYouTube في routes-translate.js (defense: أعد قراءة الملف أولاً — قد تكون جلسة موازية عدّلته)
- ملفات مؤقتة في os.tmpdir()/aralink/ وتُنظَّف في finally
- STT ≈ 5.5× مدة الصوت على هذا الجهاز — اذكر ذلك في رسائل التقدم
