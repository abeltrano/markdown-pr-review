---
applyTo: '**/*.md,**/*.markdown,**/*.mdx'
---

# Markdown

Full rules live in [`docs/coding-style.md#markdown`](../../docs/coding-style.md#markdown)
— a summary of the default
[markdownlint](https://github.com/DavidAnson/markdownlint) rule set
plus this project's tweaks. This file is a thin pointer scoped to
markdown files via the `applyTo` glob above.

## At a glance

- ATX headings (`#`, `##`, …); single space after `#`; one `#`
  heading per file; never skip heading levels; one blank line
  above and below every heading.
- Unordered list marker: `-`. Ordered: `1.`, `2.`, … Indent nested
  list items by **2 spaces** under the parent marker.
- No tabs; spaces only. At most one consecutive blank line. Final
  newline at end of file.
- No trailing whitespace **except** the deliberate **two**
  trailing spaces that denote a hard line break. `.editorconfig`
  disables trim-trailing-whitespace for `.md` files so this
  survives saves.
- Soft cap **80 characters** for prose paragraphs; headings,
  tables, code blocks, and URL-only lines are exempt.
- Fenced code blocks with a language hint
  (` ```ts `, ` ```powershell `, ` ```yaml `, ` ```text `, …);
  backticks not tildes.
- **Bold** = `**double**`, *italic* = `*single*`. No spaces inside
  the markers. Don't use emphasis as a substitute for a heading.
- Wrap bare URLs in angle brackets (`<https://example.com>`).
