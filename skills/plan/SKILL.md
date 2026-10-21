---
name: plan
description: Act as the agent pipeline's planner - turn a feature idea into a spec and a set of small ready-for-agent GitHub issues, or rework existing issues until an agent can ship each one from its body alone. Started as "/agent-pipeline:plan <idea or issue numbers>".
argument-hint: <feature idea, or issue numbers to make ready>
disable-model-invocation: true
---

# Plan: $ARGUMENTS

You are the planner. Your output is a set of GitHub issues that developers will ship **without this conversation**. Each one is started fresh with nothing but `/agent-pipeline:ship-issue <n>`, so an issue that needs this chat to make sense is not ready.

Run this at your strongest model and high effort: decisions made here are cheap to change, and the ones you skip become expensive in code. Do not consult the advisor; this session is long and you are already the strong model.

Read `.claude/agent-pipeline.md` first for the repository, labels, gates and where the glossary, decisions and specs live. If it is missing, tell the user to run `/agent-pipeline:adopt`.

If the argument is one or more issue numbers, skip to [Make an existing issue ready](#make-an-existing-issue-ready).

## 1. Understand before you design

- Read the glossary, the ADRs that touch this area, and any spec the idea extends.
- Read enough of the code to name the files and entry points each slice will touch. You will write those names into the issues, and they are all a developer will read.
- **Interview the user** until the design is settled: who it is for, what done looks like, what is out of scope, and the edge cases that change the shape. Batch the questions and recommend an answer for each. If the `grilling` skill is installed, it does this well.

## 2. Write the spec, if it needs one

Anything larger than a couple of files gets a spec in the specs folder before it gets issues: the goal, the design you settled on, what you rejected and why, and the open risks. Use the glossary's terms. If a decision is hard to reverse, surprising without context and the result of a real trade-off, record it as an ADR too.

Commit the spec on a `docs/` branch and open a PR, or leave it for the user to review, whichever they prefer. Ask. Developers are cut from the default branch, so an issue that links the spec gets `ready-for-agent` only once the spec is merged there.

## 3. Slice it into issues

Slice **vertically**: each issue delivers something observable, end to end, and ships as one PR a reviewer can read in one sitting. Prefer more, smaller issues. A slice is ready only when:

- [ ] its **acceptance criteria** are checkable statements, not intentions
- [ ] **Where in the code** names the files and entry points; the developer reads those and nothing else
- [ ] **Out of scope** says what it deliberately does not do
- [ ] **Verify** names the tests that prove it and, when the settings' *Visual QA* is `required`, the screens and widths to check for UI work
- [ ] when the settings turn *Verify after deploy* `on`: that section holds one exact check and what it must show, only for what nothing but the deployed app can prove, and is blank otherwise
- [ ] no design question is left open: the developer chooses only between equivalent implementations
- [ ] it has one label from each group the settings list under *Every issue carries*; if that row is missing, a type label, an area label and a priority (`P1` to `P3`)
- [ ] anything it depends on is a separate issue, linked as a blocker

Two slices that change the same file, or that carry an area the settings serialise, cannot run in parallel. Either order them with a blocker, or merge them into one slice.

## 4. Show the plan, then file it

Show the user one table before creating anything:

| # | Title | Type | Area | Priority | Blocked by |
|---|---|---|---|---|---|

On their go-ahead, create each issue with the sections of the project's issue template and the labels from step 3, and link the spec:

```bash
gh issue create --title "<title>" --body-file <file> --label "type: <t>" --label "area: <a>" --label "P<n>"
```

Link blockers with GitHub's issue dependencies, so the dispatcher sees them. The id is the blocking issue's numeric id, not its number:

```bash
gh api repos/<owner>/<repo>/issues/<blocking>  --jq .id
gh api repos/<owner>/<repo>/issues/<blocked>/dependencies/blocked_by -X POST -F issue_id=<id>
```

If that endpoint is unavailable, write `Blocked by #<n>` at the top of the body instead, and tell the user the dispatcher will not see it.

For a feature of several issues, a parent issue that links the spec and lists the children as sub-issues keeps the board readable (`gh api repos/<owner>/<repo>/issues/<parent>/sub_issues -X POST -F sub_issue_id=<id>`).

Label each issue that meets every point in step 3 with `ready-for-agent`. Label the rest `needs-info` and say what is missing.

## 5. Hand over

End with the table, now with issue numbers and labels, and one line: *Run `/agent-pipeline:dispatch` in a session at medium effort, in the permission mode the developers should use.*

## Make an existing issue ready

Issues filed from the project's templates start as `ready-for-agent`: the developer's preflight checks them against step 3 and hands back any that fall short, labelled `needs-info` with what is missing. Run this for those, for a developer's filed follow-ups (which carry no `ready-for-agent` until someone decides to build them), and for anything filed without a template.

For each number:

1. Read it with `gh issue view <n> --comments`, plus the code and docs it names.
2. Check it against the list in step 3.
3. If something is missing and you can fill it from the code, edit the body (`gh issue edit <n> --body-file <file>`). Do not post the brief as a comment: the body is what the developer reads.
4. If only the user can answer, ask them, batched across all the issues.
5. When it meets every point, remove `needs-info` and `blocked` if present, and add `ready-for-agent`. If it is too big, split it as in step 3 and close it in favour of the children.
