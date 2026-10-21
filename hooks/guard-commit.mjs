// PreToolUse hook for Bash and PowerShell. Refuses a `git commit` that would carry local Claude
// config, or that introduces invalid UTF-8 (any text file) or a BOM (Markdown). Exit 2 blocks the
// call and hands stderr to Claude; anything else lets it through.
//
// Encoding checks fire only on what the commit *introduces*: some tools (Visual Studio, EF, a few
// code generators) write BOMs into source files on purpose, and a file that was already broken at
// HEAD is not this commit's doing.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const command = input.tool_input?.command ?? '';
if (!/\bgit\b(?:\s+-C\s+\S+)?[^\n|;&]*\bcommit\b/.test(command)) process.exit(0);

const dirArg = command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)?.[1]?.replace(/^["']|["']$/g, '');
const base = input.cwd || process.cwd();
const cwd = dirArg ? path.resolve(base, dirArg) : base;
const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
const names = (buf) => buf.toString('utf8').split('\0').filter(Boolean);

let staged, root;
try {
  root = git('rev-parse', '--show-toplevel').toString('utf8').trim();
  staged = names(git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'));
} catch {
  process.exit(0); // not a repository: nothing to guard
}
// `git commit -a` stages tracked changes at commit time, so read those from the working tree.
const all = /\scommit\b[^\n|;&]*\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(command);
const unstaged = all ? names(git('diff', '--name-only', '-z', '--diff-filter=M')) : [];

const forbidden = (f) => f === '.claude/settings.local.json' || f.startsWith('.claude/worktrees/') || f === 'CLAUDE.local.md';
const text = /\.(md|txt|json|ya?ml|toml|ini|xml|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|rb|go|rs|java|kt|swift|cs|razor|csproj|sln|props|targets|php|sql|sh|ps1|bicep|tf)$/i;
const decoder = new TextDecoder('utf-8', { fatal: true });
const valid = (buf) => { try { decoder.decode(buf); return true; } catch { return false; } };
const hasBom = (buf) => buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
const atHead = (f) => { try { return git('show', `HEAD:${f}`); } catch { return null; } };

const problems = [];
const check = (file, content) => {
  if (forbidden(file)) return problems.push(`${file}: local Claude config, never committed`);
  if (!text.test(file)) return;
  const before = atHead(file);
  if (!valid(content) && (before === null || valid(before))) problems.push(`${file}: introduces bytes that are not valid UTF-8`);
  if (/\.md$/i.test(file) && hasBom(content) && !(before && hasBom(before))) problems.push(`${file}: introduces a UTF-8 BOM`);
};
for (const f of staged) check(f, git('show', `:${f}`));
for (const f of unstaged) if (!staged.includes(f)) check(f, readFileSync(path.join(root, f)));

if (problems.length === 0) process.exit(0);
process.stderr.write(
  `Commit refused by the agent-pipeline commit guard:\n${problems.map((p) => `- ${p}`).join('\n')}\n` +
  'Unstage local config with `git restore --staged <file>`; re-save a badly encoded file as UTF-8 without a BOM.\n'
);
process.exit(2);
