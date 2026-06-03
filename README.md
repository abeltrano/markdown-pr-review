# Markdown PR Review

> A Visual Studio Code extension that lets you review markdown design
> and architecture documents in Azure DevOps pull requests using a
> **fully rendered markdown view** — and create PR comment threads by
> selecting text directly in the rendered content.

Closes the regression introduced when teams migrated from Word-based
design-doc review to PR-based review of markdown in source control,
where ADO only supports commenting on raw markdown lines.

---

## Why this exists

When a `.docx` design doc was reviewed by passing the file around,
reviewers used Word's review track to comment on rendered prose, see
diagrams as diagrams, and call out specific phrases in context.

The same design doc, written in markdown and reviewed via an Azure
DevOps pull request, forces the reviewer onto a raw-markdown diff view:
formatting is erased, mermaid diagrams are walls of source, and
selecting "the second paragraph of section 3" means scrolling lines of
syntax. This extension restores the rendered-document review workflow
for a single reviewer — markdown is rendered, mermaid is rendered, text
selection works as you expect, and posting a comment creates a real
ADO PR thread.

---

## Install

This extension is distributed as a sideloaded `.vsix`:

1. Download the latest `ado-markdown-pr-reviewer-*.vsix` from this repo root.
2. In VS Code: **Extensions** sidebar → `...` menu →
   **Install from VSIX…** → pick the file.
3. Reload VS Code if prompted.

Alternative (command line):

```powershell
code --install-extension .\ado-markdown-pr-reviewer-0.4.11.vsix
```

### Build from source

```powershell
npm install
npm run build       # production tsc + esbuild
npm run package     # builds + runs vsce package
```

To run the dev build in an extension-host window: press **F5** in VS
Code (the launch config is wired up).

---

## Quick start

1. **Open a PR**: `Ctrl+Shift+P` → `Markdown PR Review: Open Pull
   Request…`. Paste the PR URL (e.g.,
   `https://dev.azure.com/contoso/MyProject/_git/MyRepo/pullrequest/12345`).
   On first use you will be prompted to sign in via the Microsoft
   account provider (or to enter a Personal Access Token if MSAL is not
   available).
2. **Pick a file**: the **Markdown PR Review** activity-bar view shows all
   `.md`/`.markdown`/`.mdx` files in the PR. Click one to open it in
   the rendered viewer. Clicking a non-markdown file shows a hint to
   review it in the ADO web UI.
3. **Comment on text**: select any text in the rendered view. The
   **Comment Input** panel in the sidebar populates with a quoted
   preview. Type your comment and press **Post**. The thread appears
   in the rendered view immediately (as a `[ID]` marker) and on
   `dev.azure.com` as a real PR thread.
4. **Read existing threads**: every thread already on the PR shows up
   as a clickable marker beside the line it was anchored to. Click the
   marker to read the comments inline.
5. **See what changed**: blocks added in this PR show a green gutter
   bar; modified blocks show a blue gutter bar; locations where content
   was deleted show a dashed red bar (hover to see the removed text).

---

## Commands and keybindings

| Command                                  | Default key       | Notes                                                            |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| **Markdown PR Review: Open Pull Request…**    | —                 | Accepts a full PR URL or a bare PR number (see settings below).  |
| **Markdown PR Review: Refresh Threads**       | `Ctrl+Alt+R`      | Re-fetches threads on the active PR.                             |
| **Markdown PR Review: Add Comment to Selection** | `Ctrl+Alt+C`   | Focuses the comment input sidebar for the current selection.     |
| **Markdown PR Review: Refresh to Head Commit**| `F5`              | Re-opens the PR at the latest head commit.                       |
| **Markdown PR Review: Close Session**         | —                 | Clears the active PR session.                                    |

Keybindings only fire when the rendered editor is focused
(`activeCustomEditorId == 'adoMdReview.renderedView'`).

---

## Settings

All settings live under **Markdown PR Review** in VS Code
**Settings**.

| Setting                                | Default | Description                                                    |
| -------------------------------------- | ------- | -------------------------------------------------------------- |
| `adoMdReview.defaultOrganization`      | `""`    | Default ADO organization. Set with `defaultProject` to allow bare-PR-id input. |
| `adoMdReview.defaultProject`           | `""`    | Default ADO project. Must accompany `defaultOrganization`.     |
| `adoMdReview.staleCommitPollSeconds`   | `30`    | How often to poll for new commits on the active PR. Range 15–60. |

---

## What is rendered

- **CommonMark** (paragraphs, headings, lists, blockquotes, tables,
  fences) per markdown-it defaults.
- **Mermaid diagrams** — fenced as ```` ```mermaid ``` ```` are
  rendered to SVG client-side. Selection within the SVG is not
  supported for comment anchoring (you can still anchor a comment to
  the diagram block as a whole).
