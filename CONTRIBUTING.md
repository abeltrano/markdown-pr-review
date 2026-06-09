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
| `npm run test:coverage` | Mocha under [c8](https://github.com/bcoe/c8) — writes `coverage/` and enforces thresholds |
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
  `redact()` in [`src/redact.ts`](src/redact.ts).

## Tests

The unit suite uses Mocha + Chai + `tsx` (no separate compile step).
All tests live under `test/unit/`, mirroring the `src/` tree where
applicable.

Add a test whenever you:

- Fix a bug (write the failing test first when practical).
- Add a new public function or webview message type.
- Change behavior in `renderer/`, `selection-mapper/`, or
  [`ado-client.ts`](src/ado-client.ts).

Run a single file:

```bash
npx mocha test/unit/renderer/renderer.test.ts
```

(The `--import=tsx` loader is wired in
[`.mocharc.cjs`](.mocharc.cjs), so no extra
flags are needed.)

### Coverage

[`c8`](https://github.com/bcoe/c8) (V8 native coverage — no source
instrumentation, so it composes cleanly with the existing `tsx`
loader) runs the same Mocha suite and writes reports to `coverage/`:

```bash
npm run test:coverage          # text + HTML + lcov; fails on threshold regression
start coverage/index.html      # browse the HTML report (Windows)
open coverage/index.html       # macOS
xdg-open coverage/index.html   # Linux
```

CI runs the same command on `ubuntu-latest` and uploads `lcov.info`
to [Codecov](https://about.codecov.io/) via OIDC (no token needed
for public repos).

#### What's measured (and what isn't)

c8 thresholds live in the `c8` block of
[`package.json`](package.json) and gate the **unit-testable** surface:

| Included                                    | Excluded                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `src/renderer/**`                           | Files that `import` from `'vscode'` (cannot run under mocha + tsx)  |
| `src/selection-mapper/**`                   | `src/views/rendered-view/**` and `src/views/comment-input/**` (browser-only bundles) |
| `src/redact.ts`, `src/pr-url-parser.ts`     | `src/types.ts` (interface-only, no executable code)                 |
| `src/error-classification.ts`, `ado-errors.ts` | `src/ado-client.ts`, `src/comment-controller.ts` (testable but currently untested — see below) |

Thresholds: **93% lines/statements**, **95% functions**, **80%
branches**. They sit just under the current measured values
(96%/98.5%/83.5%) so any meaningful regression in tested-surface
coverage fails the `coverage` CI job.

#### Adding tests for new code

- A new pure module under `src/` is included in coverage automatically
  via `c8.include: ["src/**/*.ts"]` — write tests for it so the
  thresholds keep holding.
- A new module that `import`s `'vscode'` cannot be exercised by the
  Node + mocha + tsx pipeline. Either:
  1. Refactor the pure logic into a separate file that does not
     depend on `vscode`, test that file, and keep the thin
     vscode-bound shim excluded; **or**
  2. Add the new file to the `c8.exclude` list in
     [`package.json`](package.json) and document the gap.

The long-term direction is to grow the tested surface — both
`ado-client.ts` (with `fetch` mocking) and `comment-controller.ts`
(with stubs for the input view and ADO client) are reachable from
Node tests and are excluded only because tests have not been written
yet. Removing them from `c8.exclude` once tests land is the
expected ratchet.

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

### Signed commits

`main` is protected with **required signatures**. Every commit
landing on `main` must carry a valid GPG, SSH, or S/MIME signature
that GitHub can verify against a key registered on the committer's
GitHub account.

The simplest path on a fresh machine is SSH signing, reusing the
same SSH key you use to push:

```bash
# Tell git to sign commits and tags with your SSH key.
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Then register that same public key on GitHub a **second** time
under **Settings → SSH and GPG keys → New SSH key → Key type:
Signing Key** (signing keys are distinct from auth keys in
GitHub's model, even if the bytes are identical).

Verify a commit you've already made shows `verified` on GitHub:

```bash
git push origin <branch>
gh api repos/abeltrano/markdown-pr-review/commits/<sha> \
  --jq '.commit.verification'
```

## Pull requests

`main` is protected: every change — even from the sole maintainer —
lands via a pull request that must pass CI (`lint + build + test` and
`coverage`) before merging. Direct pushes to `main` are not allowed
for non-admin users; admins can bypass for emergencies.

A typical change looks like:

1. Branch from `main` (`git checkout -b feat/foo`).
2. Make sure `npm run lint && npm run build && npm test` all pass
   locally before opening the PR.
3. Commit using [Conventional Commits](#commits). The commit subject
   becomes the squash-merge subject on `main` and the user-visible
   release-note entry, so make it descriptive.
4. Run the PR helper:

   ```powershell
   ./scripts/new-pr.ps1
   ```

   This pushes the branch, creates a PR via `gh pr create --fill`
   (title and body come from the last commit), and enables squash
   auto-merge so the PR lands the moment CI is green. Pass `-Draft`
   to skip auto-merge.
5. After the PR auto-merges, refresh `main`:

   ```bash
   git checkout main && git pull && git branch -D <feature-branch>
   ```

Release notes live in [`CHANGELOG.md`](CHANGELOG.md), grouped by
release tag, and are generated from Conventional Commits via
[git-cliff](https://git-cliff.org/). The file is only updated as
part of a release PR — see [Cutting a release](#cutting-a-release)
below. Day-to-day feature PRs do not need to touch `CHANGELOG.md`.

Conversation threads opened on a PR must be resolved before the PR
can merge. Squash-merging is the only enabled merge strategy, so
each PR becomes a single Conventional-Commit-style entry on `main`.

## Cutting a release

Releases are end-to-end automated by
[`.github/workflows/release.yml`](.github/workflows/release.yml): a
signed annotated tag push triggers a workflow that packages the
extension, publishes to the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=abeltrano.md-pr-review)
via federated Microsoft Entra ID (no PAT), and creates a matching
GitHub Release with the `.vsix` attached.

Two manual steps frame the automation:

### 1. Open a release-bump PR

```bash
# Pick the next version per semver. Bump in package.json.
npm version <X.Y.Z> --no-git-tag-version

# Regenerate CHANGELOG with the new section at the top.
npx git-cliff --tag v<X.Y.Z> --output CHANGELOG.md

# Stage, commit (signed), open PR.
git checkout -b chore/release-v<X.Y.Z>
git add package.json package-lock.json CHANGELOG.md
git commit -S -m "chore(release): bump version to <X.Y.Z>"
./scripts/new-pr.ps1
```

The release-bump PR is a regular PR: it must pass the same
`lint + build + test` and `coverage` checks and be reviewed/merged
through the normal branch protection. Merge it the moment CI is green.

### 2. Push the signed annotated tag

After the bump PR is on `main`:

```bash
git checkout main && git pull
# Tag the bump commit. `-s` produces a signed annotated tag.
git tag -s v<X.Y.Z> -m "v<X.Y.Z>"
git push origin v<X.Y.Z>
```

The `Release` workflow fires immediately. It:

1. **`package` job** (low-privilege: `contents: read` only) — checks
   out the tag, verifies it is an annotated tag reachable from
   `origin/main`, verifies `package.json` publisher and version
   match, runs `lint + build + test:coverage`, builds the `.vsix`,
   extracts the matching CHANGELOG section, and uploads everything
   as a workflow artifact.
2. **`publish` job** (elevated: `contents: write` + `id-token: write`
   + `environment: marketplace`) — downloads the artifact, logs in to
   Azure via OIDC, runs `vsce publish --azure-credential`, and
   creates/updates the GitHub Release with the `.vsix` attached.

The publish job has **no checkout** and installs only `@vscode/vsce`
globally, so the only code that runs with elevated permissions is
`vsce` itself and the GitHub CLI. If a project dependency were
compromised, it could not mint Azure OIDC tokens or write to git.

### Reruns and recovery

If the `publish` job fails after the marketplace upload succeeded
(e.g., a flaky `gh release create`), re-fire with the same tag:

```bash
gh workflow run Release -f tag=v<X.Y.Z>
```

The publish step detects the existing marketplace version via
`vsce show` and skips re-upload; the GitHub Release step upserts.
The workflow's `concurrency` group serializes runs for the same tag
so a re-fire never races with an in-flight publish.

### Pre-releases

A tag matching `vX.Y.Z-<suffix>` (e.g., `v0.5.0-rc.1`) is treated as
a marketplace pre-release (`vsce publish --pre-release`) and a
GitHub Release marked `prerelease`. The package-version check still
applies: `package.json` `version` must read `X.Y.Z-<suffix>`.

### One-time bootstrap

For the publish job's OIDC login to work, the Azure App Registration
`github-actions-markdown-pr-review-publish` must have a federated
credential whose subject is
`repo:abeltrano/markdown-pr-review:environment:marketplace`, the
service principal must be a member of the marketplace publisher
`abeltrano`, and the repo must have the `marketplace` environment
plus repo variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. This
is one-time setup per repo; see the release workflow's header
comment for the trust model.

## Security

If you find a security issue, **do not file a public issue**. See
[`SECURITY.md`](SECURITY.md) for the disclosure process.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE).
