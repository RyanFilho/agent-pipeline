#!/usr/bin/env node
// Splits an oversized CLAUDE.md into path-scoped .claude/rules/*.md files, following a plan file.
// Every source line lands in exactly one output, and each segment's first line is checked against
// the text the plan expects there, so a plan written against a stale copy fails instead of
// scrambling the file.
//
//   node split-claude-md.mjs --plan plan.json [--repo <dir>] [--dry-run]
//
// plan.json:
// {
//   "source": "CLAUDE.md",                                   // optional, relative to --repo
//   "segments": [                                            // ascending; the first starts at line 1
//     { "start": 1,  "expect": "# CLAUDE.md", "to": "keep" },
//     { "start": 40, "expect": "## Testing",  "to": "testing" },
//     { "start": 75, "expect": "**Flaky",     "to": "testing", "note": true }
//   ],
//   "rules": {
//     "testing": { "title": "Tests", "paths": ["tests/**", "e2e/**"] }
//   },
//   "inserts": { "40": "rules-map.md" }                      // text added to CLAUDE.md after that segment
// }
//
// A segment runs from its start to the line before the next one. "keep" stays in CLAUDE.md; any
// other "to" names a rule. Segments marked "note" are gathered under "## Working notes" at the end
// of their rule. Line endings follow the source file. Existing rule files are never overwritten.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const planPath = opt('--plan');
const repo = path.resolve(opt('--repo') ?? '.');
const dryRun = args.includes('--dry-run');
if (!planPath) {
  console.error('usage: node split-claude-md.mjs --plan plan.json [--repo <dir>] [--dry-run]');
  process.exit(1);
}

const fail = (msg) => { console.error(`split-claude-md: ${msg}`); process.exit(1); };
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const planDir = path.dirname(path.resolve(planPath));
const sourcePath = path.join(repo, plan.source ?? 'CLAUDE.md');
const src = fs.readFileSync(sourcePath, 'utf8').replace(/^﻿/, '');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const lines = src.split(/\r?\n/);
if (lines[lines.length - 1] === '') lines.pop();
const total = lines.length;

const segments = plan.segments ?? [];
const rules = plan.rules ?? {};
const ruleFile = (name) => path.join(repo, '.claude', 'rules', `${name}.md`);
for (const name of Object.keys(rules)) {
  if (fs.existsSync(ruleFile(name))) fail(`.claude/rules/${name}.md already exists; merge it by hand or rename the rule`);
}
if (segments.length === 0 || segments[0].start !== 1) fail('the first segment must start at line 1');
segments.forEach((s, i) => {
  if (i > 0 && s.start <= segments[i - 1].start) fail(`segment ${i + 1} (line ${s.start}) does not come after the one before it`);
  if (s.start > total) fail(`segment at line ${s.start} is past the end of the file (${total} lines)`);
  if (s.to !== 'keep' && !rules[s.to]) fail(`segment at line ${s.start} goes to "${s.to}", which is not in "rules"`);
});
for (const name of Object.keys(rules)) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`rule name "${name}" must be lowercase letters, digits and dashes`);
  if (!segments.some((s) => s.to === name)) fail(`rule "${name}" gets no segments`);
  if (!rules[name].paths?.length) fail(`rule "${name}" has no paths`);
}

const trimBlank = (arr) => {
  const a = [...arr];
  while (a.length && a[0].trim() === '') a.shift();
  while (a.length && a[a.length - 1].trim() === '') a.pop();
  return a;
};
const readInsert = (file) => trimBlank(fs.readFileSync(path.resolve(planDir, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/));

let covered = 0;
const out = { keep: [] };
segments.forEach((s, i) => {
  const end = i + 1 < segments.length ? segments[i + 1].start - 1 : total;
  const first = lines[s.start - 1];
  if (!first.startsWith(s.expect)) fail(`line ${s.start}: expected "${s.expect}", found "${first.slice(0, 60)}"`);
  covered += end - s.start + 1;
  (out[s.to] ??= []).push({ body: trimBlank(lines.slice(s.start - 1, end)), note: !!s.note });
  const insert = plan.inserts?.[String(s.start)];
  if (insert) out.keep.push({ body: readInsert(insert), note: false });
});
if (covered !== total) fail(`covered ${covered} of ${total} lines`);

const files = [];
const keep = [];
for (const seg of out.keep) keep.push(...seg.body, '');
files.push([sourcePath, trimBlank(keep)]);

const sameHeading = (line, title) => line?.replace(/^#+\s*/, '').trim().toLowerCase() === title.trim().toLowerCase();
for (const [name, { title, paths }] of Object.entries(rules)) {
  const file = ruleFile(name);
  const body = ['---', 'paths:', ...paths.map((g) => `  - "${g}"`), '---', '', `# ${title}`, ''];
  const segs = [...out[name].filter((s) => !s.note), ...out[name].filter((s) => s.note)];
  let notesHeaded = false;
  segs.forEach((seg, i) => {
    let chunk = seg.body;
    if (i === 0 && /^#{1,3}\s/.test(chunk[0]) && sameHeading(chunk[0], title)) chunk = trimBlank(chunk.slice(1));
    if (seg.note && !notesHeaded) { body.push('## Working notes', ''); notesHeaded = true; }
    body.push(...chunk, '');
  });
  files.push([file, trimBlank(body)]);
}

for (const [file, body] of files) {
  console.log(`${path.relative(repo, file).replaceAll('\\', '/')}: ${body.length} lines`);
  if (dryRun) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body.join(eol) + eol, 'utf8');
}
console.log(`${dryRun ? 'dry run: ' : ''}${total} source lines, all covered`);
