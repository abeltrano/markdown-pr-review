// SPDX-License-Identifier: MIT
// Diff Annotator stub for v0.1. Real implementation in TASK-030 (v0.3).
// Returning an empty array means no data-diff-state attributes are emitted
// by the renderer, which is correct for v0.1 (no diff awareness).

import type { DiffAnnotation } from '../types';

export function annotateBlockDiff(
    _headMarkdown: string,
    _baseMarkdown: string | null
): DiffAnnotation[] {
    return [];
}
