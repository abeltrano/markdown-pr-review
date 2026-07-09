// SPDX-License-Identifier: MIT
// FileDecorationProvider that paints an unresolved-comment-count badge on
// the trailing edge of file rows in the changed-files tree. This is the
// only VS Code primitive that places themed text at the row's right edge
// — TreeItem.description sits left-aligned next to the label.
//
// The provider is fed a map of resourceUri → { count, tooltip } by the
// FileTreeProvider whenever the active session or its threads change.

import * as vscode from 'vscode';

export interface CommentDecorationEntry {
  count: number;
  tooltip: string;
}

export class CommentThreadDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private decorations = new Map<string, CommentDecorationEntry>();
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const entry = this.decorations.get(uri.toString());
    if (!entry || entry.count <= 0) return undefined;
    // FileDecoration.badge is capped at 2 characters by VS Code, so
    // counts of 100+ render as "99". Real PR files don't approach that.
    const badge = entry.count > 99 ? '99' : String(entry.count);
    return new vscode.FileDecoration(
      badge,
      entry.tooltip,
      new vscode.ThemeColor('charts.blue'),
    );
  }

  // Replace the full decoration map and fire change notifications for
  // every URI whose count changed (added, removed, or differing value).
  setDecorations(next: Map<string, CommentDecorationEntry>): void {
    const changed: vscode.Uri[] = [];
    const keys = new Set<string>([...this.decorations.keys(), ...next.keys()]);
    for (const k of keys) {
      const before = this.decorations.get(k)?.count ?? 0;
      const after = next.get(k)?.count ?? 0;
      if (before !== after) {
        changed.push(vscode.Uri.parse(k));
      }
    }
    this.decorations = next;
    if (changed.length > 0) {
      this._onDidChange.fire(changed);
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
