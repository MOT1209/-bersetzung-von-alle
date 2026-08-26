# Action Required: Wave 3

## Current Status

✅ All10 task specs are complete and ready for review.

## Before Implementation

- [ ] **Gemini API Key** — تأكد من وجود `GEMINI_API_KEY` في `.env` (مطلوب لـ translate-smart)
- [x] **Chart.js CDN** — قرر استخدام Chart.js عبر CDN (محدد في task-05 و task-08)
- [x] **ADMIN_TOKEN** — اضبط `ADMIN_TOKEN` في `.env` لتفعيل لوحة التحكم (محدد في task-05)

## During Implementation

- [ ] **اختبار SSE** — استخدم `curl -N -X POST http://localhost:3000/api/translate-stream` للتأكد من عمل البث
- [ ] **اختبار Dashboard** — افتح `/admin.html` في المتصفح وتأكد من عرض المخططات
- [ ] **اختبار Context Detection** — استخدم `POST /api/translate-smart` مع `url` field لفحص اكتشاف السياق

## After Implementation

- [ ] **اختبار الأداء** — قارن Time-to-first-token بين القديم (`/api/translate`) والجديد (`/api/translate-stream`)
- [x] **مراجعة CSP** — تأكد من أن CSP يسمح بـ `https://cdn.jsdelivr.net` لـ Chart.js (محدد في task-08)
- [x] **تحديث Service Worker** — أضف `admin.html` و `js/stream.js` و `js/dashboard.js` إلى precache list (محدد في task-08)

## Wave Structure

### Wave 1 (Independent — parallel)
- task-01: SSE Backend Endpoint ✅
- task-02: Dashboard Stats API ✅
- task-03: Context Detection Engine ✅

### Wave 2 (After Wave 1)
- task-04: SSE Client Wrapper ✅
- task-05: Admin Dashboard Page ✅
- task-06: Enhanced Smart Translation ✅

### Wave 3 (After Wave 2)
- task-07: Streaming UI Integration ✅
- task-08: Dashboard UI Integration ✅
- task-09: Context UI Integration ✅

### Wave 4 (After Wave 3)
- task-10: Testing & Polish ✅

## Notes

- لا توجد خطوات يدوية معقدة — المشروع يعتمد على ملفات JSON و لا يعتمد على قواعد بيانات
- `ADMIN_TOKEN` اختياري — لوحة التحكم تعمل بدونه لكن تُخفي الأزرار الإدارية
- كل المكوناتThree рассчитаны на минимальные изменения в существующем коде
