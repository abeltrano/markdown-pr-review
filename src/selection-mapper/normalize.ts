// SPDX-License-Identifier: MIT
// Normalize raw markdown to "rendered-equivalent" plain text, producing a
// parallel position map so we can translate matches back to (line, offset).
//
// Per design.md §3.2 Selection Mapper:
//   - Strip markdown formatting characters (*, _, backticks for inline
//     code spans, link-target portion of [text](url), leading list markers,
//     table pipe separators, fence delimiters).
//   - Maintain a map from each character index in the normalized string
//     back to (line, offset) in the raw source.

import type { LineOffset } from '../types';

export interface NormalizedSpan {
    /** The normalized output string. */
    normalized: string;
    /**
     * Position map: map[i] = (line, offset) in raw source corresponding to
     * normalized character at index i. Line is 1-indexed; offset is the
     * 1-indexed column in that line.
     */
    map: LineOffset[];
}

/**
 * Normalize a slice of raw markdown lines (1-indexed `startLine` is the
 * line number of `lines[0]`). Returns the normalized text and a per-char
 * position map back to the raw source.
 */
export function normalizeBlock(lines: string[], startLine: number): NormalizedSpan {
    const out: string[] = [];
    const map: LineOffset[] = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li]!;
        const lineNo = startLine + li;
        let col = 1;                 // 1-indexed offset into raw line
        let i = 0;
        // Strip leading list markers / blockquote markers / heading hashes.
        const leadingStrip = stripLeading(line);
        // Advance i and col by the consumed prefix.
        i = leadingStrip.consumed;
        col = leadingStrip.consumed + 1;
        const remaining = line.slice(i);
        // Skip table separator rows entirely (e.g. |---|---|).
        if (/^[\s|:-]+$/.test(remaining) && remaining.includes('|')) {
            continue;
        }
        // Skip fence delimiters (``` or ~~~).
        if (/^(```|~~~)/.test(remaining.trim())) {
            // Keep an empty line in the output so position math is stable
            // across the fence boundary — but emit no chars.
            continue;
        }
        // Walk the remaining content character by character.
        let inInlineCode = false;
        let j = 0;
        while (j < remaining.length) {
            const ch = remaining[j]!;
            const rawCol = col + j;
            // Inline code span: stripped from output, preserved as raw chars.
            if (ch === '`') {
                inInlineCode = !inInlineCode;
                j++;
                continue;
            }
            if (inInlineCode) {
                // Include the literal content of the code span.
                out.push(ch);
                map.push({ line: lineNo, offset: rawCol });
                j++;
                continue;
            }
            // Emphasis markers — skip.
            if (ch === '*' || ch === '_') {
                // Heuristic: skip single or double markers when surrounded by
                // word boundaries. We don't try to enforce CommonMark's full
                // flank rules — being lenient is safer for selection matching.
                if (remaining[j + 1] === ch) {
                    j += 2;
                } else {
                    j += 1;
                }
                continue;
            }
            // Link / image syntax: [text](url) or ![alt](url).
            // Keep the text portion, discard brackets + (url).
            if (ch === '!' && remaining[j + 1] === '[') {
                j += 2;
                continue;
            }
            if (ch === '[') {
                j += 1;
                continue;
            }
            if (ch === ']' && remaining[j + 1] === '(') {
                // Skip ](...) up to the matching ).
                j += 2;
                let depth = 1;
                while (j < remaining.length && depth > 0) {
                    if (remaining[j] === '(') depth++;
                    else if (remaining[j] === ')') depth--;
                    j++;
                }
                continue;
            }
            if (ch === ']') {
                j += 1;
                continue;
            }
            // Table cell pipes — skip but treat as a space for word separation.
            if (ch === '|') {
                if (out.length > 0 && out[out.length - 1] !== ' ') {
                    out.push(' ');
                    map.push({ line: lineNo, offset: rawCol });
                }
                j++;
                continue;
            }
            // HTML escape passthrough — keep the literal source char.
            out.push(ch);
            map.push({ line: lineNo, offset: rawCol });
            j++;
        }
        // Add a newline between lines (collapse runs of blanks).
        if (out.length > 0 && out[out.length - 1] !== '\n') {
            out.push('\n');
            map.push({ line: lineNo, offset: line.length + 1 });
        }
    }

    // Trim a trailing newline so indexOf math doesn't have a stray separator.
    if (out.length > 0 && out[out.length - 1] === '\n') {
        out.pop();
        map.pop();
    }

    return { normalized: out.join(''), map };
}

/**
 * Normalize a selection string the same way we normalize raw lines, but
 * without producing a position map (we only need the text for the search).
 */
export function normalizeText(text: string): string {
    const span = normalizeBlock(text.split(/\r?\n/), 1);
    return span.normalized;
}

interface LeadingStrip {
    consumed: number;
}

function stripLeading(line: string): LeadingStrip {
    let i = 0;
    // Skip leading whitespace.
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
        i++;
    }
    // Heading hashes.
    const headingMatch = /^(#{1,6})\s+/.exec(line.slice(i));
    if (headingMatch) {
        i += headingMatch[0].length;
        return { consumed: i };
    }
    // Blockquote markers (possibly nested).
    while (line[i] === '>') {
        i++;
        if (line[i] === ' ') {
            i++;
        }
    }
    // Bullet list markers.
    const bulletMatch = /^([-*+])\s+/.exec(line.slice(i));
    if (bulletMatch) {
        i += bulletMatch[0].length;
        return { consumed: i };
    }
    // Ordered list markers.
    const orderedMatch = /^\d+[.)]\s+/.exec(line.slice(i));
    if (orderedMatch) {
        i += orderedMatch[0].length;
        return { consumed: i };
    }
    return { consumed: i };
}
