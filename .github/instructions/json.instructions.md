---
applyTo: '**/*.json,**/*.jsonc'
---

# JSON / JSONC

## Formatting

- **2-space** indent (the minimum sensible). Spaces only, never tabs.
- LF line endings; trailing newline at end of file; no trailing
  whitespace.
- UTF-8, no BOM.
- Double quotes for all strings and keys (single quotes are invalid in
  JSON; keep them out of JSONC too for consistency).
- One value per line for objects and arrays whose contents span more
  than one logical line. Short, fixed-shape values may stay on one
  line (e.g. `{ "line": 12, "offset": 1 }` in a fixture).
- Single space after `:` between key and value.
- No blank lines at start or end of file. No multiple consecutive
  blank lines inside an object.

## Comments and trailing commas

- **Strict JSON (`.json`)**: no comments, no trailing commas. Many
  `.json` files in this repo (notably `tsconfig.json`,
  `.vscode/settings.json`, `.vscode/launch.json`, `.vscode/tasks.json`)
  are interpreted by VS Code as **JSONC** and tolerate both — assume
  JSONC when editing any file under `.vscode/` or `tsconfig*.json`,
  and strict JSON everywhere else.
- **JSONC (`.jsonc`)**: `//` line comments and `/* block */` comments
  are permitted. Trailing commas on the last item of an object/array
  are permitted.

## Specific files

- `package.json` — npm controls key ordering for top-level standard
  fields; preserve the existing order. Add new dependencies via
  `npm install --save[-dev]`, not by hand-editing.
- `package-lock.json` — **do not hand-edit**. Regenerate via
  `npm install` or `npm ci`.
- `tsconfig.json` — JSONC; comments allowed and used.
