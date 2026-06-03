# ADO Markdown PR Reviewer — Implementation Plan

## 1. Overview

This implementation plan decomposes the ADO Markdown PR Reviewer VS Code
extension (per `requirements.md` v0.3 and `design.md` v0.2) into ordered,
acceptance-criteria-bearing tasks across the four release phases mandated by
the requirements: **v0.1** (round-trip prove-out), **v0.2** (existing-thread
display + automated unit-test harness), **v0.3** (diff awareness), and
**v0.4** (daily-use polish — stale-PR detection, auth retry, error handling,
status bar, settings).

The plan honors the dependency ordering from the architecture: types →
infrastructure (logger, parser, auth, ADO client, CSP) → renderer pipeline
+ selection mapper → views (custom editor, file tree, comment input) →
orchestration (session manager, comment controller, command registry) →
final wiring (`extension.ts`, `package.json`). Each phase ends in a
commit. The post-v0.4 final wraps up with README and the distributable
`.vsix`.

Each task in §4 has: a description, REQ-ID traceability, dependency
predecessors, complexity, risks, acceptance criteria, verification
approach, and rollback path. The `Validation` step on each task names the
test cases from `validation-plan.md` that gate that task (where
applicable).

## 2. Current State

**Greenfield project under source control.** The repository
`C:\src\adomarkdownprreviewer` has only the three input docs at this
plan's authoring time: `requirements.md` (v0.3), `design.md` (v0.2),
`validation-plan.md` (v1.0), plus a `.gitignore`. No source code, no
`package.json`, no toolchain configuration. Git initialized on `main`
branch with one root commit.

The target machine has Node.js v20.17.0, npm 10.8.2, and `git` configured
(`Andrew Beltrano <anbeltra@microsoft.com>`). VS Code is assumed
available for manual smoke testing (`code` on PATH). The `@vscode/vsce`
packager will be installed as a dev dependency at the appropriate
milestone.

## 3. Prerequisites

- Docs in `docs/` (REQ-IDs cited by all tasks below) must remain the
  source of truth; if any task would deviate from them, this plan or the
  upstream doc must be updated first and the discrepancy logged in
  `docs/decisions.md`.
- Node.js ≥ 20 LTS and npm ≥ 10 available on the build machine.
- VS Code stable ≥ 1.85 for the dev-loop and smoke tests
  (REQ-NFR-COMPAT-001).
- Access to at least one real ADO PR on `microsoft.visualstudio.com` for
  manual end-to-end verification (TC-150…154, TC-160…165). The
  reviewer's signed-in Microsoft account must have read-and-thread-write
  permission on the PR's repository (ASM-003).
- A `docs/decisions.md` file is created and updated for every decision
  the implementer makes that resolves an ambiguity, an `[UNKNOWN]`, or
  an `OQ-*` open question.

## 4. Plan

### Phase 0: Project initialization

#### TASK-001: Initialize repository scaffold

