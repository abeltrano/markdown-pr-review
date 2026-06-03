---
applyTo: '**/*.ts,**/*.tsx'
---

# TypeScript

Full rules live in [`docs/coding-style.md#typescript`](../../docs/coding-style.md#typescript).
This file is a thin pointer scoped to TypeScript files via the
`applyTo` glob above.

## At a glance

- 2-space indent, LF, single quotes, semicolons.
- Named exports only; `import type { ... }` (or inline
  `import { type Foo, bar }`) for type-only imports.
- `strict: true`; avoid `any`, avoid non-null assertions; use
  `unknown` + narrow when typing JSON / message boundaries.
- Prefer `async`/`await`. `eqeqeq` enforced; `== null` is the
  allowed idiom.
- Prefix unused vars/params with `_`.
- Logging: `getLogger('Component')` from `src/logger.ts` —
  **never** `console.log`. Route any secret-bearing value through
  `redact(...)` from `src/redact.ts` first.
- Comment **why**, not what. Cite `REQ-XXX` / `RISK-XXX` /
  `TC-XXX` / `ASM-XXX` when behavior derives from a spec.
