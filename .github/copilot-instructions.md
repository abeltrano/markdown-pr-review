# Copilot instructions for `markdown-pr-review`

VS Code extension that turns Azure DevOps pull requests for markdown
files (design docs, architecture proposals) into a Word-style review
surface: fully rendered prose + mermaid + diff gutters, with text
selections that round-trip to real ADO PR threads.

## Where to read the rules

This file is a thin pointer. The substantive documentation lives in
`docs/` so it stays useful to humans who aren't using AI tooling.

- **Project context, build pipeline, architecture, internals, and
  gotchas** → [`docs/development.md`](../docs/development.md)
- **Coding style and conventions per language** →
  [`docs/coding-style.md`](../docs/coding-style.md) (the per-language
  files alongside this one are thin pointers into the same doc, each
  scoped via `applyTo` so VS Code applies them only to matching
  files).
- **Product specification** → [`docs/requirements.md`](../docs/requirements.md),
  [`docs/design.md`](../docs/design.md), and
  [`docs/validation-plan.md`](../docs/validation-plan.md).
- **Contributor workflow** (commits, PRs, debugging) →
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## High-leverage rules to remember

These are the ones that, if forgotten, have repeatedly produced bugs
or regressions in this codebase. Always read the linked docs for
nuance, but never violate these without strong justification.

- **Wait for the webview to post `ready` before sending `init`** and
  **register the message handler before assigning `webview.html`**
  — both are required to avoid silent empty renders.
- **Never log secret-bearing values directly.** Anything that may
  carry a token, PAT, JWT, or ADO response body must pass through
  `redact(...)` from `src/redact.ts` first. Use
  `getLogger('Component')` from `src/logger.ts` — not `console.log`.
- **ADO uses 1-indexed lines and offsets**, and **`offset: 9999`** is
  the end-of-line sentinel. Preserve both whenever building a
  `LineOffset`.
- **Never hand-craft a webview CSP.** Always go through
  `buildRenderedViewCsp` / `buildCommentInputCsp` from
  `src/views/csp.ts`.
- **Doc citation IDs**: use `REQ-XXX` (`docs/requirements.md`),
  `RISK-XXX`, `TC-XXX` (`docs/validation-plan.md`), `ASM-XXX`. Do
  not reintroduce the retired `D-XXX` or `TASK-XXX` IDs.
