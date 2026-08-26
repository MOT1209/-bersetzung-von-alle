# Action Required: Wave 3

## Before Implementation

- [ ] **Gemini API Key** — تأكد من وجود `GEMINI_API_KEY` في `.env` (مطلوب لـ translate-smart)
- [ ] **Chart.js CDN** — قرر إن كنت تريد استخدام Chart.js (عبر CDN) أو كتابة مخططات بسيطة بـ SVG/CSS
- [ ] ** ADMIN_TOKEN** — اضبط `ADMIN_TOKEN` في `.env` لتفعيل لوحة التحكم

## During Implementation

- [ ] **اختبار SSE** — استخدم `curl -N -X POST http://localhost:3000/api/translate-stream` للتأكد من عمل البث
- [ ] **اختبار Dashboard** — افتح `/admin.html` في المتصفح وتأكد من عرض المخططات

## After Implementation

- [ ] **اختبار الأداء** — قارن Time-to-first-token بين القديم (`/api/translate`) والجديد (`/api/translate-stream`)
- [ ] **مراجعة CSP** — تأكد من أن CSP يسمح بـ CDN Chart.js إذا استخدمته
- [ ] **تحديث Service Worker** — أضف `admin.html` و `js/stream.js` و `js/dashboard.js` إلى precache list

## Notes

- لا توجد خطوات يدوية معقدة — المشروع يعتمد على ملفات JSON وไม่ิtresodeDB
- `ADMIN_TOKEN` اختياري — لوحة التحكم تعمل بدونه لكن تُخفي الأزرار الإدارية
