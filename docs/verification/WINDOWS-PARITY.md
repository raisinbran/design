# Windows Portfolio Studio parity verification

Verified 2026-10-27 on feature branch `codex/windows-studio-parity`.

## Source and preservation

- Tested commit: `b5f1d04cbfde72089e3597f7abe2e1e0d6b3f633`.
- `git fetch origin` succeeded. Published phase-1 branch resolved to that same SHA; `origin/master` was `32e6f6a8c52987acb60ecfcc211412aba019a7c5`.
- Initial working tree was clean. No stash, reset, merge, or rebase was necessary. Created a dedicated feature branch before verification.
- Read PHASE1-STATUS.md, MACOS_VERIFICATION.txt, regression fixtures, verification wrapper, publication/editor code and platform adapters first.
- Application source at this revision is unchanged from master (last Studio source commit `32e6f6a8c52987acb60ecfcc211412aba019a7c5`). Later phase-1 commits add validation tooling/reporting. No new application development explains a count difference: Windows and latest Mac both select 102.
- Protected tracked content check passed: `git diff --exit-code -- data photography images video js '*.html'`. No original or published portfolio assets were modified. All imports, exports and catalog writes used temporary synthetic fixtures.

## Exact environment

Windows 11, version 10.0.26300, SP0, AMD64; configured executable `tools/portfolio-studio/.venv/Scripts/python.exe`.
Python 3.15.1, build c37e74c (Oct 21 2026), MSC v.1951 64-bit. Tcl 9.0.4; Tk 9.0.4.

| Package | Version |
| --- | --- |
| Pillow | 13.0.0 |
| numpy | 2.5.4 |
| opencv-python-headless | 5.0.0.93 |
| pillow_heif | 1.8.1 |
| beautifulsoup4 | 4.15.0 |
| Send2Trash | 2.1.0 |
| soupsieve | 3.0.4 |
| typing_extensions | 4.16.0 |
| pip | 26.2.2 |

Full environment: [environment.json](windows-evidence/environment.json).

## Commands and results

From repository root, using the configured Windows venv; `PY` below means that executable.

| Command / check | Result |
| --- | --- |
| `PY -B docs/verification/windows-evidence/run_windows.py` | Existing `unittest` discovery, `tools/portfolio-studio`, pattern `test_*.py`: **102 passed, 0 failures, 0 errors, 0 skips, 0 excluded**, 14.475 seconds. |
| `PY -B docs/verification/windows-evidence/save_reload.py` | Two additional scripted integration probes passed: Photography publish/readback and Engineering import/save/Reload. Not counted as new regression tests. |
| `PY -B tools/validation/check_python.py` | 34 files compiled, Studio modules imported; exit 0. |
| `PY -B -m unittest discover -s tools/validation -v` | 6 passed, 0 failures/errors/skips. |
| Native Windows `recycle_files` plus Shell.Application Recycle Bin enumeration | PASS: disposable fixture absent from source and present in Recycle Bin with matching original location. |
| `git diff --check` | Passed before report commit. |

The runner sets APPDATA and LOCALAPPDATA to disposable storage before application imports and copies the existing checksum-verified model there. It does not use the Mac-only wrapper, exclude desktop tests, or install dependencies. Installed-model offline inference ran and passed; missing-model skip was not taken. Existing tests contain their own synthetic images/temp repositories. All selected test names and outcomes are retained in [regression.txt](windows-evidence/regression.txt), with [machine-readable totals](windows-evidence/result.json).

## Workflow evidence and scope

