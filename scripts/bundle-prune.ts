/**
 * Bundles scripts/prune-cli.ts into build/prune.js as a standalone Node ESM
 * entry point that can be executed inside the production Docker image with:
 *
 *   node build/prune.js
 *
 * The runtime image has no pnpm, no tsx, and no scripts/ directory — only
 * build/, migrations/, and node_modules/. This script runs during the Docker
 * builder stage (where tsx is available) after `vite build`, producing
 * build/prune.js which is then copied to the runtime image along with the
 * rest of build/.
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
 * esbuild is a transitive dependency (via vite) — not hoisted to the root
 * node_modules by pnpm. We invoke the esbuild CLI binary directly rather than
 * importing the package, which avoids a bare-import resolution failure while
 * staying equivalent (the CLI accepts the same flags as the JS API).
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../');
const esbuildBin = resolve(root, 'node_modules/.bin/esbuild');
const entryPoint = resolve(root, 'scripts/prune-cli.ts');
const outfile = resolve(root, 'build/prune.js');

execFileSync(
	esbuildBin,
	[
		entryPoint,
		`--outfile=${outfile}`,
		'--bundle',
		'--platform=node',
		'--format=esm',
		'--target=node22',
		// better-sqlite3 contains a native .node binary — it cannot be bundled
		// into JS. At runtime Node resolves it from node_modules where the
		// compiled binary lives.
		'--external:better-sqlite3',
		// Must match the value vite.config.ts injects so storage/index.ts picks
		// the Node backend rather than trying to use Cloudflare platform bindings.
		'--define:__BRAMBLE_TARGET__="node"',
	],
	{ stdio: 'inherit' },
);

console.log('build/prune.js written');
