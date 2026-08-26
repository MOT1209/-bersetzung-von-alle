# Task 02: Dashboard Stats API

## Status

pending

## Wave

1

## Description

إنشاء API endpoints جديدة توفر بيانات time-series للترجمات (آخر7/30 يوم)، إحصائيات المزوّدين، وملخصات الأداء. هذه الـ APIs تحتاجها صفحة admin dashboard لعرض المخططات. الحالي `GET /api/stats` يُعيد فقط إجماليات تراكمية بدون أ timestamps.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-05-admin-dashboard.md, task-08-dashboard-ui.md

**Context from dependencies:** هذا الـ API هو مصدر البيانات للمخططات. لا يوجد شيء مسبق يحتاجه — يُبنى من الصفر بجانب `server/usage.js` الحالي.

## Files to Create

- `server/stats.js` — Enhanced usage tracking with timestamps
- `server/routes-stats.js` — Stats API routes

## Files to Modify

- `server/usage.js` — إضافة timestamps لكل ترجمة
- `server/server.js` — تسجيل الـ new routes

## Technical Details

### Implementation Steps

1. تعديل `server/usage.js` لحفظ timestamps:
   ```javascript
   // 현재: { total, byType, byTarget, bySource }
   // الجديد: إضافة { history: [{ ts, type, sourceLang, targetLang, cached }] }
   ```
2. إنشاء `server/stats.js` بدوال التحليل:
   - `getTimeseries(days)` — إرجاع بيانات يومية (عدد الترجمات لكل يوم)
   - `getProviderStats()` — إحصائيات استخدام كل مزوّد (من cache hit/miss)
   - `getLanguageDistribution()` — توزيع اللغات المصدر والهدف
   - `getHourlyPattern()` — أنماط الاستخدام حسب الساعة
3. إنشاء `server/routes-stats.js` بـ Express Router
4. تسجيل الـ routes في `server/server.js` مع `requireAdmin` middleware

### Enhanced Usage Data Shape

```javascript
// cache/usage.json — بعد التعديل
{
  "total": 150,
  "byType": { "youtube": 80, "article": 40, "text": 25, "smart": 5 },
  "byTarget": { "ar": 120, "en": 30 },
  "bySource": { "en": 100, "auto": 50 },
  "history": [
    { "ts": 1724649600000, "type": "youtube", "sourceLang": "en", "targetLang": "ar", "cached": false },
    { "ts": 1724650200000, "type": "article", "sourceLang": "en", "targetLang": "ar", "cached": true }
  ]
}
```

### API Endpoints

```javascript
// GET /api/stats/summary — ملخص سريع (يعيد الكائن الحالي + إضافات)
// Response: { total, byType, byTarget, bySource, todayCount, weekCount }

// GET /api/stats/timeseries?days=7 — بيانات يومية
// Response: { days: [{ date: "2026-08-20", count: 15, byType: { youtube: 10, article: 5 } }] }

// GET /api/stats/providers — إحصائيات المزوّدين
// Response: { providers: [{ id: "google", label: "Google", requests: 100, errors: 5, avgTime: 1200 }] }

// GET /api/stats/languages — توزيع اللغات
// Response: { sources: [{ lang: "en", count: 100 }], targets: [{ lang: "ar", count: 120 }] }

// GET /api/stats/hourly — أنماط الساعة
// Response: { hours: [{ hour: 0, count: 5 }, { hour: 1, count: 2 }, ...] }
```

### Key Implementation Details

- **Backward compatible**: `GET /api/stats` يبقى كما هو (لا نكسر API الحالي)
- **New endpoints** تستخدم `requireAdmin` middleware (تتطلب ADMIN_TOKEN)
- **Timezone**: استخدام `Intl.DateTimeFormat` مع timezone المستخدم أو UTC
- **History trimming**: الاحتفاظ بـ30 يوم فقط (⌒2000 سجل)
- **Provider stats**: من trackUsage في routes-translate.js — نحتاج تسجيل Provider المُستخدم مع كل ترجمة
- **Cache stats**: استخدام `cache.stats()` إذا كان متاحًا، أو تمرير `cached: true/false` من meta

### Code Pattern for Timeseries

```javascript
function getTimeseries(days = 7) {
  const usage = loadUsage();
  const now = Date.now();
  const msPerDay = 86400000;
  const result = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - (i + 1) * msPerDay;
    const dayEnd = now - i * msPerDay;
    const dayRecords = (usage.history || []).filter(r => r.ts >= dayStart && r.ts < dayEnd);
    
    result.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      count: dayRecords.length,
      byType: countByType(dayRecords),
    });
  }
  
  return { days: result };
}
```

## Acceptance Criteria

- [ ] `GET /api/stats/summary` returns enhanced summary with todayCount and weekCount
- [ ] `GET /api/stats/timeseries?days=7` returns daily counts for last7 days
- [ ] `GET /api/stats/providers` returns per-provider stats (requests, errors, avgTime)
- [ ] `GET /api/stats/languages` returns source and target language distribution
- [ ] `GET /api/stats/hourly` returns hourly usage pattern
- [ ] All new endpoints require ADMIN_TOKEN
- [ ] `GET /api/stats` (existing) still works unchanged
- [ ] History is trimmed to30 days max
- [ ] Works without any database (file-backed JSON only)

## Notes

- **Provider stats collection**: يلزم تعديل `trackUsage` لتسجيل المزوّد المُستخدم — هذا تغيير بسيط في routes-translate.js
- **No real-time**: البيانات تُحسب عند الطلب (لا need for background aggregation)
- **No Chart.js yet**: هذا الـ API فقط — الواجهة في task-05
