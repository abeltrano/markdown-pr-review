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
