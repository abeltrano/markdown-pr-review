---
applyTo: '**/*.css'
---

# CSS

Most styling in this extension is emitted as inline `<style>` blocks
inside webview HTML built by `src/session-manager.ts` and friends.
Standalone `.css` files are limited to vendor assets in `out/codicons/`
(do not edit) and any user-shipped overrides. These rules apply to
hand-written `.css` files.

## Formatting

- 4-space indent (matches `.editorconfig` global), spaces only.
- LF line endings; trailing newline at end of file; no trailing
  whitespace.
- One selector per line in a selector list, comma-terminated:

  ```css
  h1,
  h2,
  h3 {
      font-weight: 600;
  }
  ```

- Opening brace on the same line as the last selector, preceded by a
  single space.
- One declaration per line.
- Single space after `:`; semicolon after every declaration
  (including the last in a block).
- Closing `}` on its own line.
- One blank line between rules; no blank lines inside a rule.
- No blank lines at start or end of file.

## Style

- Lowercase properties, lowercase keywords, lowercase hex (`#fff`,
  not `#FFF`). Use the short hex form (`#fff`) when the long form is
  redundant.
- Single quotes for strings (`content: 'x';`, `font-family: 'Segoe
  UI', sans-serif;`).
- Omit units on zero values (`margin: 0;`, not `margin: 0px;`). Keep
  units on non-zero time/angle/percentage values.
- Use `var(--token)` for VS Code theme tokens
  (`var(--vscode-editor-background)`); do not hard-code colors that
  should follow the active theme.
- Vendor-prefixed properties grouped with their canonical form,
  prefixed first, unprefixed last.

## Selectors

- Prefer class selectors over element or ID selectors for component
  styling. IDs are reserved for one-off DOM landmarks.
- Avoid deep descendant selectors (more than 3 levels) — keep
  specificity low.
- Use BEM-ish naming when invented (`.thread-marker__count`); do not
  redefine codicon class names emitted by `@vscode/codicons`.

## Comments

- `/* CSS comments */` only. Comment **why**, not what.
- Group related rules under a short section comment in long files.
