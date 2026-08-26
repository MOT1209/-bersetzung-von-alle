/* تطبيق السمة قبل رسم الصفحة (يمنع وميض الألوان) */
(function () {
  var saved = null;
  try { saved = localStorage.getItem('aralink-theme'); } catch (e) { /* تجاهل */ }
  var theme = (saved === 'light' || saved === 'dark') ? saved
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
})();
