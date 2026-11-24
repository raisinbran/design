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

## Still open before merge

1. **Entitlements:** `macos-adhoc-main-entitlements.plist` grants camera, microphone, Bluetooth, USB, location, photos-library, print and JIT beyond the documented need, and the signing check does not fail on extra keys or when `codesign` fails. Proposed fix: reduce to the minimum and make the check fail closed. This changes PR #22's branch, so it waits for the owner's OK.
2. **`docs/testing.md`** still describes "Suggest Arrangement"; update to the Arrangement menu.
3. **Owner confirmation:** the gallery lets the final two rows be shorter than the rest. Confirm this is wanted.
4. Owner merges.

## Matrix rows verified in code

Rows 11, 14, 17, 23, 27, 30 and 31 were checked against the source and updated in `parity/parity-matrix.md`. New gaps for the owner to decide on: row 23 (no duplicate, no project-level undo) and row 30 (no native title-bar tint).
