# Task 08: Dashboard UI Integration

## Status

pending

## Wave

3

## Description

دمج صفحة admin dashboard في تدفق التطبيق. إضافة رابط للوحة التحكم في نافذة الإعدادات، وتحديث CSP للسماح بـ Chart.js CDN، وتحديث Service Worker لحفظ admin.html في الكاش.

## Dependencies

**Depends on:** task-02-dashboard-stats-api.md, task-05-admin-dashboard.md
**Blocks:** task-10-testing-polish.md

**Context from dependencies:** 
- task-05 ينشئ `admin.html` و `js/dashboard.js`
- task-02 ينشئ stats API endpoints
- هذا الـ task يربط كل شيء: CSP + SW + navigation

## Files to Modify

- `server/server.js` — إضافة `https://cdn.jsdelivr.net` إلى CSP scriptSrc
- `public/sw.js` — إضافة `admin.html` و `js/dashboard.js` إلى precache list
- `public/js/features.js` — إضافة رابط "لوحة التحكم" في settings modal
- `public/index.html` — إضافة زر dashboard في settings modal

## Files to Create

None

## Technical Details

### Implementation Steps

1. **CSP Update** (`server/server.js`):
   ```javascript
   scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://cdn.jsdelivr.net"],
   ```
   ملاحظة: Chart.js CDN يحتاج `scriptSrc` permission.

2. **Service Worker Update** (`public/sw.js`):
   ```javascript
   const PRECACHE = [
     '/',
     '/index.html',
     '/admin.html',      // NEW
     '/style.css',
     '/theme-init.js',
     '/js/app.js',
     '/js/dashboard.js',  // NEW
     '/js/constants.js',
     '/js/utils.js',
     '/js/ui.js',
     '/js/media.js',
     '/js/result.js',
     '/js/features.js',
     '/js/translate.js',
     '/js/stream.js',     // NEW (from task-04)
     '/manifest.webmanifest',
     '/icons/icon.svg'
   ];
   ```

3. **Settings Modal Update** (`public/index.html`):
   Add a "لوحة التحكم" button in the settings modal, visible only when ADMIN_TOKEN is set:
   ```html
   <div class="modal-sep"></div>
   <div class="modal-subtitle">الإدارة</div>
   <a href="/admin.html" id="dashboard-link" class="btn-secondary" target="_blank" hidden>
     📊 لوحة التحكم
   </a>
   ```

4. **Show/hide dashboard link** (`public/js/features.js`):
   ```javascript
   // In initSettings() or openSettings():
   const dashboardLink = document.getElementById('dashboard-link');
   const adminToken = localStorage.getItem('aralink-admin-token');
   if (dashboardLink) {
     dashboardLink.hidden = !adminToken;
   }
   ```

5. **Admin Token in Settings** — ensure the existing settings modal saves the admin token to localStorage (it already does via `settings-api-key`).

### CSP Considerations

```javascript
// server.js — CSP directives update
// Add to scriptSrc:
"https://cdn.jsdelivr.net"    // Chart.js CDN

// Also add to styleSrc if Chart.js adds inline styles:
// (Chart.js 4 doesn't, but safe to have)
```

### Navigation Flow

```
Main Page (index.html)
  → Settings Modal → "📊 لوحة التحكم" button → admin.html (new tab)
  
Admin Dashboard (admin.html)
  → "← العودة" link → index.html
```

## Acceptance Criteria

- [ ] CSP allows `https://cdn.jsdelivr.net` for Chart.js
- [ ] Service Worker precaches `admin.html` and `js/dashboard.js`
- [ ] Settings modal shows "لوحة التحكم" link when ADMIN_TOKEN is set
- [ ] Dashboard link opens in new tab
- [ ] Dashboard link is hidden when no ADMIN_TOKEN
- [ ] "← العودة" link in dashboard returns to main page
- [ ] Chart.js loads without CSP violations
- [ ] Offline: dashboard page works from SW cache

## Notes

- **No breaking changes**: All additions are additive
- **Visibility**: Dashboard is only visible to admins (those who set ADMIN_TOKEN)
- **CDN fallback**: If Chart.js CDN fails, dashboard shows a message "مكتبة المخططات غير متوفرة"
- **Chart.js version**: Use v4 (stable, lightweight ~200KB)
