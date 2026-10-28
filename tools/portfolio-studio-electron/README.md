# Portfolio Studio (Electron)

New desktop application for portfolio content management. Source entry responsibilities are declared in `src/app-definition.ts`. Shared schema and ownership notes are in `../portfolio-electron-shared/RESPONSIBILITIES.md`.

Owns Photography catalog management, Engineering, Archive, Settings, and About. The primary action is **Save Locally**. Photography pixel edits belong to the independently launchable Photo Processor.

The existing Python launcher remains in `../portfolio-studio` during implementation and native acceptance testing.

## Development and Packaging

From the repository root, install Node.js 22 or later and run `npm ci`. Start this app with `npm run start:studio`, or double-click `Launch.command` on macOS / `Launch.bat` on Windows after installing dependencies. Development launchers require Node; installed packages bundle Electron and the image runtime and require no Python or server setup.

Run `npm run build:electron`, `npm run typecheck`, and `npm run test:electron` from the root. Run `npm run make --workspace @portfolio/studio` on the target platform for a native package. Windows uses Squirrel; macOS uses a ZIP containing the application bundle. Signing/notarization requires owner-provided release credentials. Linux packaging is a development smoke check, not macOS/Windows installation proof.

See the [workflow guide](../../../docs/electron/README.md) and [release verification](../../../docs/electron/RELEASE_VERIFICATION.md) for optional linking, reconciliation, recovery, and native acceptance status.
