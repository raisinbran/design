# Audit of the PR #22 handoff and the Codex-era work (2026-11-23)

Moved to `docs/parity-plan/audit/`. Written by Claude on taking the project back. Method: read the handoff (branch `docs/portfolio-studio-pr22-20261122-handoff`, PR #28), the legacy parity doc, PR #22's diff (59 files, +3070/-438, 74 commits), the app source at PR #22's head, the CI workflow and the retirement commit. Not done: no Node on this machine, so I did not run `npm test` or the app. CI results below are from GitHub, and no GUI was exercised.

**Dating caveat.** Claude windows were 10/27–11/3 and 11/8–11/15. Git authors ("hco", "henrico", "Brandon C", "BC", "Brandon Chen") do not identify the tool, so I classified by date. Codex-era = 11/3–11/8 (the whole Electron rewrite, 11/6) and 11/15 onward (PR #22). The 11/11 refactor (#20) and 10/28 Electron/Python work fall in Claude windows by date; I did not audit them beyond reading their current code.

## Verdict

The Electron app's core is **sound**. The surrounding process was not. Keep the code, distrust the claims. PR #22 stays bundled, by the owner's decision (fast-tracking urgent changes); the risks of that are listed below.

## What holds up (keep)

- Security posture in `backend/main.ts`: `sandbox: true`, `contextIsolation`, no node integration, IPC calls refused unless from the main frame, navigation and `window.open` denied, closed list of IPC methods checked at compile time (`ipc.ts`).
- Catalogs validated by a schema before every save; saves skip unchanged files, check a revision hash, and refuse when files changed outside the app.
- Photo rename/delete (`storage/manage.ts`) is careful: rejects symlinks and path escape, never touches private originals, keeps shared derivatives, handles case-only renames. Regression tests exist.
- Image decode only in a worker (`imaging/jobs.ts`). Output format is validated at the write boundary.
- CI runs typecheck, tests and packaging on three OSes. Handoff claims of green CI match the PR's check rollup.

## Findings

Severity: **High** blocks trust or shipping, **Med** fix before release, **Low** tidy.

### High

1. **The Python app was deleted before parity was known.** Commit `3cca40a` (11/6, Codex era) removed 160 files / 30,814 lines, including all Python tests (the Windows parity report of 10/27 recorded 102 passing). The first real parity audit came 11/21 and found about 19 gaps. Mitigation: `origin/backup/pre-portfolio-studio-20261106` holds the code. That branch is now the only reference for the parity audit; it must not be deleted or force-pushed.
2. **Parity is overstated or unmeasured everywhere except the 11/21 doc.** Earlier reports ("parity", "retired apps") predate the gap inventory, which itself says it omitted features. `docs/verification/` and `tools/` reports describe the Python app, not the Electron one. Treat all prior parity claims as void until #26 produces a matrix.
3. **Reviews look self-authored on GitHub.** Review #6014586546 and PR #28's approval are posted by `raisinbran`, the account that also authored the commits. Per the owner, they are separate review comments by different agents sharing one GitHub account, so they count as independent; GitHub just cannot show it. Cost: the reviewing agent and reviewed SHA are not recorded anywhere checkable. Fix: name the reviewer session and SHA in the review body without naming the tool in PR text, or note it in the handoff.
4. **No GUI of the packaged app has ever been seen working in PR #22.** One Mac process launch (PID, no window), zero Windows physical success (`0x80000003`, unexplained), no screenshot, no click-through. Everything the owner cares about (look, editing, saving) is unverified at the native level. The handoff is honest about this; the PR title and "approved" language around it is not.
5. **macOS entitlements are far broader than the handoff says.** The handoff and `forge.config.ts` comment say only `disable-library-validation` is added to the main app. `scripts/macos-adhoc-main-entitlements.plist` also grants allow-jit, camera, audio-input, bluetooth, usb, location, photos-library and print. A photo-editing app that reads a chosen folder needs none of the device or personal-data ones, and none are tested. Fix: reduce to the minimum that launches (likely allow-jit plus disable-library-validation, or none for ad-hoc), and correct the docs. Verify by launch, not assumption.

### Med

6. **PR #22 is five changes in one (deliberate, owner-approved)**: website gallery fix, app feature work (naming, formats, arrangement, rename/delete, theme), 648 lines of CI/signing/smoke scripts, UI mockup SVGs, and two handoff docs. About 25 of 74 commits are CI formatting probes, bot "style" commits and diagnostic scripts (`ci: inspect exact test-formatting difference`, `ci: temporarily expose ...`). Review and revert-by-piece are hard. Accepted by the owner. Mitigation instead of splitting: one fresh review pass of the whole diff, an explicit checklist per piece, and Phase 1 acceptance covering site, app and signing separately.
7. **Master carries a stray test commit.** `a9ee9ea "buggy henrico app test"` (11/21, direct to master) added a `DSCF4154.heic.webp` catalog entry and thumbnail to the live data; PR #22 renames it to `DSCF4154_crop.webp`. Until #22 (or a cherry-pick) lands, master's catalog has a mis-named asset. Also a merge commit `db3241c` joined it.
8. **Save is not transactional.** The Python app rolled back multi-file writes. `replaceFiles` writes temp files first (good) but a failed rename partway leaves a mixed state and only tells the owner to "Reload, then save again". Low probability, high annoyance. Listed as a parity gap, not yet fixed.
9. **Test coverage is thin where the owner works.** Frontend tests: arrangement, editor state, ItemList, site-layout. None for PhotoEditor (394 lines, near the 400-line rule), Engineering, Archive, or Settings. One end-to-end launch test covers editing one description. New PR #22 UI (output format selector, arrangement menu, rename/delete, theme) is untested at the UI level.
10. **Docs have drifted.** `portfolio-studio/docs/testing.md` still describes "Suggest Arrangement" and the old test list; PR #22 changed the feature and added tests without updating it. The legacy parity doc mixes done, undone and design decisions in one file, and says some rows "predate restored theme controls".
11. **Evidence is not in the repo.** Website QA screenshots were saved under `/private/tmp` and never uploaded. Claims rest on PR comments by the same account. Future acceptance reports must put screenshots in the PR or `docs/verification/`.
12. **Scope and process drift**: a closed issue (#27) documents a Codex sandbox setting; handoff includes tool-subscription advice and long GUI-harness narration. None of this belongs in project docs. Mockups of unbuilt features sit in `docs/ui-proposals/` beside real docs; label or move them.

### Low

13. Gallery rule "final two rows may be shorter" (`js/photography.js`) is the agent's reading of the owner's rule; confirm with the owner when QA runs. Phone `<=720` and desktop paths are separate planners, so one geometry model would be safer (the handoff says the same).
14. Handoff link carries `?utm_source=chatgpt.com`; harmless, not to be copied.
15. The add path accepts a missing `image.format` and skips the byte/format match check (`storage/add.ts`); fine today because the renderer always sets it, but the guard is optional by type.
16. Stale local branches/remotes (`work`, `portfolio-studio-backend-cleanup`, `stab-enhance`, five `feat/portfolio-studio-*`) should be pruned after confirming they are merged. Do not delete without owner approval.

## Handoff accuracy

| Claim | Check |
| --- | --- |
| PR #22 head `17183f4c`, CI green on 3 OSes | **Confirmed** (check rollup success). |
| Formal independent review approved | **Accepted as independent** (separate agents, shared account); provenance not checkable, see finding 3. |
| Only main app gets `disable-library-validation` | **Wrong in scope**: see finding 5. |
| No full parity | **Correct**, and the most useful sentence in the document. |
| Website QA PASS | **Unverifiable from repo**: evidence is local only. |
| Mac launch via LaunchServices | **Plausible**, one attempt, process only. |
| Stop GUI harness retries | **Agree.** Use a working GUI path (see plan) or report blocked. |
| Issues #23–26 describe the remaining work | **Confirmed**; #26 is the gating item. |

## Open PRs

- **#22** (open, ready, mergeable, CI green): stays bundled. Hold merge until native acceptance (Phase 1).
- **#28**: merged (squash) on 2026-11-23, so the handoff is now `docs/handoffs/portfolio-studio-pr22-handoff-2026-11-22.md` on master. Docs only, CI green; kept as the only record of the GUI-failure decisions. Its review is treated as independent per the owner (finding 3).
