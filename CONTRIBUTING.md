# Contributing to Markdown PR Review

Thanks for your interest! This guide covers how to build, test, and
submit changes to the extension.

## Prerequisites

- **Node.js** ≥ 20 ([download](https://nodejs.org/))
- **VS Code** ≥ 1.85
- An Azure DevOps account if you want to exercise the extension
  end-to-end (most unit tests do not require one).

## Getting started

```bash
git clone <your-fork-url>
cd markdown-pr-review
npm install
```

## Common commands

| Command           | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `npm run watch`   | esbuild bundles `out/extension.js` and re-bundles on save |
| `npm run build`   | Full type-check (tsc) + production bundle (esbuild)       |
| `npm run lint`    | ESLint (flat config, zero-warning policy)                 |
| `npm test`        | Mocha unit suite (`test/unit/**/*.test.ts`)               |
| `npm run package` | Build + produce a `.vsix` via `vsce`                      |

`npm run watch` only runs esbuild, not `tsc` — run `npm run build`
periodically to catch type errors that the bundler tolerates.

## Debugging the extension

1. Open the repo in VS Code.
2. Run `npm run watch` in a terminal so `out/extension.js` stays fresh.
3. Press **F5** to launch the **Extension Development Host** with the
   extension installed.
4. In the dev-host window, run the **Markdown PR Review: Open Pull
   Request…** command from the palette.
5. **Output** panel → channel **Markdown PR Review** for diagnostic
   logs.

The dev-host inherits your normal VS Code settings, so any auth sessions
or PAT you've configured will flow through.

## Project layout

```
src/
├── extension.ts              # activate() / deactivate()
├── session-manager.ts        # PR session lifecycle, panel management
├── ado-client.ts             # REST client for Azure DevOps
├── auth-manager.ts           # Entra ID + PAT acquisition
├── stale-pr-watcher.ts       # polls for newer head commits
├── status-bar.ts             # active-PR + sign-in indicator
├── renderer/                 # markdown-it pipeline, diff annotator
├── views/                    # webview HTML, CSP, message types
│   ├── rendered-view/        # rendered markdown panel
│   ├── comment-input/        # comment composer
│   └── file-tree/            # changed-files tree provider
├── selection-mapper/         # rendered → source line mapping
└── redact.ts                 # secret-redaction for output channel
test/unit/                    # Mocha + Chai + tsx; mirrors src/
docs/
├── requirements.md
├── design.md
└── validation-plan.md
```

For a deeper tour of the codebase, read:

- [`docs/development.md`](docs/development.md) — day-to-day developer
  guide: build pipeline, runtime architecture, webview/postMessage
  protocol, selection mapper, diff annotator, auth, logging, CSP,
  ADO quirks, and "things that have bitten this codebase".
- [`docs/design.md`](docs/design.md) — formal product design (the
  architecture-of-record with REQ-IDs and mermaid diagrams).
- [`docs/requirements.md`](docs/requirements.md) and
  [`docs/validation-plan.md`](docs/validation-plan.md) — the spec
  surface that derives those REQ-IDs.

## Coding style

Full per-language rules live in
[`docs/coding-style.md`](docs/coding-style.md). That document is the
single source of truth; the files in `.github/instructions/` are
thin pointers that scope the same rules to specific globs so VS
Code Copilot applies them correctly.

At a glance:

- **EditorConfig** drives whitespace (2-space indent, LF line
  endings).
- **ESLint** is the source of truth for TS/JS style; CI fails on
  any warning. Run `npm run lint -- --fix` to auto-fix what's
  auto-fixable.
- Prefer **named exports** over default exports, and
  **`async`/`await`** over raw promise chains.
- Never write `void someAsync()` without a leading comment
  explaining why the rejection is genuinely safe to ignore.
- Never log secret-bearing strings directly — route through
  `redact()` in `src/redact.ts`.

## Tests

The unit suite uses Mocha + Chai + `tsx` (no separate compile step).
All tests live under `test/unit/`, mirroring the `src/` tree where
applicable.

Add a test whenever you:

- Fix a bug (write the failing test first when practical).
- Add a new public function or webview message type.
- Change behavior in `renderer/`, `selection-mapper/`, or
  `ado-client.ts`.

Run a single file:

```bash
npx mocha test/unit/renderer/renderer.test.ts
```

(The `--import=tsx` loader is wired in `.mocharc.cjs`, so no extra
flags are needed.)

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
`perf`, `build`, `ci`, `ui`.

Examples from the log:

```
feat(rendered-view): honor markdown.styles + live restyle on config change
fix(webview): register message handler before webview.html
ui(rendered): use codicon-comment-discussion for thread markers
```

## Pull requests

1. Branch from `main`.
2. Make sure `npm run lint && npm run build && npm test` all pass
   locally before opening the PR.
3. Update **`CHANGELOG.md`** under the `## [Unreleased]` heading.
4. Fill in the PR template; include a screenshot or short GIF for any
   user-visible change.
5. CI must be green before review.

## Security

If you find a security issue, **do not file a public issue**. See
[`SECURITY.md`](SECURITY.md) for the disclosure process.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE).
