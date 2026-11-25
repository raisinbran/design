# Portfolio Studio

The desktop editor for the portfolio website in the parent folder. Version 1.0.0. Developer rules are in `AGENTS.md`; how the app works is in `docs/architecture.md`.

## Build the installer yourself

An installer can only be built on the kind of computer it is for: build the macOS installer on a Mac and the Windows installer on a Windows PC. (A Linux `.deb` can be built on Linux only; GitHub can build all three, see the end.)

### One-time setup

1. Install **Node.js 22** (the LTS version) from <https://nodejs.org>. Accept the defaults.
2. **macOS only:** open Terminal and run `xcode-select --install` if you have never installed the developer tools. (If it says they are already installed, carry on.)
3. Open a terminal in this folder (`portfolio-studio`):
   - **macOS:** open Terminal, type `cd ` (with a space), drag the `portfolio-studio` folder onto the window, press Return.
   - **Windows:** open the `portfolio-studio` folder in File Explorer, click the address bar, type `cmd`, press Enter.

### Build

Run these two commands, one at a time. The first takes a few minutes the first time; the second takes a few minutes and prints a lot of lines.

```sh
npm ci
```

```sh
npm run make
```

### Where the installer is

| System  | File                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| macOS   | `out/make/dmg/arm64/Portfolio Studio-1.0.0-arm64.dmg` (`x64` instead of `arm64` on an Intel Mac) |
| Windows | `out/make/squirrel.windows/x64/` , the file ending in `Setup.exe`                                |

Open it to install. The installers are not signed, so:

- **Windows** may say "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS** may refuse to open the app. Open it once, then go to **System Settings, Privacy and Security** and choose **Open Anyway**.

### Run without installing

Double-click `Launch.command` (macOS) or `Launch.bat` (Windows). The first run installs what it needs and then opens the app.

### If it fails

Run `npm ci` again and then `npm run make`. If it still stops, copy the last 20 lines of the output and send them to whoever maintains the app.

### Letting GitHub build all three

On GitHub, open **Actions**, choose **Portfolio Studio release**, then **Run workflow**. When it finishes, the three installers are on the run's page under **Artifacts** (kept for 90 days). Pushing a tag such as `v1.0.0` instead also creates a Release page with the files attached.
