---
applyTo: '**/*.ts,**/*.tsx'
---

# TypeScript

## Formatting

- 4-space indent, spaces only (no tabs), LF line endings.
- Single quotes for strings; backticks only for template literals or
  embedded `'`. Reserve double quotes for JSON-shaped contexts.
- Always terminate statements with semicolons.
- Trailing newline at end of file. No leading/trailing blank lines.
- One blank line between top-level declarations; none between members
  inside a class or interface unless a logical separator is warranted.
- Group imports: `node:` builtins, third-party, then project-relative
  (each group separated by a single blank line). No blank lines inside
  a group.

## Imports and exports

- Prefer **named exports**; do not introduce default exports.
- Use `import type { ... }` (or inline `import { type Foo, bar }`) for
  type-only imports. `typeof import('...')` is permitted for typing a
  value populated by a dynamic `import()`.
- Re-exports go in `index.ts` barrels only when there is more than one
  consumer.

## Types

- `strict: true` is on — never disable. `noImplicitAny` and
  `strictNullChecks` apply.
- Prefer `interface` for object shapes that may be extended; use
  `type` aliases for unions, intersections, and tuples.
- Avoid `any`. When unavoidable (JSON / message boundaries), add a
  one-line comment explaining why and prefer `unknown` + a narrow.
- Avoid non-null assertions (`!`). Use a narrowing check or
  `if (x == null) throw ...` instead.

## Idioms

- Prefer `async`/`await` over `.then()` chains.
- `eqeqeq` enforced; `== null` is allowed for the null-or-undefined
  idiom.
- Prefix intentionally-unused vars/params with `_` (e.g.
  `_token: vscode.CancellationToken`).
- Never `void someAsync()` without a leading comment explaining why
  the rejection is genuinely safe to ignore.
- Use `getLogger('Component')` from `src/logger.ts` — never
  `console.log`. `console.warn`/`console.error` are allowed as a last
  resort.
- Anything that may carry a token, PAT, JWT, or ADO response body must
  pass through `redact(...)` from `src/redact.ts` before logging.

## Comments

- Comment **why**, not what. Explain non-obvious tradeoffs and gotchas.
- Cite `REQ-XXX` (`docs/requirements.md`), `RISK-XXX`,
  `TC-XXX` (`docs/validation-plan.md`), or `ASM-XXX` when behavior
  derives from a spec. Do not invent new IDs and do not reintroduce
  the retired `D-XXX` or `TASK-XXX` IDs.
