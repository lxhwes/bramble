const target = process.env.BRAMBLE_TARGET ?? 'cloudflare';
const adapter =
	target === 'node'
		? (await import('@sveltejs/adapter-node')).default
		: (await import('@sveltejs/adapter-cloudflare')).default;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
	},
	kit: {
		adapter: adapter(),
		serviceWorker: { register: process.env.NODE_ENV === 'production' },
	},
};

export default config;
