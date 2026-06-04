# Changelog

All notable changes to the **Markdown PR Review** VS Code extension are
documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.18] - 2026-06-04

### Fixed
- Comment-input sidebar webview is now themed correctly. The textarea,
  Post button, and Cancel button were rendering with user-agent defaults
  (white background, black text) instead of inheriting the active VS
  Code theme. Root cause: the webview's CSP (`style-src ${webview
  .cspSource}`) intentionally omits `'unsafe-inline'` (only the
  rendered-view CSP relaxes it, for mermaid's runtime style injection),
  but all theming was declared in an inline `<style>` block. The browser
  silently blocked the entire block, so `var(--vscode-input-background)`,
  `var(--vscode-button-background)`, etc. never reached the elements.
  Styles have been extracted to `src/views/comment-input/styles.css` and
  are loaded via a `<link>` from `out/views/comment-input/styles.css`,
  which the strict CSP allows. The textarea now uses the UI font family
  (`var(--vscode-font-family)`) to match VS Code's native input controls
  (Search box, Find/Replace) rather than the editor monospace font.

### Build
- `esbuild.js` now copies `src/views/comment-input/styles.css` to
  `out/views/comment-input/styles.css` alongside the codicon copy step.
  esbuild's bundler only follows imports from the TS entry point, so the
  stylesheet is shipped via an explicit copy rather than an import.

## [0.4.17] - 2026-06-04

### Fixed
- Rendered-view prose now matches VS Code's built-in markdown preview
  (`Ctrl+Shift+V`). The webview loads the same `markdown.css` that
  ships with the bundled `vscode.markdown-language-features` extension,
  resolved at runtime via `vscode.extensions.getExtension(...)
  .extensionUri` (the on-disk path lives under a per-commit hash dir so
  it can't be hardcoded). Previously, more-specific `article#content`
  overrides for `pre`, `code`, `table`, `th`, `td`, and `blockquote`
  masked the native look — headings had no bottom border, blockquotes
  lacked the left bar, and tables had no native borders. Those overrides
  have been removed and the built-in cascade now drives prose styling
  while extension-specific rules (banners, thread markers, popovers,
  diff gutters, `html/body { padding: 0 }` layout reset) continue to win
  by source order. User `markdown.styles` entries still load last, so
  user customizations still take precedence over both built-in and
  extension defaults.

### Changed
- `RestylePayload` (host → rendered-view) now carries `builtinStyleUris`
  in addition to `userStyleUris`. The webview swaps the built-in
  `<link>` element(s) on live restyle just like it does for user
  stylesheets, inserting them before the inline `<style>` so the
  cascade order is preserved.

## [0.4.16] - 2026-06-03

### Fixed
- Mermaid diagrams now render again. The carrier that holds the diagram
  source has been switched from `<script type="text/x-mermaid">` to a
  `data-mermaid-source` attribute on the wrapper `<div class="mermaid">`.
  The `<script>` carrier was silently stripped by DOMPurify (introduced
  as defense-in-depth in 0.4.15 by the CodeQL hardening pass) because
  `<script>` is not in DOMPurify's safe-tag list, leaving the diagram
  source visible as plain text instead of rendering as a diagram. Data
  attributes are inert and pass the sanitizer unchanged.
- Mermaid SVG output is no longer over-sanitized. `foreignObject` (used
  by mermaid flowcharts to host HTML labels, including multi-line labels
  with `<br/>`) is now allowed in the SVG sanitizer profile; `<script>`
  and inline event handler attributes (`onload`, `onclick`, `onerror`,
  `onmouseover`, `onfocus`, `onblur`) remain forbidden so a malicious
  diagram source cannot inject executable content via a label.
- Body text color is now applied at the `body` selector rather than
  `article#content`, matching VS Code's built-in markdown preview. With
  the previous, more-specific selector, a user's `markdown.styles` entry
  that targeted `body { color: ... }` could not cascade into the article
  — so the article fell back to `var(--vscode-editor-foreground)`, which
  on themes that intentionally mute editor text appeared faded against
  the prose. The new rule also switches the default to
  `var(--vscode-foreground)` (general UI foreground), which is the
  variable the built-in markdown preview itself uses for body text.

### Security
- Hardened webview `innerHTML` assignments against the entire CodeQL
  `js/xss`, `js/xss-through-dom`, and `js/client-side-unvalidated-url-redirection`
  alert surface. The host markdown-it pipeline is already configured
  with `html: false` and the webview runs under a strict CSP, but as
  defense-in-depth:
  - HTML and mermaid-SVG payloads are now passed through DOMPurify
    before being assigned to `innerHTML`.
  - The comment-input draft is now built via `createElement` +
    `textContent` instead of a template literal + `innerHTML`.
  - Stylesheet URIs delivered via host → webview restyle messages are
    validated to be `https:` (which is the only scheme produced by
    `webview.asWebviewUri()`).
