const CACHE = 'glutenfree-mt-shell-v2';
const SHELL = ['/offline.html', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/photos/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { if(url.pathname === '/links' && response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/links',copy)));} return response; }).catch(async()=> (url.pathname==='/links' && await caches.match('/links')) || await caches.match('/offline.html')));
  } else if (SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;})));
  }
});
