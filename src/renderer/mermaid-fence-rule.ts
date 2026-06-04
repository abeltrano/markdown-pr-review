// SPDX-License-Identifier: MIT
// Mermaid fence rule. Replaces markdown-it's default fence renderer for
// info==='mermaid' with a CSP-safe wrapper. The diagram source is stored
// in a `data-mermaid-source` attribute on the wrapper div; the webview's
// mermaid-loader.ts reads it back at runtime via `dataset.mermaidSource`
// (the HTML parser auto-decodes attribute entities) and feeds it to
// mermaid.render().
//
// The attribute carrier replaces an earlier `<script type="text/x-mermaid">`
// data-island, which DOMPurify (used as defense-in-depth on innerHTML in
// the webview) silently strips because <script> is not in its safe-tag
// list. Data attributes are inert and pass the sanitizer unchanged.

import type MarkdownIt from 'markdown-it';

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
  const startAttr = String(token.attrGet('data-source-line-start') ?? '');
  const endAttr = String(token.attrGet('data-source-line-end') ?? '');
  const lineAttrs = startAttr && endAttr
   ? ` data-source-line-start="${startAttr}" data-source-line-end="${endAttr}"`
   : '';
  const escaped = escapeForAttribute(token.content);
  return `<div class="mermaid"${lineAttrs} data-mermaid-source="${escaped}" data-mermaid-state="pending"></div>\n`;
 };
}

function escapeForAttribute(src: string): string {
 return src
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
}
