# Task 05: Admin Dashboard Page

## Status

pending

## Wave

2

## Description

إنشاء صفحة `admin.html` مستقلة تعرض لوحة تحكم كاملة مع مخططات وإحصائيات. الصفحة تستخدم Chart.js (عبر CDN) لعرض مخططات bar وpie وline. تتطلب ADMIN_TOKEN للوصول (تُخفي المحتوى إذا لم يُضبط).

## Dependencies

**Depends on:** task-02-dashboard-stats-api.md
**Blocks:** task-08-dashboard-ui.md

**Context from dependencies:** task-02 ينشئ endpoints: `/api/stats/summary`, `/api/stats/timeseries`, `/api/stats/providers`, `/api/stats/languages`, `/api/stats/hourly`. هذه الـ endpoints تُغذّي المخططات في dashboard.html.

## Files to Create

- `public/admin.html` — Admin dashboard page
- `public/js/dashboard.js` — Dashboard logic and chart rendering

## Files to Modify

- `server/server.js` — Ensure admin.html is served (already covered by express.static)

## Technical Details

### Implementation Steps

1. إنشاء `public/admin.html` ببنية RTL Arabic متوافقة مع التصميم الحالي
2. إضافة Chart.js CDN في `<head>`
3. إنشاء `public/js/dashboard.js` بمنطق جلب البيانات وعرض المخططات
4. نظام Admin Token مُعاد من settings modal الحالي

### Page Structure

```html
<!-- public/admin.html -->
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>أرا لينك — لوحة التحكم</title>
  <script src="theme-init.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    /* Dashboard-specific styles */
    .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .stat-value { font-size: 2rem; font-weight: 800; color: var(--primary); }
    .stat-label { font-size: .85rem; color: var(--text-dim); }
    .chart-container { position: relative; height: 250px; }
    .auth-overlay { /* Full-screen auth gate */ }
  </style>
</head>
<body>
  <!-- Auth Gate -->
  <div id="auth-gate" class="auth-overlay">
    <div class="card" style="max-width: 400px; margin: 100px auto;">
      <h2>🔒 لوحة التحكم</h2>
      <p>أدخل مفتاح الإدارة (ADMIN_TOKEN)</p>
      <input type="password" id="admin-token" class="input" placeholder="المفتاح">
      <button id="auth-btn" class="btn-primary" style="width:100%; margin-top:12px;">دخول</button>
    </div>
  </div>
  
  <!-- Dashboard Content (hidden until auth) -->
  <div id="dashboard" hidden>
    <header class="site-header">
      <h1>📊 لوحة التحكم</h1>
      <a href="/" class="header-btn">← العودة</a>
    </header>
    
    <main class="container">
      <!-- Summary Cards -->
      <div class="dashboard-grid">
        <div class="stat-card">
          <div class="stat-value" id="total-count">—</div>
          <div class="stat-label">إجمالي الترجمات</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="today-count">—</div>
          <div class="stat-label">ترجمات اليوم</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="week-count">—</div>
          <div class="stat-label">ترجمات الأسبوع</div>
        </div>
      </div>
      
      <!-- Charts -->
      <div class="dashboard-grid" style="margin-top: 20px;">
        <div class="stat-card">
          <h3>📈 الترجمات خلال7 أيام</h3>
          <div class="chart-container"><canvas id="timeseries-chart"></canvas></div>
        </div>
        <div class="stat-card">
          <h3>📊 التوزيع حسب النوع</h3>
          <div class="chart-container"><canvas id="type-chart"></canvas></div>
        </div>
        <div class="stat-card">
          <h3>🌍 اللغات الأكثر استخدامًا</h3>
          <div class="chart-container"><canvas id="lang-chart"></canvas></div>
        </div>
        <div class="stat-card">
          <h3>🕐 أنماط الاستخدام (ساعات)</h3>
          <div class="chart-container"><canvas id="hourly-chart"></canvas></div>
        </div>
      </div>
    </main>
  </div>
  
  <script type="module" src="js/dashboard.js"></script>
</body>
</html>
```

### Dashboard JS Logic

```javascript
// public/js/dashboard.js
const ADMIN_TOKEN_KEY = 'aralink-admin-token';

async function fetchStats(endpoint) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const res = await fetch(`/api/stats/${endpoint}`, {
    headers: { 'x-admin-token': token },
  });
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json();
}

async function initDashboard() {
  // Auth check
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) { showAuthGate(); return; }
  
  try {
    const [summary, timeseries, providers, languages, hourly] = await Promise.all([
      fetchStats('summary'),
      fetchStats('timeseries?days=7'),
      fetchStats('providers'),
      fetchStats('languages'),
      fetchStats('hourly'),
    ]);
    
    renderSummaryCards(summary);
    renderTimeseriesChart(timeseries);
    renderTypeChart(summary.byType);
    renderLanguageChart(languages);
    renderHourlyChart(hourly);
    
    document.getElementById('dashboard').hidden = false;
  } catch (e) {
    showAuthGate(); // Token invalid
  }
}

// Chart.js rendering functions...
```

### Chart Configuration

```javascript
// RTL support for Chart.js
Chart.defaults.font.family = 'Cairo, sans-serif';
Chart.defaults.plugins.labels.color = 'var(--text)';
Chart.defaults.color = 'var(--text-dim)';

// Timeseries (Line chart)
function renderTimeseriesChart(data) {
  new Chart(document.getElementById('timeseries-chart'), {
    type: 'line',
    data: {
      labels: data.days.map(d => d.date),
      datasets: [{
        label: 'الترجمات',
        data: data.days.map(d => d.count),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

// Type distribution (Doughnut chart)
function renderTypeChart(byType) {
  const labels = { youtube: 'يوتيوب', article: 'مقالات', text: 'نصوص', smart: 'ذكية' };
  new Chart(document.getElementById('type-chart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(byType).map(k => labels[k] || k),
      datasets: [{
        data: Object.values(byType),
        backgroundColor: ['#6366f1', '#22d3ee', '#f59e0b', '#10b981'],
      }],
    },
  });
}
```

## Acceptance Criteria

- [ ] `admin.html` page loads and renders correctly
- [ ] Auth gate requires ADMIN_TOKEN before showing content
- [ ] Token is stored in localStorage and sent as `x-admin-token` header
- [ ] Summary cards show total, today, week counts
- [ ] Timeseries line chart shows7-day trend
- [ ] Type doughnut chart shows youtube/article/text/smart distribution
- [ ] Language bar chart shows top source/target languages
- [ ] Hourly chart shows usage pattern by hour
- [ ] Charts work in both dark and light themes
- [ ] Responsive layout works on mobile
- [ ] Link to dashboard is accessible from main page (settings area)

## Notes

- **Chart.js CDN**: `https://cdn.jsdelivr.net/npm/chart.js@4` — lightweight, no npm needed
- **CSP**: If CSP is enabled, add `https://cdn.jsdelivr.net` to `scriptSrc` in server.js
- **No auth system**: Simple token gate — not a login page
- **Mobile responsive**: Charts stack vertically on small screens
- **RTL**: All text is Arabic, charts render correctly with RTL font