- **Description**: Author `.gitignore`, `package.json` (with minimal
  contributions sufficient for the extension to activate),
  `tsconfig.json` (strict mode), `esbuild.js` (two bundles: extension
  host and rendered-view webview; comment-input webview added in
  TASK-018), `.vscodeignore`, `.vscode/launch.json` (debug "Run
  Extension"), `.vscode/tasks.json` (npm: compile / watch), a stub
  `README.md`, and `src/extension.ts` containing just `activate()` /
  `deactivate()` log lines. Initialize `docs/decisions.md` and seed it
  with the bundler and language choices from `design.md` §5 to set
  precedent.
- **Requirements**: REQ-NFR-MAINT-001, REQ-NFR-COMPAT-001 AC-1.
- **Dependencies**: None.
- **Acceptance Criteria**: `git status` shows only intended files; `code
  --extensionDevelopmentPath=.` opens a new VS Code window with the
  extension loaded; the activation log line appears in Debug Console
  once the extension's `package.json` `activationEvents` are triggered
  (an explicit `activationEvents: ["onStartupFinished"]` for the spike
  only; replaced by per-command/per-view events in TASK-022).
- **Complexity**: Small.
- **Risks**: esbuild config drift between the host bundle and the
  webview bundles — both must agree on TypeScript target. Mitigated by
  a single `esbuild.js` that exports both build entries.
- **Verification**: `npx tsc --noEmit` exits 0; `node esbuild.js`
  produces `out/extension.js` and `out/rendered-view/main.js`.
- **Rollback**: `git reset --hard` to the docs-only baseline commit.

#### TASK-002: Install runtime and dev dependencies

- **Description**: Install runtime: `markdown-it@^14`, `@types/markdown-it`,
  `mermaid@^10` (per OQ-3 working assumption; revisit in TASK-013 if CSP
  issues), `node-fetch@^3` (or use undici if Node ≥ 18 has built-in
  `fetch` — verify; document choice in `decisions.md`). Install dev:
  `typescript@^5`, `@types/node@^20`, `@types/vscode@^1.85`,
  `esbuild@^0.20`, `@vscode/vsce@^2`.
- **Requirements**: DEP-003, DEP-006.
- **Dependencies**: TASK-001.
- **Acceptance Criteria**: `npm install` exits 0 with no peer-dep
  errors; `package-lock.json` committed; the resolved `mermaid` version
  is logged to `decisions.md` (OQ-3 partially resolved).
- **Complexity**: Small.
- **Risks**: `mermaid` v10 vs v11 CSP behavior unverified (OQ-3); if v10
  proves not to render under our strict CSP, fall back to v11 or to the
  extension-host pre-render path (ASM-009).
- **Verification**: `npm ls --depth=0` shows all expected packages with
  no `UNMET DEPENDENCY` warnings.
- **Rollback**: `git restore package.json package-lock.json && rm -rf
  node_modules`.

#### TASK-003: Verify baseline compilation and run a no-op activation

- **Description**: Run `npx tsc --noEmit`, `node esbuild.js`, and (if
  feasible non-interactively) `code --extensionDevelopmentPath=$PWD
  --new-window`. Capture activation log in `decisions.md` to confirm the
  extension scaffold loads.
- **Requirements**: REQ-NFR-MAINT-001 AC-1, AC-2.
- **Dependencies**: TASK-002.
- **Acceptance Criteria**: `tsc` exits 0; `esbuild` exits 0 and produces
  files in `out/`; if VS Code launch is feasible, the "ADO Markdown PR
  Reviewer activated" line is in the Debug Console.
- **Complexity**: Small.
- **Risks**: Headless VS Code launch may not be feasible in the autonomy
  window — acceptable to defer the actual launch verification to manual
  smoke gate TC-150 (the first phase gate).
- **Verification**: Build commands listed in `package.json` scripts.
- **Rollback**: N/A — verification only.

### Phase 1 (v0.1): Round-trip prove-out

The defining v0.1 milestone is **a reviewer can paste a PR URL, see a
rendered markdown file with mermaid, select text, type a comment, and
have a new ADO thread appear in the ADO web UI within 5 seconds**. This
phase is end-to-end-vertical: incomplete on every component, but
sufficient to prove the architecture closes.

#### TASK-004: Implement shared types (`src/types.ts`)

- **Description**: Implement all the TypeScript interfaces from
  `design.md` §4.2: `PullRequestRef`, `PullRequest`, `ChangedFile`,
  `Thread`, `Comment`, `ThreadContext`, `DiffAnnotation`, `MappingMode`,
  `MappingResult`, `Draft`, `Session`. Also implement the postMessage
  discriminator union types from `design.md` §4.1.2:
  `HostToRenderedView`, `RenderedViewToHost`, `HostToInputView`,
  `InputViewToHost`. Export everything from `src/types.ts`.
- **Requirements**: Foundation for all REQ-CORE, REQ-COMMENT, REQ-DIFF.
- **Dependencies**: TASK-003.
- **Acceptance Criteria**: `tsc --noEmit` passes with `strict: true`;
  each interface compiles; the union types' discriminator field is
  `type: string-literal` so `switch (msg.type) {...}` exhaustiveness can
  be checked.
- **Complexity**: Small.
- **Risks**: Drift between this file and the design doc — mitigated by
  copying field names and tags directly from `design.md` §4.1.2 and
  §4.2; any rename must update both.
- **Verification**: TC-094 (static architectural check baseline).
- **Rollback**: Delete `src/types.ts`.

#### TASK-005: Implement logger with auth-header redaction (`src/logger.ts`)

- **Description**: Wrap `vscode.window.createOutputChannel('ADO
  Markdown PR Reviewer')` with `info`/`warn`/`error` functions that
  prepend timestamp + level + component name. Implement
  `redactAuthHeaders(headersOrBody: unknown): unknown` that
  recursively replaces `Authorization`, `authorization`, `bearer`,
  `Bearer`, and any value matching a JWT-shape regex (`/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/`)
  with `[REDACTED]`. All log writes MUST pass through this function.
- **Requirements**: REQ-ERR-001 (esp. AC-3), REQ-NFR-SEC-001.
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: A unit-test-friendly export of
  `redactAuthHeaders` exists (used in v0.2 by TC-145). Logging a fake
  bearer token to the channel produces a log line containing `[REDACTED]`
  and not the token value.
- **Complexity**: Small.
- **Risks**: Over-aggressive redaction could blank out legitimate
  content; under-aggressive could leak tokens. Bias the regex toward
  over-redaction; document in `decisions.md` if anything legitimate is
  caught.
- **Verification**: TC-145 (auth redaction unit test), runnable
  starting in v0.2.
- **Rollback**: Delete `src/logger.ts`; the only callers in v0.1 are
  catch blocks where `console.error` is an acceptable fallback.

#### TASK-006: Implement PR URL Parser (`src/pr-url-parser.ts`)

- **Description**: Implement `parse(input: string, settings:
  Settings): PullRequestRef | ParseError`. Accept three input shapes
  per `design.md` §3.2 PR URL Parser: (a) full
  `https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}`,
  (b) full `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`,
  (c) bare PR id `12345` with default org/project from settings. Use
  `URL`-class parsing where the input looks like a URL; fall back to
  numeric parse otherwise. Always normalize to `dev.azure.com/{org}`
  internally (RISK-007). Settings come from `WorkspaceConfiguration` —
  pass them in rather than read inside the parser so it's pure-function
  testable.
- **Requirements**: REQ-CORE-001, REQ-UX-002, ASM-001, RISK-007.
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: Validation cases from §5.1 of
  `validation-plan.md` (TC-001…005) all return the expected
  `PullRequestRef` or `ParseError`.
- **Complexity**: Small.
- **Risks**: Encoding edge cases in project names with spaces (`%20`
  vs `+`) — handle URL-decoding explicitly; document any deviation in
  `decisions.md`.
- **Verification**: TC-001…005 (unit-testable, runs in v0.2).
- **Rollback**: Delete `src/pr-url-parser.ts`; command handler can
  inline a simpler regex temporarily.

#### TASK-007: Implement Auth Manager (`src/auth-manager.ts`) + OQ-2 spike

- **Description**: Implement `getToken({ silent = true }): Promise<string>`
  that calls `vscode.authentication.getSession('microsoft',
  ['499b84ac-1321-427f-aa17-267ca6975798/.default'], { createIfNone: !silent, silent })`
  and returns the `accessToken`. Also implement an `onTokenInvalid`
  event emitter consumed by the ADO client on 401 — not yet wired in
  v0.1, just declared. Spike OQ-2 by attempting a real call against the
  Microsoft auth provider with the assumed scope; if it fails, fall back
  to a PAT input flow stored in `vscode.SecretStorage` and log the
  decision to `decisions.md` (RISK-003 mitigation).
- **Requirements**: REQ-AUTH-001, ASM-006, RISK-003.
- **Dependencies**: TASK-004, TASK-005.
- **Acceptance Criteria**: First call to `getToken()` triggers an auth
  prompt the first time only; subsequent calls within the session return
  the cached token silently (REQ-NFR-UX-001 baseline). If `.default`
  scope is rejected, the implementer documents the actual working scope
  string (or the PAT fallback) in `decisions.md` under OQ-2.
- **Complexity**: Medium — depends on which path OQ-2 resolves to.
- **Risks**: AAD scope acceptance unknown (RISK-003); PAT fallback path
  is well-known and not blocking.
- **Verification**: TC-010…012, TC-161 (OQ-2 spike).
- **Rollback**: Delete `src/auth-manager.ts`; ADO client can be stubbed
  with a hardcoded PAT for local debugging during v0.1.

#### TASK-008: Implement ADO REST Client (`src/ado-client.ts`)

- **Description**: Implement the six methods from `design.md` §3.2 ADO
  REST Client interface: `getPullRequest`, `getChangedFiles`,
  `getFileContent`, `getThreads`, `createThread`, `getMergeBaseSha`. All
  use base `https://dev.azure.com/{org}` with `api-version=7.1`,
  `Authorization: Bearer {token}` header (obtained from Auth Manager).
  Implement HTTP transport with `fetch` (Node 20 built-in `globalThis.fetch`
  preferred — confirm and document). Error handling per `design.md`
  §4.1.1 error table: 401 → emit `onTokenInvalid` + throw (auto-retry
  added in v0.4 / TASK-035); 403/404 → throw with surfaced reason; 429 →
  exponential backoff (1s, 2s, 4s + jitter, max 3 retries); 5xx → single
  retry after 2s. Every log line passes through `redactAuthHeaders()`.
  `getMergeBaseSha` may be a stub in v0.1 returning `''` (used only in
  v0.3 TASK-031).
- **Requirements**: REQ-CORE-002…004, REQ-COMMENT-004, REQ-COMMENT-005,
  REQ-ERR-001, RISK-002.
- **Dependencies**: TASK-005, TASK-007.
- **Acceptance Criteria**: Calls succeed against a real PR on
  `microsoft.visualstudio.com` (smoke gate TC-150); error paths
  reproduce per `design.md` §4.1.1; logs never contain the bearer token
  string.
- **Complexity**: Medium — six endpoints, six response shapes, error
  paths.
- **Risks**: `createThread` payload `offset` indexing ambiguity (OQ-1 /
  ASM-004) — first POST in TC-160 spike will reveal whether 1-indexed
  is correct; if wrong, fix here (single change to `createThread`
  payload assembly).
- **Verification**: TC-021, TC-022, TC-160 (OQ-1 spike), TC-100
  (round-trip endpoint).
- **Rollback**: Delete `src/ado-client.ts`; revert callers (Session
  Manager once it exists) to throwing "ADO unavailable".

#### TASK-009: Implement `adopr://` URI helpers (`src/adopr-uri.ts`)

- **Description**: Implement `buildAdoprUri(ref: PullRequestRef,
  filePath: string): vscode.Uri` and `parseAdoprUri(uri: vscode.Uri):
  { ref: PullRequestRef, filePath: string }`. URI shape per
  `design.md` §3.2 CustomEditorProvider: scheme `adopr`, path
  `/{org}/{project}/{repoId}/{prId}/{...filePath}`.
- **Requirements**: REQ-CORE-001 AC-2, REQ-CORE-006 (file picker
  routing).
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: Round-trip `build(parse(uri)) === uri`;
  filePaths with deep nesting and URL-special chars (e.g.,
  `/docs/sub dir/file.md`) round-trip correctly (encode/decode).
- **Complexity**: Small.
- **Risks**: VS Code's `Uri.toString()` canonical form may not be
  stable across versions; mitigation = always use `Uri.parse` /
  `Uri.from` instead of string concatenation.
- **Verification**: TC-073.
- **Rollback**: Delete file; callers (CustomEditorProvider) can inline
  the URI build/parse temporarily.

#### TASK-010: Implement Renderer Pipeline (`src/renderer/`)

- **Description**: Implement `src/renderer/index.ts` exporting
  `render({ markdown, diffAnnotations? }): RenderResult`. Internals
  per `design.md` §3.2 Renderer Pipeline:
  - `src/renderer/markdown-it-config.ts`: instantiate
    `markdown-it` with `html: false`, `linkify: true`, `breaks: false`.
    Register the rules listed below.
  - `src/renderer/source-line-attributes.ts`: implement the
    custom rules that wrap default renderers for `paragraph_open`,
    `heading_open`, `list_item_open`, `blockquote_open`,
    `table_open`, `fence` (non-mermaid info), `html_block` to inject
    `data-source-line-start={token.map[0] + 1}` and
    `data-source-line-end={token.map[1]}` attributes (1-indexed
    inclusive per ASM-004).
  - `src/renderer/mermaid-fence-rule.ts`: override `fence` for `info
    === 'mermaid'` to emit `<div class="mermaid"
    data-source-line-start=... data-source-line-end=...><script
    type="text/x-mermaid">{HTML-escaped source}</script></div>`.
    HTML-escape ALL special chars including newlines (`\n` →
    `&#10;`) so the inner `<script>` survives CSP-safe encoding.
  - `src/renderer/diff-annotator.ts`: stub returning `[]` in
    v0.1 (real implementation TASK-030); when the stub returns
    empty, no `data-diff-state` attributes are injected.
- **Requirements**: REQ-CORE-005, REQ-CORE-007 AC-3, AC-4, REQ-DIFF-001
  (stub), DEP-003, ASM-004.
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: For a sample markdown with one heading, two
  paragraphs, one list, one mermaid fence, one non-mermaid fence, the
  rendered HTML contains seven elements with `data-source-line-start`
  attributes; the mermaid fence becomes a `<div class="mermaid">`; no
  `<script>` tags other than the embedded mermaid source survive in
  non-mermaid output.
- **Complexity**: Medium — multiple rule overrides, attribute hygiene.
- **Risks**: `token.map` is `null` for some token types (e.g., text
  inside inline tokens) — skip attribute injection when null, log at
  debug level (RISK-001).
- **Verification**: TC-030…037, TC-094 (no script in non-mermaid).
- **Rollback**: Delete `src/renderer/`; the CustomEditorProvider can
  display "Renderer unavailable — falling back to raw markdown"
  temporarily.

#### TASK-011: Implement Selection Mapper (`src/selection-mapper/`)

- **Description**: Implement the precise-with-coarse-fallback algorithm
  from `design.md` §3.2 Selection Mapper:
  - `src/selection-mapper/index.ts`: `mapSelection(payload + rawFileContent)`
    enforces the six-mode branching from `design.md` algorithm steps
    1–4. Returns `{ rightFileStart, rightFileEnd, mappingMode }`.
  - `src/selection-mapper/normalize.ts`: `normalize(rawText:
    string): { normalized: string, positionMap: Array<{ line: number,
    offset: number }> }` — strips `*`/`_` emphasis markers, backticks
    around inline code, link `[text](url)` retains `text` and discards
    `(url)`, leading list markers (`- `, `* `, `+ `, `1. `), table pipe
    separators, fence delimiters; maintains a per-char map of normalized
    index → (line, offset).
  - `src/selection-mapper/disambiguate.ts`: uses
    `textBeforeSelection.length` to pick the correct occurrence when
    the normalized selection appears more than once in the normalized
    block.
- **Requirements**: REQ-COMMENT-002 (all ACs), CON-004, RISK-001.
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: All six `MappingMode` enum values are
  reachable via constructed test inputs (validation phase v0.2,
  TC-050…058). Module is pure-function and throws on malformed input
  only after logging a clear error; returns a safe coarse default
  rather than crashing.
- **Complexity**: Large — non-trivial normalization, position
  bookkeeping, and disambiguation logic.
- **Risks**: Normalization can be subtly wrong on edge cases (nested
  emphasis, link text containing `*`, code spans with backticks
  inside). Mitigated by extensive TC-050…058 coverage in v0.2 and
  output-channel logging per REQ-COMMENT-002 AC-6 to surface real-world
  failure rates (OQ-9).
- **Verification**: TC-050…058 in v0.2; ad-hoc manual exercise in v0.1.
- **Rollback**: Replace `mapSelection` with a 5-line function that
  always returns `coarse-text-not-found` mode with the block range —
  reduces UX to v0.1's predecessor (block-level only) without breaking
  any caller.

#### TASK-012: Implement CSP builder (`src/views/csp.ts`)

- **Description**: Export `buildRenderedViewCsp({ nonce, webview }):
  string` and `buildCommentInputCsp({ nonce, webview }): string`
  producing the two CSP strings from `design.md` §6. Use
  `webview.cspSource` for `vscode-resource:` / `vscode-webview:`
  expansion. The rendered-view CSP carries the `style-src 'unsafe-inline'`
  exception with an adjacent inline JSDoc comment block explaining
  Mermaid's requirement (REQ-NFR-SEC-001 AC-3, ASM-009). Export a
  `generateNonce(): string` helper returning 32 chars of base62.
- **Requirements**: REQ-NFR-SEC-001, RISK-002 (CSP), RISK-010.
- **Dependencies**: TASK-004.
- **Acceptance Criteria**: TC-060 (CSP shape check), TC-062 (no inline
  script execution), TC-148 (nonce uniqueness across panels).
- **Complexity**: Small.
- **Risks**: Mermaid v10 may need additional `style-src` directives
  not yet captured — discovered only at first render; fix by tightening
  per-version.
- **Verification**: TC-060, TC-062, TC-148.
- **Rollback**: Delete file; both webview providers can temporarily
  emit the literal CSP strings inline (with the security risk that they
  drift apart).

#### TASK-013: Implement Rendered-View webview (`src/views/rendered-view/`)

- **Description**: Implement five files per `design.md` §7 project
  layout:
  - `index.html`: single-file shell that the CustomEditorProvider
    serves; loads `main.js` via the host-injected nonce; declares a
    single `<div id="root"></div>` and a `<style>` block consuming
    VS Code CSS variables (`var(--vscode-editor-background)`, etc.) for
    theme integration.
  - `main.ts`: bootstraps the webview, registers the postMessage
    listener for `init`/`threadCreated`/`threadsRefreshed`/`selectionCleared`/
    `error`/`staleCommit`; on `init`, calls `document.getElementById('root').innerHTML = payload.fileContent.html`
    (after a sanity check that the HTML came from our renderer — assert
    on the postMessage envelope, not on the HTML itself, since the
    renderer is trusted); calls `initMermaid()` lazily if any `.mermaid`
    div is present.
  - `selection-handler.ts`: registers `mouseup`/`keyup` listeners on
    `#root`; on each event, reads `window.getSelection()`, walks up
    to the nearest `[data-source-line-start]` ancestor, computes
    `containerKind`, `textBeforeSelection`, `selectedText`,
    `spansMultipleBlocks`, `spannedBlockRanges`, posts `selectionMade`.
  - `selection-highlight.ts`: applies/removes `.ado-pr-selected` CSS
    class on the Range's contents on `selectionMade` send and on
    `selectionCleared` receive; backed by `Range.surroundContents`
    where feasible, else by wrapping each `Text` node in a `<span>`.
  - `mermaid-loader.ts`: lazy-imports `mermaid` only when at least
    one `<div class="mermaid">` exists (REQ-CORE-007 AC-5); calls
    `mermaid.initialize({ securityLevel: 'strict', startOnLoad: false })`
    then iterates `.mermaid` divs, extracts the inner `<script
    type="text/x-mermaid">` text, calls `mermaid.render()` and
    replaces the div's contents with the resulting SVG. On error,
    leaves the source visible with an `.mermaid-error` class.
- **Requirements**: REQ-CORE-005 (with AC-3 text selection), REQ-CORE-007,
  REQ-COMMENT-001, REQ-COMMENT-002 (DOM side), REQ-NFR-SEC-001 AC-1.
- **Dependencies**: TASK-012, TASK-010.
- **Acceptance Criteria**: A markdown file with a mermaid block renders
  in a manual smoke test; selecting text in a paragraph posts a
  `selectionMade` message with the correct `containerKind`,
  `blockLineRange`, `textBeforeSelection.length`, and `selectedText`.
- **Complexity**: Large — five files, two of them with non-trivial DOM
  algorithms.
- **Risks**: `Range.surroundContents` throws on selections spanning
  partial nodes — fall back to per-Text-node wrapping; document the
  fallback path in `decisions.md`.
- **Verification**: TC-030…038, TC-016, TC-080.
- **Rollback**: Delete the directory; CustomEditorProvider can serve a
  placeholder HTML.

#### TASK-014: Implement CustomEditorProvider (`src/views/custom-editor-provider.ts`)

- **Description**: Implement `vscode.CustomReadonlyEditorProvider` for
  the `adopr://` scheme. `openCustomDocument(uri)` returns a thin
  document object (just the URI; no buffer needed). `resolveCustomEditor`
  sets up the webview with CSP from `csp.ts`, `localResourceRoots` for
  the extension's `out/` directory, HTML containing the nonce, and
  registers `onDidReceiveMessage`. On `ready` from the webview, fetches
  the rendered HTML for the URI's file via Session Manager and posts
  `init`. Wires `selectionMade` to Comment Controller; `selectionMade`
  responses (`selectionPosted` → InputView) flow through the controller,
  not through this provider. Maintains a `Map<string, vscode.WebviewPanel>`
  of opened panels, exposed to Session Manager via a getter.
- **Requirements**: REQ-CORE-001 AC-2, REQ-CORE-005, REQ-NFR-SEC-001.
- **Dependencies**: TASK-009, TASK-013.
- **Acceptance Criteria**: Opening `adopr://...` via
  `vscode.openWith(uri, 'adoMdReview.renderedView')` produces a tab with
  the rendered content; closing the tab disposes the panel and notifies
  Session Manager.
- **Complexity**: Medium.
- **Risks**: Webview disposal during in-flight async operations can
  cause "panel disposed" errors — guard every `postMessage` with a
  `panel.visible` / `panel.active` check; document the disposal-race
  pattern in `decisions.md`.
- **Verification**: TC-070…072.
- **Rollback**: Switch to a single `WebviewPanel` (the deferred
  v0.1-of-v0.1 fallback documented in `design.md` §5 Decision 2).

#### TASK-015: Implement FileTreeView (`src/views/file-tree-provider.ts`)

- **Description**: Implement `vscode.TreeDataProvider<FileNode>` per
  `design.md` §3.2 FileTreeView. `getChildren()` returns the
  session's markdown file list, each as a `TreeItem` with `label =
  filePath`, `description = "${threadCount} threads"` when > 0, and
  `command = { command: 'vscode.openWith', arguments: [adoprUri,
  'adoMdReview.renderedView'] }`. Fires `onDidChangeTreeData` whenever
  Session Manager updates the file list or thread counts.
- **Requirements**: REQ-CORE-006 (with AC-3 thread badges).
- **Dependencies**: TASK-004, TASK-009.
- **Acceptance Criteria**: TC-091, TC-092.
- **Complexity**: Small.
- **Risks**: None significant.
- **Verification**: TC-091, TC-092.
- **Rollback**: Replace with a Quick Pick that the command shows when
  the session opens (degraded UX but functional).

#### TASK-016: Implement CommentInputView (`src/views/comment-input/`)

- **Description**: Implement the sidebar `WebviewView` per `design.md`
  §3.2 CommentInputView and §7 project layout:
  - `index.html`: shell loading `main.js` with nonce-bound CSP
    (`buildCommentInputCsp`); root container holds a header line for
    `filePath`, a `<span class="mapping-mode-badge">`, a `<textarea>`,
    a Post button, and a Cancel button.
  - `main.ts`: registers postMessage handler for `selectionPosted` /
    `draftCleared` / `error`; on `selectionPosted` populates the
    textarea with `> ${autoQuote}\n\n` and focuses the textarea past
    the auto-quote; Post → `requestPostThread`; Cancel → `cancelDraft`.
  - `draft-editor.ts`: textarea state management; Post button disabled
    when bodyText is whitespace-only (auto-quote alone doesn't count).
  - `mapping-mode-badge.ts`: renders a styled badge for each
    `MappingMode` enum value; precise = green, coarse-* = amber with
    tooltip explaining why.
  - `src/views/comment-input-view-provider.ts`: implements
    `vscode.WebviewViewProvider`; calls `webviewView.show(false)` on
    `selectionPosted` (focus moves to textarea — REQ-COMMENT-001 AC-1
    affordance latency).
- **Requirements**: REQ-COMMENT-001 (AC-2, AC-3, AC-5),
  REQ-COMMENT-002 AC-6, REQ-COMMENT-003.
- **Dependencies**: TASK-012.
- **Acceptance Criteria**: TC-016, TC-080…082.
- **Complexity**: Medium.
- **Risks**: `webviewView.show(false)` may not move focus reliably
  across all VS Code versions — fall back to a registered focus
  command and an `aria-live` region for screen readers (document
  decision).
- **Verification**: TC-016, TC-080, TC-081, TC-082.
- **Rollback**: Replace with `vscode.window.showInputBox` (one-line
  comments only — degraded UX).

#### TASK-017: Implement Comment Controller (`src/comment-controller.ts`)

- **Description**: Implement the controller per `design.md` §3.2
  Comment Controller. Single class with three entry points:
  - `onSelectionMade(payload, originatingFileUri)`: calls
    `SelectionMapper.mapSelection`, builds `Draft`, stores in
    `Session.activeDraft`, builds `SelectionPostedPayload` (including
    `autoQuote` from rendered-block text truncated to 200 chars per
    REQ-COMMENT-003 AC-2), posts to CommentInputView. If a non-empty
    draft already exists, prompts the user (Save/Discard/Cancel) via
    `vscode.window.showWarningMessage` and acts accordingly.
  - `onRequestPostThread(payload)`: calls `AdoClient.createThread`;
    on success, sends `draftCleared` to InputView, sends
    `threadCreated + selectionCleared` to the originating
    rendered-view panel via `payload.originatingFileUri` lookup. On
    failure, sends `error` to InputView and leaves the draft intact.
  - `onCancelDraft()`: clears `Session.activeDraft`, sends
    `selectionCleared` to the originating rendered-view panel.
- **Requirements**: REQ-COMMENT-003, REQ-COMMENT-004, CON-005.
- **Dependencies**: TASK-008, TASK-011, TASK-014, TASK-016.
- **Acceptance Criteria**: TC-100…107.
- **Complexity**: Medium.
- **Risks**: Race between rapid Post invocations (OQ-6) — serialize
  via a single in-flight promise per Session; document in
  `decisions.md`.
- **Verification**: TC-100…107.
- **Rollback**: Inline the logic in CustomEditorProvider's message
  handler temporarily (loses the v0.4 stale-PR-watcher hook point).

#### TASK-018: Implement Session Manager (`src/session-manager.ts`)

- **Description**: Implement the orchestrator per `design.md` §3.2
  Session Manager. Class with `openSession(ref)` that wires together
  Auth → ADO Client → Renderer → CustomEditorProvider →
  FileTreeView → CommentInputView, populates `Session` state per
  §4.2, and registers `onDidDispose` handlers for the disposal cascade
  per §4.3.1. Exposes `requestRender(filePath)`, `getActiveSession()`,
  `closeSession()`, and an `onStateChanged` emitter consumed by the
  FileTreeView. Stores `fileContentCache: Map<string, string>` for
  Selection Mapper input.
- **Requirements**: REQ-CORE-002, REQ-CORE-006, REQ-NFR-UX-001 (cache
  prevents repeat auth prompts).
- **Dependencies**: TASK-014, TASK-015, TASK-016, TASK-017.
- **Acceptance Criteria**: Opening a PR populates the FileTreeView,
  pins the head SHA in `Session.headSha`, makes
  `adoMdReview.sessionActive` context true; closing the last
  rendered-view editor disposes the session (last-editor-closed
  signal).
- **Complexity**: Large — central wiring with multiple lifecycle
  events.
- **Risks**: Disposal ordering bugs (FileTreeView refreshing after
  Session is gone) — defensive `if (!this.session) return;` guards on
  every async callback path; document the pattern.
- **Verification**: Integrated through TC-150 (v0.1 smoke).
- **Rollback**: Inline in `extension.ts` temporarily (loses single
  testable wiring point).

#### TASK-019: Implement Command Registry (`src/command-registry.ts`)

- **Description**: Register five commands per `design.md` §3.2
  Command Registry: `adoMdReview.openPullRequest`,
  `adoMdReview.focusRenderedView`, `adoMdReview.focusCommentInput`,
  `adoMdReview.refreshThreads`, `adoMdReview.commentOnSelection`. The
  open-PR command prompts via `vscode.window.showInputBox`, calls
  `parsePrUrl`, and invokes `SessionManager.openSession`. The
  refresh-threads command calls `AdoClient.getThreads` and updates the
  session's threads cache. The focus and comment-on-selection commands
  proxy to the appropriate webview's `reveal()` / `show()` method.
- **Requirements**: REQ-CORE-001, REQ-UX-001 (focus action),
  REQ-UX-003 (keybinding hooks).
- **Dependencies**: TASK-018.
- **Acceptance Criteria**: All five commands appear in the Command
  Palette; running `adoMdReview.openPullRequest` with a valid URL
  opens a session.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: TC-120…122.
- **Rollback**: Move command registration into `extension.ts`.

#### TASK-020: Implement `extension.ts` (activate/deactivate)

- **Description**: Replace the v0.1 stub `extension.ts` with the full
  wiring: instantiate Logger, AuthManager, AdoClient, CustomEditorProvider,
  FileTreeViewProvider, CommentInputViewProvider, CommentController,
  SessionManager, CommandRegistry. Register all subscriptions on the
  `context.subscriptions` array. `deactivate()` closes the active
  session (if any) and disposes all subscriptions.
- **Requirements**: All v0.1 REQ-IDs reach this orchestrator.
- **Dependencies**: TASK-019.
- **Acceptance Criteria**: Activation completes within 100 ms (per
  `design.md` §7 performance budget); deactivation is clean
  (no zombie timers, no leaked panels).
- **Complexity**: Small.
- **Risks**: Circular dependencies in the wiring order; mitigated by
  pure-data type boundaries and event emitters.
- **Verification**: Manual smoke (TC-150).
- **Rollback**: Revert to the stub from TASK-001.

#### TASK-021: Finalize `package.json` contributions

- **Description**: Update `package.json` per `design.md` §4.1.3
  contributions table: commands, keybindings (`ctrl+alt+r`,
  `ctrl+alt+c`), configuration (`adoMdReview.defaultOrganization`,
  `defaultProject`, `staleCommitPollSeconds`), `viewsContainers.activitybar`
  with `adoMdReview` container, `views.adoMdReview` with two view IDs,
  `customEditors` for `adopr` scheme, `activationEvents`
  (`onCommand:adoMdReview.openPullRequest`,
  `onCustomEditor:adoMdReview.renderedView`,
  `onView:adoMdReview.fileTree`, `onView:adoMdReview.commentInput`).
  Replace the spike's `onStartupFinished` activation.
- **Requirements**: All `contributes`-anchored REQs.
- **Dependencies**: TASK-020.
- **Acceptance Criteria**: VS Code launches the extension without
  errors in the Output panel; all commands appear in palette; all
  configurations appear under Settings → Extensions → ADO Markdown
  PR Reviewer.
- **Complexity**: Small.
- **Risks**: `customEditors` `selector.filenamePattern` cannot easily
  match the `adopr://` scheme — confirmed by VS Code docs that scheme
  matching uses the `customEditors.selector.filenamePattern` =
  `**/*.md` PLUS the document URI's scheme; verify in TASK-014 spike.
- **Verification**: TC-122.
- **Rollback**: Revert to the minimal package.json from TASK-001.

#### TASK-022: Build and package v0.1 `.vsix`

- **Description**: Run `node esbuild.js --production` and `npx vsce
  package --no-yarn`. The produced `.vsix` is installable via `code
  --install-extension`. Smoke-test manually: install, open VS Code,
  invoke `adoMdReview.openPullRequest`, paste a real PR URL, exercise
  the round-trip (TC-150).
- **Requirements**: ASM-008 (`.vsix` sideload).
- **Dependencies**: TASK-021.
- **Acceptance Criteria**: `.vsix` is produced; `vsce ls` warnings
  reviewed; the manual round-trip (TC-150) succeeds end-to-end against
  a real PR. **This is the v0.1 phase gate.**
- **Complexity**: Small.
- **Risks**: `vsce` rejects the package due to missing icon / license —
  add a stub `LICENSE.md` and codicon-referenced icon if needed;
  document.
- **Verification**: TC-150 (must pass), TC-160, TC-161 (spike gates).
- **Rollback**: Delete `.vsix` and rebuild after fixing the failure;
  no source-level rollback needed for a packaging-only task.

#### TASK-023: Commit v0.1 milestone

- **Description**: `git add` all v0.1 source, the package-lock,
  `decisions.md`, and the `.vsix`. Commit with a message documenting
  v0.1 completion and any open OQ resolutions.
- **Dependencies**: TASK-022.
- **Acceptance Criteria**: Working tree clean; `git log --oneline`
  shows the v0.1 commit.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: `git status` returns no changes.
- **Rollback**: `git reset --hard HEAD~1`.

### Phase 2 (v0.2): Tests + existing-thread display

Goal: a v0.1 user can also **see existing threads as inline markers**
in the rendered view, and the implementation is backed by an automated
unit-test suite so subsequent changes don't regress the v0.1 behavior.

#### TASK-024: Add Mocha test harness

- **Description**: Add `@vscode/test-cli`, `@vscode/test-electron`,
  `mocha`, `chai` (or built-in `assert`) as dev dependencies.
  Configure `.vscode-test.mjs` per the VS Code testing-extensions
  guide. Add `npm test` script. Add `test/unit/` directory for
  pure-function tests (no VS Code API) and `test/integration/`
  directory for tests that activate the extension. Author one
  no-op test in each directory that just asserts `true`.
- **Requirements**: §5 design decision "Test framework — minimal in
  v0.1, mocha for v0.2+".
- **Dependencies**: TASK-023.
- **Acceptance Criteria**: `npm test` exits 0 with both tests
  passing.
- **Complexity**: Medium — first-time setup of `@vscode/test-electron`
  can have headless-display quirks on Windows.
- **Risks**: `@vscode/test-electron` requires Internet to download VS
  Code on first run; cache directory must be writable.
- **Verification**: `npm test` exit code.
- **Rollback**: Delete test files and the dev deps; degrade back to
  v0.1 manual-only.

#### TASK-025: Author unit tests for v0.1 surface

- **Description**: Author tests covering:
  - `test/unit/pr-url-parser.test.ts`: TC-001…005.
  - `test/unit/selection-mapper/normalize.test.ts`: positive cases
    for emphasis, code, links, list markers (informs TC-050…055).
  - `test/unit/selection-mapper/disambiguate.test.ts`: ambiguous and
    unique cases (TC-056, TC-057).
  - `test/unit/selection-mapper/index.test.ts`: one constructed
    input per `MappingMode` enum value (TC-050…058 — the
    enum-coverage mandate from `design.md` §3.2).
  - `test/unit/logger.test.ts`: TC-145 (token redaction).
  - `test/unit/renderer/source-line-attributes.test.ts`: TC-031,
    TC-032, TC-037.
  - `test/unit/renderer/mermaid-fence-rule.test.ts`: TC-033, TC-038.
- **Requirements**: All REQ-IDs tagged for unit-test coverage in
  `validation-plan.md` §5.
- **Dependencies**: TASK-024.
- **Acceptance Criteria**: `npm test` shows all tests green; tested
  modules' branch coverage observed informally (no enforced threshold
  in v0.2).