- Rewrote `JWT_LIKE_REGEX` (used by log-payload redaction) to combine a
  bounded quantifier with the lookahead-backreference atomic-group
  idiom, eliminating CodeQL `js/polynomial-redos`. Worst-case scan time
  on "eyJ"-saturated input went from ~90 s (160K repetitions, polynomial)
  to a few hundred ms (linear). Added TC-145 regression test with a
  1.5 s budget.

## [0.4.15] - 2026-06-03

### Added
- Rendered view honors the user's `markdown.styles` setting, mirroring
  VS Code's built-in markdown preview. Supports `https://`, `file://`,
  absolute, and workspace-relative stylesheets.
- Config changes apply live: editing `markdown.styles` updates open
  panels without an iframe reload — scroll position and any open
  comment popovers are preserved.
- Rendered view picks up `markdown.preview.fontFamily`,
  `markdown.preview.fontSize`, and `markdown.preview.lineHeight`.

### Changed
- Widened CSP `style-src` and `font-src` to allow `https:` so
  user-configured stylesheets and web fonts load correctly.

## [0.4.14] - 2026-06-03

### Changed
- Rendered view prose font now matches VS Code's built-in markdown
  preview stack (`-apple-system, BlinkMacSystemFont, "Segoe WPC",
  "Segoe UI", …`).
- Output channel log lines are written with the `log` languageId so
  they pick up VS Code's colored log grammar.

## [0.4.12] - 2026-06-03

### Added
- Comment thread markers in the rendered view use the
  `comment-discussion` codicon with a right-aligned thread-id badge.
- Changed Files tree shows a `comment-discussion` icon and a trailing
  count badge for files with active threads.

### Changed
- Comment input webview themed to match VS Code (textarea + buttons);
  dropped the redundant mapping-mode badge.
- "Open Pull Request…" command surfaces a `shortTitle` of "Open PR" so
  the view-title button stays compact.

## [0.4.11] - 2026-06-03

### Changed
- **Renamed** the extension from "Azure DevOps Markdown PR Review" to
  **"Markdown PR Review"**.
- Dropped the `ado` prefix from all command and view IDs (e.g.
  `markdownPrReview.openPullRequest`).
- Added custom activity-bar and marketplace icons; marketplace tile
  bumped to 512×512 with full-bleed background.

## [0.4.10] - 2026-06-03

### Fixed
- Register the webview message handler **before** assigning
  `webview.html` so early `ready` posts from the webview are not lost.

## [0.4.9] - 2026-06-03

### Fixed
- Gate the host's initial `init` message on a `ready` signal from the
  webview, eliminating a race where the first render could be empty.

## [0.4.5] - 2026-06-03

### Fixed
- ADO `items` requests no longer send `Accept: application/octet-stream`,
  which was causing failures on very large repositories.

## [0.4.4] - 2026-06-02

### Fixed
- ADO fetch timeout now covers reading the response body in addition to
  the initial connect (previously only the connect was bounded).

## [0.4.3] - 2026-06-02

### Changed
- Fetch head and base in parallel; render the diff progressively as
  chunks arrive.
- Default ADO fetch timeout raised to 90 s with per-phase timing logged
  to the output channel.

## [0.4.2] - 2026-06-02

### Fixed
- Build `resourceUri` safely for ADO file paths containing spaces or
  special characters in the Changed Files tree.

## [0.4.1] - 2026-06-02

### Fixed
- Prompt for interactive sign-in when no cached Entra ID session exists,
  instead of silently failing.

## [0.4.0] - 2026-06-02

### Added
- Status bar item showing active PR title + sign-in state.
- Stale-commit watcher polls every 30 s (configurable, 15–60 s range)
  and offers a refresh banner when a newer head commit is pushed.
- Auto-retry on `401` with a freshly acquired token.
- Categorized error codes surfaced in user-facing messages.
- Initial README with installation, quick-start, configuration, and
  architecture overview.

## [0.3.0] - 2026-06-02

### Added
- Real diff annotator with per-line gutter bars (added / removed /
  modified) computed from head/base content.

## [0.2.0] - 2026-06-02

### Added
- Display of existing comment threads with line anchoring in the
  rendered view.
- Changed Files tree grouped by directory.
- Unit test suite (Mocha + Chai + `tsx`) covering the renderer,
  selection mapper, and ADO client.

## [0.1.0] - 2026-06-02

### Added
- Initial custom-editor implementation: open an Azure DevOps pull
  request, browse changed `.md` / `.markdown` / `.mdx` files, view a
  rendered preview, and post comments anchored to selected line ranges.
- Microsoft Entra ID authentication via
  `vscode.authentication.getSession('microsoft', …)` with PAT fallback.
- Mermaid diagram support bundled into the rendered view.

[Unreleased]: https://github.com/abeltrano/markdown-pr-review/compare/v0.4.15...HEAD
[0.4.15]: https://github.com/abeltrano/markdown-pr-review/releases/tag/v0.4.15
