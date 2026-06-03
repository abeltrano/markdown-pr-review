---
applyTo: '**/*.html,**/*.htm'
---

# HTML

Webview HTML in this extension is **built from TypeScript template
strings** in `src/session-manager.ts` and the webview entry points
under `src/views/`, not from standalone `.html` files. When editing
those template strings, treat the embedded HTML as if it were a
standalone file and follow these same rules.

## Formatting

- 4-space indent (matches `.editorconfig` global), spaces only.
- LF line endings; trailing newline at end of file; no trailing
  whitespace.
- Lowercase tag names and lowercase attribute names. Lowercase
  attribute values for keywords (`type="text"`, not `type="TEXT"`).
- Double quotes around all attribute values, even single-word ones.
- One block-level element per line. Inline elements may flow with
  surrounding text.
- Children of a block element indented one level past the parent's
  opening tag.

## HTML5 conventions

- `<!DOCTYPE html>` (all caps) at the top of any standalone document.
- `<html lang="en">` for any standalone document.
- Void elements (`<br>`, `<hr>`, `<img>`, `<input>`, `<link>`,
  `<meta>`) are written **without** a self-closing slash. Prefer
  `<br>` over `<br/>`.
- `<meta charset="utf-8">` is the first child of `<head>`.
- `<meta http-equiv="Content-Security-Policy" content="...">` follows
  the charset meta in every webview HTML — see `src/views/csp.ts`
  for the builder. Never hand-craft a CSP — always go through
  `buildRenderedViewCsp` / `buildCommentInputCsp`.
- Reference webview resources via `webview.asWebviewUri(...)` results,
  never with raw file paths or `file://` URIs.

## Accessibility

- Provide an `alt` attribute on every `<img>`. Use `alt=""` for
  purely decorative images.
- Use semantic elements (`<button>`, `<nav>`, `<header>`, `<main>`,
  `<aside>`) over generic `<div>` when the role applies.
- Form controls must have an associated `<label>` (either wrapping
  the control or referencing it via `for`/`id`).
- Interactive non-button elements need `role="button"` and
  keyboard handling — prefer real `<button>` instead.

## Webview specifics

- All inline `<script>` and `<style>` tags must carry the per-load
  `nonce` attribute that the CSP allows. Generate the nonce with
  `generateNonce()` from `src/views/csp.ts`.
- No inline event handlers (`onclick="..."`). Wire events from the
  webview's compiled IIFE entry point (`src/views/*/main.ts`).
- Codicon glyphs render through `<span class="codicon codicon-NAME">`
  with the bundled `codicon.css` (copied to `out/codicons/` by
  `esbuild.js`).
