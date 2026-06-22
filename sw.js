/* Trésorerie — service worker (PWA) — v3
   Mise à jour automatique : "réseau d'abord" pour la navigation ET pour app.js/styles.css/manifest,
   donc l'utilisateur a toujours la dernière version quand il est en ligne (repli sur le cache hors-ligne). */
const CACHE = "treso-v3";
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith(".supabase.co")) return; // API : toujours réseau direct

  const isNav = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isAsset = url.origin === location.origin && /\.(js|css|webmanifest)$/.test(url.pathname);

  // Réseau d'abord (toujours frais en ligne), repli cache hors-ligne
  if (isNav || isAsset) {
    e.respondWith(
      fetch(req)
        .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; })
        .catch(() => caches.match(req, { ignoreSearch: isNav }).then((m) => m || (isNav ? caches.match("./index.html") : undefined)))
    );
    return;
  }

  // Reste (icônes, SDK CDN) : cache d'abord
  e.respondWith(
    caches.match(req).then(
      (cached) => cached || fetch(req).then((r) => {
        if (url.origin === location.origin || url.host.includes("jsdelivr")) {
          const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      }).catch(() => cached)
    )
  );
});