- **Complexity**: Large — many small tests, each requiring fixture
  data.
- **Risks**: Mocha `import` ESM mismatch with the bundler's CJS output —
  if hit, configure mocha to use a TS loader (ts-node/esm or tsx).
- **Verification**: Test runner output.
- **Rollback**: Delete the failing test files (last resort — usually
  fixable).

#### TASK-026: Wire existing-thread display

- **Description**: Implement the marker injection per `design.md`
  §3.2 Rendered-View Webview "Marker handling". On `init` and
  `threadsRefreshed` postMessages, for each thread with
  `threadContext.rightFileStart.line` set, find the block element
  whose `data-source-line-start..end` range contains that line and
  append a `<button class="ado-thread-marker">` to it. Click → show
  a positioned `<div class="ado-thread-popover">` rendering the
  thread's `comments[]` via the same `markdown-it` bundle. (Popover
  renders read-only; no reply UX per CON: v1 scope.)
- **Requirements**: REQ-COMMENT-005 (full), REQ-COMMENT-006.
- **Dependencies**: TASK-023.
- **Acceptance Criteria**: TC-104, TC-105.
- **Complexity**: Medium.
- **Risks**: Popover positioning at viewport edges — clamp to viewport;
  document fallback (popover anchored to marker even if it overflows).
