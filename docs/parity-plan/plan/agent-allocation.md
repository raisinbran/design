# Agent allocation for Portfolio Studio

Recommendation only. Source: [SRCB agent task allocation](https://github.com/raisinbran/scrb/blob/main/agents/agent_task_allocation.md) (its 2026-11-23 revisions were still marked "pending owner approval" when read). That document is for SRCB; the rules below are the parts that transfer. Safety rules and owner-only merge authority still override. The owner granted me one exception: merging or closing PR #28.

## Roles

- **Management:** a Claude Code Sonnet session plans and coordinates. An Opus session oversees quality: plan review, high-risk review, independent QA, emergencies.
- **Choose by fit, not by habit.** Claude: planning, QA, integration, quality-sensitive UI work. ChatGPT Chat: docs and bounded cloud-safe changes. Codex: local native or packaging work that needs its device access.

## Rules to carry over

1. **One agent, one device, one goal, one branch** per assignment, with base commit, permitted files, acceptance tests and exclusions. No overlapping edits to the same files.
2. **Code written where `npm test` cannot run** (ChatGPT cloud) gets a check run on its branch by a Claude or Codex session before review. Such agents do not edit CI, workflows, signing scripts or controlling plans without Opus review, and never add a per-PR exception to a check.
3. **Codex gets one bounded attempt.** On a sandbox or permission failure it records the exact error once and hands off. No repeated retries and no hosted-workflow workarounds around its own limits. This is the lesson of PR #22's GUI-harness and CI-diagnostic commits.
4. **Independent review is a different agent, a different session, with the reviewed SHA in the review body.** The author switching model does not count. Agents share one GitHub account, so the review looks self-authored; that is accepted. PR text never names the agent (user rule). No usage log is kept for this repo.
5. **Plan changes need review and owner approval** before agents act: anything that changes scope or order of this plan.
6. **Lean**: fix demonstrated defects with focused tests; no unrelated cleanup, no repeated broad suites, no long investigations of optional tooling. If an optional tool is blocked, finish the unaffected work and report the minimum intervention.
7. **Risky areas need a short owner-approved plan first**: signing and entitlements, IPC and security, file deletion, save and rollback, anything touching private originals.
8. **Owner-only**: merges, gate approvals, spending, quota exhaustion. Weekly-quota use up to 99% is in scope for approved tasks, 100% only with a task-specific permit.
9. **Before each assignment** confirm current quota, active branches/PRs and CI, and open owner decisions. Do not reuse stale percentages.

## Suggested use per phase

| Phase | Primary | Review / QA |
| --- | --- | --- |
| 0 baseline, parity matrix, GUI QA | Claude (Sonnet) | Claude (Opus) on the matrix |
| 1 land PR #22 | Claude | different session, SHA recorded |
| 3 editor features | Claude (UI quality work) | other session; GUI QA by Claude computer-use if it works |
| 4 pipeline parity | Claude or Codex (storage/native), by fit | other agent |
| 5 Windows diagnosis | Codex on Windows or owner-run diagnostic | Claude reads the evidence |
| Docs | ChatGPT Chat or Claude | Claude spot-check |
