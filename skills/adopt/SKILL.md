---
name: adopt
description: Prepare a repository for the agent pipeline - inspect it, write .claude/agent-pipeline.md, merge the pipeline's permissions into .claude/settings.json, create the labels, add issue templates, add the CLAUDE.md section (splitting an oversized CLAUDE.md into path-scoped rules), and open a PR. Use when the user asks to set up, adopt, install or prepare the agent pipeline (or "this workflow") in a project, or runs "/agent-pipeline:adopt".
---

# Adopt the agent pipeline

You are preparing this repository so that `/agent-pipeline:plan`, `/agent-pipeline:dispatch`, `/agent-pipeline:ship-issue` and the `agent-pipeline:pr-reviewer` agent can run in it. The plugin's own files are under `${CLAUDE_PLUGIN_ROOT}`.

**Change nothing until the user has seen what you found** (step 2). Never push to the default branch, never touch `.claude/settings.local.json`, and leave the user's uncommitted work alone.

Run every command as its own call, written out literally: no pipes, `&&`, `||` or shell variables, because some hosts refuse compound commands inside a worktree. Where a command below says `${CLAUDE_PLUGIN_ROOT}`, write out the plugin's absolute path instead.

## 0. Preconditions

```bash
git rev-parse --show-toplevel
git remote get-url origin
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed
```

Stop and say so if this is not a git repository, has no GitHub remote, or `gh` is not signed in. If `.claude/agent-pipeline.md` already exists, this is an update: read it, and change only what is wrong or missing.

## 1. Inspect (read only)

Find out each of these, and note where the answer came from:

| What | Where to look |
|---|---|
| Owner, repository, default branch | `gh repo view` above |
| Merge method | the methods the repository allows, then the history: `git log --first-parent -20 --format="%s %p" origin/<default>`. Two parents per commit means `--merge`; titles ending `(#<n>)` with one parent mean `--squash` |
| Does a push to the default branch deploy? | `.github/workflows/*.yml` with `on: push` to that branch that deploy or release |
| Build, fast tests, slow tests | what CI runs first, then `package.json` scripts, `Makefile`, `*.sln`, `pyproject.toml`, `go.mod`, `Cargo.toml`, the README and `CLAUDE.md`. Slow tests are the end-to-end or browser suite, if there is one |
| Areas | the top-level layout and any existing `area:` labels; propose a few (`db`, `api`, `ui`, `infra`, …) |
| Areas that must not run in parallel | migrations, a lockfile, generated code: anything two branches cannot both change and merge cleanly |
| Existing labels | `gh label list --limit 200 --json name,description`, compared with `${CLAUDE_PLUGIN_ROOT}/templates/labels.json`. A label with another name but the same role (`agent-ready`, `wip`, `enhancement`) is a rename, not a missing label |
| Labels every issue must carry | the docs, and the `labels:` in existing issue templates. Without a rule there, propose the pipeline's own: one `type:`, one `area:` and one priority |
| Issue templates | `.github/ISSUE_TEMPLATE/` |
| Instructions | `CLAUDE.md` (line count, and its size in bytes from `git cat-file -s HEAD:CLAUDE.md`; about 4 bytes make a token), `.claude/rules/`, `.claude/settings.json`, any existing commit hook |
| Working agreement | rules in `CLAUDE.md` or contributing docs that tell agents not to commit, push or run tests unless asked. `/agent-pipeline:ship-issue` contradicts them, so they need an exception |
| Domain docs | a glossary (`CONTEXT.md`, `GLOSSARY.md`), ADRs (`docs/adr/`), specs (`docs/specs/`) |
| CI filters | `paths-ignore` or path filters on the PR and deploy workflows |
| Test cadence | `CLAUDE.md` or contributing docs that say when tests run. Suites that are slow or costly to run argue for `end-only`; otherwise keep the default, `inner-loop` |
| Visual QA | whether the project has a UI, and whether its docs gate on rendered or browser checks. No UI, or docs that rule those checks out, means `none`; otherwise keep the default, `required` |
| Verify after deploy | criteria or docs that only the deployed app can settle: a live endpoint, a production setting, seeded data. If issues often wait on such a check, suggest `on`; otherwise keep the default, `off` |
| No CI checks | `paths:` or `paths-ignore:` on the workflows that run on pull requests. If some PRs (docs, `.claude/`) get no checks at all, suggest `green`; otherwise keep the default, `blocked` |
| Open issues | `gh issue list --state open --limit 200 --json number,title,labels`. Agents take only issues labelled `ready-for-agent`, so existing ones wait until the user runs `/agent-pipeline:plan <n>` on them |
| Deployed app, deployed version | only when *Verify after deploy* is `on`: the production URL in the README, the deploy workflow or its environment. For the version, prefer `workflow <file>` naming the workflow that deploys on push to the default branch; use `command <cmd>` when the app serves its commit SHA, for example at a `/version` route |

## 2. Show the findings, and ask once

Show one table of what you will write into `.claude/agent-pipeline.md`, and mark each value *found* or *guessed*. Then ask, in one batch, for everything guessed: the commands, the merge method, the areas to serialise, the labels that get an Opus review, any Workflow setting you would move off its default, and the project's **gates**, meaning rules every PR must meet that the reviewer will check. Offer gates you saw in the docs as suggestions.

Also list what step 3 will change, so the user can strike items: labels to rename and to create, templates to add (and whether they want the optional *Human check* template), the CLAUDE.md exception and split, and CI filters.

## 3. Make the changes on a branch

Work in a worktree, so the user's checkout is untouched: call `EnterWorktree` with the name `adopt-agent-pipeline`. If it is unavailable, use `git worktree add` from `origin/<default>` with `--no-track`. Then `git switch -c chore/adopt-agent-pipeline origin/<default> --no-track`.

