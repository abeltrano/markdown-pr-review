---
applyTo: '**/*.yml,**/*.yaml'
---

# YAML

## Formatting

- **2-space** indent (the minimum allowed). Spaces only, never tabs.
- LF line endings; trailing newline at end of file; no trailing
  whitespace on any line.
- UTF-8, no BOM.
- One top-level construct per file unless YAML's `---` document
  separator is genuinely required (it usually isn't here).

## Style

- Use **block style** for mappings and sequences. Avoid flow style
  (`{key: val}`, `[a, b]`) except for short, truly inline values.
- Quote strings only when necessary: containing `:` or `#`, leading
  `!`/`&`/`*`/`?`/`-`, ambiguous booleans (`yes`/`no`/`on`/`off`),
  or numbers that must stay strings (e.g., `"1.0"`). Prefer single
  quotes; switch to double only when escaping is required.
- Booleans: `true` / `false` (lowercase). Null: omit the key, or use
  `null` when the key must be present.
- Sequence items: `- item` (one space after the dash). Indent nested
  mappings two spaces past the dash:

  ```yaml
  steps:
    - name: Build
      run: npm run build
  ```

- Keep keys lowercase-kebab-case unless the consumer (GitHub Actions,
  Dependabot, issue-form schema) requires camelCase or PascalCase.

## Spacing

- No blank lines at the start or end of the file.
- At most one blank line between top-level keys; none inside a single
  mapping unless separating logical groups in a long file.
- Single space after `:` in mapping entries (`key: value`).

## Comments

- `#` followed by a single space. Place the `#` at column 1 for
  standalone comments, or at least two spaces after the value for
  trailing comments.
- Comment **why**, not what.
