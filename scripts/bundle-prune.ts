/**
 * Bundles scripts/prune-cli.ts into build/prune.js as a standalone Node ESM
 * entry point that can be executed inside the production Docker image with:
 *
 *   node build/prune.js
 *
 * The runtime image has no pnpm, no tsx, and no scripts/ directory — only
 * build/, migrations/, and node_modules/. This script runs during the Docker
 * builder stage (where the dev toolchain is available) after `vite build`,
 * producing build/prune.js which is then copied to the runtime image along
 * with the rest of build/.
 *
 * Why better-sqlite3 is external:
 *   better-sqlite3 contains a native .node binary compiled against a specific
 *   Node ABI. It cannot be inlined into a JS bundle — esbuild would include
 *   the JS wrapper but not the binary, breaking at runtime. Marking it
 *   external tells esbuild to emit `import 'better-sqlite3'` and let Node
 *   resolve it from node_modules at runtime, where the compiled binary lives.
 *
 * Why __BRAMBLE_TARGET__ must be defined:
 *   src/lib/server/storage/index.ts branches on this constant to select the
 *   Node vs Cloudflare storage backend. Without it the constant is undefined,
 *   the cloudflare branch runs, and getStorage() throws because there is no
 *   Cloudflare platform binding in a standalone Node process. We mirror the
 *   value that vite.config.ts injects on the Node build.
 *
 * esbuild is a direct devDependency pinned to the version vite already
 * resolves, so it dedupes to a single instance. We use its JS API rather than
 * the CLI binary because pnpm does not symlink transitive-dep bins into the
 * root node_modules/.bin under its strict layout (the binary is absent in CI).
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(import.meta.url), '../../');

await build({
	entryPoints: [resolve(root, 'scripts/prune-cli.ts')],
	outfile: resolve(root, 'build/prune.js'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	// Native module — resolve from node_modules at runtime, never inline it.
	external: ['better-sqlite3'],
	// Must match the value vite.config.ts injects so storage/index.ts picks
	// the Node backend rather than trying to use Cloudflare platform bindings.
	define: { __BRAMBLE_TARGET__: '"node"' },
});

console.log('build/prune.js written');
