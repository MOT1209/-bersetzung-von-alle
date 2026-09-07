# طبقة المزوّدين (Provider Layer)

كل مزوّد خارجي يُنفِّذ واجهة موحّدة، فإضافة مزوّد جديد = ملف واحد + سطر في
`index.js` الخاص بنوعه — **بلا أي تعديل في نواة المنطق**.

القاعدة الملزمة: النواة لا تعرف أسماء المزوّدين. تعرف الواجهة فقط.

## TranslationProvider — `providers/translation/`

```js
{
  id: 'google',                       // مُعرّف فريد يظهر في API والإعدادات
  label: 'Google (مجاني)',            // اسم للعرض في الواجهة
  requiresKey: false,                 // هل يحتاج مفتاحًا؟ (للعرض فقط)
  isAvailable(): boolean,             // يُقرأ وقت الاستدعاء لا وقت الاستيراد
  async translate(text, targetLang, sourceLang): string
}
```

**قاعدة حرجة:** `isAvailable()` يجب أن يقرأ `config.*` **وقت الاستدعاء**. قراءتها
وقت الاستيراد تُجمّد القيمة، فيصبح حفظ مفتاح جديد من لوحة الإعدادات بلا أثر حتى
إعادة تشغيل الخادم (`envSettings.saveSettings` يعدّل `config` مباشرةً).

`translate()` يرمي عند الفشل ولا يُرجع النص الأصلي أبدًا — سلسلة المزوّدين في
`translate.js` هي التي تقرّر الانتقال للتالي، والفشل الصامت يُنتج «ترجمة» إنجليزية
تبدو سليمة.

## TTSProvider — `providers/tts/`

```js
{
  id: 'gtts',
  label: 'Google TTS (مجاني)',
  requiresKey: false,
  isAvailable(): boolean,
  maxChunkChars: number,              // أقصى طول نص لكل طلب عند هذا المزوّد
  async synthesize(text, lang): Buffer   // mp3
}
```

## TranscriptionProvider — `providers/stt/`

```js
{
  id: 'sherpa',
  label: 'sherpa-onnx',
  isAvailable(): boolean,             // يشمل توفّر الحزمة الأصلية نفسها
  async transcribe(pcmFloat32, sampleRate, lang): { text, chunks }
}
```

## إضافة مزوّد جديد

1. أنشئ الملف تحت المجلد المناسب مُنفِّذًا الواجهة أعلاه.
2. أضِفه إلى `index.js` في **الموضع** الصحيح — الترتيب هو أولوية السلسلة الافتراضية.
3. أضِف اختبارًا بخادم stub محلي (`http.createServer` على `127.0.0.1:0`) — لا شبكة حقيقية في الاختبارات.
