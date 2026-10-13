// La V2 vit maintenant à la racine du site. Ce fichier remplace l'ancien service worker de v2/
// sur les téléphones qui l'avaient installé : il vide son cache et se retire.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .delete("calliboss2-v1")
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
