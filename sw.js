const CACHE_NAME = "synthuser-pwa-v20";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-192.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png", "/src/app.js?v=20", "/src/styles.css?v=12"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
  // 通知所有客户端：新版本已激活
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "SW_UPDATED" }));
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const path = url.pathname;

  // index.html 和 sw.js 使用 network-first，确保每次获取最新
  if (path === "/" || path === "/index.html" || path === "/sw.js") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match("/"));
        })
    );
    return;
  }

  // 其他资源：cache-first（带版本号的资源天然不会冲突）
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match("/"));
    })
  );
});
