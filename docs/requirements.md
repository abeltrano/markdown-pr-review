# Pre-Authoring Analysis

## Ambiguities resolved during Phase 1

| Ambiguity | How resolved |
|---|---|
| Which SCM platform(s)? | Azure DevOps Services on Microsoft tenant (`microsoft.visualstudio.com`) only |
| Scope of users? | Reviewer-only, single user (you) |
| Read-only or commenting from rendered view? | **Commenting from rendered view** is the top-priority goal |
| Markdown surface area | Basic markdown (no Mermaid/math/diagrams in v1) — *[Updated in v0.2: Mermaid rendering added at fence-block comment granularity; see REQ-CORE-007 and Section 8 revision history]* |
| Diff representation | Unified rendered head view with gutter change bars |
| MVP commenting scope | Add new comments only (no replies, status changes, batching) |
| Single vs. multi-file PRs | Both — multi-file picker required |
| Polish target | Personal-tool, daily-use polish ("no irritation"); not marketplace-grade |
| Build vs. extend | Greenfield VS Code extension (built-in MD preview cannot be augmented with interactive comment UX through supported APIs) |
| Round-trip mapping technique | `markdown-it` block-level source maps → ADO thread `rightFileStart/End` line+offset |

## Ambiguities deliberately deferred

- **Thread reply/resolution UX**: Out of v1 scope by user decision; reserved for v0.5+.
- **Word-level commenting**: Block-level chosen for v1; word-level requires sub-token source mapping (open architectural question if ever revisited).
- **Draft comment batching**: ADO has no native equivalent of GitHub's pending-review; deferred.
- **Distribution channel**: `.vsix` sideload sufficient for personal use; marketplace listing not in scope.

## Key design decisions

1. **Greenfield extension with `markdown-it`-rendered webview** (vs. extending built-in preview or third-party). Justification falsified the three alternatives in Phase 1.
2. **Pin to a commit SHA at session start** to guarantee stable line→position mapping across the session; detect new commits and warn.
3. **Auto-quote the clicked rendered text into the comment body** so the comment is comprehensible to the author reviewing in raw-line context.
4. **Use VS Code's Microsoft AAD authentication provider** (`vscode.authentication.getSession('microsoft', scopes)`) — no custom OAuth flow needed.
5. **Block-level comment granularity** — `markdown-it` source maps reliably resolve at the block-token level; word-level would require sub-token tracking.

## Assumptions accepted (carried into document)

- ADO REST API line/offset indexing is 1-based (to be verified during implementation; flagged as `[UNKNOWN]` in ASM-004).
- The Microsoft AAD provider can produce a token with ADO scopes (`499b84ac-1321-427f-aa17-267ca6975798/.default` or PAT-equivalent scopes).
- `microsoft.visualstudio.com` URLs are convertible to REST API endpoints using the documented `https://dev.azure.com/microsoft` form or directly via the legacy host.

---

# ADO Markdown PR Reviewer — Requirements Document

## 1. Overview

ADO Markdown PR Reviewer is a Visual Studio Code extension that lets a single reviewer review markdown design and architecture documents in Azure DevOps pull requests using a **fully rendered markdown view** — and create PR comment threads by clicking directly on the rendered content. The extension closes a gap created when teams migrated from Word-based design-doc review (rich rendered editing + inline comments + track changes) to PR-based review of markdown in source control, where Azure DevOps only supports commenting on raw markdown lines. Reviewers currently must mentally render the markdown while reading raw source in order to know what to comment on, which is laborious and error-prone for any non-trivial document.

The extension targets the reviewer running it locally; comments it posts are round-tripped through the standard ADO REST API and appear in the normal ADO PR web view, so authors and other reviewers see them as ordinary PR threads with no client requirements. The design intentionally limits scope to "add a new comment from the rendered view" for v1, with phased delivery (v0.1 → v0.4) culminating in a daily-use-quality tool.

**Phased delivery summary** (each requirement is tagged with its target phase):

- **v0.1** — Authenticate, fetch one file from a PR by URL, render with `markdown-it` (including Mermaid fenced-code diagrams as SVG), click block → post new thread to ADO. Proves the round-trip.
- **v0.2** — Display existing threads as inline markers; multi-file picker for multi-file PRs.
- **v0.3** — Diff awareness: gutter change bars marking added/modified blocks vs. base.
- **v0.4** — Polish gate: settings UI, keybindings, status bar, error surfacing, stale-PR detection, no-irritation defaults.

## 2. Scope

### 2.1 In Scope

