---
applyTo: '**/*.yml,**/*.yaml'
---

# YAML

Full rules live in [`docs/coding-style.md#yaml`](../../docs/coding-style.md#yaml).
This file is a thin pointer scoped to YAML files via the `applyTo`
glob above.

## At a glance

- **2-space** indent (the minimum allowed). Spaces only, never
  tabs.
- LF, UTF-8 (no BOM), trailing newline, no trailing whitespace.
- Block style for mappings and sequences; flow style
  (`{key: val}`, `[a, b]`) only for short, truly inline values.
- Quote strings only when necessary (containing `:` / `#`,
  ambiguous booleans, etc.). Prefer single quotes.
- Booleans `true` / `false` (lowercase). Sequence items: `- item`
  with one space after the dash; nested mappings indented 2 spaces
  past the dash.
- Lowercase-kebab-case keys unless the consumer (GitHub Actions,
  Dependabot, issue-form schema) requires another casing.
- Comment **why**, not what. `#` followed by a single space.
