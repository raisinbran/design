# macOS Native Verification Final Record

Verified October 27, 2026.  Portfolio Studio 2.0.0, build 20261027.2.

## Result and Decision

**102 regressions passed, 0 failures, 0 errors, 0 skips, and 0 desktop exclusions**, in 6.126 seconds.  Four additional scripted workflow checks passed.  Native Finder opening, recoverable Trash destination presence, window resizing, close/reopen restoration, and sound command execution passed within the boundaries below.  No confirmed application defect was established, and no production source repair was made.

**Regular-use native sign-off remains incomplete.**  Six interactive verification groups remain blocked by an unresolved desktop-input/Tk interaction.  Coordinate clicks moved the pointer but did not activate Tk tabs or buttons, while text entry, native window controls, and resizing worked.  This observation does not establish whether physical mouse input fails.  It must not be counted as a successful usability test or attributed definitively to either the application or automation environment.

## Revision and Preservation

- Tested source: `3a77cd4ab8af2436f6c60c75cd47f63c2d789930`, matching freshly fetched `origin/master` and the supplied GitHub baseline.
- Original repository: `/Users/brandonchen/Documents/GitHub/design`, initially and finally clean at `b5f1d04cbfde72089e3597f7abe2e1e0d6b3f633`.  It was not reset, switched, rebased, or overwritten.  Fetch updated remote-tracking refs only.
- Report branch: `codex/macos-native-final`, in complete disposable clone `/private/tmp/portfolio-macos-final` based on the tested baseline.
- Workflow/UI clone: `/private/tmp/portfolio-macos-synthetic`, a separate complete repository clone at the same baseline.  Its catalogs and Engineering page were replaced with synthetic fixtures before writes.  Baseline files elsewhere in that clone remained present; only generated synthetic media was imported, processed, or opened.
- Original fixture: `/private/tmp/portfolio-macos-originals/mac-grid.png`, a generated 2400×1600 labeled grid, outside both repositories.  No real original or real published content was edited.
- Private HOME for tests: `/private/tmp/portfolio-macos-private`.  Regression wrapper uses its own temporary HOME.  User preferences were not edited.
- Report checkout production source diff against the baseline is empty.  The original working tree and protected content diff remained empty after testing.

Read `tools/portfolio-studio/MACOS_VERIFICATION.txt`, `docs/verification/PHASE1-STATUS.md`, and baseline `docs/verification/WINDOWS-PARITY.md` before running tests.  The last file was absent from the older original checkout and was read from `origin/master`.

## Environment and Test Host

macOS 27.0.1 (26A434), arm64; Python 3.14.10; Tcl 9.0.4; **Tk 9.0.5**.  This differs from the earlier reports' Tk 9.0.4 and is not evidence of a source change.  Screen: 1710×1107 logical pixels with Retina screenshots.  Full details: [environment.json](macos-evidence/environment.json), [native-results.json](macos-evidence/native-results.json).

Pillow 13.0.0, numpy 2.5.4, opencv-python-headless 5.0.0.93, pillow_heif 1.8.1, beautifulsoup4 4.15.0, Send2Trash 2.1.0.  Existing `.venv-macos` was reused; no packages or system runtimes were installed.

Opened the disposable `Portfolio Studio.app` through the desktop app API.  The API timed out, but process inspection confirmed that its launcher started Python in `/private/tmp/portfolio-macos-synthetic/tools/portfolio-studio`.  The original user's Python window shared the same application identity, preventing reliable target selection.  Only that newly launched synthetic process was closed after its working directory was confirmed.

For subsequent UI checks, copied the installed official Python.app to `/private/tmp/PortfolioMacTest.app`, assigned a unique test bundle identifier, and ad-hoc signed that disposable copy.  It ran the unmodified baseline `photo_studio.py` with existing venv packages and isolated HOME.  The synthetic checkout's launcher script alone was replaced with a test bootstrap to avoid dependency installation and isolate preferences.  No bootstrap change is included in this report branch.  This verifies the rendered source application under a separate test host, not a standalone/notarized binary or an untouched first-run installation sequence.  The original user's Studio window was left open and unmodified.

## Commands and Exact Results

`PY` means `/Users/brandonchen/Documents/GitHub/design/tools/portfolio-studio/.venv-macos/bin/python`.  Commands ran from the report checkout unless stated otherwise.

