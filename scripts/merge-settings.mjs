#!/usr/bin/env node
// Merges the pipeline's settings template into a project's .claude/settings.json. Existing keys
// win (one level deep for objects), permission lists are unioned, and nothing is removed. A
// placeholder set to an empty value drops every permission entry that uses it.
//
//   node merge-settings.mjs --template <settings.json> --target <.claude/settings.json>
//        --set MERGE_METHOD=--merge --set DEFAULT_BRANCH=main
//        --set "BUILD_COMMAND_PREFIX=npm run build" --set "TEST_COMMAND_PREFIX=npm test" [--dry-run]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const templatePath = opt('--template');
const targetPath = opt('--target');
const dryRun = args.includes('--dry-run');
if (!templatePath || !targetPath) {
  console.error('usage: node merge-settings.mjs --template <file> --target <file> --set KEY=value ... [--dry-run]');
  process.exit(1);
}

const values = {};
args.forEach((a, i) => {
  if (a !== '--set') return;
  const [key, ...rest] = (args[i + 1] ?? '').split('=');
  values[key] = rest.join('=');
});

const fill = (entry) => {
  let dropped = false;
  const filled = entry.replace(/<([A-Z_]+)>/g, (m, key) => {
    if (!(key in values)) throw new Error(`no --set for placeholder ${key}`);
    if (values[key] === '') dropped = true;
    return values[key];
  });
  return dropped ? null : filled;
};

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const exists = fs.existsSync(targetPath);
const target = exists ? JSON.parse(fs.readFileSync(targetPath, 'utf8').replace(/^﻿/, '')) : {};

const added = [];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
for (const [key, value] of Object.entries(template)) {
  if (key === 'permissions') continue;
  if (target[key] === undefined) {
    target[key] = value;
    added.push(`${key}: ${JSON.stringify(value)}`);
  } else if (isObject(target[key]) && isObject(value)) {
    for (const [sub, v] of Object.entries(value)) {
      if (target[key][sub] !== undefined) continue;
      target[key][sub] = v;
      added.push(`${key}.${sub}: ${JSON.stringify(v)}`);
    }
  }
}
target.permissions ??= {};
for (const list of ['allow', 'deny']) {
  const have = new Set(target.permissions[list] ?? []);
  for (const raw of template.permissions?.[list] ?? []) {
    const entry = fill(raw);
    if (entry === null || have.has(entry)) continue;
    have.add(entry);
    added.push(`${list}: ${entry}`);
  }
  if (have.size) target.permissions[list] = [...have];
}

console.log(added.length ? added.map((a) => `+ ${a}`).join('\n') : 'nothing to add');
if (dryRun || added.length === 0) process.exit(0);
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf8');
console.log(`${exists ? 'updated' : 'created'} ${targetPath}`);
