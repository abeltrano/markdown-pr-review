---
applyTo: '**/*.js,**/*.mjs,**/*.cjs,**/*.jsx'
---

# JavaScript

Full rules live in [`docs/coding-style.md#javascript`](../../docs/coding-style.md#javascript).
This file is a thin pointer scoped to JS/CJS/MJS files via the
`applyTo` glob above.

Hand-written `.js` / `.cjs` / `.mjs` files in this repo are limited
to build and test configuration (`esbuild.js`, `.mocharc.cjs`,
`eslint.config.mjs`). Runtime code lives in TypeScript and is
bundled to `out/` by esbuild — do not hand-edit anything under
`out/`.

## At a glance

- 2-space indent, LF, single quotes, semicolons.
- `.cjs` → CommonJS (`require` / `module.exports`); `.mjs` and
  bare `.js` under `src/` → ESM (`import` / `export`).
- Use the `node:` prefix for built-in modules
  (`require('node:path')`, `import fs from 'node:fs'`).
- Prefer `const`; use `let` only when reassignment is needed; never
  `var`.
- Prefer `async`/`await`. `eqeqeq` enforced; `== null` is the
  allowed idiom.
- Prefix unused vars/params with `_`.
- Comment **why**, not what. SPDX header at the top of files under
  `src/`.
