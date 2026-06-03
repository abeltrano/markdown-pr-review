# ADO Markdown PR Reviewer

> **Status: under active autonomous implementation.** This README will
> be expanded with installation, configuration, and usage instructions
> when v0.4 is reached (TASK-039 of `docs/implementation-plan.md`).

A Visual Studio Code extension that lets a single reviewer review
markdown design and architecture documents in Azure DevOps pull
requests using a **fully rendered markdown view** — and create PR
comment threads by selecting text directly in the rendered content.
Closes the regression introduced when teams migrated from
Word-based design-doc review to PR-based review of markdown in
source control, where ADO only supports commenting on raw markdown
lines.

See `docs/` for the requirements, design, validation plan, and
implementation plan.

## Repository layout

```
.
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript strict mode
├── esbuild.js                # Bundler config (host + 2 webviews)
├── docs/
│   ├── requirements.md       # REQ-IDs (source of truth for behavior)
│   ├── design.md             # Architecture, components, contracts
│   ├── validation-plan.md    # Test cases TC-001…TC-165
│   ├── implementation-plan.md# Phased task breakdown TASK-001…TASK-040
│   └── decisions.md          # Decisions log (D-001…)
└── src/
    └── extension.ts          # activate / deactivate
```

## Building from source

```powershell
npm install
npm run compile     # tsc --noEmit && esbuild
npm run watch       # rebuild on save
```

Then F5 in VS Code (or use the "Run Extension" launch config) to
debug the extension in a fresh VS Code window.

## License

MIT. See `LICENSE`.