1. **Settings file.** Copy `${CLAUDE_PLUGIN_ROOT}/templates/agent-pipeline.md` to `.claude/agent-pipeline.md` and fill it in from step 2. Delete the HTML comments, and keep it short: every pipeline session reads it. On an update, add any missing Workflow setting with its default, unless step 2 agreed otherwise. An older setup used a `needs-triage` label as a gate before agents: drop it from the settings and the templates' `labels:`, and leave the label itself and its open issues to the user, who readies them with `/agent-pipeline:plan <n>`.
2. **Permissions.** Merge the template into `.claude/settings.json`. Use a command prefix that stays the same across runs (`npm run build`, `dotnet test`); pass an empty value when there is none, and that entry is dropped:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/merge-settings.mjs" --template "${CLAUDE_PLUGIN_ROOT}/templates/settings.json" --target .claude/settings.json --set MERGE_METHOD=<--merge> --set DEFAULT_BRANCH=<main> --set "BUILD_COMMAND_PREFIX=<prefix>" --set "TEST_COMMAND_PREFIX=<prefix>" --dry-run
   ```

   Show the dry run, then run it again without `--dry-run`. Existing entries are kept, and `advisorModel` is added only if absent. The merge also registers this plugin's marketplace and enables the plugin in the project, so a teammate who clones the repository and trusts the folder gets the plugin too. If the plugin was installed from a fork, change `extraKnownMarketplaces` to point at that fork. If the settings map a type to a branch prefix other than `feat`, `fix`, `chore` or `docs`, add the matching `git push` allow entries by hand.
3. **Labels.** Once the user agrees:
   - **Rename** each existing label that plays a pipeline role to the pipeline's name, so open issues keep it and no mapping is needed: `gh label edit "<old>" --name "<new>" --description "<text>"`. If the user wants to keep a name (other tools rely on it, say), record a mapping in the settings file instead.
   - **Create** each label still missing: `gh label create "<name>" --color <hex> --description "<text>"`, and the `area:` labels agreed in step 2. Skip `verify-after-deploy` unless that setting is `on`.
   - Never delete a label.
4. **Issue templates.** If `.github/ISSUE_TEMPLATE/` is empty or missing, copy `${CLAUDE_PLUGIN_ROOT}/templates/ISSUE_TEMPLATE/*.yml`. If templates exist, add only the missing sections (*Acceptance criteria*, *Where in the code*, *Out of scope*, *Verify*), add `ready-for-agent` to their `labels:`, and keep the rest. Then:
   - *Verify after deploy* `on`: append `${CLAUDE_PLUGIN_ROOT}/templates/verify-after-deploy-field.yml`, without its comment, to the end of each template's `body:`.
   - *Visual QA* `none`: drop the screens, themes and widths from the *Verify* field's description and placeholder.
   - If the user wants it, copy `${CLAUDE_PLUGIN_ROOT}/templates/human-check.yml`, without its comment, to `.github/ISSUE_TEMPLATE/human-check.yml`. It files `ready-for-human` checks, which agents never take.
5. **CLAUDE.md.** If there is none, suggest `/init` first, or create one with just the section below. If step 1 found a working agreement that tells agents not to commit, push or run tests unless asked, add this line right under that rule: *`/agent-pipeline:ship-issue` is an explicit request to build, test, commit, push and open a PR: an exception to this rule, for that session only.*

   If the file is over about 200 lines, offer to split it, and put the cost in the offer: *about <size ÷ 4, in k> tokens, loaded by every developer and reviewer session*. Proceed only if the user agrees:
   - Group its sections by the files they are about.
   - Write a plan file in your scratchpad (the format is in the header of `${CLAUDE_PLUGIN_ROOT}/scripts/split-claude-md.mjs`). It moves each subsystem's detail into a rule with matching `paths:`, and keeps what every session needs: how to run, build and test, the architecture in brief, conventions, and a table of the rules.
   - Run it with `--dry-run` first, then for real, then check that the result reads well.

   Then append `${CLAUDE_PLUGIN_ROOT}/templates/claude-md-section.md`, adjusted to the project's labels.
6. **CI.** If a workflow deploys or runs the full suite on changes that are only under `.claude/` or docs, show the user the `paths-ignore` lines that would skip it. Add them only if they agree.

The commit guard ships with the plugin's hook, so there is nothing to copy. If the project already has its own commit hook, leave it alone: both can run.

## 4. Commit, and open the PR

Stage files by path. Show `git diff --cached --stat` and ask before pushing. Then:

```bash
git commit -m "chore: adopt the agent pipeline"
git push -u origin chore/adopt-agent-pipeline
gh pr create --base <default> --title "chore: adopt the agent pipeline" --body-file <file>
```

The PR body lists what changed and the values that were guessed. Do not merge it; the user does.

## 5. Next steps

Tell the user, in a few lines:

- merge the PR, then work from an up-to-date checkout of the default branch
- `/agent-pipeline:plan <idea>` in a session at the strongest model and high effort, to file `ready-for-agent` issues, or `/agent-pipeline:plan <n> <n>` to make existing issues ready
- `/agent-pipeline:dispatch` in a session at medium effort, in the permission mode the developers should use
- when *Verify after deploy* is `on`: `/agent-pipeline:verify` after each deploy, by hand or as a scheduled task, to close the issues waiting on one

Once the PR is merged, remove the worktree: `ExitWorktree` with remove, or `git worktree remove <path>` if you used `git worktree add`. Removal can fail and leave the folder behind with a stale `.git` file while git no longer lists the worktree. If it does, tell the user and, with their go-ahead, delete that folder, then run `git worktree prune` and `git branch -D chore/adopt-agent-pipeline`.
