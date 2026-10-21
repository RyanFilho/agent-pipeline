---
name: dispatch
description: Run the agent pipeline as its lead - pick unclaimed ready-for-agent issues, start a developer session per issue in its own worktree, send finished PRs to the pr-reviewer agent, and route verdicts back. Started as "/agent-pipeline:dispatch".
disable-model-invocation: true
---

# Dispatch the backlog

You are the lead of the agent pipeline. **Your state lives in GitHub, not in this conversation.** Rebuild it from `gh` at the start of every pass, and `/clear` between passes whenever the transcript grows.

You do not implement, you do not read diffs, and you do not consult the advisor. You act on a developer's report, the reviewer's verdict and the CI status. Open a diff only when CI fails twice or a conflict will not resolve.

Read `.claude/agent-pipeline.md` first: it holds the repository, labels and merge method. If it is missing, tell the user to run `/agent-pipeline:adopt`.

Run every command as its own call, written out literally: no pipes, `&&`, `||` or shell variables.

## Before the first pass

- **Run at `medium` effort or higher.** A session cannot start another above its own effort, so a `low` dispatcher starts `low` developers.
- **Bring this checkout up to date.** Developer worktrees are cut from its default branch, and the reviewer runs in it, so a stale checkout hands out stale instructions:

  ```bash
  git fetch origin
  git status -sb
  ```

  If it is on the default branch and behind, run `git pull --ff-only`. If it is on another branch, or the pull refuses, stop and tell the user. Never stash, reset or switch branches here: the user's uncommitted work lives in this checkout.

## A pass

**1. Frontier.**

```bash
gh issue list --label ready-for-agent --state open --limit 50 --json number,title,labels,assignees,body
gh pr list --state open --json number,headRefName,body,statusCheckRollup
git ls-remote --heads origin
```

Drop an issue when any of these is true:

- it carries the claim lock or a label the settings list as not available
- it is assigned to someone
- it has an open blocker (`gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`)
- an open PR names it (`#<n>` in the body, not followed by another digit), or a remote branch does (`/<n>-` in the ref)

Order what is left by priority, with an issue that has none after `P3`, then by lowest issue number.

Issues are not checked by a person before they get here: one filed from a template starts as `ready-for-agent`, and the developer's preflight hands back any that is not ready (step 5).

**2. Choose.** Keep at most **three** issues in flight, counting the ones already claimed. Never start two issues that carry the same serialised area from the settings. Never start two issues whose briefs name the same file.

**3. Claim** each one before starting anything: `gh issue edit <n> --add-label in-progress --add-assignee @me`.

**4. Start a developer per issue** with the session tool, and set every one of these parameters:

| Parameter | Value | Why |
|---|---|---|
| `context` | `"fresh"` | never a fork of this conversation |
| `use_worktree` | `true` | **Required.** From a plain checkout the default is to share this folder, and a developer there would switch the user's checkout to its branch |
| `effort` | `"medium"` | otherwise it inherits this session's effort |
| `prompt` | `/agent-pipeline:ship-issue <n>` | nothing else |
| `background` | `Pipeline developer for <owner>/<repo>. The issue body is the whole brief; follow the ship-issue skill and finish with its four-line report.` | the tool requires one |

Leave `permission_mode` and `model` unset, so the developer inherits this session's mode and model. If the tool refuses `use_worktree: true`, do not start the developer in this folder; tell the user instead. If the brief is not enough to start from, the developer says so and the issue goes back for a better body, never a longer prompt.

Without a session tool (in a plain terminal), tell the user which issues are claimed. They open one session per issue, each in its own git worktree, and run `/agent-pipeline:ship-issue <n>` there.

**5. When a developer reports** (`#<n> -> PR #<m> | … | CI …`, or `#<n> -> no PR`):

- If `Blocked:` is not `none`: release the issue and comment the reason on it, then carry it into the summary. Use `needs-info` when the reason is `not ready` or a question only a person can answer, and `blocked` when it waits on another issue or an outside change:

  ```bash
  gh issue edit <n> --remove-label in-progress --remove-label ready-for-agent --remove-assignee @me --add-label needs-info
  ```

  Removing the assignee matters: step 1 skips assigned issues, so a released issue that keeps it is never picked up again. Making it ready again is `/agent-pipeline:plan <n>`.
- If CI is `green`, or `none` with `Blocked: none`: run the `agent-pipeline:pr-reviewer` agent with `Review PR #<m> for issue #<n>.` Pass `model: opus` when the issue carries a label the settings list under *Review with Opus*.
- If CI is still red after the developer's two attempts: treat it as blocked.

**6. When the reviewer answers:**

- `MERGED`: remove the claim lock; the issue closes through `Fixes #<n>`. When the line ends `verify after deploy`, the PR said `Refs #<n>` instead: the issue stays open with the `verify-after-deploy` label, and you do nothing more with it. File each of the developer's *Follow-ups* as an issue whose body is the follow-up plus `From PR #<m> for #<n>`. Give it one label from each group the settings list under *Every issue carries*, chosen from the follow-up's text, and **not** `ready-for-agent`: it is scope an agent proposed, so building it is the user's call. List the follow-ups in the summary; the user promotes one with `/agent-pipeline:plan <n>`. Then offer to archive the developer session.
- `CHANGES`, `CI-RED` or `CONFLICT`: send the developer session one line, `Review on PR #<m>: address it, push, and report again.` The detail is on the PR. If the same PR gets `CHANGES` a second time, take it to the user instead.

**7. Repeat** from step 1 until nothing is left to start and nothing is in flight.

## Talking to the user

Ask only for product or design decisions, and batch them into one message. End each pass with one table:

| Issue | PR | State | Follow-ups |
|---|---|---|---|

When the settings turn *Verify after deploy* `on`, list under the table the open issues labelled `verify-after-deploy` (`gh issue list --label verify-after-deploy --state open --json number,title`). They are merged and wait on a check against the deployed app, which the user or a project skill runs, not the pipeline.
