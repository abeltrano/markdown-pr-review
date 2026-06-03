// SPDX-License-Identifier: MIT
// Mermaid fence rule. Replaces markdown-it's default fence renderer for
// info==='mermaid' with a CSP-safe wrapper. The diagram source is stored
// inside <script type="text/x-mermaid">{escaped}</script> so it never gets
// executed by the browser; the webview's mermaid-loader.ts reads it back at
// runtime and feeds it to mermaid.render().

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
  const escaped = escapeForMermaidScript(token.content);
  return `<div class="mermaid"${lineAttrs}><script type="text/x-mermaid">${escaped}</script></div>\n`;
 };
}

function escapeForMermaidScript(src: string): string {
 return src
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
}
