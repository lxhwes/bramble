/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

// Cache name includes the build version so a fresh deploy always opens a new
// cache. The old cache is cleaned up in the activate handler below.
const CACHE_NAME = `bramble-cache-${version}`;

// Assets to precache: the built JS/CSS bundle plus everything in /static.
const ASSETS = [...build, ...files];

// ---------------------------------------------------------------------------
// Install — precache all known assets
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting()),
	);
});

// ---------------------------------------------------------------------------
// Activate — delete stale caches from previous deploys
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for assets, network-first for HTML navigation
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only handle GET requests.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Skip cross-origin requests.
	if (url.origin !== self.location.origin) return;

	const isAsset = ASSETS.includes(url.pathname);
	const isNavigation = request.mode === 'navigate';

	if (isAsset) {
		// Cache-first: serve from cache, fall back to network.
		event.respondWith(
			caches.match(request).then((cached) => cached ?? fetch(request)),
		);
	} else if (isNavigation) {
		// Network-first: try the network, fall back to a cached shell.
		event.respondWith(
			fetch(request).catch(() => caches.match(request) as Promise<Response>),
		);
	}
	// All other requests fall through to the network with no SW involvement.
});
