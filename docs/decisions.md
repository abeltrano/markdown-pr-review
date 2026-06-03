# Decisions Log — ADO Markdown PR Reviewer

This file records every decision made during autonomous implementation
that resolves an ambiguity, an `[UNKNOWN]` flag, or an `OQ-*` open
question from `requirements.md`, `design.md`, `validation-plan.md`,
or `implementation-plan.md`.

Each entry has: date/time, decision context, the choice made, the
rationale, and links back to the relevant requirement / open question.

---

## D-001 (2026-06-02 22:30 PT) — `.gitignore` baseline

- **Context**: TASK-001 Initialize repository scaffold.
- **Decision**: Include `node_modules/`, `out/`, `dist/`,
  `*.tsbuildinfo`, `.vscode-test/`, `*.vsix`, `Thumbs.db`, `.DS_Store`,
  `.env*`, `*.local`, `*.code-workspace` in `.gitignore`. Commit
  the lockfile (`package-lock.json`) per Node convention.
- **Rationale**: Standard VS Code extension hygiene. `.vsix` excluded
  from source because the build output should not be committed; the
  final distributable will be tracked separately under release tagging.
- **REQ/OQ**: None (preparatory).

---

## D-002 (2026-06-02 22:30 PT) — Initial commit content

- **Context**: Establishing baseline.
- **Decision**: First commit contains only the four docs
  (`requirements.md` v0.3, `design.md` v0.2, `validation-plan.md` v1.0,
  `implementation-plan.md` v0.1) and `.gitignore`. No source yet.
- **Rationale**: Keeps the docs commit cleanly separable from any
  source mistake during the implementation pass.
- **REQ/OQ**: None.

---

<!-- Future entries appended below this line as implementation
     proceeds. Format: D-NNN (date time) — title; Context; Decision;
     Rationale; REQ/OQ. -->

---

## D-011 (2026-06-03 02:50 PT) — Mermaid bundled into rendered-view IIFE via dynamic import

- **Context**: TASK-013 webview bundling. Mermaid v10 is ESM-only;
  shipping a separate `mermaid.js` script tag inside the webview was
  the alternative.
- **Decision**: Bundle mermaid into `rendered-view/main.js` via a
  dynamic `import('mermaid')` inside `mermaid-loader.ts`. esbuild
  inlines it at bundle time; runtime cost is paid only on init.
- **Rationale**: Simpler CSP — no extra script tag, only the
  per-panel nonce. Production bundle is 3.3 MB (compressed in vsix)
  which is acceptable for a personal-use tool. Alternative
  (separate script tag with nonce) doubles the surface area for CSP
  bugs without saving bytes.
- **REQ/OQ**: REQ-NFR-SEC-001 AC-3, ASM-009; design.md §3.2 Mermaid
  fence rule.

---

## D-012 (2026-06-03 02:50 PT) — `moduleResolution: Bundler` over `Node16`

- **Context**: TASK-013 — markdown-it deep imports + mermaid ESM
  imports conflicted with `moduleResolution: Node16`'s strict CJS/ESM
  interop rules.
- **Decision**: Switch `tsconfig.json` to
  `"module": "ESNext", "moduleResolution": "Bundler"`. The actual
  emission is done by esbuild (host: CJS, webviews: IIFE), not by
  tsc, so the type-checker can match the bundler's resolution rules.
- **Rationale**: This is the TypeScript-recommended setup for any
  project that uses an external bundler. Tsc is used only for type
  validation (`--noEmit`); esbuild knows how to handle deep imports
  and ESM-only packages in either output format.
- **REQ/OQ**: None.

---

## D-013 (2026-06-03 02:50 PT) — Refresh-to-Head stub in v0.1

- **Context**: TASK-019 command-registry. The Refresh-to-Head command
  is a v0.4 feature (TASK-034) per the implementation plan, but it
  needs to exist now so the F5 keybinding doesn't crash.
