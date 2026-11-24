# Path forward: Portfolio Studio to parity and polish (2026-11-23)

Owner rules still apply: the app never publishes, never touches private originals, keeps the Electron sandbox on, edits generated files only through Save. Do not commit or push without being asked. Plans stay small: smallest fix per real bug, no scope inflation.

Companions: [audit](../audit/handoff-and-codex-era-audit-2026-11-23.md), [parity matrix](../parity/parity-matrix.md), [agent allocation](agent-allocation.md).

**Owner decisions recorded 2026-11-23:** PR #22 stays bundled (deliberate fast track). I may write the parity report; nothing proposed in it is implemented without the owner's decision. Some Python features may be obsolete and can be waived. PR #28 was mine to merge or close: merged. Phases below are approved as scoped.

## Phase 0: Re-baseline (first, small)

1. Install Node 22 locally (needs owner OK) so tests run here, not only in CI. Run `npm ci`, `npm run typecheck`, `npm test` on PR #22's head and record results.
2. Owner decisions still needed: (a) prune stale branches; (b) protect `backup/pre-portfolio-studio-20261106`; (c) parity matrix choices: done 2026-11-23; (d) usage log: not needed, dropped.
3. Get a working GUI QA path. Try Claude's computer-use on this Mac against a benign window first. If it works, I run the GUI checks myself; the owner only approves launches. If not, report GUI QA blocked and stop; no harness debugging.

## Phase 1: Land PR #22 (bundled)

PR #22 is merged as one unit, by owner decision. Before the owner merges:

1. Fresh review of the full diff by a session other than the author, SHA recorded, using the five pieces as a checklist: A site (`js/photography.js`, CSS, `photography.html` cache key, DSCF4154 rename), B app features, C CI/signing scripts, D docs/mockups.
2. Fix audit finding 5 (entitlements) and re-run signing checks; update `docs/testing.md` for the new features.
3. Native GUI acceptance via the Phase 0 path, with screenshots committed to the PR or `docs/verification/`.
4. Owner confirms the gallery "final two rows" rule. Owner merges.

## Phase 2: Parity matrix (issue #26), gating all new features

Read the Python source on the backup branch module by module and produce one table: feature, Python source, Electron status (done/partial/missing/waived), test, owner waiver. Check at least these, several absent from the existing parity doc: `update_published_rights.py` (bulk rights update), `export_rights.py`, `studio_notifications.py`, `video_preview.py`, `gallery_thumbnails.py`, `thumbnail_list.py`, `setup_offline_descriptions.py`, `modern_scale.py` (HiDPI), `window_state.py`, `verify_macos.py`. Port the Python tests' intent (102 tests) as a checklist of behaviors to cover, not as code. Draft exists: [parity-matrix.md](../parity/parity-matrix.md). Next: line-level verification of rows marked Verify, then the owner marks each row Build, Waive or Later. Nothing is built before that.

**Status (2026-11-24): complete.** All 39 rows decided or verified (rows 38-39 added: Tk-only widgets, not applicable). The "102 Python tests" are not on the backup branch (only the earlier TypeScript tests are), so behavior coverage is tracked by the matrix rows and each phase's own tests instead.

## Phase 3: Photo Editor (issues #23–25), one shared model

Build one geometry/state module first (crop, rotation, level angle, zoom, pan, grid, history) with unit tests, then the UI on it. Implement the approved two-bar layout: fixed-size controls, crop controls disabled by one shared predicate, undo/redo, Reset with confirm, default-drag pan, 25–400% slider with centered 100% tick, Apple-Photos aspect presets with persistent W/H and orientation. Order: #23 leveling and Reset, #24 aspect, #25 grid/zoom/pan. Add component tests for the toolbar's stable layout. GUI pass after each.

## Phase 4: Pipeline parity (decided rows only)

Per the owner's 2026-11-23 choices in the parity matrix. Build order, each with tests and a GUI pass:
1. Save rollback (29), since later work writes more files.
2. Engineering and Archive media import/optimize (24).
3. Batch import and publish with numbered name conflicts (1).
4. Rights backfill into existing published images (21): dry run by default, backups outside Git, never touches originals.

Later (not scheduled): ML captions (13), rebuild thumbnails (18), reconcile outside changes (19), video still frame (25). Everything else is waived. Phase 3 covers rows 6-10.

## Phase 5: Platforms and release

- macOS: GUI acceptance via the Phase 0 path, using the release checklist in `docs/testing.md`; keep ad-hoc signing, minimal entitlements. Developer ID and notarization only if the owner wants distribution beyond their own Macs.
- Windows `0x80000003` (STATUS_BREAKPOINT): need one owner-run diagnostic on that machine: Event Viewer/WER faulting module, and whether launching the unpacked `out/` build and the Squirrel install behave differently. Leading suspects to check, not conclusions: native module (sharp/@img) blocked or unpacked wrongly by endpoint security, and GPU/sandbox start failure. No blind relaunches. If the employer machine cannot be diagnosed, acceptance on another Windows machine is the fallback.
- Polish: accessibility of icon-only controls, tooltip behaviour, error messages, About page and appearance (appearance done; About missing), window-bounds restore on removed monitor, README and architecture docs current.

## Working rules for this project from now on

- One concern per PR; no CI-probe commits on a PR branch (use a scratch branch).
- Every acceptance claim links committed evidence (screenshots, logs) and the exact SHA.
- "Reviewed" means a fresh pass by a different agent whose findings were checked against code. Agents share one GitHub account, so record the reviewed SHA in the review body.
- Update `docs/testing.md` and the parity matrix in the same PR as the behavior.
- Mockups are labelled as design only and kept out of the way of real docs.

## Agent allocation

See [agent-allocation.md](agent-allocation.md), adapted from the SRCB allocation policy: Sonnet plans, Opus oversees quality, choose by fit, one bounded Codex attempt, independent review by a different agent with a recorded SHA, owner-only merges.

## Order of work

P0 → P1 → P2 → P3 → P4 (as chosen) → P5, with Windows diagnosis started in parallel as soon as the owner can run it. First concrete step: owner answers the open P0 decisions; I install Node (with approval) and re-run PR #22's tests.
