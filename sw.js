/* Trésorerie — service worker (PWA) — v1
   Offline-first : on cache le coeur de l'app + le SDK Supabase.
   - Navigation : network-first avec repli sur le cache (utilisable hors-ligne).
   - Assets : cache-first puis réseau. */
const CACHE = "treso-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
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
  if (req.method !== "GET") return; // jamais intercepter les écritures Supabase (POST/PATCH/DELETE)
  const url = new URL(req.url);

  // On laisse passer les appels API Supabase directement au réseau (données fraîches / temps réel)
  if (url.hostname.endsWith(".supabase.co")) return;

  // Navigation : réseau d'abord, repli cache
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return r;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Assets : cache d'abord, sinon réseau (et on met en cache l'app + le CDN)
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
