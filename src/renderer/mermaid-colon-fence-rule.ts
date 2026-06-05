// SPDX-License-Identifier: MIT
// markdown-it block rule for Azure DevOps' alternative Mermaid block
// syntax: `:::mermaid ... :::`.
//
// ADO's wiki + PR renderers support two ways of embedding a Mermaid
// diagram in markdown:
//   1. Standard CommonMark fenced-code: ```mermaid\n...\n```
//   2. Container-style colon fence:     :::mermaid\n...\n:::
//
// markdown-it covers form (1) natively (its `fence` rule), so
// `mermaid-fence-rule.ts` only needed to wrap the rendering side. ADO
// authors who use the colon-fence form (the form documented at
// https://learn.microsoft.com/en-us/azure/devops/project/wiki/wiki-markdown-guidance)
// hit a renderer regression: the block was parsed as an ordinary
// paragraph and the diagram never reached mermaid.render(). This rule
// closes that gap by registering a block-parser entry that recognises
// the colon fence and emits a synthetic `fence` token with
// `info='mermaid'`, so the existing mermaid fence renderer + source-line
// annotation + mermaid-block counter all participate without further
// changes.
//
// Implementation notes:
//   * Opener must be exactly `:::mermaid` (case-insensitive) optionally
//     followed by trailing whitespace. `:::mermaidish` or
//     `:::mermaid graph` do not match.
//   * Closer is exactly `:::` on its own line with optional trailing
//     whitespace. EOF is also accepted as an implicit close (matches
//     markdown-it's tolerant fence parsing).
//   * Both opener and closer reject 4+ space indentation so they do
//     not collide with indented-code-block parsing nor get spuriously
//     consumed by an indented literal `:::` line inside a diagram.
//   * Content is extracted via `state.getLines(..., state.sCount[startLine], true)`
//     so that the fence's own leading indentation is stripped while the
//     diagram body's internal indentation (e.g. 4-space subgraph
//     children) is preserved verbatim. This mirrors markdown-it's
//     built-in fence behaviour.
//   * `silent` mode returns immediately after the opener positively
//     matches, before any state mutation; markdown-it relies on this
//     side-effect-free signaling when other block rules probe for
//     interruption.

import type MarkdownIt from 'markdown-it';

const OPEN_MARKER = ':::mermaid';
const CLOSE_MARKER_RE = /^:::\s*$/;

export function applyMermaidColonFenceRule(md: MarkdownIt): void {
 md.block.ruler.before(
  'fence',
  'mermaid_colon_fence',
  (state, startLine, endLine, silent) => {
   if (state.sCount[startLine]! - state.blkIndent >= 4) {
    return false;
   }

   const startPos = state.bMarks[startLine]! + state.tShift[startLine]!;
   const maxPos = state.eMarks[startLine]!;
   const firstLine = state.src.slice(startPos, maxPos);

   if (firstLine.length < OPEN_MARKER.length) {
    return false;
   }
   if (firstLine.slice(0, OPEN_MARKER.length).toLowerCase() !== OPEN_MARKER) {
    return false;
   }
   const tail = firstLine.slice(OPEN_MARKER.length);
   if (tail.length > 0 && /\S/.test(tail)) {
    return false;
   }

   if (silent) {
    return true;
   }

   let nextLine = startLine;
   let foundClose = false;
   while (++nextLine < endLine) {
    if (state.sCount[nextLine]! - state.blkIndent >= 4) {
     continue;
    }
    const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    const lineEnd = state.eMarks[nextLine]!;
    const candidate = state.src.slice(lineStart, lineEnd);
    if (CLOSE_MARKER_RE.test(candidate)) {
     foundClose = true;
     break;
    }
   }

   const firstContentLine = startLine + 1;
   const lastContentLineExclusive = nextLine;
   const content = firstContentLine < lastContentLineExclusive
    ? state.getLines(
     firstContentLine,
     lastContentLineExclusive,
     state.sCount[startLine]!,
     true
    )
    : '';

   const token = state.push('fence', 'code', 0);
   token.info = 'mermaid';
   token.content = content;
   token.markup = ':::';
   token.map = [startLine, foundClose ? nextLine + 1 : nextLine];

   state.line = foundClose ? nextLine + 1 : nextLine;
   return true;
  },
  { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
 );
}
