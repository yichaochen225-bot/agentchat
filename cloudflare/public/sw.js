const CACHE = "agentchat-cloud-v0.3";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/pwa.js", "/manifest.webmanifest", "/icon.svg", "/mcp-widget.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
      return response;
    } catch (_) {
      return (await caches.match(event.request)) || caches.match("/");
    }
  })());
});
