---
applyTo: '**/*.css'
---

# CSS

Full rules live in [`docs/coding-style.md#css`](../../docs/coding-style.md#css).
This file is a thin pointer scoped to CSS files via the `applyTo`
glob above.

Most styling in this extension is emitted as inline `<style>`
blocks inside webview HTML built by `src/session-manager.ts` and
friends. Standalone `.css` files are limited to vendor assets in
`out/codicons/` (do not edit) and any user-shipped overrides.

## At a glance

- 2-space indent, LF, trailing newline, no trailing whitespace.
  Enforced by **Prettier** (`npm run format`).
- One selector per line in a selector list; opening `{` on the
  same line as the last selector; one declaration per line;
  closing `}` on its own line.
- Lowercase properties, keywords, and short-form hex (`#fff`).
  Single quotes for strings. Omit units on zero values.
- Use `var(--vscode-*)` theme tokens for any color that should
  follow the active theme.
- Prefer class selectors over element/ID selectors. Avoid deep
  descendant selectors (>3 levels). BEM-ish naming when
  inventing classes.
- `/* CSS comments */` only. Comment **why**, not what.
