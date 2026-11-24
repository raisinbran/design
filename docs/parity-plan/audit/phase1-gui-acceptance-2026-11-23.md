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

## Packaged macOS launch: found and fixed

On macOS 27.0.1 (arm64) the packaged app did not launch, with or without the entitlement trim: helper processes (GPU, network) were ad-hoc signed without `disable-library-validation` and could not load the ad-hoc-signed Electron Framework ("different Team IDs"). Per the owner's decision, the main app and its helper apps now share the same two-key exception (`forge.config.ts`); Electron Framework gets none. After the fix a packaged build opens: main plus GPU, network and renderer processes stay up with no loader errors over 12 seconds, and the signing check passes on the real bundle (it now also requires the exception on every helper, with a test scenario). Not yet run: the DMG smoke script and the signed-in-CI flow.

## Still open before merge

1. **Gallery rule:** owner clarified that no row height was ever meant to be reduced and that narrower final rows are fine; the intent is that no photo is excessively undersized or oversized to fit a row. Current code already pairs tall portraits and fills interior rows, so no change is proposed unless a bound on interior row height is wanted.
2. Run the DMG smoke script (CI or a quiet machine); the local run was stopped because of the earlier CPU load.
3. Owner merges.
