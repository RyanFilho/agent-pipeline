---
name: verify
description: Run the pipeline's verify-after-deploy checks - for each open verify-after-deploy issue whose merge is deployed, run the exact check in its "Verify after deploy" section against the deployed app, then close it with the evidence or comment the failure and hand it back as needs-info. Use when the user asks to verify deployed issues or runs "/agent-pipeline:verify", optionally with issue numbers.
---

# Verify after deploy

You run the checks that only the deployed app can settle. An issue reaches you merged, open and labelled `verify-after-deploy`; you close it, send it back, or leave it waiting. **You never change the deployed app:** no writes, no settings, no data.

Run every command as its own call, written out literally: no pipes, `&&`, `||`, `;` or shell variables. Read the output yourself instead of filtering it.

Read `.claude/agent-pipeline.md` first. It names the repository, the default branch, and under *Workflow*:

- **Verify after deploy**: if it is not `on`, stop and report `Verify after deploy is off: nothing to check`.
- **Deployed app**: where the app runs, the base URL for a check that names only a route.
- **Deployed version**: how to tell which commit is live. Either `workflow <file>, <file>, …`, the deploy workflows, each live at the head commit of its latest successful run on the default branch; or `command <cmd>`, a read-only command that prints the live commit SHA, such as a request to a `/version` route that serves the build's SHA.

If the file is missing, stop and report `Blocked: run /agent-pipeline:adopt in this project first`. If *Deployed app* or *Deployed version* is missing, stop and report `Blocked: add Deployed app and Deployed version to .claude/agent-pipeline.md`.

## 1. What is live

```bash
git fetch origin
```

Then find the live commit.

**`command <cmd>`**: run it exactly as the settings write it, and take the SHA it prints. That one SHA is live for every merge.

**`workflow <file>, …`**: for each listed workflow:

1. Read its file from the default branch, not from the settings, so its filters cannot drift: `git show origin/<default branch>:.github/workflows/<file>`. Note the `paths:` or `paths-ignore:` under `on.push`. A workflow with neither runs on every push.
2. Get its live commit: `gh run list --workflow <file> --branch <default branch> --status success --limit 1 --json headSha`.

If you cannot get a SHA for a source, or `git cat-file -e <sha>^{commit}` says the commit is not in the repository, stop and report `Blocked: cannot tell which commit <file or command> deployed`. Do not guess from the time of a merge.

## 2. The issues

```bash
gh issue list --label verify-after-deploy --state open --limit 50 --json number,title,body
```

When the user named issue numbers, keep only those. For each issue, oldest first:

1. **Find its merge.** `gh pr list --state merged --search "<n> in:body" --json number,body,mergeCommit,mergedAt`. Keep the PRs whose body opens with `Refs #<n>`, and take the most recently merged. If there is none, comment `Verify after deploy: no merged PR opens with Refs #<n>, so there is nothing to check yet.` and move on.
2. **Which deploys it touched.** With `command`, it touched the one live SHA. With `workflow`, list the PR's files with `gh pr diff <m> --name-only`. Then match them against each workflow's filters with GitHub's rules:
   - `*` matches within one folder and `**` matches across folders.
   - For `paths:`, the workflow is touched when any file matches. A `!` pattern excludes the files it matches, and a later pattern overrides an earlier one.
   - For `paths-ignore:`, the workflow is touched unless every file matches.
   - A workflow with no filter is always touched.
3. **Is it deployed?** For each touched source, run `git merge-base --is-ancestor <merge commit> <live sha>`. Exit code 0 means that deploy has it. When every touched source has it, the issue is deployed. When any does not, the issue waits: change nothing on it, and report it as `WAITING`, naming the workflows that have not shipped it. When no workflow is touched, no deploy will ever run for this merge: treat it as deployed, check it now, and add `No deploy workflow matched this PR's files, so none ran.` to the evidence.
4. **Read the check.** Take the issue body's *Verify after deploy* section. If it is blank or `_No response_`, treat it as a failed check whose output is `the issue has no check to run`.
5. **Run exactly that check**, against *Deployed app*, and nothing more. A request, a page you load in the browser, or a read-only query is fine. Do not run a check that writes, such as a `POST` that creates data or a command that changes a setting; and do not use a secret or a sign-in that this session was not given. Either way the check is not run: comment why, leave the labels as they are, and report it as `SKIPPED`, for a person to run.
6. **Judge it against what the check says it must show.** Nothing else counts: a page that loads but lacks the named field fails. A network error, a timeout or a `5xx` is not yet a verdict: run the check once more, a minute later, and judge the second result.

## 3. Record the verdict

**Pass.** Close the issue with the evidence:

```bash
gh issue close <n> --reason completed --comment "<evidence>"
```

The evidence is the check as run, what it showed (the status line and the part of the response or page that proves it, at most about 20 lines), the live commit SHA of each touched source (or the no-deploy note), and the time in UTC. Never paste a token, a cookie or personal data from a response; cut it out.

**Fail.** Comment what the check showed, in the same form as the evidence, followed by what it was meant to show. Then hand the issue back to the user, who decides with `/agent-pipeline:plan <n>` whether it needs a fix or a better check:

```bash
gh issue edit <n> --remove-label verify-after-deploy --add-label needs-info
```

Leave the issue open. Do not reopen or revert the PR, and do not file a fix yourself.

## 4. Report

Your answer is one line per issue, then nothing else:

```text
#<n> PASS | closed | <live sha per touched source, or "no deploy ran">
#<n> FAIL | needs-info | <one-line cause>
#<n> WAITING | merged in <merge sha>, not yet shipped by <workflows>
#<n> SKIPPED | <why it was not run>
```

If there are no open `verify-after-deploy` issues, the answer is `Nothing waiting on a deploy`.