| Area | Verified | Method and boundaries |
| --- | --- | --- |
| Photography | Import/load, review/reset, HEIC decode, crop ratio/current orientation, all handles/right-click clear, rotation/undo, preview, publish/overwrite/cancel/rollback | Existing automated tests use actual image processing and real Tk widgets, usually withdrawn windows; file pickers/confirmation/viewer calls are mocked where indicated in test source. These do not certify dialog usability. |
| Export and originals | JPEG/thumbnail derivatives, authorship/rights metadata, crop before resize, watermark thresholds, source-byte preservation | Automated synthetic fixtures; additional publication/readback probe asserts original bytes unchanged. No aesthetic judgment on real photographs or byte-identical Mac watermark comparison. |
| Catalog | Publication update/readback; Engineering save/Reload; stale-write rejection, atomic rollback, draft visibility | Real temporary files and rendering; dialogs/pickers mocked. Engineering probe imports a 2400x1600 synthetic JPEG, verifies 1800px derivative and unchanged original, then Reload recovers saved title/media count. |
| Engineering | Text/rich formatting, draft/duplicate/reorder/remove/undo, media import, save and source protection | Automated synthetic project fixtures. Video fixture is a placeholder: playback/codec/PDF usability is not established. |
| Window layout | Overflow at 980/1280/1470/1710/1920, primary catalog visibility, workspace restoration, saved geometry | Automated width/memory tests include mocked allocated widths; they are not visual reviews at every display width. |
| Native rendered interface | Photography at 1280x850; Engineering details and media; return to Photography; crop and rotation/undo | Computer-use mouse/keyboard smoke check on a separate disposable source checkout. Observed both tabs render, thumbnail/image pane and toolbars appear, crop handles/shading appear, typing 7 changes crop size estimate, Undo restores angle 0 and estimate. Solid-color fixture cannot establish rotation aesthetics. Screenshots linked below. |
| Recycle Bin | Actual IFileOperation invocation and recoverable destination presence | Not mocked. Created only `windows-parity-native-recycle-fixture.txt`; source disappeared and Windows shell enumerated it in Recycle Bin. [Evidence](windows-evidence/recycle-bin.json). Restore was not executed; full-photo/thumbnail pair and partial-failure handling are covered by mocked regression backends, not this native shell probe. |

Native smoke setup is reproducible via [native_smoke.py](windows-evidence/native_smoke.py); it copies Studio source without venvs into a temporary checkout and generates all media/catalogs. It never copies real photographs. The disposable checkout was retained for inspection; the verification app was closed after checks. The real user's Studio windows were not operated.

Screenshots: [Photography](windows-evidence/photography.png), [Engineering details](windows-evidence/engineering.png), [Engineering media](windows-evidence/engineering-media.png), [crop](windows-evidence/crop.png). These are synthetic assets only.

## Mac comparison and outstanding differences

Latest Mac record: 102 tests, 5.337 seconds, zero skips/exclusions; phase-1 rerun 102 in 5.673 seconds. Earlier MACOS_VERIFICATION entry has 101: the added `test_primary_catalog_stays_visible_without_displacing_export_controls` accounts for the extra test. No tests were omitted on Windows. Mac Python 3.14.10 arm64 versus Windows Python 3.15.1 AMD64; both Tcl/Tk 9.0.4 and the seven principal package versions match. Runtime duration is observational, not a benchmark.

No Windows-specific application failure was confirmed, so no production fix or new defect regression was warranted. This is bounded parity evidence, not full GUI certification.

Remaining untested/native differences:
- No complete end-to-end publish sequence driven solely through visible dialogs; scripted integration exercised real publication with mocked confirmations/viewer.
- Default Windows viewer launch, audible notification preview, actual file picker interaction, multi-monitor/DPI layout, keyboard-only accessibility, window restoration across process restart, and extensive narrow-screen manual operation remain untested here.
- Mac native Trash/Finder/sound and interactive tab navigation remain limited by its report. This Windows run does not certify those Mac integrations.
- Native font rendering and watermark pixels can differ. No cross-platform golden-image/pixel comparison was performed.
- Native Recycle Bin fixture recovery is evidenced by destination presence, not a restore operation or native batch-photo removal.

## Publication

Local report commit is on `codex/windows-studio-parity`; use `git rev-parse HEAD` for its SHA (the tested source SHA above is fixed).
An initial push waited for interactive authentication and was cancelled. A noninteractive retry with `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`, and `credential.interactive=false` failed: `could not read Username for 'https://github.com': terminal prompts disabled`. No usable GitHub write connector or `gh` executable was available in this session. No remote feature branch or PR was created; no merge was attempted. Publishing requires usable repository write credentials. The final committed report was retried after commit with the same result.