- **Verification**: TC-104, TC-105.
- **Rollback**: Remove the marker injection block (rendered view
  continues to work, just without markers).

#### TASK-027: Multi-file PR file-switching polish

- **Description**: Ensure switching between files in the FileTreeView
  preserves session state (`headSha` per REQ-CORE-006 AC-2), updates
  the `adoMdReview.renderedViewFocused` context when each editor
  becomes active, and updates the comment-thread-count badge per file
  (REQ-CORE-006 AC-3). Add the badge-update path to
  `SessionManager.onThreadsRefreshed`.
- **Requirements**: REQ-CORE-006 (full).
- **Dependencies**: TASK-026.
- **Acceptance Criteria**: TC-091, TC-092 confirmed against a 3-file
  PR.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: TC-091, TC-092.
- **Rollback**: Revert this commit; v0.2 thread display still works.

#### TASK-028: Commit v0.2 milestone

- **Description**: `git add` all v0.2 source, test files, package-lock
  updates. Commit with message documenting v0.2 completion and any
  remaining OQs.
- **Dependencies**: TASK-025, TASK-026, TASK-027.
- **Acceptance Criteria**: `npm test` green; manual smoke against a
  real PR with existing threads (TC-150, TC-152) green; `git log
  --oneline` shows the v0.2 commit.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: `npm test` + manual smoke.
