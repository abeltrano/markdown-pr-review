// SPDX-License-Identifier: MIT
// Unit tests for mapSelection — exercises ALL six MappingMode enum values
// (TC-050 .. TC-058 from validation-plan.md). Per design.md §3.2 each
// MappingMode value MUST have at least one unit test.

import { expect } from 'chai';
import { mapSelection } from '../../../src/selection-mapper';
import type { MappingMode, SelectionMadePayload } from '../../../src/types';

// Build the lightest possible SelectionMadePayload with sensible defaults.
function selection(over: Partial<SelectionMadePayload>): SelectionMadePayload {
 return {
  filePath: '/docs/test.md',
  blockLineRange: { start: 1, end: 1 },
  selectedText: '',
  textBeforeSelection: '',
  spansMultipleBlocks: false,
  containerKind: 'paragraph',
  ...over,
 };
}

describe('mapSelection — MappingMode enum coverage', () => {
 describe('TC-050 — precise within a paragraph', () => {
  it('returns mode:"precise" for a single-line selection', () => {
   const raw = 'The quick brown fox jumps over the lazy dog.\n';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 1 },
     selectedText: 'brown fox',
     textBeforeSelection: 'The quick ',
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('precise' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(1);
   // 'brown fox' begins at column 11 (1-indexed) in the raw line.
   expect(result.rightFileStart.offset).to.equal(11);
   // 'brown fox' is 9 chars long; end is exclusive of the next char.
   expect(result.rightFileEnd.offset).to.equal(11 + 9);
  });
 });

 describe('TC-051 — precise spanning two paragraphs (rendered as multi-line single-block selection)', () => {
  it('returns mode:"precise" when selection spans within a single normalized block', () => {
   const raw = [
    'first paragraph line one,',
    'first paragraph line two.',
    '',
    'second paragraph here.',
   ].join('\n');
   // Selection inside a paragraph that wraps two raw lines (markdown
   // joins them into one block).
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 2 },
     selectedText: 'line one,\nfirst paragraph line two.',
     textBeforeSelection: 'first paragraph ',
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('precise' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(2);
  });
 });

 describe('TC-052 — coarse-mermaid', () => {
  it('returns mode:"coarse-mermaid" for a selection inside a mermaid diagram', () => {
   const raw = [
    '# Title',
    '',
    '```mermaid',
    'sequenceDiagram',
    'A->>B: hi',
    '```',
   ].join('\n');
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 3, end: 6 },
     selectedText: 'A->>B',
     containerKind: 'mermaid',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-mermaid' as MappingMode);
   expect(result.rightFileStart.line).to.equal(3);
   expect(result.rightFileEnd.line).to.equal(6);
   // Coarse anchors always start at offset 1.
   expect(result.rightFileStart.offset).to.equal(1);
  });
 });

 describe('TC-053 — coarse-html-block', () => {
  it('returns mode:"coarse-html-block" for a selection inside raw HTML', () => {
   const raw = [
    '<details>',
    '<summary>click me</summary>',
    '<p>hidden body</p>',
    '</details>',
   ].join('\n');
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 4 },
     selectedText: 'hidden body',
     containerKind: 'html-block',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-html-block' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(4);
  });
 });

 describe('TC-054 — coarse-multi-block', () => {
  it('returns mode:"coarse-multi-block" when spansMultipleBlocks is true', () => {
   const raw = [
    'paragraph one.', // 1
    '',                // 2
    'paragraph two.',  // 3
    '',                // 4
    'paragraph three.',// 5
   ].join('\n');
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 1 },
     selectedText: 'one.\n\nparagraph two.\n\nparagraph three',
     spansMultipleBlocks: true,
     spannedBlockRanges: [
      { start: 1, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 5 },
     ],
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-multi-block' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(5);
  });

  it('uses the block range when spannedBlockRanges is absent', () => {
   const raw = 'a\n\nb\n\nc';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 5 },
     selectedText: 'a\n\nb\n\nc',
     spansMultipleBlocks: true,
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-multi-block' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(5);
  });
 });

 describe('TC-055 — coarse-ambiguous-text', () => {
  it('returns mode:"coarse-ambiguous-text" when text occurs multiple times near the approx position', () => {
   // 'value' appears 3 times in a single paragraph. Selecting the
   // middle 'value' with a textBeforeSelection close to two of them
   // forces the disambiguator to bail.
   const raw = 'set value to value or another value.';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 1 },
     selectedText: 'value',
     // approxStart = 9 — within 20 of both 4 ("set ") and 13.
     textBeforeSelection: 'set value',
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-ambiguous-text' as MappingMode);
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(1);
  });
 });

 describe('TC-057 — coarse-text-not-found', () => {
  it('returns mode:"coarse-text-not-found" when selected text is absent from the source', () => {
   const raw = 'just plain prose here.';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 1 },
     selectedText: '¶', // rendered-only anchor that never appears in source
     textBeforeSelection: '',
     containerKind: 'heading',
    }),
    rawFileContent: raw,
   });
   expect(result.mode).to.equal('coarse-text-not-found' as MappingMode);
  });

  it('returns mode:"coarse-text-not-found" for an empty selectedText after normalization', () => {
   const raw = 'abc';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 1, end: 1 },
     selectedText: '   ',
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   // Whitespace-only normalizes to '', which mapper treats as
   // not-found via the empty-normalized-selection branch.
   expect(result.mode).to.equal('coarse-text-not-found' as MappingMode);
  });
 });

 describe('TC-058 — invariants', () => {
  it('always returns a well-formed range with startLine ≤ endLine', () => {
   const raw = [
    '# heading',
    '',
    'paragraph one with *emphasis* and `code`.',
    '',
    '- list item alpha',
    '- list item beta',
    '',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
    '<details><summary>x</summary>body</details>',
   ].join('\n');
   const cases: SelectionMadePayload[] = [
    selection({ blockLineRange: { start: 1, end: 1 }, selectedText: 'heading', containerKind: 'heading' }),
    selection({ blockLineRange: { start: 3, end: 3 }, selectedText: 'emphasis', textBeforeSelection: 'paragraph one with ', containerKind: 'paragraph' }),
    selection({ blockLineRange: { start: 5, end: 6 }, selectedText: 'alpha', textBeforeSelection: 'list item ', containerKind: 'list-item' }),
    selection({ blockLineRange: { start: 8, end: 10 }, selectedText: 'A-->B', containerKind: 'mermaid' }),
    selection({ blockLineRange: { start: 12, end: 12 }, selectedText: 'body', containerKind: 'html-block' }),
   ];
   const validModes: MappingMode[] = [
    'precise',
    'coarse-mermaid',
    'coarse-html-block',
    'coarse-multi-block',
    'coarse-ambiguous-text',
    'coarse-text-not-found',
   ];
   for (const sel of cases) {
    const result = mapSelection({ selection: sel, rawFileContent: raw });
    expect(validModes).to.include(result.mode);
    expect(result.rightFileStart.line).to.be.lessThanOrEqual(
     result.rightFileEnd.line
    );
    if (result.rightFileStart.line === result.rightFileEnd.line) {
     expect(result.rightFileStart.offset).to.be.lessThanOrEqual(
      result.rightFileEnd.offset
     );
    }
    expect(result.rightFileStart.line).to.be.greaterThan(0);
    expect(result.rightFileStart.offset).to.be.greaterThan(0);
   }
  });

  it('clamps a blockLineRange that exceeds the file length', () => {
   const raw = 'one line only.';
   const result = mapSelection({
    selection: selection({
     blockLineRange: { start: 5, end: 999 },
     selectedText: 'one',
     containerKind: 'paragraph',
    }),
    rawFileContent: raw,
   });
   expect(result.rightFileStart.line).to.equal(1);
   expect(result.rightFileEnd.line).to.equal(1);
  });
 });
});
