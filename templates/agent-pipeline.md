# Agent pipeline: project settings

Read by `/agent-pipeline:plan`, `/agent-pipeline:dispatch`, `/agent-pipeline:ship-issue`, `/agent-pipeline:verify` and the `agent-pipeline:pr-reviewer` agent. Written by `/agent-pipeline:adopt`. Keep it short: every pipeline session reads it.

## Repository

- **GitHub:** `<owner>/<repo>`
- **Default branch:** `main`
- **Merge method:** `--merge` <!-- or --squash / --rebase: match the existing history -->
- **A push to the default branch deploys:** yes <!-- yes: merging is a release, so the reviewer merges only on green CI -->

## Commands

| Purpose | Command |
|---|---|
| Build | `<build command>` |
| Fast tests, the inner loop | `<fast test command>` |
| Slow tests, run once at the end | `<full or browser test command, or "none">` |

## Workflow

A setting left out of this file takes its default, which is how the pipeline behaved before the setting existed.

- **Test cadence:** `inner-loop` <!-- default: build and fast tests while implementing, slow tests once at the end. Or end-only: nothing while implementing, then every command above once, in full, before the PR -->
- **Visual QA:** `required` <!-- default: check each touched screen in every theme and at phone, tablet and desktop widths. Or none: the project has no UI, or does not gate on rendered checks -->
- **Verify after deploy:** `off` <!-- default: every issue closes when its PR merges. Or on: an issue whose "Verify after deploy" section is filled in stays open after the merge, labelled verify-after-deploy, until /agent-pipeline:verify sees that check pass against the deployed app -->
- **Deployed app:** `<https://app.example.com>` <!-- only when Verify after deploy is on: the base URL the checks run against -->
- **Deployed version:** `workflow <deploy.yml>` <!-- only when Verify after deploy is on: how /agent-pipeline:verify tells which commit is live. workflow <file>, <file>: every workflow that deploys from the default branch, each live at its latest successful run; verify reads each one's path filters from the workflow file and waits only on the ones a merge touched. Or command <cmd>: a read-only command that prints the live commit SHA, such as curl -s <url>/version when the app serves its build SHA there -->
- **No CI checks:** `blocked` <!-- default: a PR on which no CI check runs is not merged. Or green: CI is path-filtered, so a PR with no checks (docs, agent config) counts as green -->

## Labels

| Role | Labels |
|---|---|
| Ready for an agent | `ready-for-agent` |
| Claim lock | `in-progress` |
| Not available | `blocked`, `deferred`, `needs-info`, `ready-for-human`, `verify-after-deploy` |
| Every issue carries | one `type:`, one `area:`, and one of `P1` to `P3` <!-- the label groups every issue needs, follow-ups included, or "none" --> |
| Type → branch prefix | `type: feature` → `feat`, `type: bug` → `fix`, `type: chore` → `chore`, `type: docs` → `docs` <!-- a new prefix also needs its git push entries in .claude/settings.json --> |
| Never two in flight at once | `area: db` <!-- areas whose work collides, e.g. migrations --> |
| Review with Opus | `P1`, `area: auth`, `area: db` |

## Gates

Project rules every PR must meet. The developer follows them and the reviewer checks them. Keep each to one line and point at the doc that explains it.

- <e.g. every new endpoint is authorised and scoped to the caller>
- <e.g. a migration is additive and updates the schema doc in the same PR>

## Read before building

- **Glossary:** `<CONTEXT.md or none>`
- **Decisions:** `<docs/adr/ or none>`
- **Specs:** `<docs/specs/>` <!-- where /agent-pipeline:plan writes designs too big for one issue -->