- **Rollback**: `git reset --hard HEAD~1`.

### Phase 3 (v0.3): Diff awareness

#### TASK-029: Implement merge-base resolution in ADO Client

- **Description**: Replace the v0.1 stub `AdoClient.getMergeBaseSha`
  with a real implementation: call `/_apis/git/repositories/{repoId}/pullRequests/{prId}/iterations?api-version=7.1&$top=1`,
  read `commonRefCommit.commitId` from the last iteration entry. Add
  `AdoClient.getFileContentOrNull(repoId, sha, path)` that returns
  `null` instead of throwing on 404 (used when a file doesn't exist
  at the merge-base per REQ-DIFF-002 AC-2).
- **Requirements**: REQ-DIFF-002.
- **Dependencies**: TASK-028.
- **Acceptance Criteria**: For a PR with a known merge-base, the
  returned SHA matches the ADO web UI's diff base.
- **Complexity**: Small.
- **Risks**: Iteration response shape differs from what's documented
  — verify against a real PR; document any deviation.
- **Verification**: TC-040 (informally), TC-150 smoke.
- **Rollback**: Restore the stub returning `''`.

#### TASK-030: Implement Diff Annotator

- **Description**: Replace the v0.1 stub
  `src/renderer/diff-annotator.ts` with the real block-level
  diff per `design.md` §3.2 Diff Annotator. Tokenize both versions
  via the shared `markdown-it` instance, compute SHA-1 hashes of
  each block's normalized text (strip whitespace, lowercase),
  run a Myers diff (use the existing `diff` npm package on the hash
  sequence — added as a dep here), map diff hunks back to head-version
  block line ranges. Emit `DiffAnnotation[]` consumed by the
  source-line-attributes renderer rule to add `data-diff-state` to
  affected blocks.
