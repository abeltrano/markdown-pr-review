---
applyTo: '**/*.md,**/*.markdown,**/*.mdx'
---

# Markdown

Follow the default rule set from
[markdownlint](https://github.com/DavidAnson/markdownlint), summarized
below with this project's tweaks. The rule IDs (`MD001`, etc.) match
the markdownlint catalogue.

## Headings (MD001, MD003, MD018, MD022–MD026, MD041)

- Use **ATX** headings (`#`, `##`, `###`). No setext (`====` / `----`).
- Single space after the `#` characters.
- Heading levels increment by one — never skip a level.
- Surround every heading with one blank line above and one below
  (file start excepted).
- Headings begin at column 1.
- A markdown file's first non-blank line is a top-level (`#`) heading.
- One `#` heading per file.
- No trailing punctuation in headings (no `.`, `,`, `:` etc.).
- Sibling headings under the same parent must not have identical text.

## Lists (MD004, MD005, MD007, MD029, MD030, MD032)

- Unordered list marker: `-` (consistent throughout the file).
- Ordered lists: `1.`, `2.`, `3.` (increment) — not all `1.`.
- One space after the marker (`- item`, `1. item`).
- Indent nested list items by **2 spaces** under the parent marker.
- Surround top-level lists with one blank line above and below.

## Whitespace (MD009, MD010, MD012, MD047)

- No trailing whitespace, with one deliberate exception: **two**
  trailing spaces denote a hard line break in prose. `.editorconfig`
  disables `trim_trailing_whitespace` for `.md` files so that
  intentional pair survives saves.
- No tab characters. Use spaces.
- At most **one** consecutive blank line.
- File ends with a single trailing newline.

## Line length (MD013)

- Soft cap **80 characters** for prose paragraphs.
- Exempt: headings, tables, code blocks, and lines containing only a
  link reference or URL. Don't break a URL or a table to stay under
  the limit.

## Code (MD031, MD038, MD040, MD046, MD048)

- Use **fenced** code blocks (triple backticks) — not indented.
- Always specify a language hint:
  ` ```ts `, ` ```powershell `, ` ```yaml `, ` ```text ` (for
  fixed-width output without highlighting).
- Surround fenced code blocks with one blank line above and below.
- Backticks (not tildes) for fences.
- No spaces inside inline code: `` `foo` `` not `` ` foo ` ``.

## Emphasis and strong (MD036, MD037, MD049, MD050)

- **Bold** uses `**double asterisks**`. *Italic* uses `*single
  asterisks*`. Consistent throughout the file.
- No spaces inside the markers: `*italic*`, not `* italic *`.
- Don't use bold/italic as a substitute for a heading.

## Links and references (MD034, MD039, MD042, MD051)

- Wrap bare URLs in angle brackets: `<https://example.com>`.
- No spaces inside link text: `[text](url)`, not `[ text ](url)`.
- No empty link destinations: `[text]()` is not allowed.

## Other (MD027, MD028, MD035)

- Blockquotes: `> ` with exactly one space after `>`. No multiple
  consecutive spaces.
- Don't separate blockquote paragraphs with a blank, unquoted line.
- Horizontal rules: `---` (consistent across the file).

## HTML (MD033)

- Inline HTML is acceptable for HTML comments (`<!-- ... -->`) and
  PR-template / issue-template scaffolding. Avoid raw HTML in prose
  documents (the rendered-view webview escapes raw HTML anyway).
