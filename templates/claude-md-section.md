## Agent pipeline

Large work runs as roles over GitHub Issues with the `agent-pipeline` plugin: a planner files `ready-for-agent` issues, `/agent-pipeline:dispatch` starts one developer session per issue running `/agent-pipeline:ship-issue <n>`, and the `agent-pipeline:pr-reviewer` agent reviews and merges. Project settings: `.claude/agent-pipeline.md`.

- **Developers are separate sessions, not subagents**, each with **fresh context** and nothing but `/agent-pipeline:ship-issue <n>` as the prompt. Never fork the lead: the issue is the brief.
- **Never develop in the main checkout.** It holds the user's uncommitted work and every session shares it. A developer session that finds itself there moves into a worktree with `EnterWorktree` before doing anything else.
- **Every session in the pipeline uses the lead's permission mode**, or messages between them are not delivered.
- **The lead does not read diffs.** It trusts the developer's report, the reviewer's verdict and green CI.
- **Claim before you build.** An issue labelled `in-progress`, or with a branch or PR that names it, belongs to another session.
- **Consult the advisor in developer sessions only**, at decision points. It re-reads the whole transcript on every call.
- **`/agent-pipeline:ship-issue` is an explicit request** to build, test, commit, push and open a PR.
