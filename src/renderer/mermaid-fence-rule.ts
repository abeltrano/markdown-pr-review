// SPDX-License-Identifier: MIT
// Mermaid fence rule. Replaces markdown-it's default fence renderer for
// info==='mermaid' with a CSP-safe wrapper. The diagram source is stored
// in a `data-mermaid-source` attribute on the wrapper div; the webview's
// mermaid-loader.ts reads it back at runtime via `dataset.mermaidSource`
// and feeds it to mermaid.render() after URI-decoding.
//
// The attribute carrier replaces an earlier `<script type="text/x-mermaid">`
// data-island, which DOMPurify (used as defense-in-depth on innerHTML in
// the webview) silently strips because <script> is not in its safe-tag
// list.
//
// Why URI-encoding instead of HTML-entity escaping?
//   DOMPurify also strips data-* attributes whose decoded value contains
//   raw newlines or `<` / `>` characters — even though such values are
//   legal in attribute syntax — because it treats them as XSS surface.
//   Multi-line mermaid sources hit BOTH triggers (newlines between rows
//   and `<-->` arrows), so HTML-entity-escaping the source produced an
//   attribute that DOMPurify silently dropped, leaving an empty
//   <div class="mermaid"> and a silently-missing diagram. URI-encoding
//   yields a value of purely URI-safe ASCII (alphanumerics, `-_.!~*'()`
//   and `%nn` escapes), which DOMPurify treats as inert.

import type MarkdownIt from 'markdown-it';

// Pass-through attributes the renderer must preserve on the emitted
// `<div class="mermaid">` so downstream CSS selectors keep matching.
//   - data-source-line-start / data-source-line-end: required for the
//     selection-mapper to map clicks in the rendered diagram back to
//     raw line ranges in the source markdown.
//   - data-diff-state / data-diff-deleted: written by the diff
//     annotator (see src/renderer/index.ts injectDiffAttributes) and
//     consumed by the rendered-view CSS (border-left treatment in
//     session-manager.ts) so diagrams in changed regions of a PR
//     receive the same added/modified/context-of-deletion gutter
//     styling as ordinary block elements. Prior to this change the
//     mermaid wrapper dropped these attributes silently, so design
//     docs that introduce or modify a mermaid diagram in a PR did not
//     visually surface as changed.
const PASSTHROUGH_ATTR_NAMES = [
 'data-source-line-start',
 'data-source-line-end',
 'data-diff-state',
 'data-diff-deleted'
] as const;

export function applyMermaidFenceRule(md: MarkdownIt): void {
 const previous = md.renderer.rules.fence;
 md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const info = (token.info ?? '').trim().toLowerCase();
  if (info !== 'mermaid') {
   return previous
    ? previous(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
  }
  let passthroughAttrs = '';
  for (const name of PASSTHROUGH_ATTR_NAMES) {
   const value = token.attrGet(name);
   if (value !== null && value !== '') {
    passthroughAttrs += ` ${name}="${escapeForAttribute(value)}"`;
   }
  }
  const encoded = encodeURIComponent(token.content);
  return `<div class="mermaid"${passthroughAttrs} data-mermaid-source="${encoded}" data-mermaid-state="pending"></div>\n`;
 };
}

function escapeForAttribute(src: string): string {
 return src
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
}
