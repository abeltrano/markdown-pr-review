// SPDX-License-Identifier: MIT
// Selection Mapper entry per design.md §3.2.
//
// Six MappingMode return values:
//   - precise                          : single-line or multi-line precise span
//   - coarse-text-not-found            : normalized selection text absent in block
//   - coarse-ambiguous-text            : multiple matches with no disambiguation
//   - coarse-html-block                : selection sits inside raw HTML block
//   - coarse-mermaid                   : selection sits inside rendered mermaid
//   - coarse-no-block                  : DOM walk-up found no source-line ancestor
//
// All paths return ADO-friendly { rightFileStart, rightFileEnd } with
// 1-indexed line + 1-indexed offset. Coarse modes set offset=1 for start
// and 1 + lineLength for end (whole-block highlight in ADO).

import type { LineOffset, MappingMode, SelectionMadePayload } from '../types';
import { normalizeBlock, normalizeText } from './normalize';
import { disambiguate } from './disambiguate';

export interface MapSelectionInput {
    /** The selection payload from the webview. */
    selection: SelectionMadePayload;
    /** Raw markdown file contents (string, not pre-split). */
    rawFileContent: string;
}

export interface MapSelectionResult {
    mode: MappingMode;
    rightFileStart: LineOffset;
    rightFileEnd: LineOffset;
    /** Excerpt of raw text the comment will quote (used by ControllerLayer). */
    quotedText: string;
    /** Log breadcrumb suitable for the output channel. */
    note: string;
}

export function mapSelection(input: MapSelectionInput): MapSelectionResult {
    const { selection, rawFileContent } = input;
    const lines = rawFileContent.split(/\r?\n/);
    const blockStart = clampLine(selection.blockLineRange.start, lines.length);
    const blockEnd = clampLine(selection.blockLineRange.end, lines.length);

    // Coarse modes that bypass normalization.
    if (selection.containerKind === 'html-block') {
        return coarse('coarse-html-block', lines, blockStart, blockEnd, selection.selectedText,
                      `Selection inside raw HTML block; coarse-anchored to lines ${blockStart}-${blockEnd}.`);
    }
    if (selection.containerKind === 'mermaid') {
        return coarse('coarse-mermaid', lines, blockStart, blockEnd, selection.selectedText,
                      `Selection inside mermaid diagram; coarse-anchored to fence block ${blockStart}-${blockEnd}.`);
    }
    if (selection.spansMultipleBlocks) {
        // Coalesce across the union of spanned blocks.
        const ranges = selection.spannedBlockRanges ?? [selection.blockLineRange];
        const unionStart = clampLine(Math.min(...ranges.map(r => r.start)), lines.length);
        const unionEnd = clampLine(Math.max(...ranges.map(r => r.end)), lines.length);
        return coarse('coarse-multi-block', lines, unionStart, unionEnd, selection.selectedText,
                      `Selection spans ${ranges.length} blocks; coarse-anchored to union ${unionStart}-${unionEnd}.`);
    }

    // Normalize the raw block.
    const blockLines = lines.slice(blockStart - 1, blockEnd);
    const span = normalizeBlock(blockLines, blockStart);
    const normalizedSelection = normalizeText(selection.selectedText);
    const normalizedBefore = normalizeText(selection.textBeforeSelection ?? '');

    // Empty normalized selection — fallback coarse.
    if (normalizedSelection.length === 0) {
        return coarse('coarse-text-not-found', lines, blockStart, blockEnd, selection.selectedText,
                      `Empty normalized selection; coarse-anchored to ${blockStart}-${blockEnd}.`);
    }

    // Find all occurrences.
    const matches = allOccurrences(span.normalized, normalizedSelection);
    if (matches.length === 0) {
        return coarse('coarse-text-not-found', lines, blockStart, blockEnd, selection.selectedText,
                      `Normalized selection not found in normalized block ${blockStart}-${blockEnd}; coarse anchor used.`);
    }

    const disamb = disambiguate({ matches, approxStart: normalizedBefore.length });
    if (disamb.index === null) {
        return coarse('coarse-ambiguous-text', lines, blockStart, blockEnd, selection.selectedText,
                      `Selection text appears ${matches.length} times within ${disambiguateThreshold()} chars; coarse anchor used.`);
    }

    // Translate match index back to (line, offset).
    const startMap = span.map[disamb.index];
    const endMap = span.map[disamb.index + normalizedSelection.length - 1];
    if (!startMap || !endMap) {
        // Defensive: position map missing — coarse fallback.
        return coarse('coarse-text-not-found', lines, blockStart, blockEnd, selection.selectedText,
                      `Position map missing at index ${disamb.index}; coarse anchor used.`);
    }
    const rightFileStart: LineOffset = { line: startMap.line, offset: startMap.offset };
    // ADO end offset is exclusive of the last selected char in the offset sense
    // — we add 1 to make the span inclusive of endMap's char.
    const rightFileEnd: LineOffset = { line: endMap.line, offset: endMap.offset + 1 };
    return {
        mode: 'precise',
        rightFileStart,
        rightFileEnd,
        quotedText: extractQuotedText(lines, rightFileStart, rightFileEnd),
        note: `Precise mapping: lines ${rightFileStart.line}:${rightFileStart.offset} - ${rightFileEnd.line}:${rightFileEnd.offset}.`
    };
}

function coarse(
    mode: MappingMode,
    lines: string[],
    blockStart: number,
    blockEnd: number,
    selectedText: string,
    note: string
): MapSelectionResult {
    const endLineText = lines[blockEnd - 1] ?? '';
    return {
        mode,
        rightFileStart: { line: blockStart, offset: 1 },
        rightFileEnd: { line: blockEnd, offset: Math.max(1, endLineText.length + 1) },
        quotedText: selectedText,
        note
    };
}

function clampLine(n: number, max: number): number {
    if (n < 1) return 1;
    if (n > max) return Math.max(1, max);
    return n;
}

function allOccurrences(haystack: string, needle: string): number[] {
    if (needle.length === 0) {
        return [];
    }
    const out: number[] = [];
    let from = 0;
    while (from <= haystack.length - needle.length) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        out.push(idx);
        from = idx + 1;
    }
    return out;
}

function extractQuotedText(lines: string[], start: LineOffset, end: LineOffset): string {
    if (start.line === end.line) {
        const line = lines[start.line - 1] ?? '';
        return line.slice(start.offset - 1, end.offset - 1);
    }
    const out: string[] = [];
    const firstLine = lines[start.line - 1] ?? '';
    out.push(firstLine.slice(start.offset - 1));
    for (let l = start.line + 1; l < end.line; l++) {
        out.push(lines[l - 1] ?? '');
    }
    const lastLine = lines[end.line - 1] ?? '';
    out.push(lastLine.slice(0, end.offset - 1));
    return out.join('\n');
}

function disambiguateThreshold(): number {
    return 20;
}
