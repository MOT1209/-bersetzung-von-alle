/* sw.js — Service Worker لأرا لينك (PWA)
   استراتيجية: شبكة-أوّل مع تحديث خلفي (stale-while-revalidate) للملفات الثابتة
   لضمان ظهور النسخ المحدّثة بعد النشر. الكاش يبقى كاحتياطي أوفلاين فقط. */
const CACHE = 'aralink-v4';
const PRECACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/style.css',
  '/theme-init.js',
  '/js/app.js',
  '/js/constants.js',
  '/js/utils.js',
  '/js/ui.js',
  '/js/media.js',
  '/js/result.js',
  '/js/features.js',
  '/js/translate.js',
  '/js/stream.js',
  '/js/dashboard.js',
  '/manifest.webmanifest',
  '/icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // لا نتطفل على الواجهات/النطاقات الأخرى أبدًا
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // الطلبات الديناميكية (API) — لا نكاش إلا قائمة اللغات (خاص/كبير)
  if (url.pathname.startsWith('/api/')) {
    // Only cache the languages list — everything else (video/translations) is private or huge
    if (url.pathname === '/api/languages' || url.pathname === '/api/languages/') {
      e.respondWith(
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => caches.match(e.request))
      );
    }
    return;
  }

  // الملفات الثابتة → stale-while-revalidate:
  // قدّم نسخة الكاش فوراً (سرعة + أوفلاين)، ثم احصل على النسخة الحديثة من الشبكة
  // وخدّث الكاش للزيارات التالية. يضمن ظهور التحديثات دون إعادة تحميل قسري.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});