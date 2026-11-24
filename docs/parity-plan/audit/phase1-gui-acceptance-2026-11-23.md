# Phase 1: GUI acceptance of PR #22 (2026-11-23)

**Reviewed commit:** `17183f4c` (PR #22 head). **Result: PASS on macOS for what was driven; Windows and native window chrome still unverified.**

## How it was run

The real Electron app (the PR #22 build, `sandbox: true`) was launched with Playwright against a disposable copy of the site, never the real one. Automated baseline before the run: 76 of 76 unit tests passing.

This is a real app window, but it is driven through the page, not through OS-level clicks. It does not exercise the native title bar, menus, file-open dialogs, the packaged/signed app, or Windows.

## What was checked

| Check | Result | Screenshot |
|---|---|---|
| App launches sandboxed; window title, 1280x820, visible | Pass | `evidence/phase1-1-start.png` |
| Photography list, thumbnails, details panel | Pass | `evidence/phase1-1-start.png` |
| Engineering, Archive, Photo Editor, Settings render | Pass | `evidence/phase1-Engineering.png`, `-Archive`, `-Photo_Editor`, `-Settings` |
| Dark mode applies across the app | Pass | `evidence/phase1-settings-dark.png` |
| Arrangement menu offers 5 modes, 5 reverse modes, "Reverse current order" | Pass | `evidence/phase1-arrangement-menu.png` |
| Running "Color harmony" reorders the list and enables Save | Pass | `evidence/phase1-after-color-harmony.png` |
| Rename opens; Rename is disabled while the catalog has unsaved edits | Pass (by design) | `evidence/phase1-rename-open.png` |
| Edit Image opens the Photo Editor; shows "original not where it was saved" with Relink | Pass (expected, the disposable site has no private originals) | `evidence/phase1-edit-image2.png` |
| Console and page errors during the whole run | None | |

## Not covered

- Windows, including the unresolved `0x80000003` crash.
- The packaged, ad-hoc-signed app, and the native title bar and menus.
- Real import, crop and publish from a private original (needs files outside the disposable site).
- The gallery "final two rows" rule on the website (needs the owner's confirmation, see below).

## Fixes pushed to PR #22 (`412dbef`)

- Entitlements cut to `allow-jit` and `disable-library-validation`; the signing check now rejects any other main-app key and fails when the framework's entitlements cannot be read. Signing-policy test covers both (6 scenarios pass).
- `portfolio-studio/docs/testing.md` now says "Arrangement menu" instead of "Suggest Arrangement".
- The full unit-test suite was not re-run after this change (it only touches shell scripts and docs; the run was stopped when it overloaded the machine).

## New finding: packaged macOS app does not launch (pre-existing)

On macOS 27.0.1 (arm64), `macos-packaged-smoke.sh` fails for the DMG build both before and after the entitlement change. The main app starts, but every helper process (GPU, network) dies with "mapping process and mapped file have different Team IDs": the helpers are ad-hoc signed without `disable-library-validation`, so they cannot load the ad-hoc-signed Electron Framework. The "main app only" exception is therefore not enough. This is likely related to the Windows-independent "packaged app fails" reports and must be fixed before the packaged macOS build can be called working. The dev-run app (what the GUI check above used) is unaffected.

## Still open before merge

1. **Packaged macOS launch** (above): needs a decision on how to sign helpers (give helpers the same exception, or sign with a real identity).
2. **Gallery rule:** owner clarified that no row height was ever meant to be reduced and that narrower final rows are fine; the intent is that no photo is excessively undersized or oversized to fit a row. Current code already pairs tall portraits and fills interior rows, so no change is proposed unless a bound on interior row height is wanted.
3. Owner merges.
