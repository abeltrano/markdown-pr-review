// SPDX-License-Identifier: MIT
// Renderer Pipeline entry per design.md §3.2.
//
// Inputs: raw markdown + optional diff annotations.
// Output: { html, sourceMap, mermaidBlockCount }.
//
// The renderer always runs in the extension host; the resulting HTML
// string is shipped to the webview via postMessage `init`.

import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownIt } from './markdown-it-config';
import type { DiffAnnotation, RenderResult } from '../types';

export interface RenderOptions {
  markdown: string;
  diffAnnotations?: DiffAnnotation[];
}

export function render(opts: RenderOptions): RenderResult {
  const md = createMarkdownIt();
  const tokens = md.parse(opts.markdown, {});

  if (opts.diffAnnotations && opts.diffAnnotations.length > 0) {
    injectDiffAttributes(tokens, opts.diffAnnotations);
  }

  const html = md.renderer.render(tokens, md.options, {});
  const mermaidBlockCount = countMermaidBlocks(tokens);
  const sourceMap = collectSourceMap(tokens);
  return { html, sourceMap, mermaidBlockCount };
}

function injectDiffAttributes(
  tokens: Token[],
  annotations: DiffAnnotation[],
): void {
  if (annotations.length === 0) {
    return;
  }
  for (const token of tokens) {
    if (token.map) {
      const start = token.map[0] + 1;
      const end = Math.max(start, token.map[1]);
      const match = annotations.find((a) =>
        rangesOverlap(a.headLineStart, a.headLineEnd, start, end),
      );
      if (match) {
        setAttr(token, 'data-diff-state', match.state);
        if (match.deletedContent !== undefined) {
          setAttr(token, 'data-diff-deleted', match.deletedContent);
        }
      }
    }
    if (token.children) {
      injectDiffAttributes(token.children, annotations);
    }
  }
}

function setAttr(token: Token, name: string, value: string): void {
  const existing = token.attrIndex(name);
  if (existing < 0) {
    token.attrPush([name, value]);
  } else {
    token.attrs![existing]![1] = value;
  }
}

function rangesOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
): boolean {
  return a1 <= b2 && b1 <= a2;
}

function countMermaidBlocks(tokens: Token[]): number {
  let n = 0;
  for (const t of tokens) {
    if (
      t.type === 'fence' &&
      (t.info ?? '').trim().toLowerCase() === 'mermaid'
    ) {
      n++;
    }
  }
  return n;
}

function collectSourceMap(tokens: Token[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const t of tokens) {
    if (t.map) {
      const start = t.map[0] + 1;
      const end = Math.max(start, t.map[1]);
      out[`${t.type}-${start}-${end}`] = [start, end];
    }
  }
  return out;
}
