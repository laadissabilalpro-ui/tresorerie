/* Trésorerie — service worker (PWA) — v2
   Offline-first. Cache le coeur de l'app (édition + consultation) + le SDK Supabase. */
const CACHE = "treso-v2";
const CORE = ["./", "./index.html", "./vue.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    try { await c.add(CDN); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // ne jamais intercepter les écritures Supabase
  const url = new URL(req.url);

  // Appels API Supabase : toujours au réseau (données fraîches / temps réel)
  if (url.hostname.endsWith(".supabase.co")) return;

  // Navigation (index.html / vue.html) : réseau d'abord, repli sur le cache de la MÊME page
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match("./index.html"))
        )
    );
    return;
  }

  // Autres ressources : cache d'abord, sinon réseau
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((r) => {
            if (url.origin === location.origin || url.host.includes("jsdelivr")) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          })
          .catch(() => cached)
    )
  );
});
