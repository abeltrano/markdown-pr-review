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