- **Requirements**: REQ-DIFF-001 (all ACs), RISK-006.
- **Dependencies**: TASK-029.
- **Acceptance Criteria**: TC-040…044.
- **Complexity**: Large.
- **Risks**: Tokenization differences between head and base on
  borderline blocks (e.g., a paragraph that lost a trailing space)
  — normalization should be tolerant; document any edge cases hit.
- **Verification**: TC-040…044.
- **Rollback**: Restore stub returning `[]`; gutter bars vanish but
  rendered view continues to function.

#### TASK-031: Wire diff gutter bars in rendered view

- **Description**: Add CSS rules to `src/views/rendered-view/index.html`'s
  `<style>` block that draws left-gutter color bars per
  `data-diff-state` attribute (green = added, blue = modified, neutral
  = unchanged, dashed = context-of-deletion). Add a hover-handler that
  shows the deleted content for context-of-deletion blocks.
- **Requirements**: REQ-DIFF-001 AC-1, AC-2, AC-3, AC-4.
- **Dependencies**: TASK-030.
- **Acceptance Criteria**: A PR with one added, one modified, and one
  deleted paragraph displays the three gutter states correctly in a
  manual smoke (TC-153).
- **Complexity**: Small.
- **Risks**: VS Code theme variables for "green-ish" not standardized
  — use `var(--vscode-diffEditor-insertedTextBackground)` and analogs
  documented in the VS Code Theme Color reference.
