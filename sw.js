// Meat again – Service Worker: online immer aktuell, offline (oder bei sehr langsamem Netz) aus dem Cache
// Bei jeder Veröffentlichung CACHE hochzählen, damit alte und neue Dateien nicht gemischt werden.
const CACHE = 'meatagain-v8';
const DATEIEN = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/model.js', 'js/data.js', 'js/speicher.js', 'js/signale.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];
const NETZ_TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netzwerk zuerst (damit Updates sofort ankommen); nur erfolgreiche Antworten landen im Cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const ausCache = () => cache.match(req, { ignoreSearch: true });
    const netz = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') e.waitUntil(cache.put(req, res.clone()));
      return res;
    });
    netz.catch(() => {});   // Fehler wird unten behandelt; hier nur „unbehandelt“-Meldungen vermeiden
    try {
      let timer;
      const zuLangsam = new Promise((ok) => { timer = setTimeout(() => ok(null), NETZ_TIMEOUT_MS); });
      const res = await Promise.race([netz, zuLangsam]);
      clearTimeout(timer);
      if (res && res.ok) return res;
      // zu langsam oder Fehlerantwort (z. B. 503): Cache bevorzugen, sonst doch das Netz abwarten
      return (await ausCache()) || res || await netz;
    } catch {
      return (await ausCache()) || Response.error();
    }
  })());
});
