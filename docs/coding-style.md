# Coding Style

This is the per-language style and convention guide for the
`markdown-pr-review` repo. Everything here is enforced by some
combination of `.editorconfig`, ESLint, and human review.

Whitespace rules common to every language are pinned in
[`.editorconfig`](../.editorconfig):

- **2-space** indent, spaces only (no tabs).
- **LF** line endings.
- UTF-8 (no BOM).
- Final newline at end of file.
- No trailing whitespace, with one exception: Markdown's hard-line-break
  pair of trailing spaces is preserved.

The language sections below add language-specific rules on top of
that baseline. Each section lists the file globs it applies to so you
can see at a glance which files a rule covers.

## TypeScript

*Applies to: `**/*.ts`, `**/*.tsx`.*

### Formatting

- 2-space indent, spaces only (no tabs), LF line endings.
- Single quotes for strings; backticks only for template literals or
  embedded `'`. Reserve double quotes for JSON-shaped contexts.
- Always terminate statements with semicolons.
- Trailing newline at end of file. No leading/trailing blank lines.
- One blank line between top-level declarations; none between members
  inside a class or interface unless a logical separator is warranted.
- Group imports: `node:` builtins, third-party, then project-relative
  (each group separated by a single blank line). No blank lines
  inside a group.

### Imports and exports

- Prefer **named exports**; do not introduce default exports.
- Use `import type { ... }` (or inline `import { type Foo, bar }`)
  for type-only imports. `typeof import('...')` is permitted for
  typing a value populated by a dynamic `import()`.
- Re-exports go in `index.ts` barrels only when there is more than
  one consumer.

### Types

- `strict: true` is on — never disable. `noImplicitAny` and
  `strictNullChecks` apply.
- Prefer `interface` for object shapes that may be extended; use
  `type` aliases for unions, intersections, and tuples.
- Avoid `any`. When unavoidable (JSON / message boundaries), add a
  one-line comment explaining why and prefer `unknown` + a narrow.
- Avoid non-null assertions (`!`). Use a narrowing check or
  `if (x == null) throw ...` instead.

### Idioms

- Prefer `async`/`await` over `.then()` chains.
- `eqeqeq` enforced; `== null` is allowed for the null-or-undefined
  idiom.
- Prefix intentionally-unused vars/params with `_` (e.g.
  `_token: vscode.CancellationToken`).
- Never `void someAsync()` without a leading comment explaining why
  the rejection is genuinely safe to ignore.
- Use `getLogger('Component')` from
  [`src/logger.ts`](../src/logger.ts) — never `console.log`.
  `console.warn`/`console.error` are allowed as a last resort.
- Anything that may carry a token, PAT, JWT, or ADO response body
  must pass through `redact(...)` from
  [`src/redact.ts`](../src/redact.ts) before logging.

### Comments

- Comment **why**, not what. Explain non-obvious tradeoffs and
  gotchas.
- Cite `REQ-XXX` ([`docs/requirements.md`](requirements.md)),
  `RISK-XXX`, `TC-XXX`
  ([`docs/validation-plan.md`](validation-plan.md)), or `ASM-XXX`
  when behavior derives from a spec. Do not invent new IDs and do
  not reintroduce the retired `D-XXX` or `TASK-XXX` IDs.

## JavaScript

*Applies to: `**/*.js`, `**/*.mjs`, `**/*.cjs`, `**/*.jsx`.*

Hand-written `.js` / `.cjs` / `.mjs` files in this repo are limited
to build and test configuration ([`esbuild.js`](../esbuild.js),
[`.mocharc.cjs`](../.mocharc.cjs),
[`eslint.config.mjs`](../eslint.config.mjs)). Runtime code lives in
TypeScript and is bundled to `out/` by esbuild — do not hand-edit
anything under `out/`.

### Formatting

- 2-space indent, spaces only (no tabs), LF line endings.
- Single quotes for strings; backticks only for template literals.
- Always terminate statements with semicolons.
- Trailing newline at end of file. No leading/trailing blank lines.
- One blank line between top-level declarations.
- Group imports / requires: `node:` builtins, third-party, then
  project-relative, each group separated by a single blank line.

