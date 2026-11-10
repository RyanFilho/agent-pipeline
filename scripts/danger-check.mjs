#!/usr/bin/env node
// Matches a set of changed files against the project's danger zones, so the stop for a risky
// change does not depend on a model noticing it.
//
//   node danger-check.mjs --pr <number>          the files of a pull request (asks gh)
//   node danger-check.mjs --files <path> ...     the paths given
//   [--settings <file>]                          default: .claude/agent-pipeline.md in the cwd
//
// Zones are the rows of the table under "## Danger zones" in the settings file:
//
//   | Zone | Paths |
//   |---|---|
//   | `migrations` | `db/migrations/**`, `**/*.sql` |
//
// The settings are read from the working directory, not from the pull request, so a PR cannot
// loosen its own check. One zone is always on: the pipeline's own settings and permissions.
//
// Prints `clear`, or one `DANGER <zone>: <file>, <file>` line per zone. Exit 0 either way;
// exit 1 when the files or the settings cannot be read.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const fail = (message) => { console.error(`danger-check: ${message}`); process.exit(1); };
const at = (name) => args.indexOf(name);
const settingsPath = at('--settings') >= 0 ? args[at('--settings') + 1] : '.claude/agent-pipeline.md';

let files;
if (at('--pr') >= 0) {
  const pr = args[at('--pr') + 1];
  if (!/^\d+$/.test(pr ?? '')) fail('--pr needs a pull request number');
  try {
    files = execFileSync('gh', ['pr', 'diff', pr, '--name-only'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');
  } catch (error) {
    fail(`could not list the files of PR #${pr}: ${(error.stderr || error.message || '').toString().trim()}`);
  }
} else if (at('--files') >= 0) {
  files = args.slice(at('--files') + 1).filter((a, i, rest) => a !== '--settings' && rest[i - 1] !== '--settings');
} else {
  fail('usage: node danger-check.mjs (--pr <number> | --files <path> ...) [--settings <file>]');
}
files = [...new Set(files.map((f) => f.trim().replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean))];

const zones = [{ name: 'pipeline-config', globs: ['.claude/agent-pipeline.md', '.claude/settings.json'] }];
if (!fs.existsSync(settingsPath)) fail(`${settingsPath} not found: run /agent-pipeline:adopt first`);
const section = fs.readFileSync(settingsPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '').split(/^## /m).find((s) => /^Danger zones\b/i.test(s));
for (const line of (section ?? '').split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 4) continue; // not a table row
  const name = cells[1].match(/`([^`]+)`/)?.[1];
  const globs = [...cells[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  // A row still holding the template's <placeholder> is not a zone.
  if (name && globs.length && !/[<>]/.test(name + globs.join(''))) zones.push({ name, globs });
}

// GitHub-style globs: `*` stays inside a folder, `**` crosses folders, `?` is one character, and
// a pattern without a slash matches that name in any folder.
const toRegExp = (glob) => {
  let g = glob.replace(/^\.?\//, '');
  if (g.endsWith('/')) g += '**';
  if (!g.includes('/')) g = `**/${g}`;
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
};

const hits = [];
for (const zone of zones) {
  const patterns = zone.globs.map(toRegExp);
  const matched = files.filter((f) => patterns.some((p) => p.test(f)));
  if (matched.length) hits.push(`DANGER ${zone.name}: ${matched.join(', ')}`);
}
console.log(hits.length ? hits.join('\n') : 'clear');
