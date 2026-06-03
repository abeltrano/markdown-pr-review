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

run().catch(err => {
  console.error(err);
  process.exit(1);
});