### Module systems

- `.cjs` → CommonJS. Use `require(...)` and `module.exports`.
  ESLint is configured with the Node CommonJS globals (`module`,
  `require`, `__dirname`, `__filename`, `process`, `exports`).
- `.mjs` and bare `.js` under `src/` → ESM. Use `import`/`export`.
- Use the `node:` prefix for built-in modules
  (`require('node:path')`, `import fs from 'node:fs'`).

### Idioms

- `'use strict'` is unnecessary in ESM and CommonJS modules — omit
  it.
- Prefer `const`; use `let` only when reassignment is needed; never
  `var`.
- Prefer `async`/`await` over `.then()` chains.
- `eqeqeq` enforced; `== null` is allowed for the null-or-undefined
  idiom.
- Prefix intentionally-unused vars/params with `_`.

### Comments

- Comment **why**, not what.
- SPDX header at the top of files under `src/`
  (`// SPDX-License-Identifier: MIT`) matches the surrounding
  TypeScript convention.

## YAML

*Applies to: `**/*.yml`, `**/*.yaml`.*

### Formatting

- **2-space** indent (the minimum allowed). Spaces only, never tabs.
- LF line endings; trailing newline at end of file; no trailing
  whitespace on any line.
- UTF-8, no BOM.
- One top-level construct per file unless YAML's `---` document
  separator is genuinely required (it usually isn't here).

### Style

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

- Keep keys lowercase-kebab-case unless the consumer (GitHub
  Actions, Dependabot, issue-form schema) requires camelCase or
  PascalCase.

### Spacing

- No blank lines at the start or end of the file.
- At most one blank line between top-level keys; none inside a
  single mapping unless separating logical groups in a long file.
- Single space after `:` in mapping entries (`key: value`).

### Comments

- `#` followed by a single space. Place the `#` at column 1 for
  standalone comments, or at least two spaces after the value for
  trailing comments.
- Comment **why**, not what.

## Markdown

*Applies to: `**/*.md`, `**/*.markdown`, `**/*.mdx`.*

Follow the default rule set from
[markdownlint](https://github.com/DavidAnson/markdownlint),
summarized below with this project's tweaks. The rule IDs (`MD001`,
etc.) match the markdownlint catalogue.

### Headings (MD001, MD003, MD018, MD022–MD026, MD041)

- Use **ATX** headings (`#`, `##`, `###`). No setext (`====` /
  `----`).
- Single space after the `#` characters.
- Heading levels increment by one — never skip a level.
- Surround every heading with one blank line above and one below
  (file start excepted).
- Headings begin at column 1.
- A markdown file's first non-blank line is a top-level (`#`)
  heading.
- One `#` heading per file.
- No trailing punctuation in headings (no `.`, `,`, `:` etc.).
- Sibling headings under the same parent must not have identical
  text.

### Lists (MD004, MD005, MD007, MD029, MD030, MD032)

- Unordered list marker: `-` (consistent throughout the file).
- Ordered lists: `1.`, `2.`, `3.` (increment) — not all `1.`.
- One space after the marker (`- item`, `1. item`).
- Indent nested list items by **2 spaces** under the parent marker.
- Surround top-level lists with one blank line above and below.

### Whitespace (MD009, MD010, MD012, MD047)

- No trailing whitespace, with one deliberate exception: **two**
  trailing spaces denote a hard line break in prose.
  `.editorconfig` disables `trim_trailing_whitespace` for `.md`
  files so that intentional pair survives saves.
- No tab characters. Use spaces.
- At most **one** consecutive blank line.
- File ends with a single trailing newline.

### Line length (MD013)

- Soft cap **80 characters** for prose paragraphs.
- Exempt: headings, tables, code blocks, and lines containing only a
  link reference or URL. Don't break a URL or a table to stay under
  the limit.

### Code (MD031, MD038, MD040, MD046, MD048)

- Use **fenced** code blocks (triple backticks) — not indented.
- Always specify a language hint:
  ` ```ts `, ` ```powershell `, ` ```yaml `, ` ```text ` (for
  fixed-width output without highlighting).
- Surround fenced code blocks with one blank line above and below.
- Backticks (not tildes) for fences.
- No spaces inside inline code: `` `foo` `` not `` ` foo ` ``.

### Emphasis and strong (MD036, MD037, MD049, MD050)

- **Bold** uses `**double asterisks**`. *Italic* uses `*single
  asterisks*`. Consistent throughout the file.
- No spaces inside the markers: `*italic*`, not `* italic *`.
- Don't use bold/italic as a substitute for a heading.

### Links and references (MD034, MD039, MD042, MD051)

- Wrap bare URLs in angle brackets: `<https://example.com>`.
- No spaces inside link text: `[text](url)`, not `[ text ](url)`.
- No empty link destinations: `[text]()` is not allowed.
- **Always make internal file references markdown links** so
  readers can navigate directly to the file on GitHub or in their
  editor. The first mention of a repo-relative path in a sentence
  should be a link, with the path itself as the link text wrapped in
  backticks:

  ```markdown
  See [`src/redact.ts`](../src/redact.ts) for the secret-redaction
  helper.
  ```

  Use a path relative to the containing markdown file (`../src/...`
  from `docs/`, `src/...` from the repo root). Subsequent
  back-to-back mentions of the same file in the same paragraph may
  be plain `` `inline code` ``. Pure-text references (file
  *categories* like "`.cjs` files", config keys like
  `package.json#main`, or generated artifacts like `out/extension.js`
  that don't exist in source control) do **not** need to be links.

### Other (MD027, MD028, MD035)

- Blockquotes: `> ` with exactly one space after `>`. No multiple
  consecutive spaces.
- Don't separate blockquote paragraphs with a blank, unquoted line.
- Horizontal rules: `---` (consistent across the file).

### HTML (MD033)

- Inline HTML is acceptable for HTML comments (`<!-- ... -->`) and
  PR-template / issue-template scaffolding. Avoid raw HTML in prose
  documents (the rendered-view webview escapes raw HTML anyway).

## JSON / JSONC

*Applies to: `**/*.json`, `**/*.jsonc`.*

### Formatting

- **2-space** indent (the minimum sensible). Spaces only, never
  tabs.
- LF line endings; trailing newline at end of file; no trailing
  whitespace.
- UTF-8, no BOM.
- Double quotes for all strings and keys (single quotes are invalid
  in JSON; keep them out of JSONC too for consistency).
- One value per line for objects and arrays whose contents span more
  than one logical line. Short, fixed-shape values may stay on one
  line (e.g. `{ "line": 12, "offset": 1 }` in a fixture).
- Single space after `:` between key and value.
- No blank lines at start or end of file. No multiple consecutive
  blank lines inside an object.

### Comments and trailing commas

- **Strict JSON (`.json`)**: no comments, no trailing commas. Many
  `.json` files in this repo (notably
  [`tsconfig.json`](../tsconfig.json),
  [`.vscode/launch.json`](../.vscode/launch.json),
  [`.vscode/tasks.json`](../.vscode/tasks.json),
  [`.vscode/extensions.json`](../.vscode/extensions.json)) are
  interpreted by VS Code as **JSONC** and tolerate both — assume
  JSONC when editing any file under `.vscode/` or `tsconfig*.json`,
  and strict JSON everywhere else.
- **JSONC (`.jsonc`)**: `//` line comments and `/* block */`
  comments are permitted. Trailing commas on the last item of an
  object/array are permitted.

### Specific files

- [`package.json`](../package.json) — npm controls key ordering for
  top-level standard fields; preserve the existing order. Add new
  dependencies via `npm install --save[-dev]`, not by hand-editing.
- [`package-lock.json`](../package-lock.json) — **do not hand-edit**.
  Regenerate via `npm install` or `npm ci`.
- [`tsconfig.json`](../tsconfig.json) — JSONC; comments allowed and
  used.

## CSS

*Applies to: `**/*.css`.*

Most styling in this extension is emitted as inline `<style>` blocks
inside webview HTML built by
[`src/session-manager.ts`](../src/session-manager.ts) and friends.
Standalone `.css` files are limited to vendor assets in
`out/codicons/` (do not edit) and any user-shipped overrides. These
rules apply to hand-written `.css` files.

### Formatting

- 2-space indent, spaces only.
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

### Style

- Lowercase properties, lowercase keywords, lowercase hex (`#fff`,
  not `#FFF`). Use the short hex form (`#fff`) when the long form
  is redundant.
- Single quotes for strings (`content: 'x';`, `font-family: 'Segoe
  UI', sans-serif;`).
- Omit units on zero values (`margin: 0;`, not `margin: 0px;`).
  Keep units on non-zero time/angle/percentage values.
- Use `var(--token)` for VS Code theme tokens
  (`var(--vscode-editor-background)`); do not hard-code colors that
  should follow the active theme.
- Vendor-prefixed properties grouped with their canonical form,
  prefixed first, unprefixed last.

### Selectors

- Prefer class selectors over element or ID selectors for component
  styling. IDs are reserved for one-off DOM landmarks.
- Avoid deep descendant selectors (more than 3 levels) — keep
  specificity low.
- Use BEM-ish naming when invented (`.thread-marker__count`); do
  not redefine codicon class names emitted by `@vscode/codicons`.

### Comments

- `/* CSS comments */` only. Comment **why**, not what.
- Group related rules under a short section comment in long files.

## HTML

*Applies to: `**/*.html`, `**/*.htm`.*

Webview HTML in this extension is **built from TypeScript template
strings** in [`src/session-manager.ts`](../src/session-manager.ts)
and the webview entry points under
[`src/views/`](../src/views/), not from standalone `.html` files.
When editing those template strings, treat the embedded HTML as if
it were a standalone file and follow these same rules.

### Formatting

- 2-space indent, spaces only.
- LF line endings; trailing newline at end of file; no trailing
  whitespace.
- Lowercase tag names and lowercase attribute names. Lowercase
  attribute values for keywords (`type="text"`, not `type="TEXT"`).
- Double quotes around all attribute values, even single-word ones.
- One block-level element per line. Inline elements may flow with
  surrounding text.
- Children of a block element indented one level past the parent's
  opening tag.

### HTML5 conventions

- `<!DOCTYPE html>` (all caps) at the top of any standalone
  document.
- `<html lang="en">` for any standalone document.
- Void elements (`<br>`, `<hr>`, `<img>`, `<input>`, `<link>`,
  `<meta>`) are written **without** a self-closing slash. Prefer
  `<br>` over `<br/>`.
- `<meta charset="utf-8">` is the first child of `<head>`.
- `<meta http-equiv="Content-Security-Policy" content="...">`
  follows the charset meta in every webview HTML — see
  [`src/views/csp.ts`](../src/views/csp.ts) for the builder. Never
  hand-craft a CSP — always go through `buildRenderedViewCsp` /
  `buildCommentInputCsp`.
- Reference webview resources via `webview.asWebviewUri(...)`
  results, never with raw file paths or `file://` URIs.

### Accessibility

- Provide an `alt` attribute on every `<img>`. Use `alt=""` for
  purely decorative images.
- Use semantic elements (`<button>`, `<nav>`, `<header>`, `<main>`,
  `<aside>`) over generic `<div>` when the role applies.
- Form controls must have an associated `<label>` (either wrapping
  the control or referencing it via `for`/`id`).
- Interactive non-button elements need `role="button"` and
  keyboard handling — prefer real `<button>` instead.

### Webview specifics

- All inline `<script>` and `<style>` tags must carry the per-load
  `nonce` attribute that the CSP allows. Generate the nonce with
  `generateNonce()` from
  [`src/views/csp.ts`](../src/views/csp.ts).
- No inline event handlers (`onclick="..."`). Wire events from the
  webview's compiled IIFE entry point (`src/views/*/main.ts`).
- Codicon glyphs render through
  `<span class="codicon codicon-NAME">` with the bundled
  `codicon.css` (copied to `out/codicons/` by
  [`esbuild.js`](../esbuild.js)).
