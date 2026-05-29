import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		// Build-time constant that gates Node-only imports. On the default
		// Cloudflare build this is 'cloudflare', so esbuild dead-code-eliminates
		// the `await import('./node.js')` branch — better-sqlite3 never enters
		// the Worker bundle.
		__BRAMBLE_TARGET__: JSON.stringify(
			process.env.BRAMBLE_TARGET ?? 'cloudflare',
		),
	},
});