- Authenticate to Azure DevOps Services (`microsoft.visualstudio.com`) using VS Code's built-in Microsoft authentication provider.
- Fetch a pull request's metadata, list of changed markdown files, file contents at the head commit, and existing comment threads via the ADO REST API.
- Render markdown files in a VS Code webview using `markdown-it` with source-map-emitting tokenization.
- Render Mermaid diagrams (` ```mermaid ` fenced code blocks) as SVG within the webview. Comments on diagrams are anchored at the fence-block level only — no per-node or per-edge anchoring within a rendered diagram.
- Display gutter change bars in the rendered view indicating blocks added or modified in the PR vs. the merge base.
- Allow the reviewer to click a rendered block and create a new ADO comment thread anchored to that block's raw line range.
- Automatically prepend a quoted snippet of the clicked block's rendered text to the comment body so the comment remains comprehensible to readers viewing in raw mode.
- Display existing ADO PR comment threads as inline markers at their corresponding rendered positions (v0.2+).
- Support multi-file PRs via a file-picker pane within the webview (v0.2+).
- Pin to the PR's head commit SHA at session start to ensure stable line mapping; detect new commits during a session and warn.

### 2.2 Out of Scope

| Excluded | Rationale |
|---|---|
| Replying to existing comment threads from the rendered view | User-confirmed v1 scope is "add new comments only"; replies are a v0.5+ extension. |
| Changing thread status (Active / Resolved / By Design / Won't Fix) | Same as above. |
| Editing or deleting one's own comments after posting | Not part of MVP commenting scope. |
| Draft-comment batching (GitHub-style pending review) | ADO has no native equivalent; would require local persistence not justified by personal-use polish target. |
| Word-level comment anchors (sub-block precision) | `markdown-it` source maps are block-granular; word-level requires custom sub-token tracking. Deferred. |
| Anchoring comments to individual SVG elements (nodes, edges) within a rendered Mermaid diagram | Mermaid renders into an opaque SVG; the meaningful and reliably-source-mapped anchor is the fence block as a whole. |
| Rendering of math (KaTeX/MathJax), PlantUML, and other non-Mermaid markdown extensions | Mermaid is the only extension prioritized for v1; others can be added later if needed. |
| Azure DevOps Server (on-prem) support | User confirmed ADO Services only. |
| Multi-user collaboration features (presence, live cursors) | Single-user reviewer tool. |
| Authoring or editing markdown from within the rendered view | Reviewer tool only — authoring stays in the existing editor. |
| Cross-platform parity beyond what VS Code natively provides | Inherits VS Code's platform support; no additional platform-specific code. |
| Marketplace publication and update telemetry | Personal tool; sideload via `.vsix` is sufficient. |
| Local persistence of partially-drafted comments across VS Code restarts | Not required for personal use; can be added later if pain emerges. |
| Integration with VS Code's native Comments API (`vscode.comments`) | Considered; comments-in-webview chosen instead for v1 because the rendered view IS the experience. May revisit. |

## 3. Definitions and Glossary

| Term | Definition |
|---|---|
| **PR** | Pull request in Azure DevOps. |
| **Thread** | An ADO PR comment thread, anchored to a file and line range, containing one or more comments. |
| **Block** | A `markdown-it` block-level token — a paragraph, heading, list item, blockquote, code fence, table, or HTML block. |
| **Source map** | The `map: [startLine, endLine]` array `markdown-it` attaches to block tokens, identifying their position in the raw markdown source (0-indexed, end-exclusive). |
| **Head commit SHA** | The git commit hash of the most recent commit on the PR's source branch at session start. |
| **Session** | A single "Open PR Review" invocation: starts when the user opens a PR, ends when the webview is closed. |
| **Rendered view** | The HTML output produced by rendering the markdown source through `markdown-it` and displayed in the extension's webview. |
| **Raw line range** | A `{ line, offset }` pair (or pair of pairs) identifying a position or span in the raw markdown source, used as ADO thread anchor coordinates. |
| **`rightFileStart` / `rightFileEnd`** | Fields in the ADO `threadContext` REST payload anchoring a thread to a line+offset range in the right-side (head) file version. |
| **MAUC** | Microsoft AAD User Credentials — the credentials VS Code's Microsoft auth provider obtains. |

## 4. Requirements

### 4.1 Functional Requirements

#### Core review session

**REQ-CORE-001** *(v0.1)*: The extension SHALL register a command `markdownPrReview.openPullRequest` which, when invoked, prompts the user for a pull request URL or numeric ID and begins a review session for that PR.

- AC-1: Running `markdownPrReview.openPullRequest` from the Command Palette displays an input box with placeholder text describing the accepted formats.
- AC-2: Submitting a valid PR URL such as `https://microsoft.visualstudio.com/{project}/_git/{repo}/pullrequest/12345` opens a webview titled with the PR number and title within 5 seconds on a reliable network.
- AC-3: Submitting an invalid URL or a PR number without an active workspace-configured default project SHALL surface an error message and not open a webview.

**REQ-CORE-002** *(v0.1)*: The extension MUST resolve the PR's head commit SHA at session start and use it for all subsequent fetches of file content within that session.

- AC-1: The webview state (visible somewhere in the UI, e.g., status footer) displays the short head SHA used for the session.
- AC-2: If the user opens the same PR twice in different windows after the author has pushed a new commit, each session is pinned to its own head SHA.

**REQ-CORE-003** *(v0.1)*: The extension MUST fetch the list of changed files in the pull request and identify the subset whose paths have a `.md`, `.markdown`, or `.mdx` extension.

- AC-1: When opening a PR that contains 3 changed files of which 2 are markdown, only the 2 markdown files appear in the file-picker pane.
- AC-2: When opening a PR with zero markdown files, the webview SHALL display a message stating no markdown files were found and SHALL NOT open a renderer pane.

**REQ-CORE-004** *(v0.1)*: The extension MUST fetch the head-version content of a selected markdown file from the ADO REST API and pass it to the renderer.

- AC-1: For a 50 KB markdown file the file content is loaded and rendering begins within 2 seconds on a reliable network.
- AC-2: A non-UTF-8 file SHALL be decoded as UTF-8 with replacement characters and a warning logged to the output channel.

**REQ-CORE-005** *(v0.1)*: The extension MUST render markdown into the rendered-view surface using `markdown-it` configured to emit token source maps.

- AC-1: Every block-level element in the rendered DOM has a `data-source-line-start` and `data-source-line-end` attribute corresponding to the source map of its originating token.
- AC-2: Headings, paragraphs, list items, blockquotes, code fences, tables (and table rows), and HTML blocks are all annotated.
- AC-3: The rendered surface MUST permit the reviewer to select arbitrary text using standard mouse and keyboard text-selection gestures (no JS-disabled selection, no `user-select: none` on rendered content).

**REQ-CORE-006** *(v0.2)*: When a PR contains more than one markdown file, the extension MUST provide a file-picker UI allowing the reviewer to switch between files without re-opening the PR. The location of the picker (inside the rendered surface, in a sidebar TreeView, in a Quick Pick, etc.) is design-defined.

- AC-1: With 3 markdown files in the PR, all 3 appear in the picker; selecting each loads and renders that file in under 2 seconds.
- AC-2: Switching files preserves the session's pinned head SHA.
- AC-3: The picker SHALL indicate which files have existing comment threads (e.g., a badge or icon) so the reviewer can prioritize.

**REQ-CORE-007** *(v0.1)*: The extension MUST render ` ```mermaid ` fenced code blocks as SVG diagrams within the webview, using the `mermaid` JavaScript library bundled with the extension.

- AC-1: A markdown file containing a valid mermaid flowchart renders as an inline SVG diagram within 2 seconds of the surrounding markdown becoming visible (after file content is fetched and parsed).
- AC-2: A markdown file containing an invalid mermaid block SHALL display the diagram source as a code block with a visible error indicator and SHALL NOT cause the surrounding rendered content to fail to display.
- AC-3: The container element wrapping each rendered mermaid diagram MUST carry the `data-source-line-start` and `data-source-line-end` attributes corresponding to the source map of the underlying fence token, so REQ-COMMENT-002 anchoring works for fence-block-level comments on diagrams.
- AC-4: Mermaid initialization MUST use `securityLevel: 'strict'` (or stricter) to prevent any user-supplied diagram content from executing arbitrary script.
- AC-5: When the rendered file contains zero mermaid fence blocks, the `mermaid` library SHOULD NOT be loaded into the webview (lazy load) to keep initial render fast for non-diagram files.

#### Commenting capability

**REQ-COMMENT-001** *(v0.1)*: The rendered view MUST allow the reviewer to initiate a new comment by selecting text in the rendered content. Selecting text and completing the selection (e.g., releasing the mouse button after a drag-select, or pressing a "comment on selection" keyboard shortcut after a keyboard selection) MUST surface a comment input affordance.

- AC-1: Completing a non-collapsed text selection in the rendered content surfaces a comment input affordance within 200 ms. Acceptable affordances include: a floating "Comment on selection" button positioned near the selection; automatic focus on a sidebar/panel comment-input view; or activation of a registered command. The chosen affordance is design-defined and SHALL be documented in [`design.md`](design.md).
- AC-2: The comment input control SHALL include a multi-line text area, a "Post" button, and a "Cancel" affordance.
- AC-3: The input control SHALL display, in a visually-distinct area, the file path and the resolved raw line range (REQ-COMMENT-002) of the selected text so the reviewer can verify what their comment will anchor to before posting.
- AC-4: The reviewer SHALL be able to keyboard-trigger the comment affordance for the current selection without using the mouse (REQ-UX-003 backbone).
- AC-5: Comment input MAY live outside the rendered view (e.g., in a sidebar `WebviewView`) provided AC-1 surfacing latency is met; if so, the selected text MUST remain visually distinguished in the rendered view until the input is posted or cancelled (to preserve selection context after focus leaves the rendered surface).

**REQ-COMMENT-002** *(v0.1)*: When the reviewer initiates a comment via REQ-COMMENT-001, the extension MUST resolve a raw-line range from the selection by mapping the rendered DOM selection back to the raw markdown source.

- AC-1: When the selection lies wholly inside a single rendered block (e.g., a paragraph from raw lines 47–49) AND the selected rendered text can be unambiguously located in the raw source for that block, the comment payload MUST use the precise raw line numbers and 1-indexed character offsets bounding the selected text (1-indexed; see ASM-004). For example, selecting a 12-character substring of the paragraph that starts on raw line 48 column 7 produces `rightFileStart.line = 48, rightFileStart.offset = 7, rightFileEnd.line = 48, rightFileEnd.offset = 19`.
- AC-2: When precise mapping per AC-1 is not feasible (selection spans multiple block-level ancestors; selection lies inside a Mermaid container; selection lies inside a raw HTML block; rendered text cannot be uniquely located in the normalized raw source), the extension MUST fall back to a coarse anchor at the smallest block (or block union) fully containing the selection, using the bounding block(s)' `data-source-line-*` range with `offset = 1` (start) and `offset = 9999` (end, end-of-line sentinel). Each coarse fallback occurrence MUST be logged to the output channel with the failure reason so the behavior is observable.
- AC-3: For a heading or list item rendered from a single raw line 12 selected in full, the comment payload uses `rightFileStart.line = 12` and `rightFileEnd.line = 12`.
- AC-4: If a selection's anchor element lacks `data-source-line-*` attributes, the extension SHALL walk up the DOM to the nearest ancestor that has them; if no such ancestor exists, the comment initiation SHALL be rejected and an output-channel log entry written.
- AC-5: Selections entirely within a rendered Mermaid SVG (or any descendant of the mermaid container produced by REQ-CORE-007) SHALL resolve to the container's `data-source-line-*` attributes per REQ-CORE-007 AC-3 — i.e., the entire fence block is the comment anchor; per-SVG-element anchoring is out of scope per Section 2.2.
- AC-6: The resolved line range and a one-line summary of the mapping mode (`precise` or `coarse-<reason>`) MUST be displayed in the comment-input affordance per REQ-COMMENT-001 AC-3 so the reviewer can decide whether to refine the selection before posting.

**REQ-COMMENT-003** *(v0.1)*: The comment body sent to ADO MUST automatically include a quoted snippet of the selected rendered text (or, for coarse-anchored comments per REQ-COMMENT-002 AC-2, the bounding block's plain text), prepended above any text the reviewer types.

- AC-1: A comment created on a selection of "The fallback path is invoked when the primary connection times out" begins with a markdown blockquote line like `> The fallback path is invoked when the primary connection times out`.
- AC-2: The quoted snippet SHALL be truncated to at most 200 characters with an ellipsis if the selected text exceeds 200 characters.
- AC-3: The reviewer SHALL be able to edit or delete the auto-prepended quote before posting if they choose.

**REQ-COMMENT-004** *(v0.1)*: Posting a comment MUST create a new ADO PR comment thread via `POST /_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads` with `threadContext.filePath`, `rightFileStart`, and `rightFileEnd` populated from REQ-COMMENT-002.

- AC-1: A successful POST results in the new thread being visible in the ADO web UI for the same PR within 5 seconds of posting, anchored to the expected raw line range.
- AC-2: A failed POST (any non-2xx response) SHALL surface an error message in the webview, leave the draft comment intact, and write the full error to the output channel.
- AC-3: The created thread's `status` defaults to `Active`.

**REQ-COMMENT-005** *(v0.2)*: The extension MUST fetch the PR's existing comment threads at session start (and on demand via a refresh action) and display markers at the rendered positions corresponding to each thread's `threadContext.rightFileStart.line`.

- AC-1: For a PR with 4 existing threads anchored to lines 10, 45, 78, and 120, each rendered block whose source-line range contains one of those lines displays a visible marker (e.g., gutter icon or inline badge).
- AC-2: Threads whose `threadContext` is null or does not have a `rightFileStart` (e.g., overall PR comments) SHALL be displayed in a separate "PR-level comments" section, not as inline markers.
- AC-3: After REQ-COMMENT-004 posts a new thread, the marker for that thread appears within 5 seconds without manual refresh.

**REQ-COMMENT-006** *(v0.2)*: Clicking a marker rendered by REQ-COMMENT-005 MUST display the thread's existing comments (author, date, body) in a read-only popover or inline panel.

- AC-1: Clicking a marker for a 3-comment thread shows all 3 comments in chronological order with author display name and timestamp.
- AC-2: Markdown formatting in comment bodies is rendered (not shown as raw text).
- AC-3: The popover or panel includes a clear "Reply / Resolve are not supported in v1 — open in ADO web UI →" affordance.

#### Authentication

**REQ-AUTH-001** *(v0.1)*: The extension MUST authenticate to Azure DevOps using VS Code's built-in Microsoft authentication provider (`vscode.authentication.getSession('microsoft', scopes, { createIfNone: true })`).

- AC-1: On first invocation of `markdownPrReview.openPullRequest`, the user is prompted by VS Code's auth flow if no Microsoft session exists.
- AC-2: On subsequent invocations within the same VS Code session, no auth prompt appears as long as the token is valid.
- AC-3: The extension SHALL request only the scopes required for PR thread read/write (see ASM-006).

**REQ-AUTH-002** *(v0.4)*: The extension MUST handle a 401 Unauthorized response from any ADO REST call by silently refreshing the token via the auth provider and retrying the request once.

- AC-1: A 401 response triggers a token refresh attempt; on success the original request is retried; on failure a single user-visible auth prompt is shown.
- AC-2: A second consecutive 401 after refresh SHALL surface a clear error message and SHALL NOT loop indefinitely.

#### Diff awareness

**REQ-DIFF-001** *(v0.3)*: The extension MUST compute a block-level diff between the head version of the file and its merge-base version, and annotate each rendered block in the webview with one of: `unchanged`, `added`, `modified`, or `context-of-deletion` (a block immediately following a deletion).

- AC-1: For a PR that adds a new paragraph, the rendered output of that paragraph carries a `data-diff-state="added"` attribute and visually displays a green gutter bar.
- AC-2: For a PR that edits an existing paragraph, the rendered output carries `data-diff-state="modified"` and a blue gutter bar.
- AC-3: For a PR that deletes a paragraph, a marker is displayed at the surviving block immediately above the deletion (or at the file start if deletion is from the top), indicating that content was deleted; hovering reveals the deleted content as plain text.
- AC-4: A file with no changes displays no gutter bars.

**REQ-DIFF-002** *(v0.3)*: The extension MUST resolve the merge-base SHA between the PR's source and target branches and fetch the file content at that SHA for diff comparison.

- AC-1: For a PR with source `feature/foo` and target `main`, the merge-base used for diffing is the same merge-base ADO would use for its own diff view.
- AC-2: If a file does not exist at the merge-base (new file added in PR), every block is annotated `added`.

#### User experience

**REQ-UX-001** *(v0.4)*: The extension MUST display a status bar item during an active review session showing the PR number and current file name, with a click action that re-focuses the review webview.

- AC-1: Opening a session shows e.g., `MD Review: PR 12345 — design/auth.md` in the status bar.
- AC-2: Clicking the status bar item brings the webview to focus.
- AC-3: Closing the webview removes the status bar item within 1 second.

**REQ-UX-002** *(v0.4)*: The extension SHOULD provide configuration settings for (a) the default ADO organization, (b) the default project, and (c) the path to a list of repositories the user reviews frequently, to streamline PR-URL parsing and PR-ID resolution.

- AC-1: With `markdownPrReview.defaultOrganization = "microsoft"` configured, the user MAY paste a PR URL that omits the organization segment and the extension SHALL still resolve it.
- AC-2: With `markdownPrReview.defaultProject` configured, the user MAY invoke the command with a numeric PR ID alone.

**REQ-UX-003** *(v0.4)*: The extension SHOULD expose a default keybinding (configurable) for `markdownPrReview.openPullRequest`.

- AC-1: A default keybinding is registered in [`package.json`](../package.json) (e.g., `ctrl+alt+r`) and can be overridden via standard VS Code keybindings UI.

#### Error handling and resilience

**REQ-ERR-001** *(v0.4)*: The extension MUST surface all ADO REST errors to the user via a notification or webview-embedded error region, and MUST log the full error (including HTTP status, response body, and request URL with secrets redacted) to a dedicated VS Code output channel named `ADO Markdown PR Reviewer`.

- AC-1: A 404 on the PR fetch surfaces a clear "PR not found" notification and logs the full failed request URL (without auth headers) to the output channel.
- AC-2: A network error (offline, DNS failure) surfaces a "Cannot reach Azure DevOps" notification.
- AC-3: The output channel never contains the bearer token or PAT value in plain text.

**REQ-ERR-002** *(v0.4)*: The extension MUST poll for new commits on the PR's source branch (or otherwise detect them) and warn the user if the head commit advances during an active session.

- AC-1: With a session pinned to commit A, when commit B is pushed and detected, a warning is displayed in the webview offering a "Refresh to new HEAD (will discard pending drafts)" action.
- AC-2: Acting on the refresh re-pins the session to commit B and re-fetches all files; declining leaves the session pinned to commit A.
- AC-3: The poll interval is at most 60 seconds and at least 15 seconds (configurable).

**REQ-ERR-003** *(v0.4)*: If the markdown file fails to parse (which `markdown-it` does not normally hard-fail on, but malformed UTF-8 or extreme file sizes could trip), the extension MUST display a clear error in the webview indicating the file cannot be rendered and SHALL NOT crash the extension host.

- AC-1: A file exceeding 5 MB SHALL display a "File too large to render" message instead of attempting to render.
- AC-2: The extension host process survives and the user can return to the file picker.

### 4.2 Non-Functional Requirements

**REQ-NFR-PERF-001**: For a markdown file ≤ 200 KB, rendering and DOM annotation MUST complete within 500 ms on a developer-class machine (e.g., 8+ core CPU, 16 GB+ RAM) on a reliable network after file content is fetched.

- AC-1: Synthetic benchmark with a 200 KB markdown file completes render in < 500 ms across 10 consecutive runs.

**REQ-NFR-UX-001**: During an active session, the extension MUST NOT prompt the user for authentication more than once unless a token refresh fails (REQ-AUTH-002).

- AC-1: Performing 50 thread-create operations consecutively within one session produces no auth prompts beyond the initial one.

**REQ-NFR-COMPAT-001**: The extension MUST run on VS Code stable (current version at time of v0.1 release) on Windows, macOS, and Linux as supported by VS Code's portability surface.

- AC-1: The extension's `engines.vscode` declares a minimum VS Code version no older than `^1.85.0`.
- AC-2: No native code dependencies are introduced; all runtime dependencies are pure JavaScript/TypeScript or VS Code APIs.

**REQ-NFR-MAINT-001**: The extension MUST be implemented in TypeScript using the standard VS Code extension layout ([`package.json`](../package.json) with `contributes`, [`src/extension.ts`](../src/extension.ts) activate/deactivate, webpack or esbuild bundling).

- AC-1: Running `npm install && npm run compile` from a fresh clone produces a runnable extension.
- AC-2: Source code passes `tsc --noEmit` with `strict: true`.

**REQ-NFR-SEC-001**: The webview's Content Security Policy MUST disallow inline scripts from untrusted sources and MUST restrict resource loading to the extension's bundled assets and to `vscode-resource:` / `vscode-webview:` URIs.

- AC-1: The webview's CSP header forbids `unsafe-inline` for `script-src` outside of the extension's own bundled scripts.
- AC-2: No markdown content can execute script via raw HTML passthrough (configure `markdown-it` with `html: false` or sanitize HTML blocks).
- AC-3: The CSP MAY permit `style-src 'unsafe-inline'` to accommodate Mermaid's style injection (REQ-CORE-007, ASM-009); this exception MUST be documented in code comments adjacent to the CSP construction. The CSP MUST NOT permit `script-src 'unsafe-eval'` (mermaid v10+ with `securityLevel: 'strict'` does not require it).

### 4.3 Constraints

**CON-001**: Single-user only. No multi-user state synchronization, presence, or shared session state.

**CON-002**: Azure DevOps Services (cloud) only. ADO Server (on-prem) is explicitly unsupported in v1.

**CON-003**: Basic markdown rendering plus Mermaid diagrams. KaTeX/MathJax, PlantUML, and other markdown extensions are out of scope for v1. Mermaid diagrams are commented at the fence-block level only (no anchoring to individual SVG nodes or edges).

**CON-004**: Selection-based comment anchoring with at most line+offset character-level precision (per ADO REST `threadContext.rightFileStart/End`). Sub-character anchoring (per-token, per-glyph) and cross-block multi-line semantic anchors (e.g., "this paragraph and the next one collectively") are out of scope; multi-block selections fall back to coarse block-range anchoring per REQ-COMMENT-002 AC-2.

**CON-005**: Comments are posted immediately upon clicking Post. No drafting-and-batching, no "submit review" workflow.

**CON-006**: The extension MUST NOT modify any file in the user's workspace. It is a read-and-comment tool; all writes go to ADO via REST.

**CON-007**: The extension MUST NOT bundle or invoke any external git binary. All repository data is obtained from the ADO REST API.

## 5. Dependencies

**DEP-001**: This requirement set depends on the **Azure DevOps Services REST API** for: PR metadata, file content at commit SHA, thread list, and thread creation. Impact if unavailable: the extension is non-functional. The Microsoft tenant's API endpoint stability is assumed; breaking changes are very rare but possible.

**DEP-002**: This requirement set depends on the **VS Code Microsoft authentication provider** (built into VS Code) for AAD-based ADO authentication. Impact if unavailable: the extension cannot authenticate; user would need to fall back to a PAT-based path, which is out of scope for v1.

**DEP-003**: This requirement set depends on the **`markdown-it` library** (or equivalent CommonMark renderer that emits source maps). Impact if unavailable or breaking change: substantial re-implementation effort for the source-map mechanism that REQ-COMMENT-002 depends on.

**DEP-004**: This requirement set depends on **the VS Code Extension API surface**: webview, commands, configuration, status bar, output channel, authentication. Impact if changed: VS Code's stable API rarely breaks; risk is low.

**DEP-005**: This requirement set depends on the **ADO REST thread API supporting the `threadContext.rightFileStart/End` payload format documented as of API version 7.x**. Impact if changed: REQ-COMMENT-004 would need re-targeting; see ASM-004.

**DEP-006**: This requirement set depends on the **`mermaid` JavaScript library** (current major version, expected v10+ as of authoring date) bundled into the extension. Impact if unavailable or breaking change: REQ-CORE-007 cannot be satisfied; reviewers cannot read mermaid diagrams in the rendered view, but the extension remains usable for non-mermaid markdown. Alternative renderers (e.g., extension-host-side pre-render to SVG via `@mermaid-js/mermaid-cli`) are documented as a fallback in ASM-009.

## 6. Assumptions

**ASM-001**: PR URLs the reviewer pastes are well-formed and conform to one of the documented Azure DevOps URL patterns (`https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}` or the equivalent `dev.azure.com` form). **If wrong**: URL parsing in REQ-CORE-001 fails for unsupported variants; mitigation is to expand the parser as new patterns are encountered.

**ASM-002**: The reviewer can identify which markdown file(s) in the PR is the design/architecture document of interest, either by file name or by virtue of being the only markdown file changed. **If wrong**: the file picker may list too many files; not a blocker for v1.

**ASM-003**: The signed-in Microsoft account has read access (and thread-write access) to the repositories under review. **If wrong**: REST calls return 401/403; REQ-ERR-001 surfaces this clearly.

**ASM-004**: `[UNKNOWN: verify during implementation]` The ADO REST API's `threadContext.rightFileStart.line` and `.offset` fields are 1-indexed (lines and character offsets). Per the ADO REST docs both line and offset start at 1. **If wrong**: comments anchor one line off; quickly diagnosable and fixable.

**ASM-005**: A reviewer reviews at most one PR per VS Code window at a time. Concurrent multi-PR review in one window is not supported. **If wrong**: minor UX adjustment to allow multiple session webviews.

**ASM-006**: The ADO scope required for `vscode.authentication.getSession('microsoft', scopes)` is `499b84ac-1321-427f-aa17-267ca6975798/.default` (the documented ADO resource ID). **If wrong**: actual scope string would need to be discovered empirically (e.g., by inspecting the GitHub PRs extension's analog or ADO docs); does not invalidate any requirement, only the implementation detail.

**ASM-007**: The PR's source branch's HEAD commit is fetchable via the API as of session start (i.e., it is not garbage-collected or in a state of branch deletion). For active PRs this is universally true.

**ASM-008**: The reviewer is willing to sideload the `.vsix` artifact (or run the extension from source via `code --extensionDevelopmentPath`). No marketplace presence is required.

**ASM-009**: The `mermaid` library functions correctly inside a VS Code webview with a Content Security Policy that permits `style-src 'unsafe-inline'` (mermaid injects style elements) and does not require `script-src 'unsafe-eval'` when configured with `securityLevel: 'strict'`. **If wrong**: REQ-CORE-007 may require an alternative rendering approach — pre-rendering each mermaid block to SVG in the extension host process via `@mermaid-js/mermaid-cli` (or a headless puppeteer instance) and sending the inert SVG to the webview. The fence-block source-line attributes (REQ-CORE-007 AC-3) remain valid under either approach.

## 7. Risks

| Risk ID | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-001 | `markdown-it` block-level source maps may have edge cases where the `map` array is `null` or imprecise (e.g., HTML blocks, nested lists, code fences with no surrounding blank lines). | Medium | Medium — comments may anchor incorrectly or be blocked. | Test with diverse real-world design docs early; fall back to walking up the DOM tree (REQ-COMMENT-002 AC-4). |
| RISK-002 | ADO REST rate limits may throttle a session that fetches threads on a frequent poll plus does many POSTs. | Low | Low — surfaces as transient 429s. | Use a 60s poll cap (REQ-ERR-002 AC-3); backoff on 429. |
| RISK-003 | VS Code's Microsoft authentication provider may not produce a token with the ADO `vso.code_write` equivalent scope without additional configuration on the user's account or tenant. | Medium | High — REQ-COMMENT-004 cannot post threads. | Validate scope acquisition in v0.1 spike; if blocked, fall back to PAT in v0.1 with a documented setup step. |
| RISK-004 | The author pushes a new commit while the reviewer is mid-session, invalidating source-line mapping for any draft comment. | Medium | Medium — comments could anchor to wrong lines if posted blindly. | REQ-ERR-002 detects and warns; reviewer chooses to refresh or stay pinned. |
| RISK-005 | Webview Content Security Policy (REQ-NFR-SEC-001) and `markdown-it` HTML passthrough interaction may break legitimate inline HTML in design docs. | Low | Low | Sanitize via `markdown-it`'s built-in `html: false` first; opt-in HTML allowlist later if pain emerges. |
| RISK-006 | Diff computation (REQ-DIFF-001) at block-level requires a markdown-aware diff algorithm; naive line-diff will mis-align after block boundary changes. | Medium | Medium — gutter bars may be misleading. | Use a block-tokenization-based diff (tokenize both versions, diff token sequences) rather than a line diff; phase v0.3 acceptably late to gather complexity. |
| RISK-007 | `microsoft.visualstudio.com` legacy URL host quirks in REST API base URL construction. | Low | Low | Normalize to `dev.azure.com/microsoft` internally; both hosts share the same API surface. |
| RISK-008 | A future ADO PR review feature could supersede this tool. | Low (this is a long-standing gap) | Low — tool stops being needed, which is fine. | None — accept. |
| RISK-009 | The `mermaid` library bundle is ~1 MB and may slow webview initial load, especially for files without mermaid content. | Low | Low — one-time per webview lifecycle | Lazy-load `mermaid` only when at least one mermaid fence block is present in the rendered file (REQ-CORE-007 AC-5). |
| RISK-010 | Mermaid may inject inline styles that conflict with `style-src` CSP, or future mermaid versions may require `script-src 'unsafe-eval'`. | Medium | Medium — REQ-CORE-007 cannot render diagrams in the webview | Pin mermaid major version; if CSP cannot be satisfied, fall back to extension-host-side pre-rendering per ASM-009. |

## 8. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-02 | Interactive design session (PromptKit `interactive-design`, persona: `software-architect`) | Initial requirements document produced from interactive Phase 1 reasoning and approach selection. |
| 0.2 | 2026-06-02 | Phase 3 refinement (user request) | **Added Mermaid rendering support** via new REQ-CORE-007 (assigned to v0.1 phase to meet daily-use bar). Added AC-4 to REQ-COMMENT-002 specifying that clicks on rendered Mermaid SVGs anchor to the fence-block source-line range (no per-element anchoring, per user requirement). Updated CON-003 to permit Mermaid. Added DEP-006 (mermaid library), ASM-009 (mermaid + CSP, with fallback to extension-host pre-render if assumption fails), RISK-009 (bundle size, mitigated by lazy-load), RISK-010 (CSP risks). Added AC-3 to NFR-SEC-001 documenting permissible CSP relaxation for Mermaid. Added Mermaid bullet to Scope 2.1; replaced the unitary "out of scope" Mermaid row in Scope 2.2 with two rows that scope OUT per-SVG-element anchoring and other non-Mermaid extensions. Annotated Pre-Authoring Analysis "Markdown surface area" row pointing at the change. No requirement renumbering; no cross-references broken. |
| 0.3 | 2026-06-02 | Phase 3 refinement after rubber-duck review of webview surface decision | **Pivoted commenting interaction model from click-on-block to text-selection.** User clarified that the primary pain is reading rendered (not raw) markdown; selecting rendered text to anchor a comment is the desired gesture; comment input UX can live in a sidebar or popup. Replaced REQ-COMMENT-001 (now selection-based with five ACs including sidebar permission and selection-persistence requirement). Replaced REQ-COMMENT-002 (now mandates precise selection mapping with deterministic coarse fallback for unmappable cases, with output-channel logging of fallbacks for observability — chosen path (b) per user direction; failure modes are predictable since worst case equals former-baseline coarse anchoring). Updated REQ-COMMENT-003 to operate on selected text instead of clicked block. Updated REQ-CORE-005 with AC-3 mandating text-selection capability on the rendered surface. Updated REQ-CORE-006 to make file picker UI location design-defined (no longer mandates "in the webview") and added AC-3 for comment-presence indicators. Renumbered acceptance criteria within REQ-COMMENT-002 to accommodate new precise/coarse ACs; REQ-COMMENT-002 AC-4 (was clicks-on-Mermaid) is now AC-5 (selections-in-Mermaid) — all cross-references in requirements doc were checked. **Updated CON-004** from "block-level only" to "selection-based with line+offset precision, sub-character/multi-block out of scope" to align with the new REQ-COMMENT-002. No new constraints, dependencies, assumptions, or risks added in this revision; design doc will absorb new tradeoff decisions (surface choice rationale, CustomEditorProvider, native TreeView for file picker, sidebar WebviewView for input, selection mapping algorithm). |
