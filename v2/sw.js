// Cache hors ligne. Incrémente VERSION à chaque mise en ligne.
// Toute la liste des fichiers de l'app est ici ; tests/core.test.js vérifie qu'il n'en manque aucun.
const VERSION = "calliboss2-v1";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/app.css",
  "fonts/barlow-400.woff2",
  "fonts/barlow-500.woff2",
  "fonts/barlow-600.woff2",
  "fonts/barlow-condensed-600.woff2",
  "fonts/barlow-condensed-700.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "js/main.js",
  "js/store.js",
  "js/core/dates.js",
  "js/core/model.js",
  "js/core/v1-default.js",
  "js/core/migrate.js",
  "js/core/catalog.js",
  "js/core/run.js",
  "js/core/stats.js",
  "js/core/share.js",
  "js/cloud/firebase.js",
  "js/cloud/account.js",
  "js/cloud/group.js",
  "js/ui/dom.js",
  "js/ui/icons.js",
  "js/ui/charts.js",
  "js/ui/today.js",
  "js/ui/session.js",
  "js/ui/programs.js",
  "js/ui/run.js",
  "js/ui/me.js",
  "js/ui/group.js",
  "js/ui/settings.js",
  "../firebase-config.js",
];

// GitHub Pages laisse le navigateur garder chaque fichier 10 min : sans `cache`, une mise à jour
// arrive par morceaux. On passe donc outre ce cache-là.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("calliboss2-") && k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
// Seulement l'app et le SDK Firebase : les appels au serveur ne sont jamais mis en cache.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const own = url.origin === location.origin;
  if (!own && url.hostname !== "www.gstatic.com") return;
  e.respondWith(
    (own ? fetch(e.request.url, { cache: "no-cache" }) : fetch(e.request))
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
