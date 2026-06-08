# Changelog

All notable changes to the Markdown PR Review extension are documented
here. This file is generated from the Conventional Commits in the
[git history](https://github.com/abeltrano/markdown-pr-review/commits/main)
via [git-cliff]. To regenerate after merging a PR or cutting a release,
run `npm run release:notes` from the repository root.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

[git-cliff]: https://git-cliff.org


## [0.4.21] - 2026-06-08

### 🧪 Testing

- *(coverage)* Add c8 code coverage with Codecov upload ([#29](https://github.com/abeltrano/markdown-pr-review/pull/29))

### ⚙️ CI

- *(coverage)* Make coverage a required check, bump action to v6 ([#30](https://github.com/abeltrano/markdown-pr-review/pull/30))
- *(release)* Add automated marketplace + GitHub release pipeline ([#32](https://github.com/abeltrano/markdown-pr-review/pull/32))

### 📦 Dependencies

- *(deps-dev)* Bump the types group across 1 directory with 2 updates ([#26](https://github.com/abeltrano/markdown-pr-review/pull/26))
- *(deps-dev)* Bump @types/chai from 4.3.20 to 5.2.3 in the mocha group across 1 directory ([#27](https://github.com/abeltrano/markdown-pr-review/pull/27))

### 🧹 Chores

- *(ci)* Add one-time bootstrap workflow for marketplace publisher identity ([#31](https://github.com/abeltrano/markdown-pr-review/pull/31))

## [0.4.20] - 2026-06-08

### 🐛 Bug Fixes

- *(renderer)* Make mermaid diagrams actually render end-to-end ([#28](https://github.com/abeltrano/markdown-pr-review/pull/28))

## [0.4.19] - 2026-06-05

### 🐛 Bug Fixes

- Add explicit node types to tsconfig for TypeScript 6 compatibility ([#9](https://github.com/abeltrano/markdown-pr-review/pull/9))
- *(renderer)* Recognise ADO's :::mermaid colon-fence block syntax ([#24](https://github.com/abeltrano/markdown-pr-review/pull/24))

### 📚 Documentation

- *(readme)* Polish for Visual Studio Marketplace launch ([#19](https://github.com/abeltrano/markdown-pr-review/pull/19))
- *(readme)* Replace demo placeholder with captured GIF ([#23](https://github.com/abeltrano/markdown-pr-review/pull/23))

### ⚙️ CI

- *(deps)* Bump actions/checkout from 4 to 6 ([#5](https://github.com/abeltrano/markdown-pr-review/pull/5))
- *(deps)* Bump actions/setup-node from 4 to 6 ([#6](https://github.com/abeltrano/markdown-pr-review/pull/6))
- Matrix lint/build/test across ubuntu, macos, windows ([#20](https://github.com/abeltrano/markdown-pr-review/pull/20))

### 📦 Dependencies

- *(deps-dev)* Bump @types/node from 20.19.41 to 25.9.1 in the types group across 1 directory ([#7](https://github.com/abeltrano/markdown-pr-review/pull/7))
- *(deps)* Bump mermaid from 10.9.6 to 11.15.0 ([#12](https://github.com/abeltrano/markdown-pr-review/pull/12))
- *(deps-dev)* Bump the eslint group across 1 directory with 3 updates ([#8](https://github.com/abeltrano/markdown-pr-review/pull/8))
- *(deps-dev)* Bump chai from 4.5.0 to 6.2.2 in the mocha group across 1 directory ([#10](https://github.com/abeltrano/markdown-pr-review/pull/10))
- *(deps-dev)* Bump @vscode/vsce from 2.32.0 to 3.9.2 in the vscode group across 1 directory ([#11](https://github.com/abeltrano/markdown-pr-review/pull/11))
- *(deps-dev)* Bump esbuild from 0.25.12 to 0.28.0 ([#14](https://github.com/abeltrano/markdown-pr-review/pull/14))
- *(deps)* Bump diff from 5.2.2 to 9.0.0 ([#13](https://github.com/abeltrano/markdown-pr-review/pull/13))

### 🧹 Chores

- *(docs)* Remove CHANGELOG.md; derive release notes from squash-merge commits ([#17](https://github.com/abeltrano/markdown-pr-review/pull/17))
- *(manifest)* Marketplace metadata polish (categories, keywords, banner, scm-agnostic description) ([#21](https://github.com/abeltrano/markdown-pr-review/pull/21))

## [0.4.18] - 2026-06-04

### 🐛 Bug Fixes

- *(comment-input)* Load theme via external CSS so strict CSP applies it (0.4.18) ([#16](https://github.com/abeltrano/markdown-pr-review/pull/16))

## [0.4.17] - 2026-06-04

### 🐛 Bug Fixes

- *(render)* Load VS Code built-in markdown.css for native preview look (0.4.17) ([#15](https://github.com/abeltrano/markdown-pr-review/pull/15))

## [0.4.16] - 2026-06-04

### 🐛 Bug Fixes

- *(security)* Resolve all 7 open CodeQL alerts ([#2](https://github.com/abeltrano/markdown-pr-review/pull/2))
- *(security)* Inline URL.protocol check at link.href sink ([#3](https://github.com/abeltrano/markdown-pr-review/pull/3))
- *(rendering)* Restore mermaid diagrams and let user CSS cascade (0.4.16) ([#4](https://github.com/abeltrano/markdown-pr-review/pull/4))

### 📚 Documentation

- Document required SSH commit signing on main ([#1](https://github.com/abeltrano/markdown-pr-review/pull/1))

### 📦 Dependencies

- *(deps)* Fix Dependabot security alerts

### 🧹 Chores

- Add repository metadata, README badges, and changelog compare links
- Add new-pr.ps1 helper and document solo-maintainer PR workflow

## [0.4.15] - 2026-06-03

### 🚀 Features

- *(v0.1)* Infrastructure modules (TASK-004..011)
- *(v0.1)* Full v0.1 round-trip extension (TASK-013..023)
- *(v0.2)* Tests + existing-thread display + file tree grouping (TASK-024..028)
- *(v0.3)* Real diff annotator + gutter bars (TASK-029..032)
- *(v0.4)* Status bar + stale watcher + 401 retry + error codes (TASK-033..037)
- *(v0.4)* README + final 0.4.0 .vsix (TASK-039..040)
- Rename extension to "Markdown PR Review" (0.4.11)
- *(icons)* Custom activity-bar + marketplace icons
- *(rendered-view)* Honor markdown.styles + live restyle on config change

### 🐛 Bug Fixes

- Drop duplicated 'ADO MD Review:' prefix from command titles
- *(auth)* Prompt for interactive sign-in when no cached session exists
- *(tree)* Build resourceUri safely for ADO file paths (0.4.2)
- *(ado)* Extend fetch timeout over response body read (0.4.4)
- *(ado)* Drop octetStream from items requests on huge repos (0.4.5)
- *(webview)* Gate init postMessage on 'ready' signal (0.4.9)
- *(webview)* Register message handler before webview.html (0.4.10)
- *(icon)* Full-bleed marketplace tile; PNG had opaque white corners
- *(icon)* Bump marketplace tile from 128x128 to 256x256
- *(icon)* Bump marketplace tile from 256x256 to 512x512

### Other

- Initial baseline: requirements (v0.3), design (v0.2), validation plan (v1.0), .gitignore
- Project init (TASK-001..TASK-003)
- *(ado)* Log response timing per phase; reduce timeout to 30s (0.4.6)
- *(render)* Log each phase of attachRenderedView (0.4.7)
- *(webview)* Unblock & instrument postMessage; log ready signal (0.4.8)

### ⚡ Performance

- Parallelize head+base, progressive diff render, 90s fetch timeout (0.4.3)

### 🚜 Refactor

- Drop "ado" prefix from all identifiers

### 📚 Documentation

- Implementation plan v0.1 + decisions log seed
- Retire decisions.md and implementation-plan.md
- Add Copilot instructions for the repo + per-language style files
- Add JSON, CSS, HTML Copilot instructions
- Extract dev guide and coding style from Copilot instruction files
- Linkify internal file references and add architecture diagram

### 🎨 Styling

- Add shortTitle "Open PR" for view-title button
- *(comment-input)* Theme the textarea/buttons and drop the mapping-mode badge
- *(rendered)* Use codicon-comment-discussion for thread markers
- *(tree)* Swap to comment-discussion icon + trailing count badge for files with threads
- *(log)* Colorize output channel via 'log' languageId + match log grammar format
- *(rendered)* Match built-in markdown preview font (prose) + 0.4.14
- Apply repo-wide style rules (LF, 2-space YAML, linkify, renormalize)

### ⚙️ CI

- Tighten .vscodeignore (drop source maps, test config, icon source)

### 🧹 Chores

- Bump to 0.4.1 to force reinstall of auth fix
- Stop tracking .vsix build artifacts
- Bump version to 0.4.12
- *(vscode)* Add recommended extensions (esbuild + tsc problem matchers)
- Add .editorconfig, ESLint, and GitHub Actions CI
- Add CHANGELOG, SECURITY, CONTRIBUTING, issue/PR templates, gitattributes, dependabot
- Align CSS/HTML/SVG indent to 2 spaces (industry standard)
- Reformat TypeScript/JavaScript to 2-space indent (tree-wide)
