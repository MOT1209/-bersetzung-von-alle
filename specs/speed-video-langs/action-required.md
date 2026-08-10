# Action Required — Speed + Video Player + All Languages

## Before implementation

لا خطوات يدوية مطلوبة (لا مفاتيح API جديدة).

ملاحظات بيئية:
- `npm install` بطيء جدًا على هذا الجهاز (OneDrive + إعادة فحص الكاش) — نفّذ التثبيت في الخلفية
  (`npm install <pkg> > install.log 2>&1 &`) وراقب السجل؛ قد يستغرق 5-15 دقيقة.
- sherpa-onnx ينزّل ثنائيات Windows جاهزة أثناء التثبيت — إذا فشل (شبكة/بروكسي)، استخدم
  المسار الاحتياطي: ترقية `onnxruntime-node` إلى 1.27 مع whisper-tiny.

## After implementation

- إن رغب المستخدم لاحقًا بتحسين دقة التفريغ: ضبط `WHISPER_MODEL` في `.env`.
- لاختبار الترجمة الحي: انتظر تجديد حصة Google اليومية أو ضع مفتاح Gemini جديدًا في `.env`.