- **Verification**: TC-153.
- **Rollback**: Remove the CSS rules; data attributes still present
  but invisible.

#### TASK-032: Commit v0.3 milestone

- **Description**: Commit Phase 3 work.
- **Dependencies**: TASK-031.
- **Acceptance Criteria**: `npm test` green; TC-153 passes manually;
  `git log --oneline` shows the v0.3 commit.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: `npm test` + manual TC-153.
- **Rollback**: `git reset --hard HEAD~1`.

### Phase 4 (v0.4): Daily-use polish

#### TASK-033: Implement Status Bar Controller (`src/status-bar.ts`)

- **Description**: Implement `StatusBarController` with `show(session,
  file)` and `hide()` per `design.md` §3.2 Status Bar Controller.
  Item text: `$(comment-discussion) MD Review: PR ${prId} — ${fileName}`.
  Click action: `adoMdReview.focusRenderedView`. Wire to
  `SessionManager.onStateChanged` + `vscode.window.onDidChangeActiveTextEditor`.
- **Requirements**: REQ-UX-001 (all ACs).
- **Dependencies**: TASK-032.
- **Acceptance Criteria**: TC-120.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: TC-120.
- **Rollback**: Delete file; remove subscription from `extension.ts`.

#### TASK-034: Implement Stale-PR Watcher (`src/stale-pr-watcher.ts`)

- **Description**: Implement `StalePRWatcher.start(session)` /
  `.stop()` per `design.md` §3.2 Stale-PR Watcher. Uses
  `setInterval(..., pollSeconds * 1000)` with `pollSeconds` clamped to
  `[15, 60]` from `adoMdReview.staleCommitPollSeconds` setting (default
  30). On each tick, calls `AdoClient.getPullRequest(ref)` and compares
  `lastMergeSourceCommit.commitId` to `session.headSha`. On advance,
  posts `staleCommit` to all open rendered-view panels. After 3
  consecutive failures, logs a warn-level summary; doesn't surface as
  user error (background concern).
- **Requirements**: REQ-ERR-002 (all ACs), RISK-004.
- **Dependencies**: TASK-032.
- **Acceptance Criteria**: TC-110, TC-111, TC-112.
- **Complexity**: Medium.
- **Risks**: Timer leak if `stop()` not called on session disposal —
  guard via `Session.dispose()` cascade in TASK-018, verify via the
  smoke gate.
- **Verification**: TC-110, TC-111, TC-112.
- **Rollback**: Remove file and registration; sessions stay pinned
  indefinitely (v0.3 behavior).

#### TASK-035: Implement 401 silent-retry path

- **Description**: Wire the `Auth Manager.onTokenInvalid` event (declared
  in TASK-007) to a one-shot retry in `AdoClient`: on first 401, call
  `getToken({ silent: false })`, retry the request once, fail loudly on
  second 401 (REQ-AUTH-002 AC-2). Add a request-level retry counter so a
  single user request never triggers more than one auth prompt.
- **Requirements**: REQ-AUTH-002 (all ACs).
- **Dependencies**: TASK-032.
- **Acceptance Criteria**: TC-013, TC-014 (negative — second 401
  surfaces).
- **Complexity**: Small.
- **Risks**: Refresh loop if the auth provider returns the same
  expired token; mitigated by the single-retry cap.
- **Verification**: TC-013, TC-014.
- **Rollback**: Revert to v0.3's "401 = throw" behavior.

#### TASK-036: Comprehensive error handling

- **Description**: Audit every `catch` block and ADO REST call site;
  ensure every error path either surfaces a `vscode.window.show*Message`
  or routes to an existing recovery path. Add the
  `vscode.window.showErrorMessage(..., 'Open Output')` action button
  pattern per `design.md` §7 error surfacing. Add the
  `errorRegion` postMessage path to both webviews so renderer / input
  failures display in-context per REQ-ERR-003 AC-1.
- **Requirements**: REQ-ERR-001 (all ACs), REQ-ERR-003 (all ACs),
  RISK-008.
- **Dependencies**: TASK-035.
- **Acceptance Criteria**: TC-130, TC-131, TC-132, TC-133.
- **Complexity**: Medium.
- **Risks**: Missing a code path → ungraceful failure; mitigated by
  the audit checklist enforced by code review and the test cases.
- **Verification**: TC-130…133.
- **Rollback**: Revert specific catch blocks; partial rollback OK.

#### TASK-037: Settings + keybindings polish

- **Description**: Confirm `package.json` `configuration` entries from
  TASK-021 produce a clean Settings UI; add `markdownDescription`
  fields with concrete examples; verify default keybindings are
  active and overridable; add a "When clause" tooltip showing
  `adoMdReview.renderedViewFocused` activation context.
- **Requirements**: REQ-UX-002, REQ-UX-003.
- **Dependencies**: TASK-032.
- **Acceptance Criteria**: TC-121, TC-122.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: TC-121, TC-122.
- **Rollback**: Revert `package.json` snippets.

#### TASK-038: Commit v0.4 milestone

- **Description**: `git add` all v0.4 work; commit.
- **Dependencies**: TASK-033, TASK-034, TASK-035, TASK-036, TASK-037.
- **Acceptance Criteria**: `npm test` green; TC-154 passes (30-min
  real-PR review without forced fallback to ADO web).
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: `npm test` + manual TC-154.
- **Rollback**: `git reset --hard HEAD~1`.

### Phase 5: Distribution

#### TASK-039: Author README.md user guide

- **Description**: Replace the stub README with: install instructions
  (sideload via `.vsix`), getting-started walkthrough (open PR by URL,
  select text, post comment), settings reference, known limitations
  (out-of-scope items from `requirements.md` §2.2), troubleshooting
  (output channel, common auth failure modes), version-to-version
  capability matrix.
- **Requirements**: ASM-008 (`.vsix` sideload instructions).
- **Dependencies**: TASK-038.
- **Acceptance Criteria**: A first-time user can install and round-trip
  a comment using only the README (validated by re-reading after a
  break, or by attempting install in a clean VS Code profile).
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: Self-review.
- **Rollback**: Restore prior README.

#### TASK-040: Build final distributable `.vsix`

- **Description**: Bump the `package.json` version to `0.4.0`, run
  `node esbuild.js --production && npx vsce package --no-yarn`, save
  the resulting `.vsix` to the repo root, commit.
- **Requirements**: ASM-008.
- **Dependencies**: TASK-039.
- **Acceptance Criteria**: `.vsix` installs cleanly in a fresh VS
  Code window; smoke (TC-154) passes against a real PR.
- **Complexity**: Small.
- **Risks**: None.
- **Verification**: TC-154 (manual final gate).
- **Rollback**: Delete `.vsix`; re-run after fix.

## 5. Dependency Graph

