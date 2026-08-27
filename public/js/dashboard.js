// public/js/dashboard.js — Admin dashboard logic
const TOKEN_KEY = 'aralink-admin-token';

async function fetchStats(endpoint) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api/stats/${endpoint}`, {
    headers: { 'x-admin-token': token },
  });
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
  return res.json();
}

function showAuthGate() {
  document.getElementById('auth-gate').hidden = false;
  document.getElementById('dashboard').hidden = true;
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function initCharts() {
  Chart.defaults.font.family = 'Cairo, sans-serif';
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-dim') || '#666';
  Chart.defaults.color = textColor;
}

function renderTimeseries(data) {
  new Chart(document.getElementById('timeseries-chart'), {
    type: 'line',
    data: {
      labels: data.days.map(d => d.date.slice(5)),
      datasets: [{
        data: data.days.map(d => d.count),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true, tension: 0.3, pointRadius: 4,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
}

function renderTypeChart(byType) {
  const labels = { youtube: 'يوتيوب', article: 'مقالات', text: 'نصوص', smart: 'ذكية' };
  const entries = Object.entries(byType);
  new Chart(document.getElementById('type-chart'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => labels[k] || k),
      datasets: [{ data: entries.map(([,v]) => v), backgroundColor: ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'] }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderLangChart(data) {
  const entries = Object.entries(data.byTarget || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  new Chart(document.getElementById('lang-chart'), {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([,v]) => v), backgroundColor: '#6366f1' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: 'y' },
  });
}

function renderHourly(data) {
  new Chart(document.getElementById('hourly-chart'), {
    type: 'bar',
    data: {
      labels: data.hours.map((_, i) => `${i}`),
      datasets: [{ data: data.hours, backgroundColor: '#22d3ee' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
}

function renderQuality(data) {
  const body = document.getElementById('quality-body');
  const updated = document.getElementById('quality-updated');
  if (!body) return;
  if (!data || !data.available) {
    body.textContent = 'لا يوجد تقرير بعد — شغّل: node scripts/bench-translate.js';
    return;
  }
  if (updated && data.generatedAt) {
    updated.textContent = '· آخر تحديث: ' + new Date(data.generatedAt).toLocaleString('ar');
  }
  const langs = data.langs || [];
  const rows = (data.summary || []).map((s) => {
    const perLang = langs.map((l) => `<td style="text-align:center">${s.perLang && s.perLang[l] != null ? s.perLang[l] : '—'}</td>`).join('');
    return `<tr>
      <td style="font-weight:700">${s.provider}</td>
      <td style="text-align:center;font-weight:700">${s.avgScore != null ? s.avgScore : '—'}</td>
      <td style="text-align:center">${s.avgWer != null ? s.avgWer : '—'}</td>
      <td style="text-align:center">${s.succeeded}/${s.samples}</td>
      ${perLang}
    </tr>`;
  }).join('');
  body.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:1px solid var(--border,#e5e7eb)">
      <th style="text-align:right;padding:6px">المزوّد</th>
      <th style="padding:6px">الدرجة</th>
      <th style="padding:6px">WER</th>
      <th style="padding:6px">نجاح</th>
      ${langs.map((l) => `<th style="padding:6px">${l}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:var(--text-dim,#666);font-size:.8rem;margin-top:8px">الدرجة = 1 − WER (1 = مطابق للترجمة المرجعية). ${data.refsetSize} جملة مرجعية.</p>`;
}

async function init() {
  const token = localStorage.getItem(TOKEN_KEY);

  document.getElementById('auth-btn').addEventListener('click', () => {
    const val = document.getElementById('admin-token').value.trim();
    if (!val) return;
    localStorage.setItem(TOKEN_KEY, val);
    location.reload();
  });

  if (!token) { showAuthGate(); return; }

  try {
    const [summary, timeseries, languages, hourly] = await Promise.all([
      fetchStats('summary'),
      fetchStats('timeseries?days=7'),
      fetchStats('languages'),
      fetchStats('hourly'),
    ]);

    document.getElementById('total-count').textContent = summary.total || 0;
    document.getElementById('today-count').textContent = summary.todayCount || 0;
    document.getElementById('week-count').textContent = summary.weekCount || 0;

    initCharts();
    renderTimeseries(timeseries);
    renderTypeChart(summary.byType || {});
    renderLangChart(languages);
    renderHourly(hourly);

    // جودة الترجمة — اختياري، لا يكسر اللوحة إن غاب التقرير
    try { renderQuality(await fetchStats('quality')); }
    catch { renderQuality(null); }

    document.getElementById('auth-gate').hidden = true;
    document.getElementById('dashboard').hidden = false;
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    showAuthGate();
    showError('المفتاح غير صحيح أو الخادم غير متاح');
  }
}

init();
