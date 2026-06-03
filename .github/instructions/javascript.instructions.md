---
applyTo: '**/*.js,**/*.mjs,**/*.cjs,**/*.jsx'
---

# JavaScript

Hand-written `.js` / `.cjs` / `.mjs` files in this repo are limited to
build and test configuration (`esbuild.js`, `.mocharc.cjs`). Runtime
code lives in TypeScript and is bundled to `out/` by esbuild — do not
hand-edit anything under `out/`.

## Formatting

- 2-space indent, spaces only (no tabs), LF line endings.
- Single quotes for strings; backticks only for template literals.
- Always terminate statements with semicolons.
- Trailing newline at end of file. No leading/trailing blank lines.
- One blank line between top-level declarations.
- Group imports / requires: `node:` builtins, third-party, then
  project-relative, each group separated by a single blank line.

## Module systems

- `.cjs` → CommonJS. Use `require(...)` and `module.exports`. ESLint
  is configured with the Node CommonJS globals (`module`, `require`,
  `__dirname`, `__filename`, `process`, `exports`).
- `.mjs` and bare `.js` under `src/` → ESM. Use `import`/`export`.
- Use `node:` prefix for built-in modules (`require('node:path')`,
  `import fs from 'node:fs'`).

## Idioms

- `'use strict'` is unnecessary in ESM and CommonJS modules — omit it.
- Prefer `const`; use `let` only when reassignment is needed; never
  `var`.
- Prefer `async`/`await` over `.then()` chains.
- `eqeqeq` enforced; `== null` is allowed for the null-or-undefined
  idiom.
- Prefix intentionally-unused vars/params with `_`.

## Comments

- Comment **why**, not what.
- SPDX header at the top of files under `src/` (`// SPDX-License-Identifier: MIT`)
  matches the surrounding TypeScript convention.
