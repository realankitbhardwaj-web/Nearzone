/* ═══════════════════════════════════════════════════
   NearZone — Service Worker  (Cache-first strategy)
   Version bump cacheName when you deploy new builds
   ═══════════════════════════════════════════════════ */

const CACHE_NAME   = 'nearzone-v1';
const RUNTIME_CACHE = 'nearzone-runtime-v1';

/* ── Assets to pre-cache on install ── */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  /* Google Fonts — cached at runtime on first fetch */
];

/* ══ INSTALL — pre-cache shell ══ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ══ ACTIVATE — clean old caches ══ */
self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !allowedCaches.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ══ FETCH — network-first for API / Firebase, cache-first for assets ══ */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Skip non-GET and cross-origin Firebase / Firestore / ZegoCloud requests */
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('firebaseio.com'))  return;
  if (url.hostname.includes('firestore.googleapis.com')) return;
  if (url.hostname.includes('googleapis.com'))  return;
  if (url.hostname.includes('zegocloud.com'))   return;
  if (url.hostname.includes('cloudinary.com'))  return;

  /* Google Fonts & CDN assets — cache-first, long TTL */
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(event.request, RUNTIME_CACHE));
    return;
  }

  /* App shell (same origin) — network-first with cache fallback */
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request));
    return;
  }
});

/* ── Strategy helpers ── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200
    });
  }
}

/* ── Inline offline fallback page ── */
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NearZone — Offline</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Plus Jakarta Sans',sans-serif;background:#F8F7FF;
       display:flex;flex-direction:column;align-items:center;
       justify-content:center;height:100dvh;gap:12px;padding:24px;text-align:center;}
  .ico{font-size:56px;}
  h2{font-size:20px;font-weight:900;color:#1F2937;}
  p{font-size:13px;color:#6B7280;max-width:280px;line-height:1.6;}
  button{margin-top:8px;background:linear-gradient(135deg,#7B61FF,#9B85FF);
         color:white;border:none;padding:12px 28px;border-radius:14px;
         font-size:14px;font-weight:800;cursor:pointer;}
</style>
</head>
<body>
  <div class="ico">📡</div>
  <h2>You're Offline</h2>
  <p>NearZone ko internet chahiye. Connection check karo aur dobara try karo.</p>
  <button onclick="location.reload()">Retry</button>
</body>
</html>`;
}

/* ══ PUSH NOTIFICATIONS (future use) ══ */
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title:'NearZone', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'NearZone', {
      body:    data.body    || 'Koi message aaya hai!',
      icon:    '/icons/icon-192x192.png',
      badge:   '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data:    data.url ? { url: data.url } : {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      const existing = list.find(c => c.url === url && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
