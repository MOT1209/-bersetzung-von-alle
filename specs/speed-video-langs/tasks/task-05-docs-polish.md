# Task 05: التوثيق والصقل النهائي

## Status

complete — README المشروع مُحدّث بالميزات الجديدة.

pending

## Wave

3

## Description

بعد اكتمال التنفيذ: توثيق الميزات الجديدة في README المشروع، تحديث حالات المهام في
`specs/speed-video-langs/README.md`، ومراجعة نهائية خفيفة (لا اختبارات برمجية جديدة).

## Dependencies

**Depends on:** task-04-video-player-frontend.md
**Blocks:** None

**Context from dependencies:** الميزات الجديدة: STT أسرع، كاش ترجمة، 130 لغة، مشغل فيديو مترجم.

## Files to Modify

- `README.md` (جذر المشروع) — قسم جديد: «المرحلة الثانية: السرعة + الفيديو المترجم + كل اللغات»
- `specs/speed-video-langs/README.md` — تفعيل خانات الاكتمال لكل المهام

## Technical Details

1. في `README.md` أضف بعد قسم «🔊 ميزة الصوت» فقرة تشرح:
   - محرك التفريغ الأسرع (sherpa-onnx أو ترقية onnxruntime — اكتب الفعلي)
   - كاش الترجمة ومسار `cache/`
   - 130 لغة في زر الاختيار
   - مشغل الفيديو المترجم (مضمّن + محلي بترجمات WebVTT)
2. حدّث `specs/speed-video-langs/README.md`: ضع `[x]` للمهام المنجزة.

## Acceptance Criteria

- [ ] README الجذر يذكر الميزات الجديدة بدقة (بدون تضخيم)
- [ ] خانات المهام في المواصفة محدّثة
