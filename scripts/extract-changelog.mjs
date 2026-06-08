#!/usr/bin/env node
// Extract a single release section from CHANGELOG.md by version number.
// Usage:  node scripts/extract-changelog.mjs 0.4.21
//
// Writes the body of the matching `## [<version>] - <date>` section to
// stdout (heading stripped — GitHub Releases shows the title separately).
// Exits non-zero with a clear stderr message if the section is missing
// or empty so the release workflow fails loudly instead of publishing a
// release with no notes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const version = process.argv[2];
if (!version) {
  process.stderr.write('usage: extract-changelog.mjs <version>\n');
  process.exit(64);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');
const md = readFileSync(changelogPath, 'utf8');

const escaped = version.replace(/[.+\\*?^${}()|[\]]/g, '\\$&');
const startRe = new RegExp(`^## \\[${escaped}\\](?:\\s|$)`, 'm');
const startMatch = startRe.exec(md);
if (!startMatch) {
  process.stderr.write(`CHANGELOG.md has no section for [${version}]\n`);
  process.exit(2);
}

const after = md.slice(startMatch.index);
// Find the next top-level "## [..." heading after the matched section.
// Skip 2 chars so we don't match the heading we just found.
const nextRe = /^## \[/m;
const nextMatch = nextRe.exec(after.slice(2));
const section = nextMatch ? after.slice(0, nextMatch.index + 2) : after;

// Strip the heading line itself; release UI shows the title separately.
const body = section.split('\n').slice(1).join('\n').trim();
if (body.length === 0) {
  process.stderr.write(`CHANGELOG.md section for [${version}] is empty\n`);
  process.exit(3);
}

process.stdout.write(body + '\n');
