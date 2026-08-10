/* sw.js — Service Worker لأرا لينك (PWA)
   استراتيجية: كاش-أول للملفات الثابتة (تفتح الواجهة أوفلاين)، شبكة-أول للباقي
   السجل والمسرد مخزنان في localStorage — يعملان أوفلاين تلقائيًا */
const CACHE = 'aralink-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
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
  // الطلبات الديناميكية (API) → شبكة أولاً مع كاش احتياطي بسيط
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // الملفات الثابتة → كاش أولاً ثم شبكة (أوفلاين للواجهة)
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
