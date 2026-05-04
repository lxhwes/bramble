import type { RequestHandler } from './$types';

/**
 * Kill switch: unregisters the service worker and clears all caches, then
 * redirects to the app root. Use this before flipping the repo public or any
 * time a stale SW needs to be evicted from browsers.
 *
 * GET /sw-clear — serves an inline HTML page that performs the cleanup and
 * redirects. No client-side framework is needed; the page is self-contained.
 */
export const GET: RequestHandler = () => {
	const html = /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Clearing service worker…</title>
</head>
<body>
  <p>Clearing service worker and caches…</p>
  <script>
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } finally {
        window.location.replace('/');
      }
    })();
  </script>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			// Prevent this page itself from being served by a SW or cached.
			'cache-control': 'no-store',
		},
	});
};
