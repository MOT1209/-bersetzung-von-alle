# Task 03: واجهة اللغات (GET /api/languages)

## Status

complete — GET /api/languages في server.js. تحقق: 132 لغة.

pending

## Wave

1

## Description

ملف البيانات `server/languages.js` (**موجود مسبقًا — جاهز** ويصدّر `getAllLanguages()`,
`isSupportedLang(code)`, `langName(code)`, `LANGUAGES`). مهمتك فقط: ربطه بالخادم عبر مسار
`GET /api/languages` وإضافة تحقق خفيف لقبول رمز اللغة في `POST /api/translate`.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-video-player-frontend.md

**Context from dependencies:** `server/server.js` حالياً يضم `translateRouter` و`ttsRouter` عبر `app.use('/api', ...)`. لا يوجد بعد مسار لغات.

## Files to Create

- لا ملفات جديدة

## Files to Modify

- `server/server.js` — إضافة `GET /api/languages`
- `server/routes-translate.js` — (اختياري) تحقق `targetLang` المدخلة: إن كانت مدعومة مررها، وإن لم تكن في القائمة لكنها قيمة شائعة (مثل `'zh'`) عيّنها إلى أقرب رمز مدعوم أو اتركها للواجهة. الأهم: لا ترفض طلبات بلا رمز.

## Technical Details

### server/server.js — المسار

```js
const { getAllLanguages } = require('./languages');
// ...
app.get('/api/languages', (req, res) => {
  res.json({ languages: getAllLanguages() });
});
```

### ملاحظة تحقق

لا حاجة لرفض الطلبات: الواجهة تقيّد الاختيار بالقائمة. إن أردت التحقق فاكتفِ بـ:
```js
const { isSupportedLang } = require('./languages');
// في /api/translate: إن وُجد targetLang ولم يكن مدعومًا لكنه رمز مألوف (zh, ja...) فاتركه —
// Google يفهمه. لا تعقّد.
```

## Acceptance Criteria

- [ ] `npm run check` سليم
- [ ] `curl http://localhost:3000/api/languages` يعيد `{"languages":[{code,nameAr},...]}` بعدد ≥ 120
- [ ] لا يتعارض المسار الجديد مع المسارات الموجودة

## Notes

- لا تلمس `server/audio.js`/`config.js`/`package.json` (task-01) ولا `server/translate.js` (task-02).
- ملف `server/languages.js` جاهز — لا تعده من الصفر.