```
TASK-001 ── TASK-002 ── TASK-003 ── TASK-004 ┬─ TASK-005 ──┬─ TASK-007 ── TASK-008 ┐
                                              │              │                       │
                                              ├─ TASK-006    │                       │
                                              ├─ TASK-009 ───┼───────────────────────┤
                                              ├─ TASK-010 ───┼───────────────────────┤
                                              ├─ TASK-011 ───┼───────────────────────┤
                                              └─ TASK-012 ──┬┴─ TASK-013 ── TASK-014 ┤
                                                            │                        │
                                                            ├─ TASK-015 ─────────────┤
                                                            ├─ TASK-016 ─────────────┤
                                                            └────────────── TASK-017 ┤
                                                                                     │
                                                                          TASK-018 ──┤
                                                                          TASK-019 ──┤
                                                                          TASK-020 ──┤
                                                                          TASK-021 ──┤
                                                                          TASK-022 ──┤
                                                                          TASK-023 ──┤
                                                                                     │
                                          ┌────────────────────────────── TASK-024 ──┤
                                          ├────── TASK-025 ──────────────────────────┤
                                          ├────── TASK-026 ──────────────────────────┤
                                          ├────── TASK-027 ──────────────────────────┤
                                          └────── TASK-028 ──────────────────────────┤
                                                                                     │
                                          ┌────── TASK-029 ── TASK-030 ── TASK-031 ──┤
                                          └────── TASK-032 ──────────────────────────┤
                                                                                     │
                                          ┌────── TASK-033 ──────────────────────────┤
                                          ├────── TASK-034 ──────────────────────────┤
                                          ├────── TASK-035 ──────────────────────────┤
                                          ├────── TASK-036 ──────────────────────────┤
                                          ├────── TASK-037 ──────────────────────────┤
                                          └────── TASK-038 ──────────────────────────┤
                                                                                     │
                                                                  TASK-039 ──────────┤
                                                                  TASK-040
```

**Critical path** (longest dependency chain that determines minimum
time-to-feature-complete):

`TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-007 →
TASK-008 → TASK-017 → TASK-018 → TASK-019 → TASK-020 → TASK-021 →
TASK-022 → TASK-023 → TASK-026 → TASK-028 → TASK-029 → TASK-030 →
TASK-031 → TASK-032 → TASK-034 (longest v0.4 single-track) → TASK-038 →
TASK-039 → TASK-040`

The renderer pipeline (TASK-010), selection mapper (TASK-011), and
webview shells (TASK-013, TASK-015, TASK-016) can be developed in
parallel with the auth/ADO/controller path but all converge at
TASK-018 (Session Manager) before the v0.1 milestone can ship.

## 6. Risk Assessment

| Risk ID | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| IRISK-001 | Microsoft auth provider's `.default` scope does not yield a token usable for `POST /threads` (OQ-2 / RISK-003). | Medium | High — blocks comment posting. | TASK-007 spike resolves before TASK-008 depends on it; PAT-fallback path documented; impact contained to a single component swap. |
| IRISK-002 | `markdown-it` `token.map` is `null` for certain block types in real-world design docs (RISK-001). | Medium | Medium — selections in those blocks resolve to ancestor's range, sometimes the whole document. | TASK-010 logs all null-map tokens at debug; OQ-9 telemetry surfaces real-world rate; can patch with custom tokenization for offending types in v0.5+. |
| IRISK-003 | Mermaid v10 with `securityLevel: 'strict'` requires `unsafe-eval` in CSP under some browsers / VS Code Electron versions (RISK-010). | Medium | Medium — diagrams don't render. | TASK-013 spike (TC-038, TC-164) detects this immediately; fall back to v11 or ASM-009's extension-host pre-render. |
| IRISK-004 | ADO `threadContext` `offset` indexing differs from assumed 1-indexed (ASM-004 / OQ-1). | Medium | Low — comments anchor one line/offset off; quickly diagnosable. | TASK-008 + TC-160 spike on first POST; single fix in `createThread` payload assembly. |
| IRISK-005 | `vsce` packaging rejects the bundle for missing icon, license, or repository URL. | Low | Low — packaging-time error, no source impact. | Stub `LICENSE` (MIT for personal use), 128×128 PNG icon, `repository.url` pointing at the local path. |
| IRISK-006 | Disposal-cascade bugs in Session Manager cause webview panels to outlive their session (zombie panels). | Medium | Medium — UX confusion, memory growth. | Defensive `if (!session) return;` guards on every async callback; explicit `Session.dispose()` cascade test in v0.2 (TC-074). |
| IRISK-007 | esbuild's webview-bundle config produces non-CSP-compatible output (e.g., inline source maps that violate `script-src`). | Low | Medium — webview fails to load with CSP violation in console. | Configure esbuild to emit source maps as separate files (`sourcemap: 'external'`); verify in TASK-013 manual smoke. |
| IRISK-008 | `@vscode/test-electron` cannot download VS Code in the autonomy window due to network / proxy issues. | Low | Medium — blocks TASK-024…025. | Pre-warm the cache before disconnecting; fall back to documenting unit tests as "to be run manually" and shipping them anyway. |

## 7. Verification Strategy

- **Per-phase manual smoke** is the primary acceptance gate, mapped to
  `validation-plan.md` §7.2:
  - v0.1: TC-150 (round-trip), TC-151 (multi-file), TC-160, TC-161
    (spike gates). All must pass on a real PR before TASK-023.
  - v0.2: TC-150 still passes, TC-152 (existing-thread display),
    TC-148 (CSP nonce discipline). `npm test` green.
  - v0.3: TC-153 (visual diff match vs ADO web). `npm test` green.
  - v0.4: TC-154 ("personally dogfoodable" — 30-min real review with
    no forced ADO-web fallback, no restart, no re-auth prompt).
    `npm test` green.
- **Per-task verification** is named in each task's "Verification"
  field, referencing the relevant TC-IDs from `validation-plan.md`.
- **Continuous regression** is via `npm test` after v0.2; a phase
  cannot ship if `npm test` regresses.
- **Final acceptance**: a real-PR review for 30 minutes without
  forced fallback to the ADO web UI (TC-154 = personal-dogfoodable
  gate per the user's "no irritation" success criterion).

## 8. Open Questions

These are operational unknowns that the implementer must resolve and
document in `decisions.md` as work proceeds. The plan itself does not
block on them — each task above lists the spike that resolves the
relevant question.

- **OQ-A**: Is Node 20's built-in `fetch` (undici) preferable to
  `node-fetch@^3` for the ADO Client? **Resolution path**: choose at
  TASK-002; document in `decisions.md`. Working hypothesis: built-in
  `fetch`, since it eliminates a dep without functionality loss.
- **OQ-B**: Should mermaid be v10 or v11? **Resolution path**: TASK-002
  initial pick + TASK-013 verification; fall back if CSP fails.
- **OQ-C**: Does `@vscode/test-electron` need a custom display variable
  on the build machine? **Resolution path**: TASK-024 first run.
- **OQ-D**: What's the right CSS variable for the "modified" gutter
  color (blue) — VS Code doesn't natively have a "diff-modified" theme
  color? **Resolution path**: TASK-031; pick from
  `--vscode-gitDecoration-modifiedResourceForeground` or a custom
  hardcode; document.
- **OQ-E**: Inherits `OQ-1` through `OQ-9` from `design.md` §8 —
  resolved by the named spikes in TASK-007, TASK-008, TASK-013, etc.

## 9. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-02 | Pipeline stage `plan-implementation` (PromptKit, persona: `software-architect`); consumes `requirements.md` v0.3 + `design.md` v0.2 + `validation-plan.md` v1.0 | Initial implementation plan. 40 ordered tasks across 5 phases (init + v0.1…v0.4 + distribution). Critical path identified. 8 implementation risks (IRISK-001…008) cataloged with mitigations. Open questions OQ-A…E noted as operational items the implementer will resolve during execution; OQ-1…OQ-9 from design doc routed to the relevant spike tasks. |
