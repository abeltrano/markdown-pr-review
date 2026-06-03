# Changelog

All notable changes to the **Markdown PR Review** VS Code extension are
documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
