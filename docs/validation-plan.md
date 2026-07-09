# ADO Markdown PR Reviewer — Validation Plan

**Version:** 1.0
**Last updated:** 2026-06-02
**Authored by:** Systems Engineer persona (PromptKit pipeline stage `author-validation-plan`)
**Inputs consumed:** [`requirements.md`](requirements.md) v0.3, [`design.md`](design.md) v0.2
**Status:** Draft — all test cases planned, none yet executed.

---

## 1. Overview

This document defines the validation strategy that proves the **ADO Markdown
PR Reviewer** VS Code extension satisfies the behaviours, constraints, and
quality attributes captured in `requirements.md` v0.3, and that the
architecture described in `design.md` v0.2 has been implemented as
intended.

The validation strategy combines four kinds of evidence:

1. **Unit tests** (mocha, v0.2+) for pure functions where correctness is the
   dominant risk — most importantly `Selection Mapper`, `PR URL Parser`,
   `Diff Annotator`, and the renderer's source-line attribute emission.
2. **Integration tests** (`@vscode/test-electron`, v0.2+) for behaviour that
   spans the postMessage protocol, the `CustomEditorProvider`, the
   `CommentController`, and a mocked ADO REST surface.
3. **Manual end-to-end exercises** against a real Azure DevOps Services PR,
   used for v0.1 smoke validation, for cross-component assumptions that can
   only be checked against the live ADO service (e.g. ASM-004 indexing,
   ASM-006 auth scope, ASM-009 mermaid CSP), and for usability checks.
4. **Static and configuration checks** (e.g. `tsc --noEmit --strict`, CSP
   header inspection, redacted-log inspection) for NFR-level guarantees that
   are not directly observable as runtime behaviour.

The plan is **phase-aligned with the release plan in `requirements.md` §7**:

| Phase | Validation activity                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| v0.1  | Manual round-trip smoke (TC-150 series) + assumption-verification spikes (TC-160 series). No automated suite yet (per §5 design decision). |
| v0.2  | Unit suite for `Selection Mapper`, `Renderer Pipeline`, `PR URL Parser`, `Diff Annotator` enabled; integration suite for postMessage protocol; multi-file picker tests. |
| v0.3  | Integration tests for `Diff Annotator` end-to-end; status bar / settings / keybinding UX tests.                                |
| v0.4  | Error-handling matrix (TC-130 series), full NFR/CSP tests (TC-140 series), and stale-PR watcher tests. Acts as gate for tagging the extension as "personally dogfoodable". |

The plan is explicitly **risk-based** (see §6): test design effort and
execution depth scale with the risk register in `requirements.md` §6, with
**comment anchoring correctness** (REQ-COMMENT-002, RISK-001) and **webview
security** (REQ-NFR-SEC-001, RISK-002) as the two top-priority concerns.

Coverage gaps and known limitations are flagged in §4 and §5 rather than
silently omitted.

---

## 2. Scope of Validation

### 2.1 In Scope

* All 28 functional requirements (`REQ-CORE-001…007`, `REQ-COMMENT-001…006`,
  `REQ-AUTH-001…002`, `REQ-DIFF-001…002`, `REQ-UX-001…003`,
  `REQ-ERR-001…003`).
* All 5 non-functional requirements
  (`REQ-NFR-PERF-001`, `REQ-NFR-UX-001`, `REQ-NFR-COMPAT-001`,
  `REQ-NFR-MAINT-001`, `REQ-NFR-SEC-001`).
* Empirical verification of assumptions `ASM-001…009`, especially those flagged
  as carrying significant downstream rework risk (`ASM-004`, `ASM-006`,
  `ASM-008`, `ASM-009`).
* Verification that the design's "must-be-correct" components — `Selection
  Mapper`, `Renderer Pipeline` source-line attribution, `Diff Annotator`,
  `CommentController` round-trip, and the two webviews' CSP — behave as
  specified in `design.md` §3 and §4.
* Validation that the documented mitigations for `RISK-001…010` are
  effective (see §6 risk-traceability cross-reference).

### 2.2 Out of Scope

* **Performance and scale beyond personal use.** No load tests, no
  concurrent-user simulations. Justified by `CON-001` (single-user tool) and
  the personal-tool framing of `requirements.md` §1.
* **Azure DevOps Server (on-prem).** Per `CON-002`, only Azure DevOps
  *Services* (dev.azure.com / *.visualstudio.com) is targeted.
* **Math (KaTeX) and PlantUML rendering.** Per `CON-003`, only Mermaid
  diagrams are supported in v1.
* **Multi-user / shared review experiences.** Per `CON-001`, no team-server,
  no shared draft state.
* **Workspace mutation.** Per `CON-006`, the extension never writes files
  to the user's open workspace; all reviewed documents live under the
  `mdpr://` virtual scheme.
* **Local `git` binary integration.** Per `CON-007`, file content is fetched
  exclusively via ADO REST; no shell-out tests are required.
* **GitHub PRs.** Per `requirements.md` §1 / `CON-002`, GitHub support is
  explicitly v2+ scope.
* **Internationalisation and accessibility certification.** Only basic
  keyboard reachability is verified (REQ-UX-003); no formal WCAG audit.
* **Telemetry / crash reporting.** Per `requirements.md` §1 anti-goals.

### 2.3 Assumptions and Prerequisites

The validation environment assumes:

* A real Azure DevOps Services organisation the tester can author into, with
  at least one project, one Git repository, and the ability to open and
  amend draft PRs containing Markdown files.
* A "fixture PR" prepared in that organisation with the following
  characteristics, used by manual E2E tests:
  - Title contains the magic string `[mdpr-fixture]` so it is easy to find.
  - At least three changed Markdown files of varied size: a small file
    (~5 KB, plain), a medium file (~80 KB, mixed prose/lists/code), and a
    large file (~200 KB, prose-heavy).
  - One file contains a fenced ```` ```mermaid ```` diagram (sequence or
    flowchart).
  - One file contains raw HTML blocks (e.g. `<details>` / `<summary>`).
  - The PR has at least one pre-existing review thread on a Markdown file,
    anchored to a known line range, to validate `REQ-COMMENT-006` thread
    fetching.
* A development VS Code instance (Stable channel ≥ 1.85.0) with the
  Extension Development Host (`F5`) workflow available, plus the ability to
  install `.vsix` packages via "Install from VSIX…" for late-phase tests
  (`ASM-008`).
* Node.js ≥ 18 and `npm` available locally to run the unit / integration
  suites and to build the `.vsix`.
* A signed-in Microsoft account in VS Code that has access to the fixture
  ADO organisation (so `vscode.authentication.getSession('microsoft', …)`
  can produce a token without browser interaction).
* Network access to `dev.azure.com` and `*.visualstudio.com`. Tests that
  require failure simulation (e.g. TC-061 stale-commit detection, TC-131
  401-refresh) use either deliberate test-only PRs or mocked ADO clients.

Where these prerequisites are not met, the affected test cases are marked
**Skipped — prerequisite unmet** rather than counted as failures.

---

## 3. Test Strategy

### 3.1 Test Levels

The strategy uses four test levels, matching the component boundaries in
`design.md` §4:

| Level                 | Scope                                                                                                                                                                                                                                       | Primary tooling                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Unit**              | Pure functions and modules with no VS Code API dependency: `PR URL Parser`, `Selection Mapper` (`mapSelectionToSourceRange`, `normalizeWhitespace`), `Diff Annotator` (`diffBlocks`), renderer plugin (`emitSourceLine`, `encodeMermaid`), redaction helper, CSP composer. | mocha + assert, run via `npm test` (v0.2+).                                                      |
| **Integration**       | Behaviour that crosses the host ↔ webview boundary, or the host ↔ ADO REST client boundary: postMessage protocol, `CustomEditorProvider` lifecycle, `CommentController` round-trip with mocked ADO client, draft-state persistence.       | `@vscode/test-electron` driving a real Extension Development Host with `nock` (or equivalent) intercepting `https://dev.azure.com`. |
| **System / E2E**      | Full workflow against a real ADO PR: open PR → pick file → render → select text → submit comment → see marker → reply → resolve.                                                                                                            | Manual script-driven (v0.1) and partially automated via the fixture PR (v0.4).                   |
| **Static**            | Type safety, CSP correctness, dependency surface, secret-leak in logs.                                                                                                                                                                      | `tsc --noEmit --strict`, manual inspection of webview HTML, `npm ls --omit=dev`, log review.    |

### 3.2 Test Approach

* **Traceability-matrix first.** Every functional, NFR, constraint, and
  high-severity assumption / risk in `requirements.md` is mapped to at least
  one test case in §5. Unmapped IDs are flagged as coverage gaps in §4.
* **Tests derive from acceptance criteria.** Each AC bullet in
  `requirements.md` is the unit of coverage; one or more test cases assert
  each AC, and per §7 a test passes only when *all* of its referenced ACs
  hold simultaneously.
* **Negative + boundary tests are mandatory** for any AC with a numeric
  threshold, an enumerated set, or an explicit failure mode. Concrete cases
  are listed inline in §5 (e.g. TC-141 boundary at 200 KB, TC-014 at 5 MB,
  TC-016 at 200-char truncation, TC-053 at quote 199/200/201 chars).
