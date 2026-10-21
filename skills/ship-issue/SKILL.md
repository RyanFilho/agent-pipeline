---
name: ship-issue
description: Ship one GitHub issue end to end as a pipeline developer - work in an own worktree, check the issue is unclaimed, branch, implement, verify once, open a PR, wait for CI, and report back in four lines. Started as "/agent-pipeline:ship-issue <n>".
argument-hint: <issue number>
disable-model-invocation: true
---

# Ship issue #$ARGUMENTS

You are a developer in the agent pipeline. **The issue is your whole brief**: you were started without the conversation that produced it, and you do not need it. Its acceptance criteria are the definition of done, and anything it puts out of scope stays out.

Read `.claude/agent-pipeline.md` first. It names this project's repository, commands, labels and gates; below, `<build>`, `<fast tests>`, `<slow tests>` and `<default branch>` mean the values there. If the file is missing, stop and report `Blocked: run /agent-pipeline:adopt in this project first`.

## 0. Work in your own worktree

```bash
git rev-parse --git-dir
```

If the path contains `/worktrees/`, this session has a worktree of its own: carry on. Anything else (usually `.git`) means you are in the user's main checkout, which holds their uncommitted work and is shared with every other session. **Do not branch, build or edit here.** Call `EnterWorktree` with the name `ship-$ARGUMENTS` to move into a new worktree, then run the check again. If that tool is unavailable or fails, stop and report `Blocked: started in the main checkout and could not enter a worktree`.

## 1. Preflight: stop if it is not yours

```bash
git fetch origin
gh issue view $ARGUMENTS --json number,title,state,labels,assignees,body,comments
gh pr list --state all --search "$ARGUMENTS" --json number,state,title,headRefName,body
git ls-remote --heads origin | grep -E "refs/heads/[a-z]+/$ARGUMENTS-" || true
```

Stop and send the step 7 report with `Blocked:` filled in when any of these is true:

- the issue is closed, or a merged PR says `Fixes #$ARGUMENTS`
- an open PR or a remote branch already names it, which means another session is on it
- it carries a label the settings list as not available
- it has an open blocker (`gh api repos/<owner>/<repo>/issues/$ARGUMENTS --jq .issue_dependencies_summary.blocked_by` is above 0)
- the acceptance criteria are missing or cannot be checked: say which, and do not guess

If it is not labelled with the claim lock yet, claim it: `gh issue edit $ARGUMENTS --add-label in-progress --add-assignee @me`.

## 2. Read the brief, and only what it names

Read the issue body, plus the latest triage brief in its comments if there is one. Then read the glossary terms it uses, the spec section or ADR it links, and the files it says it touches. Opening those files loads any matching `.claude/rules/`. Do not survey the codebase beyond that.

If the brief leaves more than one reasonable design open, consult the advisor before you choose.

## 3. Branch, and lock it

Take the branch prefix from the issue's type label, using the settings' map. Cut the branch from `origin/<default branch>` **without tracking it**, so a bare `git push` can never reach the default branch. Switching here changes only your worktree:

```bash
git switch -c <prefix>/$ARGUMENTS-<short-slug> origin/<default branch> --no-track
git push -u origin <prefix>/$ARGUMENTS-<short-slug>
```

Pushing the empty branch straight away is the lock: the next session's preflight sees it.

## 4. Implement

- Follow every gate in the settings.
- Write the failing test first for logic and bugs.
- In the inner loop, run only `<build>` and `<fast tests>`.
- **If the same failure comes back twice, consult the advisor before a third attempt.**
- If something is wrong outside the brief, do not fix it. Note it under *Follow-ups* in the report.

## 5. Verify, once

- Run `<slow tests>` **once**: only the parts covering what you touched, unless the change is cross-cutting. Before starting it in the background, say how long it will take.
- If the UI changed, check each touched screen in every theme and at phone, tablet and desktop widths. Use computed styles and measurements, not just screenshots. Record the results for the PR.
- Consult the advisor before declaring the work done.

## 6. Open the PR and get CI green

Stage files by path, never `git add -A`, and commit in the repository's style. Then run:

```bash
git push origin <branch>
gh pr create --base <default branch> --title "<type>: <what> (#$ARGUMENTS)" --body-file <file>
gh pr checks <pr> --watch --fail-fast
```

The PR body is where the detail goes, so the lead never needs to read a diff:

```markdown
Fixes #<n>

## What changed
- up to three bullets

## Acceptance criteria
- [x] each criterion from the issue, with the test or check that proves it

## Tests
fast <passed>/<total> · slow <suite>: <passed>/<total>

## Visual QA        (UI changes only)
| screen | theme | phone | tablet | desktop |

## Judgment calls
## Follow-ups
```

If CI fails, fix it and push. After two failed attempts, stop and report it as blocked. **Do not merge**: the reviewer merges.

## 7. Report

Your last message is the handoff, and the lead may see only its first 400 characters. Use exactly this format and nothing else:

```text
#<n> -> PR #<m> | fast <p>/<t> | slow <p>/<t> | CI <green|red>
Judgment calls: <one line, or none>
Follow-ups: <one line per issue worth filing, or none>
Blocked: <reason, or none>
```

## When the lead sends review feedback

A message like `Review on PR #<m>` means the reviewer commented on the PR:

1. Read the comments with `gh pr view <m> --comments`.
2. Fix what they ask, within the brief.
3. Run the fast tests, push, and wait for CI.
4. Send the step 7 report again.

If the branch is behind or conflicts with the default branch, merge `origin/<default branch>` into it and resolve the conflicts. Do not rebase or force push.
