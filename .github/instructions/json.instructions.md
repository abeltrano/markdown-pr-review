---
applyTo: '**/*.json,**/*.jsonc'
---

# JSON / JSONC

Full rules live in [`docs/coding-style.md#json--jsonc`](../../docs/coding-style.md#json--jsonc).
This file is a thin pointer scoped to JSON/JSONC files via the
`applyTo` glob above.

## At a glance

- **2-space** indent (the minimum sensible). Spaces only, never
  tabs. Enforced by **Prettier** (`npm run format`).
- LF, UTF-8 (no BOM), trailing newline, no trailing whitespace.
- Double quotes for all strings and keys (single quotes are
  invalid in JSON; keep them out of JSONC too for consistency).
- Single space after `:` between key and value.
- **Strict `.json`**: no comments, no trailing commas. **JSONC**:
  both permitted. Files under `.vscode/` and `tsconfig*.json` are
  parsed as JSONC by VS Code — treat them accordingly.
- **Never hand-edit `package-lock.json`** — regenerate with
  `npm install` or `npm ci`. Add deps to `package.json` via
  `npm install --save[-dev]`, not by hand.
