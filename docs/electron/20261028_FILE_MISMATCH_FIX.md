# Electron Desktop Applications — Windows Startup and File Mismatch Fix

**Date:** October 28, 2026  
**Repository:** `C:\Users\brand\Documents\GitHub\design`  
**Affected applications:** Portfolio Studio Electron and Photo Processor Electron

## Symptoms

Running `npm.cmd run start:processor` or `npm.cmd run start:studio` opened a blank gray Electron window. Developer Tools in Portfolio Studio reported:

```text
Unable to load preload script: ...\portfolio-studio-electron\.vite\build\preload.js
Error: ENOENT: no such file or directory, open '...\preload.js'
Uncaught TypeError: Cannot read properties of undefined (reading 'onCompanionTask')
```

An earlier startup attempt also failed with:

```text
Error: Multiple plugins tried to take control of the start command
 --> auto-unpack-natives, vite
```

## Diagnosis

Both application build directories contained **`preload.cjs`**, not `preload.js`. The Electron main process tried to load `preload.js`, so the preload bridge did not initialize; the React interface subsequently failed when calling `onCompanionTask` on an undefined bridge.

The shared Forge configuration also registered two plugins that both attempted to control the start command.

## Changes instructed

### 1. Remove conflicting Forge plugin

**File:** `tools/portfolio-electron-shared/forge-config.ts`

Remove the `AutoUnpackNativesPlugin` import and its entry from `plugins`, retaining `VitePlugin`. Preserve the existing Sharp/libvips ASAR unpack rule:

```typescript
asar: { unpack: '**/node_modules/{sharp,@img}/**/*' }
```

### 2. Correct preload filename

**File:** `tools/portfolio-electron-shared/src/main/desktop.ts`

Change:

```typescript
preload: path.join(__dirname, "preload.js"),
```

To:

```typescript
preload: path.join(__dirname, "preload.cjs"),
```

This aligns the main-process path with the generated preload bundle in both applications. The shared Vite source configuration contained a `preload.js` filename setting, but the observed actual build output was `preload.cjs`.

## Verification status

- **Confirmed:** After the Forge plugin correction, both Electron application windows could open.
- **Confirmed:** Both `.vite/build` folders contained `preload.cjs`, and Studio's developer console reported missing `preload.js`.
- **Not yet confirmed:** The user has not reported whether both interfaces render correctly after changing the preload path to `preload.cjs`.
- **Still outstanding:** Windows/macOS packaged-app launch, native image-processing behavior, Sharp/libvips inclusion, and installer verification.

## Recommended verification

From the repository root, run the following commands one at a time (close the first app before launching the next):

```powershell
npm.cmd run start:processor
npm.cmd run start:studio
```

Confirm both interfaces render and that no preload errors appear in Developer Tools. Then run the project's Electron tests and packaged build checks before committing the change.

**Scope:** This report records the user-provided console output and the fixes instructed during troubleshooting. It does not claim independent repository inspection or successful post-fix verification.
