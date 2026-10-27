# Phase 1 verification status

Verified 2026-10-27 on branch `codex/portfolio-phase1-validation`.

- Fetched remote master and confirmed baseline: `32e6f6a8c52987acb60ecfcc211412aba019a7c5`.
- Implementation tested: `5c1152c1d619a2b1b03497b3ba6671ec9f1527a1` (this report is committed subsequently).
- Initial working tree was clean. No original photographs, published assets, site markup, JavaScript, or real catalogs changed.

## Commands and exact results

Run from repository root. `PY` below means `tools/portfolio-studio/.venv-macos/bin/python`; `NODE` means the existing bundled executable `/Users/brandonchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

| Command | Result |
| --- | --- |
| `git fetch origin` and `git rev-parse origin/master` | Supplied baseline matched remote master. |
| `$PY -B tools/validation/check_python.py` | Exit 0; 34 files compiled without bytecode writes; all 29 non-test Studio modules imported without constructing a GUI. |
| `$PY -B tools/validation/validate_portfolio.py` | Exit 0; 28 photos and 7 projects validated; no files written. |
| `$PY -B -m unittest discover -s tools/validation -v` | 6 tests passed; 0 failures, 0 errors, 0 skips. Invalid JSON in each catalog, missing photo/thumbnail/project asset, unknown tag, unsafe project path and stale generated references rejected with exit 1. Every fixture check also asserts unchanged file contents and file inventory. |
| `$NODE tools/test-photography-gallery.cjs` | Exit 0; 270 tag/viewport cases plus portrait, landscape, filtering, thumbnail and mobile-selection assertions passed. |
| `$NODE tools/test-home-previews.cjs` | Exit 0; fade, catalog, hover/focus pause, failed-image and reduced-motion assertions passed. Script does not publish an assertion count. |
| `$PY -B tools/portfolio-studio/verify_macos.py --download-model` | Exit 0; 102 selected, 102 passed, 0 failed, 0 errors, 0 skipped; 0 desktop tests excluded; 5.673 seconds. Model downloaded and inference tested in disposable storage. |
| `ruby -e 'require "yaml"; w=YAML.load_file(".github/workflows/portfolio-validation.yml"); abort unless w["jobs"].keys.sort == %w[catalog-validation javascript-tests python-validation]'` | Exit 0; YAML parsed and expected jobs present. |
| `/tmp/actionlint .github/workflows/portfolio-validation.yml` | actionlint 1.7.7: exit 0, no diagnostics. Temporary macOS arm64 binary; no runtime installed. |
| `git diff --check` | Exit 0; no whitespace errors. |
| `git diff --exit-code 32e6f6a8c52987acb60ecfcc211412aba019a7c5 -- data photography images video js '*.html'` | Exit 0; protected tracked content unchanged after all checks. |

The first sandboxed Mac model download stopped before test discovery due to unavailable network/DNS (zero tests executed). The authorized native rerun outside that restriction produced the 102-pass result above. Existing `.venv-macos` reused; no Python or Node runtime installed.

## Environment

- macOS 27.0.1 (26A434), arm64; Python 3.14.10; Tcl/Tk 9.0.4.
- Local Node v24.19.0; CI explicitly targets Node 22 and Python 3.12 on ubuntu-latest. Linux runner execution remains to be confirmed by GitHub Actions.
- Existing Mac packages: Pillow 13.0.0, numpy 2.5.4, opencv-python-headless 5.0.0.93, pillow_heif 1.8.1, beautifulsoup4 4.15.0, Send2Trash 2.1.0.

## CI boundaries and remaining verification

Three independent jobs run on pushes, pull requests and manual dispatch, with read-only GitHub permissions, disabled persisted checkout credentials and bounded timeouts. Catalog checkout enables LFS. The validators never call catalog synchronization, save, publication or model-setup entrypoints. Imports and synthetic negative tests are offline; dependency installation and LFS checkout require network access. Each job checks tracked files for changes.

Linux does **not** run `test_studio.py`, `test_engineering.py` or `verify_macos.py`: those suites include desktop Tk tests and installed-model inference. There is no headless regression job and no claim of Linux GUI or model coverage. Import validation requires Tk libraries but does not open windows. GitHub-hosted CI results and Python 3.12 compatibility must still be observed after push. Media validation checks existence and catalog/reference consistency; it does not decode every image/video, certify LFS payload contents, crawl every site link or compare all engineering HTML to its catalog.

Required Windows follow-up in an existing configured desktop environment:

1. Run `python -m unittest discover -s tools/portfolio-studio -p 'test_*.py' -v` with the offline model installed. Record exact selected/pass/fail/error/skip counts and Python/Tk/package versions; do not count skipped inference as verified.
2. Smoke-test Studio launch, editing/crop viewport, dialogs, file selection, scrolling, preferences and reopening on a Windows desktop using synthetic files.
3. Verify Recycle Bin behavior and file opening adapters, and confirm publication/engineering editing on a disposable repository copy preserves originals and unrelated page content.

Local Git LFS hooks report that `git-lfs` is unavailable. Only new text tooling/workflow/documentation files are committed; no LFS objects are introduced. Push may bypass the local LFS hook for this text-only branch without editing repository hooks. No merge is authorized or performed.

## Publication blocker

Local commits are complete. `git -c core.hooksPath=/dev/null push -u origin codex/portfolio-phase1-validation` failed with `could not read Username for 'https://github.com': Device not configured`. The connected GitHub service was also tried: creating the feature branch returned HTTP 403, `Resource not accessible by integration`. Consequently no remote branch or PR was created, and hosted CI has not run. Publishing requires a Git credential with repository write/workflow permission or an appropriately authorized GitHub connection. Nothing was merged.

## Publication update

Repository access was refreshed by the owner. The GitHub connector successfully published the feature branch and workflow. Implementation on GitHub: `3399213fbdbe75e29ab263809c9a09e2c30ef238`; it contains the same tooling verified locally above. The earlier publication blocker is resolved through the connector; local Git HTTPS authentication remains unavailable. Hosted CI results will be reported on the PR.
