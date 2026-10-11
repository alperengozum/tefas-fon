// Service worker: uygulama kabuğu (kurulabilir PWA) ve çevrimdışı okuma.
// - /_astro/* (içerik özetli adlar, değişmez): önce önbellek
// - sayfalar ve /api/funds/*: önce ağ, ağ yoksa son görülen sürüm; o da yoksa /offline
// - diğer her şey (OG görselleri, /mcp, /healthz, POST'lar): dokunulmaz
// Veri günde bir değiştiği için önce ağ: çevrimiçi kullanıcı hiçbir zaman bayat veri görmez.
const VERSION = "v1";
const STATIC = `static-${VERSION}`, PAGES = `pages-${VERSION}`;
const PRECACHE = ["/offline", "/favicon.svg", "/icon-192.png", "/manifest.webmanifest"];
const MAX_PAGES = 40; // son görülen sayfa/veri sayısı (fon detayı ~100-300 KB)

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
}

async function networkFirst(req, fallback) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.delete(req); // yeniden ekle: anahtar sırası = son kullanım (trim en eskiyi atar)
      await cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (fallback) return (await caches.match(fallback)) ?? Response.error();
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/_astro/")) return e.respondWith(cacheFirst(req));
  if (req.mode === "navigate") return e.respondWith(networkFirst(req, "/offline"));
  if (url.pathname.startsWith("/api/funds/")) return e.respondWith(networkFirst(req));
});
