# Agent pipeline: project settings

Read by `/agent-pipeline:dispatch`, `/agent-pipeline:ship-issue` and the `agent-pipeline:pr-reviewer` agent. Written by `/agent-pipeline:adopt`. Keep it short: every pipeline session reads it.

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

## Labels

| Role | Labels |
|---|---|
| Ready for an agent | `ready-for-agent` |
| Claim lock | `in-progress` |
| Not available | `blocked`, `deferred`, `needs-triage`, `needs-info`, `ready-for-human` |
| Type → branch prefix | `type: feature` → `feat`, `type: bug` → `fix`, `type: chore` → `chore`, `type: docs` → `docs` |
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
