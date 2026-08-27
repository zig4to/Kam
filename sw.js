/* Predpomnilnik lupine aplikacije, da deluje tudi brez povezave.
   Ploščice zemljevida (tuja domena) gredo mimo predpomnilnika naravnost v omrežje.
   Ob spremembi datotek povečaj VERSION. */
var VERSION = 'kam-v57';
var SHELL = [
  './', './index.html', './style.css', './icon.svg', './manifest.json',
  './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Najprej omrežje, predpomnilnik le kot rezerva.

   Prej je bilo obratno (najprej predpomnilnik) in nameščena aplikacija na
   telefonu je še dolgo po objavi kazala staro različico — nove datoteke je
   dobila šele, ko se je uspel namestiti nov service worker. Ker aplikacija
   za zemljevid tako ali tako potrebuje omrežje, nas ta zamenjava skoraj nič
   ne stane, brez povezave pa lupina še vedno deluje iz predpomnilnika. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // ploščice zemljevida: samo omrežje
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