- **Decision**: v0.1 stub shows an info toast ("close + reopen the
  PR in v0.1") and logs the request. v0.4 will replace it with the
  full polling + refresh implementation.
- **Rationale**: Better to ship the binding and a clear deferred-
  feature message than to leave the keystroke silently failing.
- **REQ/OQ**: REQ-PR-005 (deferred to v0.4).

---

## D-014 (2026-06-03 02:50 PT) — Selection-Made minimum char length defaults to 1

- **Context**: TASK-013 selection-handler. The webview captures the
  user's selection on `mouseup` / `keyup`. A single accidentally-
  dragged character would fire `selectionMade` constantly.
- **Decision**: Default `minLength = 1`. Future iteration may raise
  this to 2 or 3 if posting accidental single-char comments becomes
  a real problem.
- **Rationale**: User pain point is reviewers wanting to comment on
  precise items including small inline tokens like `&nbsp;` or
  punctuation. Filtering at 1 char keeps the door open; the host
  can still reject zero-length normalized selections downstream.
- **REQ/OQ**: REQ-COMMENT-001.

---

## D-016 (2026-06-03 04:00 PT) — html_block deferred under html:false safer default

- **Context**: TASK-025 unit-test pass uncovered that markdown-it
  configured with `html: false` (the safer setting per
  REQ-NFR-SEC-001 AC-2) does NOT emit `html_block` tokens; raw HTML
  is rendered as escaped text inside a paragraph. Design.md and
  validation TC-032 assumed html_block tokens would fire.
- **Decision**: Keep `html: false` for v0.2. TC-032 test updated to
  verify the safer behaviour (raw HTML escaped, source-line attrs on
  the host paragraph). Block-level HTML (e.g. `<details>`) does NOT
  render as a live element in v0.2.
- **Rationale**: `html: true` would require a sanitization layer
  (e.g. DOMPurify, ~50 KB extra bundle, more CSP work). For personal
  use against trusted PR authors this is acceptable trade-off; the
  feature can be re-enabled in v0.4+ behind a sanitizer.
- **REQ/OQ**: REQ-CORE-005 AC-1 (partial — html_block re-enablement
  deferred); REQ-NFR-SEC-001 AC-2 (satisfied with stronger guarantee).

---

## D-017 (2026-06-03 04:00 PT) — Mermaid renderer rule registered BEFORE source-line attributes

- **Context**: TASK-025 unit tests showed mermaid blocks rendered
  without `data-source-line-start/end` attrs because the mermaid
  rule was registered AFTER source-line-attributes, so it intercepted
  `fence` and bypassed the annotator chain.
- **Decision**: In `createMarkdownIt()`, call
  `applyMermaidFenceRule(md)` first, then
  `applySourceLineAttributes(md)`. Source-line wraps mermaid as
  prior, annotates the token, then delegates — preserving both
  behaviours.
- **Rationale**: Order matters because each rule overwrites the same
  `md.renderer.rules.fence` slot and captures the previous slot as
  `prior`. Source-line is universally additive (just annotates +
  delegates), so it MUST wrap the more specialised rules.
- **REQ/OQ**: REQ-COMMENT-002 AC-1; REQ-CORE-007 AC-1, AC-2.

---

## D-018 (2026-06-03 04:00 PT) — Extracted `redactAuthHeaders` to `src/redact.ts`  

- **Context**: TASK-025 needed to unit-test `redactAuthHeaders`,
  which was defined in `src/logger.ts`. Logger top-imports `vscode`,
  so importing the function in plain mocha threw
  `Cannot find module 'vscode'`.
- **Decision**: Move `redactAuthHeaders` + supporting constants to a
  new pure module `src/redact.ts` (no vscode dependency). Logger
  re-exports them for backward compatibility. Logger.ts also gains a
  new `redactJwtsAndUrlTokens` helper for the `write()` method's
  message sanitization (which now catches access_token /
  refresh_token URL query parameters too).
- **Rationale**: Standard separation-of-concerns; preferred over a
  vscode-stub require hook because it makes the pure logic
  independently testable forever.
- **REQ/OQ**: REQ-NFR-MAINT-001 AC-1; TC-145.

---

## D-019 (2026-06-03 04:00 PT) — Test harness: plain mocha + tsx loader (no @vscode/test-electron)

- **Context**: TASK-024 test infrastructure choice. Implementation
  plan suggested `@vscode/test-electron` for integration tests.
- **Decision**: For v0.2, use plain `mocha` with the `tsx` Node
  loader (registered via `.mocharc.cjs` `node-option:
  ['import=tsx']`) for unit tests only. No `@vscode/test-electron`,
  no integration tests yet.
- **Rationale**: All v0.2-targeted unit tests are pure functions (no
  vscode runtime needed). `@vscode/test-electron` adds 100+ MB
  download + Windows headless quirks (IRISK-008). Plain mocha+tsx is
  zero-config, runs in <100 ms, and covers everything REQ-NFR-MAINT-001
  requires for v0.2. Integration tests deferrable to v0.4 polish.
- **REQ/OQ**: REQ-NFR-MAINT-001 AC-2; IRISK-008.

---

## D-020 (2026-06-03 04:00 PT) — Thread popover renders plain-text comment content

- **Context**: TASK-026 marker → popover wiring. Design.md §3.2 says
  `rendering the thread's comments[] via the same markdown-it bundle`.
  But markdown-it is NOT in the rendered-view webview bundle (we
  render in the host and ship HTML).
- **Decision**: For v0.2, render comment content as plain text via
  `textContent` (with CSS `white-space: pre-wrap`). Markdown
  rendering of comments is deferred.
- **Rationale**: Avoids shipping markdown-it (~150 KB) to the webview
  bundle; plain text is sufficient for the v0.2 scope. The popover
  structure (header / comments list / footer) is unchanged, so
  switching to rendered markdown later is a 1-line change inside
  `buildPopover()`.
- **REQ/OQ**: REQ-COMMENT-005 AC-1 (satisfied); REQ-COMMENT-005 AC-2
  (deferred — formatting fidelity).

---

## D-015 (2026-06-03 02:50 PT) — Bare-PR-id repositoryName left empty

- **Context**: TASK-007. Bare-id parse path can't infer the repo
  without a fourth setting; design.md is silent on the trade-off.
- **Decision**: Return `repositoryId: ''` and `repositoryName: ''`
  for bare-id input. SessionManager's first ADO call will surface
  a clear "repo unknown" failure if the user lacks a default repo
  hint.
- **Rationale**: Adding a 3rd setting (defaultRepository) would
  require either a UI to manage it or a one-off prompt — both
  outside v0.1 scope. Letting the failure surface gives users a
  clear signal to enter a full URL instead.
- **REQ/OQ**: REQ-PR-001.

---

## D-003 (2026-06-03 02:10 PT) — Node 20 built-in `fetch` (no `node-fetch`)

- **Context**: TASK-008 (`src/ado-client.ts`) HTTP layer.
- **Decision**: Use the built-in `fetch` global from Node 20.x rather
  than adding a `node-fetch` runtime dependency.
- **Rationale**: VS Code 1.85+ ships with Node 20.x. Built-in fetch is
  spec-compliant, supports streaming, and removes 1 dep. The `undici`
  engine-warning during `npm install` is irrelevant because that package
  is pulled in only transitively and is not on our import path.
- **REQ/OQ**: REQ-INFRA-001; design.md §4.1.1 (placeholder noted no
  preference).

---

## D-004 (2026-06-03 02:10 PT) — Mermaid v10.9.1 (defer v11 evaluation)

- **Context**: TASK-002 / TASK-013 mermaid runtime selection.
- **Decision**: Pin `mermaid@^10.9.1` for v0.1. Defer evaluation of
  v11.x until TASK-013 implementation surfaces real CSP issues.
- **Rationale**: v10.9.1 is the latest 10.x release tested by
  ASM-009 (design.md §6.1) and known to work under
  `style-src 'unsafe-inline'`. v11 ships a different bundling model
  whose CSP profile we have not validated.
- **REQ/OQ**: REQ-NFR-SEC-001 AC-3, ASM-009.

---

## D-005 (2026-06-03 02:10 PT) — Bare-ID PR input requires both default org and project

- **Context**: TASK-007 (`src/pr-url-parser.ts`) input acceptance.
- **Decision**: When the user enters a bare numeric PR id, both
  `adoMdReview.defaultOrganization` AND `adoMdReview.defaultProject`
  settings must be populated. Missing either yields a
  `missing-org`/`missing-project` parse error.
- **Rationale**: Avoids a second interactive prompt during parsing.
  The error message tells the user exactly which setting to populate.
  Alternative (allow just one default with an inline prompt for the
  other) was rejected as a poor UX vs. the one-time settings cost.
- **REQ/OQ**: REQ-PR-001 AC-1, AC-2.

---

## D-006 (2026-06-03 02:10 PT) — PAT mode is sticky for a session

- **Context**: TASK-009 (`src/auth-manager.ts`) MSAL ↔ PAT fallback.
- **Decision**: Once a PAT is stored in `vscode.SecretStorage`, the
  `getToken` path short-circuits to PAT mode for the remainder of the
  VS Code session. The user must explicitly clear the secret to revert
  to MSAL auth.
- **Rationale**: Switching mid-session is rarely intentional and
  creates confusing 401 loops. Sticky behaviour matches the user's
  effective intent ("I already proved my account doesn't work with
  MSAL — keep using the PAT").
- **REQ/OQ**: REQ-INFRA-AUTH-001; RISK-003.

---

## D-007 (2026-06-03 02:10 PT) — `markdown-it/lib/*` deep-import → namespace types

- **Context**: TASK-010 renderer pipeline TypeScript imports.
- **Decision**: Use `import MarkdownIt from 'markdown-it'` and
  reference inner types as `MarkdownIt.Token` / `MarkdownIt.Renderer`
  instead of deep-importing from `'markdown-it/lib/token'`.
- **Rationale**: `@types/markdown-it@14` ships the inner types only
  via the namespace export of the package's `Node16`-style CJS
  bundle. Deep paths fail TypeScript module resolution under
  `module: Node16`.
- **REQ/OQ**: None (build-tooling).

---

## D-008 (2026-06-03 02:10 PT) — Default `renderToken` via the renderer `self` argument

- **Context**: TASK-010 source-line attribute injection.
- **Decision**: When wrapping a markdown-it default rule, call
  `self.renderToken(tokens, idx, options)` to invoke the built-in
  behaviour. Avoid instantiating a fresh `Renderer` via
  `new (md.renderer.constructor as typeof Renderer)()`.
- **Rationale**: `self` in a rule callback IS the renderer instance,
  so the canonical helper is one method-call away. Constructing a
  parallel renderer fights TypeScript's class/value distinction and
  carries no functional benefit.
- **REQ/OQ**: None.

---

## D-009 (2026-06-03 02:10 PT) — Selection mapper uses single-pass normalization with parallel position map

- **Context**: TASK-011 (`src/selection-mapper/`).
- **Decision**: `normalizeBlock(lines, startLine)` returns
  `{ normalized: string, map: LineOffset[] }`. The normalized string
  strips markdown formatting (emphasis markers, link brackets, list
  markers, table pipes, fence delimiters) and is built char-by-char
  with `map[i]` recording the (line, offset) in raw source. Selection
  resolution uses `String.indexOf` on the normalized text starting
  from `normalizeText(textBeforeSelection).length`, and the
  disambiguator picks the match closest to that approximate index
  with a ±20-char "unique enough" threshold.
- **Rationale**: Pre-summary plan favoured (b) "precise selection
  mapping" over (a) "coarse anchoring" based on user input. The
  parallel position map is the simplest data structure that lets
  precise matches translate cleanly back to (line, offset) — at the
  cost of bookkeeping during the walk. The ±20 threshold balances
  false-precise (matching the wrong occurrence) against
  false-coarse (giving up when the answer is obvious).
- **REQ/OQ**: REQ-COMMENT-002 AC-1..AC-5.

---

## D-010 (2026-06-03 02:10 PT) — Repository GUID resolution lazily inside `AdoClient`

- **Context**: TASK-008 — PR URL parsing initially yields a repo
  *name*, not the GUID required by ADO REST.
- **Decision**: `HttpAdoClient.resolveRepositoryId(ref)` does the
  name→GUID lookup on demand and is called by every method that
  needs a repo id. The result is not cached inside the client —
  `SessionManager` is responsible for storing the resolved GUID
  in the `Session` after the first call.
- **Rationale**: Keeps the client stateless; concentrates session
  state where it belongs. Cost: one extra GET per "first-time"
  endpoint hit per session — acceptable for a personal-use tool.
- **REQ/OQ**: design.md §4.1.1; REQ-PR-001.

---

## D-021 (2026-06-03 00:30 PT) — Diff fingerprint normalization rules

- **Context**: TASK-030 Diff Annotator. Need a normalization that is
  tolerant enough not to flag trivial reformatting as a change, yet
  strict enough to detect real content changes.
- **Decision**: Normalize block fingerprints by lowercasing then
  collapsing all whitespace runs to a single space and trimming. The
  fingerprint is computed over the concatenation of the block's
  `token.type` prefix and its rendered text content (children
  `content` fields joined with a space).
- **Rationale**: Lowercasing avoids flagging case-only changes
  (e.g., capitalizing a heading) as modifications; whitespace
  collapsing handles trailing-space and indentation drift. Prefixing
  with the token type ensures that, say, a heading and a paragraph
  with identical text never compare as equal — they are semantically
  different blocks.
- **REQ/OQ**: REQ-DIFF-001 AC-4.

---

## D-022 (2026-06-03 00:35 PT) — Context-of-deletion anchoring

- **Context**: TASK-030. The renderer cannot draw a gutter bar where
  no head-block exists (deleted content was removed entirely). We
  must anchor the context-of-deletion marker to something visible.
- **Decision**: Attach pending deletions to the next head block in
  document order. When the deletion is at the file tail (no following
  head block), fall back to the immediately preceding head block.
  The deleted content is carried in the `deletedContent` field and
  surfaced as a hover tooltip via CSS `::after`.
- **Rationale**: Reviewers reading the head version in document
  order will see the marker exactly where the deletion fits in the
  flow. Falling back to the previous block ensures tail-end
  deletions are still surfaced rather than silently swallowed.
- **REQ/OQ**: REQ-DIFF-001 AC-3.

---

## D-023 (2026-06-03 00:40 PT) — getFileContentOrNullByRef for added files

- **Context**: TASK-029. REQ-DIFF-002 AC-2 says that when a file
  does not exist at the merge-base (added in the PR), the diff
  annotator should treat every block as `added`.
- **Decision**: Add `HttpAdoClient.getFileContentOrNullByRef` that
  catches `AdoRestError` with status 404 and returns `null`
  instead of throwing. All other errors propagate. The diff
  annotator receives `null` and short-circuits to all-added.
- **Rationale**: Keeps the diff-computation path entirely declarative
  ("base content is either text or null"); error handling stays in
  the REST layer where it belongs.
- **REQ/OQ**: REQ-DIFF-002 AC-2.


---

## D-024 (2026-06-03 01:10 PT) — Status Bar item placement and tooltip

- **Context**: TASK-033. Design.md says ``$(comment-discussion) MD Review: PR ${prId} — ${fileName}``.
- **Decision**: Place at ``StatusBarAlignment.Left`` priority 100,
  tooltip "Click to focus the ADO MD Review rendered editor".
  When threads > 0, append " ( N thread(s))" so reviewers can see at
  a glance whether anyone has chimed in. The click action opens the
  first ``adopr://`` URI registered in the session's ``openedEditors``.
- **Rationale**: Left side keeps it associated with file/session state
  (right side is typically for diagnostics counts). Showing thread
  count repurposes the existing event flow without adding a separate
  poll.
- **REQ/OQ**: REQ-UX-001.

---

## D-025 (2026-06-03 01:15 PT) — Stale-PR Watcher uses setInterval, not setTimeout chain

- **Context**: TASK-034. Choice between ``setInterval`` and recursive
  ``setTimeout`` for the poll loop.
- **Decision**: Use ``setInterval`` with a fixed interval pulled from
  ``adoMdReview.staleCommitPollSeconds`` (clamped to [15, 60]).
  Failures don't extend the interval; we log a warn after 3
  consecutive failures and keep polling.
- **Rationale**: setInterval is simpler to reason about and to stop
  reliably (single ``clearInterval`` handle). A recursive timeout
  chain risks orphaning a pending timer on dispose if the chain races.
  Configuration changes take effect on the next ``start()`` call (i.e.,
  when a new PR session opens), which is acceptable since users
  changing this setting will normally restart the session anyway.
- **REQ/OQ**: REQ-ERR-002.

---

## D-026 (2026-06-03 01:20 PT) — 401 silent retry uses a per-request flag

- **Context**: TASK-035. REQ-AUTH-002 AC-2 demands at most one auth
  prompt per user request.
- **Decision**: Track ``auth401Retries`` as a local counter inside
  ``requestText``. First 401 calls ``invalidateToken()`` and retries
  with ``silent: false``; second 401 throws. The retry does NOT count
  toward the existing 429-attempt budget (``attempt--`` after a 401
  retry) so a single network-flapping window doesn't masquerade as a
  401 storm.
- **Rationale**: Keeps the retry state per-request, which matches the
  user-visible expectation (one click means at most one auth prompt).
  Putting the counter at the client level would deadlock if two
  parallel requests both 401'd.
- **REQ/OQ**: REQ-AUTH-002 AC-2.

---

## D-027 (2026-06-03 01:25 PT) — Error classification extracted from error-utils

- **Context**: TASK-036. error-utils.ts originally combined
  ``classifyError`` (pure) with ``surfaceError`` (vscode-dependent).
  Unit tests can't import the combined module because the test
  runtime has no ``vscode`` module.
- **Decision**: Mirror the redact.ts split: pure classification +
  payload helpers live in ``src/error-classification.ts``; the vscode
  surfacing wrapper lives in ``src/error-utils.ts``. error-utils
  re-exports the pure helpers so existing callers don't break.
  ``AdoRestError`` / ``AdoNetworkError`` extracted similarly to a new
  ``src/ado-errors.ts`` (re-exported from ado-client to keep
  back-compat).
- **Rationale**: Same rationale as D-018 — keeping pure logic in a
  vscode-free module is the lowest-friction way to unit-test it in
  mocha. The marginal cost (two extra files) is far smaller than the
  cost of jumping to ``@vscode/test-electron`` for these tests.
- **REQ/OQ**: REQ-ERR-001, links D-018.

---

## D-028 (2026-06-03 01:30 PT) — Settings use markdownDescription with setting links

- **Context**: TASK-037. settings UI polish.
- **Decision**: Convert all three configuration entries to
  ``markdownDescription`` and reference cross-settings via the
  ``#adoMdReview.X#`` pattern that VS Code resolves to clickable
  links in the Settings UI. Add concrete examples in every entry.
- **Rationale**: Improves discoverability for users who land on a
  single setting without the context of the others (e.g.,
  ``defaultProject`` is only useful if ``defaultOrganization`` is
  also set; the cross-link makes that explicit).
- **REQ/OQ**: REQ-UX-002.


---

## D-029 (2026-06-03 02:00 PT) — Ship .vsix in repo root, version bump to 0.4.0

- **Context**: TASK-040. The implementation plan calls for saving
  ``ado-markdown-pr-reviewer-0.4.0.vsix`` to the repo root and
  committing it so users can download and sideload without a
  separate release pipeline.
- **Decision**: Bump ``package.json`` version 0.1.0 -> 0.4.0 to match
  the v0.4 capability set. Force-add the .vsix despite the
  ``*.vsix`` gitignore rule (the rule still applies to development
  artifacts; the released VSIX is committed manually). Use ``vsce
  package --no-yarn --allow-missing-repository --skip-license`` since
  this is a personal-use extension without a publisher repository
  field and the LICENSE file is auto-bundled by name match.
- **Rationale**: A single-reviewer tool benefits from being able to
  ``code --install-extension .\ado-markdown-pr-reviewer-0.4.0.vsix``
  straight from a fresh clone. The marginal repo size (3.4 MB) is
  acceptable given the dependency on mermaid in the rendered-view
  bundle.
- **REQ/OQ**: ASM-008.