| Check | Exact Result | Evidence and Scope |
| --- | --- | --- |
| `git fetch origin`; resolve `origin/master` | PASS: supplied SHA matched remote master | Initial sandbox attempt could not write FETCH_HEAD; authorized retry succeeded. |
| `PY -B tools/portfolio-studio/verify_macos.py --download-model` | PASS: 102 selected/passed; 0 failures/errors/skips/exclusions; 6.126 s | [regression.txt](macos-evidence/regression.txt).  Native Tk tests and downloaded, verified offline-model inference ran.  Initial sandbox DNS failure occurred before discovery; authorized retry succeeded. |
| `HOME=/private/tmp/portfolio-macos-private PY -B docs/verification/windows-evidence/save_reload.py` | PASS: 2 scripted workflow checks | [save-reload.txt](macos-evidence/save-reload.txt).  Existing Windows probes repeat Photography publish/readback and Engineering import/save/Reload on synthetic fixtures.  Pickers, confirmations, and viewers mocked. |
| `PY -B docs/verification/macos-evidence/complete_checkout_workflow.py` | PASS: 2 additional scripted workflows in complete disposable repository | [script](macos-evidence/complete_checkout_workflow.py), [results](macos-evidence/complete-workflow.json).  Actual Photography JPEG/thumbnail/catalog generation and disk reload; Engineering media import, title edit, save, and Reload.  Dialogs mocked and auto-opening disabled. |
| `PY -B docs/verification/macos-evidence/native_probe.py` | PASS within integration boundaries below | [script](macos-evidence/native_probe.py), [results](macos-evidence/native-results.json).  One-shot script uses the retained disposable paths; use fresh fixtures/destination for a rerun. |
| Isolated export/notification preference save and reload | PASS: maxSide 1440, openAfterPublish false; silent mode, volume 22 | [preferences-roundtrip.json](macos-evidence/preferences-roundtrip.json).  Persistence adapter check only. |
| Original SHA-256 before/after processing and both workflows | PASS: identical | [before](macos-evidence/original-hashes-before.json), [after](macos-evidence/original-hashes-after.json). |
| Original checkout `git status --short` and protected content diff | PASS: empty | No original repository content changed. |
| Report checkout production-source diff and `git diff --check` | PASS | Documentation/evidence changes only. |

Four additional workflow checks are separate from the 102-test count.  Preference and native adapter probes are not additional regression-test counts.

Synthetic original SHA-256 before and after: `b28205e7484bbc7325a5e37e6a1e9bf20433f6541a808119dadedb525d5eddb1`.

## Native Desktop Matrix

| Area | Result | Actual Observation and Limits |
| --- | --- | --- |
| App bundle launch | PASS with test-host qualification | Native launcher started the synthetic checkout process.  Subsequent interactions used the separately identified host described above. |
| Wide Photography layout | PASS, visual | At 1470 logical pixels wide, Add original, Published catalog, export row, crop ratio, rotation, and overflow entry points render.  [Wide screenshot](macos-evidence/photography-wide.png).  Empty initial viewport is expected before import. |
| Narrow Photography layout and resize | PASS, visual | Native drag resized to 983×671 client area.  Primary Add original/Published catalog remained visible; JPEG quality, suffix, publish scope, preview/publish remained on their export row.  Crop ratio, destination, and rotation remained visible; secondary tools moved into More controls, and secondary actions into More actions.  [Narrow screenshot](macos-evidence/photography-narrow.png).  Menu activation remains blocked. |
| Native text input | PASS, bounded | Typing `Synthetic input probe` appeared in the accessible-description entry.  This was an empty synthetic session and did not publish content. |
| Closing, reopening, window restoration | PASS | Closed via native close accessibility action; process exited normally.  New process restored 983×671, maximized false.  [Saved state](macos-evidence/window-state.json), [reopened screenshot](macos-evidence/restored-window.png).  Multi-monitor position/maximized restoration was not exercised. |
| Finder/default viewer | PASS | Finder Go to Folder selected `mac-native-export.jpg`; Cmd+O opened Preview at that exact disposable URL.  Preview visibly rendered the rotated grid and watermark.  [Screenshot](macos-evidence/finder-export-preview.png).  Export is 1080×721, JPEG decoding verified.  This is Finder opening; the Studio auto-open UI path was not driven end to end. |
| Native Trash | PASS, recoverable destination presence | Unmocked `recycle_files` invoked Send2Trash on `mac-native-trash-fixture-20261027.txt`; source disappeared.  Finder selected the exact name in the user's Trash, showing 62 bytes.  [Screenshot](macos-evidence/trash-fixture.png), [results](macos-evidence/native-results.json).  Fixture retained in Trash; Trash was not emptied.  Restore and batch-photo deletion were not tested. |
| Sound backend | PASS for process execution; audibility unverified | Actual soft/system adapters invoked native playback.  Independent `afplay` checks for Glass.aiff and Tink.aiff returned 0, no stderr.  Silent adapter returned.  Tools do not hear system audio, so audible quality/volume are not certified. |
| Interactive tab navigation and return to Photography | BLOCKED B1 | Engineering coordinate clicks did not switch tabs.  Neither successful interactive Engineering entry nor return can be claimed. |
| Interactive crop handles, rotation, Undo | BLOCKED B2 | Original picker could not be activated; no loaded-image mouse editing was certified.  Shared automated tests cover handles, rotation, Undo, and image processing. |
| Native dialogs and Published catalog | BLOCKED B3 | Add original did not open a picker through automation.  Published catalog dialog usability was not established. |
| Overflow menu operation | BLOCKED B4 | Menus rendered at narrow width, but clicking More actions did not open it.  Existing regressions cover overflow membership/value preservation/restoration. |
| Preferences dialog and audible preview controls | BLOCKED B5 | UI interaction not established; persistence and backend execution passed separately. |
| Entire visible publish and Engineering edit/save/reload workflows | BLOCKED B6 | Scripted real-file workflows passed; neither entire workflow was driven solely through native visible dialogs. |

