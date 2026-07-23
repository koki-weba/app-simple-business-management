/* Service Worker — ネットワーク優先 + version.json は常にサーバーから取得 */
const CACHE = "startup-roadmap-v22";
const SHELL = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./defaults.js",
  "./sync.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon.svg",
];

const NETWORK_FIRST = /\.(html|js|css|json|svg)(\?.*)?$/i;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          if (client.url.startsWith(self.registration.scope)) {
            client.navigate(client.url);
          }
        });
      })
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
      }
      return res;
    })
    .catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
      }
      return res;
    });
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    e.respondWith(fetch(e.request, { cache: "no-store" }));
    return;
  }

  if (e.request.mode === "navigate" || NETWORK_FIRST.test(url.pathname)) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  e.respondWith(cacheFirst(e.request));
});