- **Code fences** with the language hint shown.
- **Raw HTML** is escaped (rendered as text). This is intentional for
  v0.4 — a sanitizer pass is a future enhancement.

Comments themselves are rendered as plain text in the popover to keep
the webview bundle small.

---

## Known limitations (v0.4)

These are documented in `docs/requirements.md` §2.2 as out of scope:

- **Multi-PR**: only one PR session is active at a time. Opening a new
  PR closes the previous session.
- **Editing/deleting comments**: post-only. Edit or resolve threads in
  the ADO web UI.
- **Reply to a specific comment**: posting always creates a new
  thread anchored to the selection.
- **Right-side panel of resolved threads**: only active threads show
  markers; resolved threads must be reviewed in the ADO web UI.
- **GitHub PRs / Bitbucket / GitLab**: ADO only.
- **Side-by-side base/head view**: the rendered view always shows the
  head version with diff gutter bars indicating change state.
- **Comment markdown rendering inside popovers**: comments display
  as plain text (whitespace preserved) for now.
- **HTML passthrough**: raw HTML blocks are escaped.

---

## Troubleshooting

### Where is the log?

Open the **Output** panel (`View → Output`), then pick **ADO Markdown
PR Reviewer** from the dropdown. Every REST call, every selection
mapping, and every error is recorded here with a timestamp and a
component tag. Errors include a stable code (`E_ADO_AUTH`,
`E_ADO_PERM`, etc.) so you can grep the log.

When a user-facing error appears, the **Open Output** button on the
notification jumps straight to this channel.

### "Azure DevOps rejected your credentials" (`E_ADO_AUTH`)

Sign in via the Microsoft account provider was successful but the
returned token does not authorize the requested ADO resource. On the
next REST call you will be re-prompted exactly once. If the second
attempt also fails, the extension falls back to offering a Personal
Access Token via Secret Storage.

### "Your account does not have permission" (`E_ADO_PERM`)

403 from ADO. Check that you have **Read** on the repository and
**Contribute to pull requests** for posting comments.

### "Azure DevOps returned 404" (`E_ADO_NOT_FOUND`)

Most often a typo in the PR URL or a project/repo you cannot see. The
**Open Output** action shows the exact URL that returned 404.

### Mermaid diagrams render as source

Check that the fence info string is exactly `mermaid` (lowercase, no
extra characters). If rendering still fails, the log records the
mermaid error message.

### Stale PR notification keeps appearing

The default 30 s poll interval will detect new commits within that
window. Increase `adoMdReview.staleCommitPollSeconds` if you find it
intrusive, or use the **Close Session** command to stop polling.

---

## Capability matrix by version

| Capability                                          | v0.1 | v0.2 | v0.3 | v0.4 |
| --------------------------------------------------- | :--: | :--: | :--: | :--: |
| Open ADO PR by URL                                  |  ✅  |  ✅  |  ✅  |  ✅  |
| Rendered markdown view                              |  ✅  |  ✅  |  ✅  |  ✅  |
| Mermaid diagram rendering                           |  ✅  |  ✅  |  ✅  |  ✅  |
| Select-to-comment round-trip                        |  ✅  |  ✅  |  ✅  |  ✅  |
| Existing thread markers + inline popover            |  —   |  ✅  |  ✅  |  ✅  |
| Multi-file picker with directory grouping           |  —   |  ✅  |  ✅  |  ✅  |
| Diff gutter bars (added / modified / deleted)       |  —   |  —   |  ✅  |  ✅  |
| Status bar with PR + thread count                   |  —   |  —   |  —   |  ✅  |
| Stale-commit watcher (auto-detect new head)         |  —   |  —   |  —   |  ✅  |
| 401 silent retry                                    |  —   |  —   |  —   |  ✅  |
| User-facing error codes + Open Output action        |  —   |  —   |  —   |  ✅  |

---

## Repository layout

```
.
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript strict mode
├── esbuild.js                    # Bundler config (host + 2 webviews)
├── .mocharc.cjs                  # Test config (mocha + tsx)
├── docs/
│   ├── requirements.md           # REQ-IDs (source of truth)
│   ├── design.md                 # Architecture, components, contracts
│   ├── validation-plan.md        # Test cases TC-001…TC-165
│   ├── implementation-plan.md    # Phased task breakdown TASK-001…TASK-040
│   └── decisions.md              # Decisions log (D-001…D-028)
├── src/                          # Extension host code
└── test/unit/                    # Mocha unit tests (90 currently)
```

---

## Development

```powershell
npm install
npm run compile     # tsc --noEmit && esbuild (dev)
npm run watch       # esbuild rebuilds on save
npm test            # mocha against test/unit/**/*.test.ts
npm run build       # tsc + production esbuild
npm run package     # build + vsce package
```

Press **F5** in VS Code (with the **Run Extension** launch config) to
debug in a fresh VS Code window.

---

## License

MIT. See `LICENSE`.