* **Risk-based prioritisation.** Test execution order and depth follow the
  Critical/High/Medium/Low classification in §6. Critical tests (anchoring
  correctness, webview CSP, comment round-trip, auth foundation) are
  re-executed in every release-candidate cycle; Low priority tests are
  acceptable to skip when time-boxed.
* **Anti-hallucination discipline.** No test asserts behaviour not stated in
  `requirements.md` or `design.md`. Where the design is silent, the test is
  marked as a *spike* and the open question (`OQ-1…9`) is recorded.
* **`Selection Mapper` exhaustive enum coverage.** Per `design.md` §3.2
  ("coverage of each mappingMode enum value required for v0.2+"), one
  unit test exists for each of the six `MappingMode` values: `precise`,
  `coarse-mermaid`, `coarse-html-block`, `coarse-multi-block`,
  `coarse-ambiguous-text`, `coarse-text-not-found`.
* **Phased automation.** The v0.1 release is validated entirely by manual
  scripts (per `design.md` §5 decision "Test framework — minimal in v0.1,
  mocha for v0.2+"); automated suites become required gates from v0.2
  onward.

---

## 4. Requirements Traceability Matrix

Every requirement, constraint, assumption, and high-severity risk in
`requirements.md` v0.3 is mapped to one or more test cases. Status is
"Planned" for the whole table; it is updated to "Pass" / "Fail" / "Blocked"
as tests are executed.

### 4.1 Functional Requirements

| Requirement     | Acceptance Criteria covered | Test Case IDs                                       | Status  |
| --------------- | --------------------------- | --------------------------------------------------- | ------- |
| REQ-CORE-001    | AC-1, AC-2, AC-3            | TC-001, TC-002, TC-003, TC-150                      | Planned |
| REQ-CORE-002    | AC-1, AC-2                  | TC-004, TC-005, TC-091                              | Planned |
| REQ-CORE-003    | AC-1, AC-2                  | TC-021, TC-022                                      | Planned |
| REQ-CORE-004    | AC-1, AC-2                  | TC-030, TC-031, TC-141                              | Planned |
| REQ-CORE-005    | AC-1, AC-2, AC-3            | TC-032, TC-033, TC-034                              | Planned |
| REQ-CORE-006    | AC-1, AC-2, AC-3            | TC-035, TC-036, TC-070                              | Planned |
| REQ-CORE-007    | AC-1, AC-2, AC-3, AC-4, AC-5 | TC-037, TC-038, TC-039, TC-071, TC-164             | Planned |
| REQ-CORE-008    | AC-1, AC-2, AC-3, AC-4, AC-5 | TC-006, TC-007, TC-008, TC-009                     | Planned |
| REQ-COMMENT-001 | AC-1, AC-2, AC-3, AC-4, AC-5 | TC-050, TC-051, TC-072, TC-080                     | Planned |
| REQ-COMMENT-002 | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 | TC-052, TC-053, TC-054, TC-055, TC-056, TC-057, TC-058 | Planned |
| REQ-COMMENT-003 | AC-1, AC-2, AC-3            | TC-016, TC-081, TC-082                              | Planned |
| REQ-COMMENT-004 | AC-1, AC-2, AC-3            | TC-100, TC-101, TC-102, TC-152                      | Planned |
| REQ-COMMENT-005 | AC-1, AC-2, AC-3            | TC-103, TC-104, TC-105                              | Planned |
| REQ-COMMENT-006 | AC-1, AC-2, AC-3            | TC-106, TC-107, TC-073                              | Planned |
| REQ-AUTH-001    | AC-1, AC-2, AC-3            | TC-010, TC-011, TC-161                              | Planned |
| REQ-AUTH-002    | AC-1, AC-2                  | TC-012, TC-131                                      | Planned |
| REQ-DIFF-001    | AC-1, AC-2, AC-3, AC-4      | TC-040, TC-041, TC-042, TC-153                      | Planned |
| REQ-DIFF-002    | AC-1, AC-2                  | TC-043, TC-044                                      | Planned |
| REQ-UX-001      | AC-1, AC-2, AC-3            | TC-120, TC-121, TC-122                              | Planned |
| REQ-UX-002      | AC-1, AC-2                  | TC-123, TC-124                                      | Planned |
| REQ-UX-003      | AC-1                        | TC-125, TC-126                                      | Planned |
| REQ-ERR-001     | AC-1, AC-2, AC-3            | TC-130, TC-145                                      | Planned |
| REQ-ERR-002     | AC-1, AC-2, AC-3            | TC-110, TC-111, TC-132                              | Planned |
| REQ-ERR-003     | AC-1, AC-2                  | TC-014, TC-133                                      | Planned |

### 4.2 Non-Functional Requirements

| Requirement       | Acceptance Criteria covered | Test Case IDs           | Status  |
| ----------------- | --------------------------- | ----------------------- | ------- |
| REQ-NFR-PERF-001  | AC-1                        | TC-140, TC-141          | Planned |
| REQ-NFR-UX-001    | AC-1                        | TC-142                  | Planned |
| REQ-NFR-COMPAT-001 | AC-1, AC-2                 | TC-143, TC-144          | Planned |
| REQ-NFR-MAINT-001 | AC-1, AC-2                  | TC-146, TC-147          | Planned |
| REQ-NFR-SEC-001   | AC-1, AC-2, AC-3            | TC-060, TC-061, TC-148  | Planned |

### 4.3 Constraints

| Constraint | Verified by                                  | Status  |
| ---------- | -------------------------------------------- | ------- |
| CON-001    | TC-094 (static review: no shared state APIs) | Planned |
| CON-002    | TC-001, TC-002 (URL parser only Services hosts) | Planned |
| CON-003    | TC-038 (only ```` ```mermaid ```` fence triggers diagram code-path) | Planned |
| CON-004    | TC-052 (line+offset precision when mapping is exact); TC-055 (deterministic coarse fallback otherwise) | Planned |
| CON-005    | TC-100 (each draft posts exactly one thread, not a batched payload) | Planned |
| CON-006    | TC-094 (static review: no `workspace.fs.writeFile` calls) | Planned |
| CON-007    | TC-094 (static review: no `child_process` invocations of `git`) | Planned |

### 4.4 Assumptions

| Assumption | Verified by                                                                                                       | Status  |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| ASM-001    | TC-021 (REST returns full file content with `includeContent=true`)                                                | Planned |
| ASM-002    | TC-038, TC-164 (mermaid 10.x renders fixture diagrams inside webview CSP)                                          | Planned |
| ASM-003    | TC-021, TC-022 (no MIME-sniff fallback needed for `text/markdown`)                                                 | Planned |
| ASM-004    | TC-160 — empirical: post comment with known `rightFileStart.line/offset`, confirm ADO renders it at the expected location | Planned |
| ASM-005    | TC-100 (thread visible without polling delay after POST returns)                                                   | Planned |
| ASM-006    | TC-161 — empirical: `vscode.authentication.getSession('microsoft', ['499b84ac-1321-427f-aa17-267ca6975798/.default'])` succeeds without prompt | Planned |
| ASM-007    | TC-141 (200 KB render < 500 ms budget)                                                                             | Planned |
| ASM-008    | TC-163 — install built `.vsix` into a fresh Stable VS Code, confirm activation                                     | Planned |
| ASM-009    | TC-164 — load real Mermaid fixture inside CSP and confirm render                                                   | Planned |

### 4.5 Risks (verification of mitigations)

Only risks tagged with a mitigation requiring runtime evidence are listed
here; the rest are tracked in the design / risk register.

| Risk       | Mitigation verified by                                                       | Status  |
| ---------- | ---------------------------------------------------------------------------- | ------- |
| RISK-001   | TC-052 through TC-058 (anchoring correctness suite)                          | Planned |
| RISK-002   | TC-060, TC-148 (CSP enforcement and `unsafe-eval` absence)                   | Planned |
| RISK-003   | TC-021, TC-148 (file fetch over HTTPS only; no plaintext channels)           | Planned |
| RISK-004   | TC-110, TC-111, TC-132 (stale-commit watcher + read-only banner)             | Planned |
| RISK-005   | TC-100, TC-105 (duplicate-suppression via deterministic re-fetch)            | Planned |
| RISK-006   | TC-040 through TC-044 (diff annotator block boundary correctness)            | Planned |
| RISK-007   | TC-080, TC-082 (CommentInputView reachable and recoverable)                  | Planned |
| RISK-008   | TC-130, TC-145 (log redaction)                                               | Planned |
| RISK-009   | TC-038, TC-164 (mermaid version pin and CSP compatibility)                   | Planned |
| RISK-010   | TC-091, TC-092 (custom-editor `mdpr://` works; no scheme conflict)          | Planned |

### 4.6 Coverage Gaps

The following items are intentionally not directly tested and are recorded
as **acceptable gaps**:

* **DEP-001 (VS Code 1.85+):** indirectly verified by TC-143; no test
  enumerates *every* VS Code API used.
* **DEP-002 (Microsoft built-in auth provider availability):** treated as a
  platform invariant. Failure mode is covered by TC-011 (clear error if
  `getSession` rejects).
* **DEP-003 (ADO REST stability):** API drift is out of scope for
  pre-release validation; TC-160…162 establish a baseline.
* **DEP-004 (Mermaid bundle):** pinned via [`package.json`](../package.json) and verified at
  build time; runtime change-detection is not in scope.
* **DEP-005, DEP-006:** transitive — covered by `npm ls` static check
  (TC-147).
* **Performance characteristics for files > 200 KB:** explicitly out of
  scope per REQ-NFR-PERF-001 wording; oversize behaviour is tested instead
  (TC-014, TC-133).
* **ASM-002 mermaid syntax breadth:** TC-164 covers one representative
  diagram; we do *not* attempt full mermaid grammar coverage.

---

## 5. Test Cases

The test cases are grouped by component, mirroring `design.md` §4. Each
case is **executable by someone unfamiliar with the system** when read in
order; preconditions list exact fixture / mock state, and expected results
are measurable.

Legend:
* **Priority:** Critical (C) / High (H) / Medium (M) / Low (L) per §6.
* **Type:** Functional (F) / Performance (P) / Security (S) / Regression
  (R) / Static (Stc).
* **Level:** Unit (U) / Integration (I) / System-E2E (E) / Static (Stc).
* **Phase:** v0.1 / v0.2 / v0.3 / v0.4 — the earliest release this test is
  required to pass.

### 5.1 PR URL Parser (REQ-CORE-001, REQ-CORE-002, CON-002)

**TC-001** — Parse modern `dev.azure.com` PR URL
* Requirement(s): REQ-CORE-001 AC-1, CON-002
* Preconditions: Unit test harness, no live network.
* Steps:
  1. Call `parsePrUrl('https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/4242')`.
* Expected: returns `{ organization: 'contoso', project: 'MyProj', repositoryId: 'MyRepo', pullRequestId: 4242, host: 'dev.azure.com' }`.
* Priority: C  · Type: F  · Level: U  · Phase: v0.2

**TC-002** — Parse legacy `*.visualstudio.com` PR URL
* Requirement(s): REQ-CORE-001 AC-1, CON-002
* Preconditions: Unit test harness.
* Steps:
  1. Call `parsePrUrl('https://contoso.visualstudio.com/MyProj/_git/MyRepo/pullrequest/77')`.
* Expected: returns the same shape as TC-001 with `host: 'contoso.visualstudio.com'`.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-003** — Reject malformed and non-ADO URLs
* Requirement(s): REQ-CORE-001 AC-3
* Preconditions: Unit test harness.
* Steps:
  1. Call `parsePrUrl` with each of: `''`, `'not a url'`, `'https://github.com/o/r/pull/1'`, `'https://dev.azure.com/contoso/MyProj/_git/MyRepo'` (no PR id), `'https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/abc'`.
* Expected: each input throws (or returns a structured error) carrying a non-redacted message; no input is silently accepted as the wrong PR.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-004** — `markdownPrReview.openPullRequest` command surfaces an inputBox when no URL provided
* Requirement(s): REQ-CORE-002 AC-1, AC-2
* Preconditions: Extension activated in Extension Development Host.
* Steps:
  1. Run the command `ADO PR Reviewer: Open PR…` from the command palette.
* Expected: a VS Code `showInputBox` appears with placeholder text mentioning an ADO PR URL.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-005** — `markdownPrReview.openPullRequest` command accepts URL argument
* Requirement(s): REQ-CORE-002 AC-2
* Preconditions: As TC-004.
* Steps:
  1. Programmatically execute `vscode.commands.executeCommand('markdownPrReview.openPullRequest', '<fixture-pr-url>')`.
* Expected: No inputBox is shown; the file picker (`FileTreeView`) becomes visible populated with the fixture PR's files.
* Priority: M  · Type: F  · Level: I  · Phase: v0.2

### 5.2 Auth Manager (REQ-AUTH-001, REQ-AUTH-002)

**TC-010** — First-time auth flow uses Microsoft provider with ADO scope
* Requirement(s): REQ-AUTH-001 AC-1, AC-2
* Preconditions: VS Code account session previously signed-out for the
  Microsoft provider.
* Steps:
  1. Trigger any flow that needs a token (e.g. `markdownPrReview.openPullRequest`).
* Expected: `vscode.authentication.getSession('microsoft', ['499b84ac-1321-427f-aa17-267ca6975798/.default'], { createIfNone: true })` is invoked; the VS Code OS auth flow appears; on success a session token is cached in extension memory.
* Priority: C  · Type: F  · Level: I  · Phase: v0.2

**TC-011** — Cached token is reused without re-prompting
* Requirement(s): REQ-AUTH-001 AC-3, REQ-NFR-UX-001 AC-1
* Preconditions: TC-010 has run; session exists; same VS Code window.
* Steps:
  1. Call `AuthManager.getToken()` 5 times in succession.
* Expected: no further `createIfNone: true` prompts; the same token is returned each call until expiry.
* Priority: C  · Type: F  · Level: I  · Phase: v0.2

**TC-012** — Token refresh on a single 401 retry
* Requirement(s): REQ-AUTH-002 AC-1, AC-2
* Preconditions: Mock ADO client (`nock`) configured to reply 401 the first
  time and 200 the second time for `GET …/pullrequests/{id}/threads`.
* Steps:
  1. Trigger a fetch that hits the mocked endpoint.
* Expected: `AuthManager.refresh()` (which calls `getSession` with `forceNewSession: true`) is invoked exactly once; the second request succeeds.
* Priority: C  · Type: F  · Level: I  · Phase: v0.2

**TC-013** — Two consecutive 401s surface a clear, user-visible error
* Requirement(s): REQ-AUTH-002 AC-2, REQ-ERR-001 AC-3
* Preconditions: As TC-012 but mocked to return 401 twice.
* Steps:
  1. Trigger a fetch that hits the mocked endpoint.
* Expected: an error notification appears containing the words "sign in"; no further retries are attempted; no PII or token fragment is included in the notification.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-014** — Refuse to open a file > 5 MB
* Requirement(s): REQ-ERR-003 AC-1, REQ-CORE-004 AC-1, CON-003
* Preconditions: Mocked ADO response carries `Content-Length: 5242881`
  (5 MB + 1 byte). Boundary inputs: 5 242 879 (pass), 5 242 880 (pass — at
  the exact 5 MB limit per RFC 8259 binary-units convention), 5 242 881
  (fail).
* Steps:
  1. Trigger file-open for each boundary file from the file picker.
* Expected: files at ≤ 5 MB render normally; the > 5 MB file does *not* render and a user-visible notification states the size limit and the actual size.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

### 5.3 ADO REST Client (REQ-CORE-003, REQ-COMMENT-004…006)

**TC-021** — Fetch full PR file list and metadata
* Requirement(s): REQ-CORE-003 AC-1, ASM-001
* Preconditions: Live ADO fixture PR.
* Steps:
  1. With a valid session, call the client's `getPullRequestFiles(prRef)`.
* Expected: returns the same set of changed file paths visible in the ADO
  web "Files" tab, each with `oldObjectId` / `newObjectId` SHAs and a
  change kind (`add` / `edit` / `delete`).
* Priority: C  · Type: F  · Level: I  · Phase: v0.1 (manual) → v0.2 (mocked)

**TC-022** — Fetch raw file content at a specific object ID
* Requirement(s): REQ-CORE-003 AC-2, ASM-003
* Preconditions: Object ID known from TC-021.
* Steps:
  1. Call `getItemContent(repoId, objectId)`.
* Expected: response is full UTF-8 text content, byte-for-byte identical to the file content fetched manually via the ADO web "Download" link.
* Priority: C  · Type: F  · Level: I  · Phase: v0.1 (manual) → v0.2 (mocked)

### 5.4 Renderer Pipeline (REQ-CORE-004…007, REQ-NFR-PERF-001, RISK-006, ASM-002, ASM-007)

**TC-030** — Markdown renders with standard CommonMark + GFM tables
* Requirement(s): REQ-CORE-004 AC-1, AC-2
* Preconditions: Fixture PR file containing headings, lists, tables, code fences.
* Steps:
  1. Open the file via the rendered-view custom editor.
* Expected: Output visually matches the same file rendered by VS Code's built-in `Markdown: Open Preview`, modulo extension-specific decorations (comment markers, diff gutters).
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-031** — Renderer emits `data-source-line` attributes on block elements
* Requirement(s): REQ-COMMENT-002 AC-1 (precondition), `design.md` §3.2
* Preconditions: Unit harness for the renderer plugin; input is a fixed
  Markdown string covering paragraph, heading, list-item, blockquote, code
  fence, table row, html_block, mermaid fence.
* Steps:
  1. Render to HTML.
  2. Assert that every top-level block tag in the output has a
     `data-source-line-start` and `data-source-line-end` attribute.
  3. Assert the values are 1-based line numbers and `start ≤ end`.
* Expected: 100 % of expected block-level tokens carry the attributes; values match the source positions verified manually.
* Priority: C  · Type: F  · Level: U  · Phase: v0.2

**TC-032** — Wrap `html_block` tokens so source-line attrs survive
* Requirement(s): REQ-CORE-005 AC-1, AC-2
* Preconditions: Unit harness; input contains
  `<details><summary>x</summary>body</details>`.
* Steps: render to HTML.
* Expected: the raw HTML block is wrapped in (or annotated with) an element bearing `data-source-line-start` / `…-end`; the inner HTML is not modified.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-033** — Render escaped / dangerous HTML safely
* Requirement(s): REQ-CORE-005 AC-3, REQ-NFR-SEC-001 AC-2
* Preconditions: Unit harness; input contains `<script>alert(1)</script>`
  and `<img src=x onerror=alert(1)>` both as `html_block` and as inline
  HTML.
* Steps: render and inspect output.
* Expected: no executable `<script>` tag is produced; `onerror` attributes are stripped or escaped per `markdown-it` defaults; rendering inside the webview does not execute alerts (verified visually in TC-148).
* Priority: C  · Type: S  · Level: U  · Phase: v0.2

**TC-034** — Headings produce anchor IDs (smoke for navigation)
* Requirement(s): REQ-CORE-005 AC-2
* Preconditions: Unit harness; input contains `## Section Two!`.
* Steps: render.
* Expected: produces `<h2 id="section-two">` (slug rules as documented by `markdown-it`'s built-in anchor logic), no errors thrown.
* Priority: M  · Type: F  · Level: U  · Phase: v0.2

**TC-035** — Code fences are syntax-highlighted using VS Code theme tokens
* Requirement(s): REQ-CORE-006 AC-1, AC-2
* Preconditions: Fixture file with fenced ` ```typescript ` and ` ```bash ` blocks.
* Steps: open in the rendered view under both a light and a dark theme.
* Expected: tokens are coloured consistently with the active theme; no FOUC (flash of unstyled content) > 250 ms.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-036** — Unknown language fences fall back to plain text without errors
* Requirement(s): REQ-CORE-006 AC-3
* Preconditions: Fixture file with ```` ```madeuplang ```` fence.
* Steps: render.
* Expected: text renders monospaced and unhighlighted; no console errors.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-037** — Mermaid fence emits a `<pre class="mermaid">` placeholder
* Requirement(s): REQ-CORE-007 AC-1, AC-2
* Preconditions: Unit harness; input ```` ```mermaid\nsequenceDiagram\nA->>B: hi\n``` ````.
* Steps: render to HTML.
* Expected: output contains `<pre class="mermaid" data-source-line-start="…" data-source-line-end="…">…</pre>`; the inner text is URI-encoded or HTML-escaped per the design's CSP-safe convention; no `data-graph` attribute carrying raw HTML.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-038** — Mermaid renders inside the webview CSP
* Requirement(s): REQ-CORE-007 AC-3, AC-4, ASM-002, ASM-009, RISK-009
* Preconditions: Fixture file with a non-trivial mermaid sequence diagram;
  webview CSP composed as `design.md` §6 specifies (no `unsafe-eval`).
* Steps:
  1. Open the file in the rendered view.
  2. Wait up to 2 s for the diagram to appear.
* Expected: an SVG diagram replaces the `<pre class="mermaid">` placeholder; no CSP violations appear in the webview's developer console; per-diagram render time recorded for TC-140.
* Priority: C  · Type: F  · Level: E  · Phase: v0.2

**TC-039** — Mermaid syntax error is shown inline, not as a host crash
* Requirement(s): REQ-CORE-007 AC-5
* Preconditions: Fixture file with ```` ```mermaid\nNOT VALID\n``` ````.
* Steps: open file.
* Expected: the placeholder area shows a mermaid-style error message; the rest of the document continues to render; the webview is not blanked out.
* Priority: H  · Type: F  · Level: E  · Phase: v0.2

### 5.5 Diff Annotator (REQ-DIFF-001, REQ-DIFF-002, RISK-006)

**TC-040** — Block-level token diff identifies added paragraphs
* Requirement(s): REQ-DIFF-001 AC-1, AC-2
* Preconditions: Unit harness; "old" and "new" markdown strings differ by one new paragraph at line 12.
* Steps: call `diffBlocks(oldMd, newMd)`.
* Expected: returns a list including `{ kind: 'added', startLine: 12, endLine: 12 }` and no spurious changes elsewhere.
* Priority: H  · Type: F  · Level: U  · Phase: v0.3

**TC-041** — Removed paragraphs annotated against the parent block of the gap
* Requirement(s): REQ-DIFF-001 AC-3
* Preconditions: Unit harness; "old" has a paragraph that is gone in "new".
* Steps: call `diffBlocks`.
* Expected: result contains `{ kind: 'removed', anchorAfterLine: <n> }` (or equivalent representation per design); positions are deterministic for the same input.
* Priority: M  · Type: F  · Level: U  · Phase: v0.3

**TC-042** — Modified paragraph is one "modified" entry, not add+remove
* Requirement(s): REQ-DIFF-001 AC-4
* Preconditions: Unit harness; one paragraph's wording changed.
* Steps: call `diffBlocks`.
* Expected: result contains exactly one `{ kind: 'modified', startLine, endLine }` covering the paragraph.
* Priority: M  · Type: F  · Level: U  · Phase: v0.3

**TC-043** — Annotator decorates the rendered view with gutter markers
* Requirement(s): REQ-DIFF-002 AC-1
* Preconditions: Fixture file with three known-diff regions.
* Steps:
  1. Open the file in rendered view.
* Expected: each diff region's first block has a gutter marker (added/removed/modified, distinct colours / icons per `design.md`); markers align with their block.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-044** — New file added in PR: every block annotated `added`
* Requirement(s): REQ-DIFF-002 AC-2
* Preconditions: PR whose changed set includes a markdown file that does not exist at the merge-base (newly added in the PR).
* Steps: open that file in rendered view.
* Expected: because the file is absent at the merge-base, every rendered block carries `data-diff-state="added"` (green gutter), per REQ-DIFF-002 AC-2.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

### 5.6 Selection Mapper (REQ-COMMENT-002, RISK-001, CON-004, OQ-9)

Selection Mapper is the highest-risk pure module. Per `design.md` §3.2
each `mappingMode` enum value MUST have at least one unit test.

**TC-050** — Selection inside a paragraph maps `precise` with `line+offset`
* Requirement(s): REQ-COMMENT-001 AC-2, REQ-COMMENT-002 AC-1
* Preconditions: Unit harness; rendered HTML for a paragraph spanning lines 10–11; user selection covers characters 5–14 within the paragraph.
* Steps: call `mapSelectionToSourceRange(selectionPayload, sourceMap)`.
* Expected: `{ mode: 'precise', startLine: 10, startOffset: 5, endLine: 10, endOffset: 14 }`; offsets are 0-based per the design.
* Priority: C  · Type: F  · Level: U  · Phase: v0.2

**TC-051** — Selection across two adjacent paragraphs maps `precise` spanning both
* Requirement(s): REQ-COMMENT-002 AC-1, AC-2
* Preconditions: Unit harness; two paragraphs (lines 10–11 and 13–14, blank line 12).
* Steps: simulate selection from mid-para-1 to mid-para-2; call mapper.
* Expected: `{ mode: 'precise', startLine: 10, startOffset: …, endLine: 14, endOffset: … }`.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-052** — Selection touching a Mermaid block falls back to `coarse-mermaid`
* Requirement(s): REQ-COMMENT-002 AC-3, CON-004
* Preconditions: Rendered SVG mermaid block at source lines 30–42.
* Steps: simulate selecting any portion of the SVG.
* Expected: `{ mode: 'coarse-mermaid', startLine: 30, startOffset: 0, endLine: 42, endOffset: 0 }`; deterministic across re-renders.
* Priority: C  · Type: F  · Level: U  · Phase: v0.2

**TC-053** — Selection inside a raw HTML block falls back to `coarse-html-block`
* Requirement(s): REQ-COMMENT-002 AC-3
* Preconditions: `<details>` block at lines 50–60.
* Steps: select text inside the `<summary>`.
* Expected: `{ mode: 'coarse-html-block', startLine: 50, endLine: 60, … }`.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-054** — Selection spanning three blocks maps `coarse-multi-block`
* Requirement(s): REQ-COMMENT-002 AC-3, AC-4
* Preconditions: Three contiguous blocks at lines 10–11, 13–14, 16–17.
* Steps: select from inside block 1 to inside block 3.
* Expected: `{ mode: 'coarse-multi-block', startLine: 10, endLine: 17 }`.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-055** — Ambiguous re-occurring text within a block maps `coarse-ambiguous-text`
* Requirement(s): REQ-COMMENT-002 AC-3, AC-5
* Preconditions: Paragraph contains the word "value" three times; user selects the second one.
* Steps: call mapper using a selection payload whose normalized text matches multiple positions in the source.
* Expected: `{ mode: 'coarse-ambiguous-text', startLine: <para-start>, endLine: <para-end>, startOffset: 0, endOffset: 0 }`; mapper does NOT guess a specific occurrence.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-056** — Whitespace-only differences between rendered and source still yield `precise`
* Requirement(s): REQ-COMMENT-002 AC-2
* Preconditions: Source uses `   ` (3 spaces) where rendered text appears as a single space.
* Steps: call `normalizeWhitespace(s)` then `mapSelectionToSourceRange`.
* Expected: mode is `precise`; offsets reference source positions, not normalized positions.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-057** — Selection text that does not appear in source maps `coarse-text-not-found`
* Requirement(s): REQ-COMMENT-002 AC-6
* Preconditions: Selection payload reports text that has been entirely synthesised by a renderer extension (e.g. anchor link "¶").
* Steps: call mapper.
* Expected: `{ mode: 'coarse-text-not-found', startLine: <block-start>, endLine: <block-end> }`; mapper logs a single structured warning.
* Priority: H  · Type: F  · Level: U  · Phase: v0.2

**TC-058** — Mapper never returns `endLine` before `startLine`
* Requirement(s): REQ-COMMENT-002 AC-1 (well-formed ranges)
* Preconditions: Property-test or fuzz harness with 100 random selection payloads against the fixture document.
* Steps: invoke mapper on each.
* Expected: for every result, `startLine ≤ endLine`; if equal, `startOffset ≤ endOffset`; `mode` is always one of the 6 enum values.
* Priority: C  · Type: F  · Level: U  · Phase: v0.2

### 5.7 Webview Security & CSP (REQ-NFR-SEC-001, RISK-002)

**TC-060** — Rendered-view CSP omits `unsafe-eval`
* Requirement(s): REQ-NFR-SEC-001 AC-1, AC-3
* Preconditions: Extension running in dev host; rendered view opened.
* Steps:
  1. In the webview developer tools, run `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`.
* Expected: result contains `script-src 'nonce-…'` and does *not* contain `'unsafe-eval'`; `default-src 'none'`; explicit `font-src` / `style-src` per design §6.
* Priority: C  · Type: S  · Level: E  · Phase: v0.2

**TC-061** — CommentInputView CSP omits `unsafe-inline` style
* Requirement(s): REQ-NFR-SEC-001 AC-1
* Preconditions: CommentInputView visible.
* Steps:
  1. Read its CSP meta as in TC-060.
* Expected: `style-src` lists explicit nonces / sources; no `'unsafe-inline'`; no font sources.
* Priority: H  · Type: S  · Level: E  · Phase: v0.2

**TC-062** — Injected `<script>` tag is not executed inside the rendered view
* Requirement(s): REQ-CORE-005 AC-3, REQ-NFR-SEC-001 AC-2
* Preconditions: Fixture file containing `<script>window.__pwned=true</script>` as an HTML block.
* Steps: open file; in dev tools evaluate `typeof window.__pwned`.
* Expected: `'undefined'`; no console error indicating CSP refused inline script (the script must have been escaped by the renderer before reaching the DOM, not merely blocked by CSP — both layers are required).
* Priority: C  · Type: S  · Level: E  · Phase: v0.2

### 5.8 CustomEditorProvider & `mdpr://` URI (REQ-CORE-004, RISK-010)

**TC-070** — CustomEditorProvider claims `mdpr://` URIs
* Requirement(s): REQ-CORE-004 AC-1, RISK-010
* Preconditions: Extension activated.
* Steps:
  1. Call `vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse('mdpr://contoso/MyProj/_git/MyRepo/pullrequest/4242/file/docs/design.md@<sha>'), 'markdownPrReview.renderedView')`.
* Expected: a new editor tab opens; tab label is the file's basename; the rendered view appears within 2 s (per REQ-CORE-001 AC-2 family budget).
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-071** — Two files from the same PR open in separate tabs
* Requirement(s): REQ-CORE-004 AC-1, REQ-CORE-007 AC-1 (independent rendering)
* Preconditions: Fixture PR.
* Steps: from the file picker, open File A, then File B without closing A.
* Expected: two tabs visible; switching between them preserves their independent scroll positions and any draft comment state.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-072** — Re-opening the same file URI focuses the existing tab
* Requirement(s): REQ-CORE-004 AC-1 (no duplication)
* Preconditions: TC-070 has produced an open tab.
* Steps: invoke `vscode.openWith` with the same URI again.
* Expected: no new tab is created; the existing tab is focused.
* Priority: M  · Type: F  · Level: I  · Phase: v0.2

**TC-073** — Threads from ADO are reflected in markers on file open
* Requirement(s): REQ-COMMENT-006 AC-1, AC-2
* Preconditions: Fixture file has at least one pre-existing thread on a known line range.
* Steps: open the file in the rendered view.
* Expected: a marker appears at (or near) the rendered location of the thread within 5 s; clicking the marker opens the CommentInputView pre-populated with the existing comments and a reply field.
* Priority: C  · Type: F  · Level: E  · Phase: v0.2

### 5.9 FileTreeView (REQ-CORE-002, RISK-010)

**TC-091** — TreeView lists exactly the PR's changed files, grouped by directory
* Requirement(s): REQ-CORE-002 AC-2
* Preconditions: Fixture PR with files in two directories.
* Steps: open PR via TC-005; observe the `ADO PR: Files` view in the side bar.
* Expected: every changed file appears, grouped under a directory node; clicking a file invokes `vscode.openWith` with the appropriate `mdpr://` URI.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-092** — Non-markdown files appear but are flagged "not rendered here"
* Requirement(s): REQ-CORE-002 AC-2 (no silent omission)
* Preconditions: Fixture PR with a `.png` and a `.json` change.
* Steps: try to open a non-markdown file from the tree.
* Expected: the tree shows them visibly (e.g. greyed-out); attempting to open displays a notification recommending the regular ADO web UI.
* Priority: L  · Type: F  · Level: I  · Phase: v0.2

### 5.10 CommentInputView (REQ-COMMENT-001, REQ-COMMENT-003, RISK-007)

**TC-016** — Quote truncation boundary at 200 characters
* Requirement(s): REQ-COMMENT-003 AC-2
* Preconditions: Unit harness for the `truncateQuote(s, 200)` helper.
  Boundary inputs: strings of length 199, 200, 201.
* Steps: call `truncateQuote(input, 200)` for each length.
* Expected: length 199 → returned unchanged; length 200 → returned unchanged; length 201 → result has total length ≤ 200 and ends with the documented truncation indicator (e.g. `…`), preserving the longest possible prefix of the input.
* Priority: M  · Type: F  · Level: U  · Phase: v0.2

**TC-080** — CommentInputView opens pre-populated from a `precise` selection
* Requirement(s): REQ-COMMENT-001 AC-3, AC-4, REQ-COMMENT-003 AC-1
* Preconditions: Rendered view open; user has a `precise` selection over the phrase "the quick brown fox" (19 chars).
* Steps:
  1. Trigger the `markdownPrReview.addComment` command (or the equivalent keybinding from TC-125).
* Expected: the CommentInputView becomes visible in its declared view container (per `design.md` §4.1.3); the quoted-text region displays the exact selected phrase byte-for-byte; the body textarea is empty and receives focus; the Submit button is enabled only after at least one character is entered into the body.
* Priority: C  · Type: F  · Level: I  · Phase: v0.2

**TC-081** — CommentInputView truncates the *displayed* quote for long selections
* Requirement(s): REQ-COMMENT-003 AC-1, AC-3
* Preconditions: Selection of 350 characters spanning a single paragraph (mode `precise`).
* Steps:
  1. Trigger Add Comment.
  2. Inspect the rendered quote element's text length.
  3. Submit a comment with body "long-quote-test" against a mock ADO client.
* Expected: step 2 — the visible quote text is ≤ 200 chars and ends with the truncation indicator; step 3 — the POST payload's `rightFileStart` / `rightFileEnd` cover the *full* original 350-character range (the truncation is purely a display concern); no warning or error appears to the user.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-082** — CommentInputView is reachable and editable after a submission error
* Requirement(s): REQ-COMMENT-003 AC-3 (precondition: input remains reachable), RISK-007, REQ-COMMENT-004 AC-3
* Preconditions: Mock ADO client configured to return HTTP 500 on the first POST and HTTP 200 on the second.
* Steps:
  1. Open CommentInputView; type `draft`; click Submit.
  2. Observe the error state.
  3. Edit the body text to `draft v2`; click Submit.
* Expected: after step 1, the view stays visible with body `draft` retained and a non-blocking error banner; after step 2, no modal blocks input and the textarea is focusable; after step 3, the POST succeeds, the view closes, and a marker appears per TC-103.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

### 5.11 Comment Controller — Round-trip (REQ-COMMENT-003…005, RISK-005)

**TC-100** — Submit a new comment posts exactly one ADO thread
* Requirement(s): REQ-COMMENT-004 AC-1, CON-005
* Preconditions: Fixture file open; selection mapped `precise`; CommentInputView populated; mock ADO client recording POSTs.
* Steps: enter "Hello reviewer." and click Submit.
* Expected: exactly one `POST …/pullrequests/{id}/threads` is made; payload includes `rightFileStart` / `rightFileEnd` matching the mapper output; UI marker becomes visible within 5 s.
* Priority: C  · Type: F  · Level: I  · Phase: v0.2

**TC-101** — Submit comment with `coarse-mermaid` mapping uses block-range anchor
* Requirement(s): REQ-COMMENT-004 AC-2, REQ-COMMENT-002 AC-3
* Preconditions: As TC-100 but selection is inside a mermaid SVG.
* Steps: submit comment.
* Expected: the POST payload's range matches the mermaid block's source line range (per TC-052); no precise offsets are sent.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-102** — Network failure during POST shows error and preserves draft
* Requirement(s): REQ-COMMENT-004 AC-3, RISK-007
* Preconditions: Mock ADO client configured to error on `POST .../threads`.
* Steps: submit comment.
* Expected: a notification surfaces the failure; the CommentInputView remains populated with the draft text; user can retry without retyping.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-103** — Posted comment appears as a marker without page reload
* Requirement(s): REQ-COMMENT-005 AC-1, AC-3
* Preconditions: TC-100 succeeded.
* Steps: observe the rendered view immediately after submission.
* Expected: a comment marker is drawn at the anchor location within 5 s; the document is not re-rendered from scratch.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-104** — Marker click re-opens the thread (read + reply)
* Requirement(s): REQ-COMMENT-005 AC-2
* Preconditions: Marker from TC-103 present.
* Steps: click marker.
* Expected: CommentInputView opens; comment text and author are shown; reply field is available; resolving the thread updates the marker icon.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-105** — Refresh after submit does not duplicate the just-posted thread
* Requirement(s): REQ-COMMENT-005 AC-3, RISK-005
* Preconditions: TC-100 succeeded; mock ADO client returns the newly created thread on next `GET …/threads`.
* Steps: trigger a manual refresh.
* Expected: the marker count for the file stays at +1 (no duplicate marker); reconciliation matches the local optimistic record to the server thread by ID.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-106** — Threads on opened files are fetched at file-open time
* Requirement(s): REQ-COMMENT-006 AC-1
* Preconditions: Fixture file with two pre-existing threads (one resolved, one active).
* Steps: open the file.
* Expected: a `GET …/pullrequests/{id}/threads?$top=…` is made once; both threads are reflected, with distinct icons for active vs resolved.
* Priority: H  · Type: F  · Level: I  · Phase: v0.2

**TC-107** — Threads not anchored to the current file are not surfaced as markers
* Requirement(s): REQ-COMMENT-006 AC-3
* Preconditions: PR has a thread on a different file.
* Steps: open the fixture file under test.
* Expected: no marker for the unrelated thread appears in this tab; per-file filtering uses thread `pullRequestThreadContext.iterationContext.filePath`.
* Priority: M  · Type: F  · Level: I  · Phase: v0.2

### 5.12 Stale-PR Watcher (REQ-ERR-002, RISK-004)

**TC-110** — Watcher polls at the configured interval
* Requirement(s): REQ-ERR-002 AC-1, AC-3
* Preconditions: Mock ADO client; setting `markdownPrReview.staleCommitPollSeconds` set to `15` (the documented minimum).
* Steps: observe `GET …/pullrequests/{id}` calls for 2 minutes.
* Expected: between 7 and 9 polls occur (boundary tolerance ± 1 per minute); no polls when interval is set to `0` (disabled).
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-111** — `lastMergeSourceCommit` change triggers a "stale" banner
* Requirement(s): REQ-ERR-002 AC-2
* Preconditions: TC-110 running; mock changes `lastMergeSourceCommit` between polls.
* Steps: wait for the next poll.
* Expected: an in-tab banner appears stating the PR has been updated; rendered view becomes read-only (no Submit) per design; refresh action re-fetches files and resets the watcher.
* Priority: C  · Type: F  · Level: I  · Phase: v0.4

**TC-112** — Poll interval boundary validation
* Requirement(s): REQ-ERR-002 AC-3
* Preconditions: Settings UI.
* Steps: set the setting successively to `14`, `15`, `60`, `61`.
* Expected: `14` and `61` are rejected with a settings-error glyph; `15` and `60` are accepted.
* Priority: M  · Type: F  · Level: I  · Phase: v0.4

### 5.13 Status Bar, Settings, and Keybindings (REQ-UX-001…003)

**TC-120** — Status bar item shows current PR id and file count
* Requirement(s): REQ-UX-001 AC-1
* Preconditions: PR open.
* Steps: observe bottom-left status bar.
* Expected: text is exactly `ADO PR #<id> · <N> file(s)`; clicking it opens the file picker.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-121** — Status bar item shows progress during fetch
* Requirement(s): REQ-UX-001 AC-2
* Preconditions: Slow mock response (3 s).
* Steps: open a file from the picker.
* Expected: status text changes to `ADO PR #<id> · Fetching…` until response arrives.
* Priority: L  · Type: F  · Level: I  · Phase: v0.3

**TC-122** — Status bar item disappears within 1 s after closing all PR tabs
* Requirement(s): REQ-UX-001 AC-3
* Preconditions: One PR tab open with status bar item visible.
* Steps: close the tab.
* Expected: status bar item is removed within 1 second.
* Priority: L  · Type: F  · Level: I  · Phase: v0.3

**TC-123** — Settings register under `markdownPrReview.*` namespace
* Requirement(s): REQ-UX-002 AC-1
* Preconditions: Extension installed.
* Steps: open VS Code Settings; search for "markdownPrReview".
* Expected: `markdownPrReview.defaultOrganization`, `markdownPrReview.defaultProject`, and `markdownPrReview.staleCommitPollSeconds` (as declared in `package.json`) appear with descriptions.
* Priority: L  · Type: F  · Level: Stc · Phase: v0.3

**TC-124** — Bare PR id resolves when a default org and project are configured
* Requirement(s): REQ-UX-002 AC-2
* Preconditions: `markdownPrReview.defaultOrganization` and `markdownPrReview.defaultProject` are set.
* Steps: run `markdownPrReview.openPullRequest` and enter a bare numeric PR id (no URL).
* Expected: the extension resolves the PR from the configured org/project and opens the review session, per REQ-UX-002 AC-2.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-125** — Default keybinding for "Add Comment" works
* Requirement(s): REQ-UX-003 AC-1
* Preconditions: Selection mapped `precise` in a rendered view.
* Steps: press the documented chord (per `package.json`).
* Expected: CommentInputView opens with the selection pre-quoted.
* Priority: M  · Type: F  · Level: I  · Phase: v0.3

**TC-126** — All core commands are reachable from the command palette
* Requirement(s): REQ-UX-003 AC-1 (keyboard reachability)
* Preconditions: Extension activated.
* Steps: in the palette, type `ADO PR Reviewer:` and enumerate the offered commands.
* Expected: at least `Open PR…`, `Refresh PR`, `Toggle Diff Annotations`, `Add Comment`, `Sign Out` appear; each executes its declared command without error from an empty selection state (where applicable).
* Priority: L  · Type: F  · Level: I  · Phase: v0.3

### 5.14 Error Handling (REQ-ERR-001…003, RISK-008)

**TC-130** — Errors are logged to the `ADO PR Reviewer` output channel
* Requirement(s): REQ-ERR-001 AC-1, AC-2
* Preconditions: Force an error in any code path (e.g. inject malformed PR URL).
* Steps: open `View › Output › ADO PR Reviewer`.
* Expected: a structured log line appears with timestamp, severity, message, and a stable error code; the URL and PR id are present but no token or PII is.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-131** — 401 propagates to the user only after one silent retry
* Requirement(s): REQ-AUTH-002 AC-2, REQ-ERR-001 AC-3
* Preconditions: As TC-012 / TC-013.
* Steps: observe the user-visible notification stream.
* Expected: at most one notification per failed user action; no notification for the silent retry.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-132** — Stale-commit banner uses a distinct severity (Warning) and a sticky duration
* Requirement(s): REQ-ERR-002 AC-2
* Preconditions: Trigger TC-111.
* Steps: observe the in-tab banner.
* Expected: banner uses warning styling; does not auto-dismiss; offers a "Refresh PR" action.
* Priority: M  · Type: F  · Level: I  · Phase: v0.4

**TC-133** — Files exactly at the size limit render; one byte over rejects
* Requirement(s): REQ-ERR-003 AC-1, AC-2
* Preconditions: Two mock files: 5 242 880 bytes (5 MB exact) and 5 242 881 bytes.
* Steps: open each in turn.
* Expected: the 5 MB file renders; the 5 MB + 1 file is rejected per TC-014 expectations; the rejection notification offers an "Open in ADO web" action.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

### 5.15 NFR — Performance / Compatibility / Security / Maintainability

**TC-140** — Mermaid render < 2 s per diagram on the fixture
* Requirement(s): REQ-CORE-007 AC-2
* Preconditions: Fixture mermaid diagram (TC-038).
* Steps: measure wall-clock between renderer dispatch and SVG visible.
* Expected: median over 5 runs ≤ 2 000 ms; no individual run > 3 000 ms (test fails if 95th percentile breaches budget).
* Priority: M  · Type: P  · Level: E  · Phase: v0.4

**TC-141** — 200 KB markdown renders under 500 ms (boundary)
* Requirement(s): REQ-NFR-PERF-001 AC-1, ASM-007
* Preconditions: Three boundary files of 199 999, 200 000, 200 001 bytes
  (the third exceeds the budget surface but is still under the 5 MB hard
  limit).
* Steps: open each in the rendered view, measure render time.
* Expected: 199 999 and 200 000 byte files render in ≤ 500 ms median over 5 runs; the 200 001 byte file is allowed to exceed 500 ms but must complete (no perf-related rejection).
* Priority: H  · Type: P  · Level: E  · Phase: v0.4

**TC-142** — 50 comment-create flows produce 0 re-auth prompts
* Requirement(s): REQ-NFR-UX-001 AC-1
* Preconditions: Valid session; mock ADO client returning 200 for all thread POSTs.
* Steps: run an automated loop performing 49, 50, 51 comment submissions
  (boundary). Token expiry is *not* simulated.
* Expected: zero `getSession({ createIfNone: true })` prompts at any of the three counts; same applies for the boundary count.
* Priority: H  · Type: F  · Level: I  · Phase: v0.4

**TC-143** — `package.json` declares `"engines": {"vscode": "^1.85.0"}`
* Requirement(s): REQ-NFR-COMPAT-001 AC-1
* Preconditions: Source checkout.
* Steps: inspect `package.json`.
* Expected: the engines entry matches; activation events use only APIs available since 1.85.
* Priority: H  · Type: Stc · Level: Stc · Phase: v0.4

**TC-144** — No native (compiled) dependencies in `node_modules`
* Requirement(s): REQ-NFR-COMPAT-001 AC-2
* Preconditions: Clean `npm install --omit=dev`.
* Steps: run `npm ls --omit=dev`; scan for any package containing `binding.gyp` or `.node`.
* Expected: zero matches; `.vsix` does not embed any pre-built native binary.
* Priority: H  · Type: Stc · Level: Stc · Phase: v0.4

**TC-145** — Log redaction never leaks tokens, secrets, or full URLs with token query
* Requirement(s): REQ-ERR-001 AC-3, RISK-008
* Preconditions: Unit test of `redact(s)` helper.
* Steps: feed a payload containing `Bearer eyJ…`, `Authorization: …`, and a URL with `?access_token=xxx`.
* Expected: each is replaced with a `[REDACTED]` sentinel; original payload is recoverable only from the un-redacted source.
* Priority: C  · Type: S  · Level: U  · Phase: v0.4

**TC-146** — `tsc --noEmit --strict` passes
* Requirement(s): REQ-NFR-MAINT-001 AC-2
* Preconditions: Source checkout.
* Steps: run `npm run typecheck` (or equivalent).
* Expected: exit code 0; no errors.
* Priority: H  · Type: Stc · Level: Stc · Phase: v0.2

**TC-147** — `npm ls --omit=dev` shows only the documented runtime dependencies
* Requirement(s): REQ-NFR-MAINT-001 AC-1, DEP-005, DEP-006
* Preconditions: Clean install.
* Steps: run `npm ls --omit=dev` and diff against the documented set in `design.md` §7.
* Expected: production dependency tree matches the documented set (markdown-it, mermaid, plus their direct transitive deps); no surprise packages.
* Priority: M  · Type: Stc · Level: Stc · Phase: v0.4

**TC-148** — Webview HTML never contains an inline `<script>` without nonce
* Requirement(s): REQ-NFR-SEC-001 AC-1, AC-2, RISK-002
* Preconditions: Render any fixture file.
* Steps: in dev tools inspect the webview HTML for `<script>` tags.
* Expected: every `<script>` carries a `nonce` attribute matching the CSP nonce; no inline event handlers (`onclick`, `onerror`, etc.) exist on rendered output.
* Priority: C  · Type: S  · Level: E  · Phase: v0.2

### 5.16 End-to-End Smoke (manual) — required gate per phase

**TC-150** — v0.1 happy-path round-trip
* Requirement(s): REQ-CORE-001…007, REQ-COMMENT-001…005, REQ-AUTH-001
* Preconditions: Fixture PR; signed-in VS Code.
* Steps:
  1. Run `ADO PR Reviewer: Open PR…`, paste the fixture URL.
  2. Pick the medium markdown file from the file picker.
  3. Confirm rendered content matches the source visually.
  4. Select a phrase inside a paragraph; trigger Add Comment.
  5. Type "smoke-test", submit.
  6. Confirm marker appears; click it; confirm thread + reply field show.
  7. In the ADO web UI, open the same PR and confirm the thread is anchored
     at the same line and includes the quoted phrase.
* Expected: every step succeeds without errors; the comment appears with
  correct anchoring in both VS Code and ADO web; total wall-clock < 5 min.
* Priority: C  · Type: F  · Level: E  · Phase: v0.1

**TC-151** — v0.1 mermaid round-trip
* Requirement(s): REQ-CORE-007, REQ-COMMENT-002 (coarse mermaid)
* Preconditions: Fixture file with mermaid diagram.
* Steps:
  1. Open the file.
  2. Confirm the mermaid SVG renders.
  3. Select inside the SVG, post a comment "mermaid-coarse-test".
  4. Verify the thread appears in ADO web anchored to the fenced block.
* Expected: as above; anchor lines in ADO match the source fence range.
* Priority: H  · Type: F  · Level: E  · Phase: v0.1

**TC-152** — v0.2 multi-file picker exercise
* Requirement(s): REQ-CORE-002, REQ-CORE-004
* Preconditions: Fixture PR ≥ 3 markdown files.
* Steps: open three files in succession from the TreeView; switch among them; confirm drafts persist across switches.
* Expected: no tab loses state when another is focused; CSP-controlled webviews recover correctly when retainContextWhenHidden flips.
* Priority: H  · Type: F  · Level: E  · Phase: v0.2

**TC-153** — v0.3 diff-annotation visual check
* Requirement(s): REQ-DIFF-001, REQ-DIFF-002
* Preconditions: Fixture file with three known diffs.
* Steps: open the file in rendered view; toggle annotations off and on.
* Expected: gutter markers align with the three known diff regions; toggling is instantaneous; behaviour matches the ADO web "Files (diff)" tab for the same file.
* Priority: M  · Type: F  · Level: E  · Phase: v0.3

**TC-154** — v0.4 full review session "no manual interventions"
* Requirement(s): aggregate of all REQs; pass criterion for v0.4 gate.
* Preconditions: Real PR (the user picks one of their own real reviews,
  not the synthetic fixture); session length budget 30 min.
* Steps: conduct a normal review using only the extension; log every time the user has to switch to the ADO web UI or restart the extension.
* Expected: zero forced switches to ADO web (other than for non-markdown files per CON-003); zero extension restarts; zero re-auth prompts.
* Priority: C  · Type: F  · Level: E  · Phase: v0.4

### 5.17 Assumption-Verification Spikes (run-once)

**TC-160** — Empirical: `rightFileStart.line / .offset` indexing (ASM-004, OQ-1)
* Steps:
  1. Pick a fixture file with a unique phrase at known line N column C (1-indexed in editors).
  2. Manually `POST …/threads` with `rightFileStart: { line: N, offset: C }` and `rightFileEnd: { line: N, offset: C + len(phrase) }`.
  3. View the resulting thread in ADO web.
* Expected: the thread is anchored over the expected phrase. Record whether `offset` is 1-indexed or 0-indexed and update `design.md` §3.2 if the observed indexing differs from the assumption.
* Priority: C  · Type: F  · Level: E  · Phase: v0.1

**TC-161** — Empirical: Microsoft auth scope works without prompt (ASM-006, OQ-2)
* Steps:
  1. From a fresh VS Code window (or after signing out the Microsoft provider), trigger TC-010.
* Expected: the documented scope `499b84ac-1321-427f-aa17-267ca6975798/.default` produces a session that can read `…/pullrequests/{id}/threads`. If a different scope is required, update `design.md` §3.2 and `requirements.md` REQ-AUTH-001 wording.
* Priority: C  · Type: F  · Level: E  · Phase: v0.1

**TC-162** — Empirical: ADO REST rate-limit budget for stale-watcher (DEP-003)
* Steps:
  1. With the watcher at minimum interval (15 s), run a 30-min review.
* Expected: zero HTTP 429 responses for `GET pullrequests/{id}`. If any occur, raise the minimum interval and re-run.
* Priority: M  · Type: F  · Level: E  · Phase: v0.4

**TC-163** — Empirical: built `.vsix` activates in a fresh VS Code (ASM-008)
* Steps:
  1. Run `npm run package` to produce `.vsix`.
  2. Install in a fresh VS Code profile (`--profile temp`).
  3. Trigger `markdownPrReview.openPullRequest`.
* Expected: extension activates; no missing-dependency errors; commands reachable.
* Priority: H  · Type: F  · Level: E  · Phase: v0.4

**TC-164** — Empirical: Mermaid 10.x renders under our CSP (ASM-002, ASM-009, OQ-3)
* Steps: run TC-038 against fixture diagrams of three types: flowchart, sequence, class diagram.
* Expected: all three render; no CSP console violations. If any fail, downgrade mermaid (per RISK-009 mitigation) and retest.
* Priority: C  · Type: F  · Level: E  · Phase: v0.2

**TC-165** — Empirical: selection-mapping precision rate on real reviews (OQ-9)
* Steps:
  1. During TC-154, instrument the mapper to emit a structured log line per selection containing only `{ mode }` — no PII.
  2. Compute the fraction of selections that resulted in `mode='precise'`.
* Expected: ≥ 80 % `precise` on a typical 30-min review; if lower, raise OQ-9 as a v1.1 follow-up.
* Priority: M  · Type: F  · Level: E  · Phase: v0.4

### 5.18 Static Architectural Checks (CON-001, CON-006, CON-007)

**TC-094** — Source scan for forbidden APIs
* Requirement(s): CON-001, CON-006, CON-007
* Preconditions: Source checkout.
* Steps: run `grep -nE "child_process|workspace\.fs\.writeFile|workspace\.fs\.delete" -r src/`.
* Expected: zero matches in production source (matches inside test fixtures or comments tagged `// allowed:` are acceptable but justified).
* Priority: H  · Type: Stc · Level: Stc · Phase: v0.4

### 5.19 Active-Branch PR Discovery (REQ-CORE-008)

**TC-006** — ADO remote-URL parser: canonical `dev.azure.com` remote
* Requirement(s): REQ-CORE-008 AC-1, CON-002
* Preconditions: Unit test harness, no live network.
* Steps:
  1. Call `parseAdoRemoteUrl` on `https://dev.azure.com/contoso/MyProj/_git/MyRepo`, its `.git`-suffixed form, and the `https://contoso@dev.azure.com/...` userinfo form.
* Expected: each returns `{ organization: 'contoso', project: 'MyProj', repositoryName: 'MyRepo' }`; a trailing `.git` and a `{org}@` userinfo prefix are stripped.
* Priority: H  · Type: F  · Level: U  · Phase: v0.5

**TC-007** — ADO remote-URL parser: legacy, SSH, and non-ADO remotes
* Requirement(s): REQ-CORE-008 AC-1, AC-4, CON-002
* Preconditions: Unit test harness.
* Steps:
  1. Parse `https://contoso.visualstudio.com/MyProj/_git/MyRepo`, the `.../DefaultCollection/MyProj/_git/MyRepo` variant, and `git@ssh.dev.azure.com:v3/contoso/MyProj/MyRepo`.
  2. Parse a non-ADO remote such as `git@github.com:owner/repo.git`.
* Expected: the ADO forms normalize to `{ organization: 'contoso', project: 'MyProj', repositoryName: 'MyRepo' }`; the non-ADO remote returns a typed parse error and does not throw.
* Priority: H  · Type: F  · Level: U  · Phase: v0.5

**TC-008** — Discovered-PR → Quick Pick item and `PullRequestRef` mapping
* Requirement(s): REQ-CORE-008 AC-2
* Preconditions: Unit test harness.
* Steps:
  1. Map a list of discovered PRs (including one with `isDraft: true`) to Quick Pick items and to `PullRequestRef`s via the pure picker helpers.
* Expected: each item label reads `#{id} — {title}` (drafts carry a draft marker); each `PullRequestRef` is built from the PR's own `repository.id` / `name` and round-trips through `isPullRequestRef`.
* Priority: H  · Type: F  · Level: U  · Phase: v0.5

**TC-009** — Active-branch discovery end to end (happy path + edge cases)
* Requirement(s): REQ-CORE-008 AC-1, AC-2, AC-3, AC-4
* Preconditions: Extension Development Host signed in to ADO; a branch with one active PR, a branch with several, and a branch with none.
* Steps:
  1. On each branch, run `markdownPrReview.openPullRequestForCurrentBranch`.
  2. Also exercise: not a git repository / Git extension disabled, detached HEAD, and a non-ADO remote.
* Expected: one match opens after the Quick Pick; several show a Quick Pick; zero shows an informational message noting fork-sourced PRs are excluded; each error state shows a distinct actionable message with no unhandled exception and no secret in the Output channel.
* Priority: C  · Type: F  · Level: I  · Phase: v0.5

---

## 6. Risk-Based Test Prioritization

Priority levels combine business impact (from `requirements.md` §6) with
the probability of latent defects given the design's complexity hotspots.
A test's priority determines:

* Whether it MUST be re-executed for every release candidate (Critical and
  High), only for the milestone introducing it (Medium), or opportunistically
  (Low).
* The depth of investigation for any failure: Critical failures block
  release; High failures block the affected feature area; Medium / Low
  failures may be deferred with a tracked work item.

### 6.1 Critical (must-pass every release candidate)

| Area                                | Tests                                                          | Rationale |
| ----------------------------------- | -------------------------------------------------------------- | --------- |
| Comment anchoring correctness       | TC-050…058, TC-101, TC-160                                     | Core value proposition (RISK-001, REQ-COMMENT-002). A misanchored comment in a real review is the single most-damaging failure mode. |
| Webview security (CSP, XSS, leaks)  | TC-060, TC-062, TC-145, TC-148, TC-033                         | RISK-002, REQ-NFR-SEC-001. Browser-style execution context inside the editor host. |
| Comment round-trip                  | TC-100, TC-103, TC-150                                         | RISK-005, REQ-COMMENT-004. End-to-end utility depends on this. |
| Auth foundation                     | TC-010, TC-011, TC-012, TC-161                                 | REQ-AUTH-001/002. Failure mode is "nothing works at all." |
| Stale PR detection                  | TC-111                                                         | RISK-004. Posting on a stale commit is silently wrong, hard to recover from. |
| Markdown source-line attribution    | TC-031                                                         | Precondition for the entire anchoring pipeline. |
| Tab opening (CustomEditorProvider)  | TC-070                                                         | Without this, no rendered view works (RISK-010). |
| Mermaid rendering under CSP         | TC-038, TC-164                                                 | RISK-009, ASM-002, ASM-009. Failure forces a major redesign. |
| Round-trip integration on real ADO  | TC-150, TC-154                                                 | Acceptance gates for v0.1 and v0.4 respectively. |

### 6.2 High (must-pass for the feature area's release)

* TC-002, TC-003, TC-004, TC-005 — PR URL handling
* TC-013, TC-014, TC-021, TC-022, TC-073 — fetch and read pipeline
* TC-032, TC-037, TC-039 — renderer robustness
* TC-040 — diff annotator base case
* TC-051, TC-053, TC-054, TC-055, TC-056, TC-057 — selection mapper modes
* TC-061 — input-view CSP
* TC-071, TC-091, TC-102, TC-104, TC-105, TC-106 — multi-file, error recovery, reconciliation
* TC-110, TC-130, TC-131, TC-133, TC-141, TC-142, TC-143, TC-144, TC-146, TC-163 — error & NFR gates
* TC-151, TC-152 — phase smoke tests

### 6.3 Medium (must-pass at the introducing milestone; may regress with a tracked issue thereafter)

* TC-034, TC-035, TC-036 — code-block niceties
* TC-041, TC-042, TC-043, TC-044 — diff annotator detail and toggle
* TC-107, TC-112, TC-120, TC-124, TC-125, TC-132, TC-140, TC-147, TC-153, TC-162, TC-165 — UX, telemetry-equivalents, and quality-of-life

### 6.4 Low (best-effort)

* TC-092 — non-markdown file handling
* TC-121, TC-122, TC-123, TC-126 — status bar / palette niceties

---

## 7. Pass/Fail Criteria

### 7.1 Per-Test Pass Criteria

A test passes only when **all** of the following hold:

1. Every requirement / AC listed under "Requirement(s)" is observably
   satisfied as described in "Expected".
2. No unhandled exception is logged to the host extension's debug console
   or to the rendered-view / comment-input webview developer consoles.
3. No CSP violations are emitted (Critical / High security tests).
4. No PII or token fragment appears in any log output captured during the
   test (universal; see TC-145).
5. The test's preconditions were actually met (e.g. fixture file matches
   the expected shape); otherwise the result is "Skipped — prerequisite
   unmet", not "Pass".

Per-test fail: any of the above is violated. There is no "partial pass."

### 7.2 Per-Phase Gates

Each release-phase gate is the conjunction of:

* All **Critical** tests for the phase: pass.
* ≥ 95 % of **High** tests for the phase: pass; any failures have a tracked
  work item and a documented user-visible workaround.
* ≥ 80 % of **Medium** tests for the phase: pass.
* Low tests: no gate; failures are recorded for future investigation.

Concrete per-phase gates:

* **v0.1 gate.** TC-150, TC-151, TC-160, TC-161 must all pass on the real
  fixture PR. The plan accepts that no automated suite exists yet (per
  `design.md` §5 decision). The user manually executes the smoke and
  records observations.
* **v0.2 gate.** All v0.2-phase Critical and High tests pass; the
  Selection Mapper unit suite covers every `mappingMode` enum value;
  TC-148 confirms webview CSP nonce discipline.
* **v0.3 gate.** Diff annotator tests + status bar/settings tests pass;
  TC-153 confirms the diff view visually matches ADO web for the fixture.
* **v0.4 gate ("personally dogfoodable").** TC-154 passes — a real
  30-minute review can be completed without forced fallback to ADO web,
  without extension restart, without re-auth prompts. All Critical tests
  re-executed and pass.

### 7.3 Overall Project Pass Criterion

The project is "validation-complete for personal v1 release" when:

* All four phase gates have passed.
* Every assumption-verification spike (TC-160…165) has been executed and
  any disconfirming evidence has been reflected back into
  `requirements.md` and `design.md`.
* All open questions `OQ-1` through `OQ-9` in `design.md` §8 are either
  resolved or explicitly deferred with a recorded rationale.

### 7.4 Fail Triage Policy

* **Critical fail:** stop release; treat as P0; fix before any further
  feature work.
* **High fail:** stop the affected feature for the current release;
  consider hiding the feature behind a setting (off by default) if a fix is
  not available.
* **Medium fail:** open a tracked work item; release allowed with a known
  issue documented in the release notes.
* **Low fail:** record for future investigation.

---

## 8. Revision History

| Version | Date       | Author                                                                                       | Notes                                                                                                                            |
| ------- | ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-06-02 | Pipeline stage `author-validation-plan` (PromptKit, persona: `systems-engineer`); consumes `requirements.md` v0.3 + `design.md` v0.2 | Initial validation plan. Full traceability matrix, 90 test cases across 17 component / scenario groups, risk-based prioritisation, four phase gates. |
| 1.1     | 2026-07-09 | Active-Branch PR Discovery (user sign-off) | Added REQ-CORE-008 traceability row (TC-006…009) and §5.19 defining TC-006…009 (ADO remote-URL parser, discovered-PR → Quick Pick mapping, and end-to-end discovery incl. edge cases). No renumbering of existing test cases. |