## Reproduction of the Interaction Blocker

1. Launch baseline Studio from the complete synthetic checkout using the isolated host above.  Observe Photography and Engineering tabs, initial description entry, and both toolbar rows.
2. On the 2940×1944 Retina window screenshot (1470 logical width), click Engineering at screenshot coordinate `(1570, 234)`.  Repeat after raising the app; repeat with a 150 ms hold.  Photography remains selected.
3. Click Add original at `(130, 100)`.  No picker appears.  A half-scale attempt `(65, 50)` also does not open it.  Coordinate pointer position changes, but Tk content does not activate.
4. Native drag from screenshot bottom-right `(2935, 1938)` to `(1960, 1400)` successfully resizes the window.  Capture the new narrow screenshot before using new coordinates.
5. At narrow width, click Engineering `(1080, 234)`, including a 500 ms hold, explicit left double-click, and a 1-pixel drag gesture.  Tab remains Photography.  Ctrl+Tab does not change it; notebook traversal shortcuts are not established by this observation.
6. Click More actions `(1780, 100)`.  No menu appears.  Type `Synthetic input probe`; text appears in the description entry.  Native close accessibility action works and geometry is restored on reopening.

The Tk accessibility tree exposes the top-level window and macOS menu bar, but no individual Tk buttons/entries/tabs for a semantic accessibility-action fallback.  Native Finder keyboard navigation and native close/resize actions work.  The same general tab-click limitation was already recorded in MACOS_VERIFICATION.txt; this run additionally identified Tk 9.0.5.  No traceback or application error dialog accompanied the failed activation attempts.  No physical human-click comparison was available.  Classification: **unresolved automation/runtime interaction, potentially application-affecting; not a confirmed production defect**.  No test-only source change was used to make a control pass.

## Windows Parity and Remaining User Action

Windows selected the same 102 regressions and passed all, on Python 3.15.1 / Tcl and Tk 9.0.4.  This Mac passed on Python 3.14.10 / Tcl 9.0.4 / Tk 9.0.5.  Principal package versions match.  Durations are observations, not benchmarks.  The repeated Windows workflow probes passed here, with the same mocked-dialog limits.  Both platforms now have native recoverable Trash/Recycle Bin destination evidence.  This Mac adds Finder-to-Preview evidence and native close/reopen size restoration.  Windows has successful visible tab/crop smoke screenshots; this Mac does not establish those interactive checks.  Watermark font/pixels were not compared byte-for-byte or demanded to match.

To resolve B1–B6, perform physical mouse testing on a fresh synthetic complete checkout, first confirming Engineering opens and returns to Photography.  Then use Add original to select the synthetic grid; exercise crop handles, rotation and Undo, Published catalog, narrow/wide overflow menus, native dialogs, notification preferences/preview, and both visible workflows.  Confirm sound audibility locally.  If physical clicks also fail, retain the exact runtime/version and reproduction above, then diagnose on a separate defect branch with a focused regression; do not approve regular-use readiness from the current automated pass alone.

No merge or unrelated publication is authorized or performed.  Verification PR is intended to remain open.  Disposable checkout and fixture paths are retained for inspection; the isolated test window is closed after verification.
