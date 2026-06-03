---
applyTo: '**/*.html,**/*.htm'
---

# HTML

Full rules live in [`docs/coding-style.md#html`](../../docs/coding-style.md#html).
This file is a thin pointer scoped to HTML files via the `applyTo`
glob above.

Webview HTML in this extension is **built from TypeScript template
strings** in `src/session-manager.ts` and the webview entry points
under `src/views/`, not from standalone `.html` files. Treat the
embedded HTML as if it were a standalone file and follow these
same rules.

## At a glance

- 2-space indent, LF, trailing newline, no trailing whitespace.
- Lowercase tag and attribute names. Double quotes around all
  attribute values.
- Void elements (`<br>`, `<hr>`, `<img>`, `<input>`, `<link>`,
  `<meta>`) written **without** a self-closing slash.
- `<!DOCTYPE html>` and `<html lang="en">` for standalone docs;
  `<meta charset="utf-8">` first in `<head>`.
- **Never hand-craft a CSP** — always go through
  `buildRenderedViewCsp` / `buildCommentInputCsp` from
  `src/views/csp.ts`.
- Reference webview resources via `webview.asWebviewUri(...)`,
  never raw file paths or `file://`.
- All inline `<script>` / `<style>` carry the per-load nonce; no
  inline event handlers.
- Accessibility: alt text on `<img>`, semantic elements over
  `<div>`, `<label>` on form controls, real `<button>` over
  role-button divs.
