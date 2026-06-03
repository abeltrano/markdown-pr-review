// SPDX-License-Identifier: MIT
// markdown-it configuration. We instantiate a single MarkdownIt per render
// so plugin state doesn't leak between renders.
//
// Per design.md §3.2 Renderer Pipeline:
//   html: false       - block raw HTML execution (REQ-NFR-SEC-001 AC-2)
//   linkify: true     - auto-detect URLs
//   breaks: false     - hard line breaks per CommonMark
//
// Block source maps come from markdown-it core out of the box (token.map).
// We never call markdown-it from the webview; rendering is always done in
// the extension host so the webview's CSP stays strict.

import MarkdownIt from 'markdown-it';
import { applySourceLineAttributes } from './source-line-attributes';
import { applyMermaidFenceRule } from './mermaid-fence-rule';

export function createMarkdownIt(): MarkdownIt {
    const md = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: false
    });
    applyMermaidFenceRule(md);
    applySourceLineAttributes(md);
    return md;
}
