// SPDX-License-Identifier: MIT
// esbuild build script. Produces three bundles:
//   1. Extension host (Node CommonJS, external: vscode)
//   2. Rendered-view webview (browser IIFE, includes markdown-it/mermaid)
//   3. Comment-input webview (browser IIFE, lightweight)
// Run: `node esbuild.js`
// Watch: `node esbuild.js --watch`
// Production: `node esbuild.js --production`

const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const sharedOpts = {
bundle: true,
sourcemap: isProduction ? false : 'external',
minify: isProduction,
logLevel: 'info',
target: 'es2022',
legalComments: 'none'
};

const hostBuild = {
...sharedOpts,
entryPoints: [path.join('src', 'extension.ts')],
outfile: path.join('out', 'extension.js'),
platform: 'node',
format: 'cjs',
external: ['vscode']
};

const renderedViewBuild = {
...sharedOpts,
entryPoints: [path.join('src', 'views', 'rendered-view', 'main.ts')],
outfile: path.join('out', 'views', 'rendered-view', 'main.js'),
platform: 'browser',
format: 'iife',
// mermaid is bundled but loaded lazily by main.ts (see mermaid-loader.ts).
};

const commentInputBuild = {
...sharedOpts,
entryPoints: [path.join('src', 'views', 'comment-input', 'main.ts')],
outfile: path.join('out', 'views', 'comment-input', 'main.js'),
platform: 'browser',
format: 'iife'
};

async function run() {
copyCodicons();
const builds = [hostBuild, renderedViewBuild, commentInputBuild];
if (isWatch) {
 const contexts = await Promise.all(builds.map(b => esbuild.context(b)));
 await Promise.all(contexts.map(c => c.watch()));
 console.log('[esbuild] watching...');
} else {
 await Promise.all(builds.map(b => esbuild.build(b)));
 console.log(`[esbuild] built ${builds.length} bundles${isProduction ? ' (production)' : ''}.`);
}
}

// Copy the codicon font + CSS from node_modules into out/codicons/ so the
// rendered-view webview (whose localResourceRoots is out/) can load them.
// We only need the .css + .ttf; the rest of @vscode/codicons (.svg, .html
// gallery, etc.) stays out of the package.
function copyCodicons() {
const srcDir = path.join('node_modules', '@vscode', 'codicons', 'dist');
const dstDir = path.join('out', 'codicons');
fs.mkdirSync(dstDir, { recursive: true });
for (const f of ['codicon.css', 'codicon.ttf']) {
 fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
}
console.log('[esbuild] copied codicon.css + codicon.ttf to out/codicons/.');
}

run().catch(err => {
console.error(err);
process.exit(1);
});
