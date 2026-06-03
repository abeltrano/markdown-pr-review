// SPDX-License-Identifier: MIT
// Renderer rules that inject data-source-line-start / data-source-line-end
// attributes on every block-level token's opening element.
//
// Per design.md §3.2 Renderer rules:
//   - For paragraph_open, heading_open, list_item_open, blockquote_open,
//     table_open, fence (non-mermaid), html_block: add the attrs.
//   - Source line numbers are converted from markdown-it's 0-indexed
//     end-exclusive `token.map = [start, end]` to ADO's 1-indexed
//     inclusive form: data-source-line-start = start + 1,
//     data-source-line-end = end (inclusive).

import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const BLOCK_TOKEN_OPENERS = new Set([
    'paragraph_open',
    'heading_open',
    'blockquote_open',
    'list_item_open',
    'bullet_list_open',
    'ordered_list_open',
    'table_open',
    'thead_open',
    'tbody_open',
    'tr_open'
]);

const SELF_CONTAINED_BLOCKS = new Set([
    'fence',
    'code_block',
    'hr',
    'html_block'
]);

export function applySourceLineAttributes(md: MarkdownIt): void {
    for (const tokenType of BLOCK_TOKEN_OPENERS) {
        const prior = md.renderer.rules[tokenType];
        md.renderer.rules[tokenType] = (tokens, idx, options, env, self) => {
            annotateToken(tokens[idx]);
            if (prior) {
                return prior(tokens, idx, options, env, self);
            }
            return self.renderToken(tokens, idx, options);
        };
    }
    for (const tokenType of SELF_CONTAINED_BLOCKS) {
        const prior = md.renderer.rules[tokenType];
        md.renderer.rules[tokenType] = (tokens, idx, options, env, self) => {
            annotateToken(tokens[idx]);
            if (prior) {
                return prior(tokens, idx, options, env, self);
            }
            return self.renderToken(tokens, idx, options);
        };
    }
}

function annotateToken(token: Token | undefined): void {
    if (!token || !token.map) {
        // RISK-001: some tokens emit null maps. SelectionMapper's walk-up
        // logic handles missing data-source-line on inner elements.
        return;
    }
    const [start, end] = token.map;
    // markdown-it: [start, end) 0-indexed. ADO: 1-indexed inclusive.
    const startAttr = start + 1;
    const endAttr = Math.max(startAttr, end);
    setAttr(token, 'data-source-line-start', String(startAttr));
    setAttr(token, 'data-source-line-end', String(endAttr));
}

function setAttr(token: Token, name: string, value: string): void {
    const existing = token.attrIndex(name);
    if (existing < 0) {
        token.attrPush([name, value]);
    } else {
        token.attrs![existing]![1] = value;
    }
}
