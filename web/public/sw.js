const CACHE = "speedrun-shell-v1";

const SHELL = ["/", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest", "/backdrop.jpg"];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
	self.clients.claim();
});

function cacheFirst(request) {
	return caches.match(request).then(
		(hit) =>
			hit ??
			fetch(request).then((response) => {
				if (response.ok) {
					const copy = response.clone();
					caches.open(CACHE).then((cache) => cache.put(request, copy));
				}

				return response;
			}),
	);
}

function networkFirst(request) {
	return fetch(request)
		.then((response) => {
			const copy = response.clone();
			caches.open(CACHE).then((cache) => cache.put("/", copy));

			return response;
		})
		.catch(() => caches.match("/"));
}

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);

	if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

	if (url.pathname.startsWith("/api/") || event.request.headers.get("upgrade") === "websocket") return;

	if (event.request.mode === "navigate") return event.respondWith(networkFirst(event.request));
	event.respondWith(cacheFirst(event.request));
});
