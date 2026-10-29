# Testing

Run `npm test` in `portfolio-studio/`. It builds the app, then runs the Vitest tests that sit next to the code.

## Linux setup

The tests and `npm start` run Electron with its sandbox on. Ubuntu 23.10 and later block the user namespaces that the sandbox needs, unless an AppArmor profile allows them for the Electron binary. Run this once in the main checkout. The profile also covers worktrees in `worktrees/`, and it survives `npm ci`.

```sh
CHECKOUT="$(git rev-parse --show-toplevel)"
sudo tee /etc/apparmor.d/portfolio-studio-electron >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>

profile portfolio-studio-electron $CHECKOUT{,/worktrees/*}/portfolio-studio/node_modules/electron/dist/electron flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/portfolio-studio-electron
sudo apt install xvfb
```

Without the profile, Electron stops at launch with a message about `chrome-sandbox`. The installed `.deb` needs no setup.

Run the tests with `xvfb-run -a npm test`, so their windows stay off the screen. Plain `npm test` also works in a desktop session, where the app window appears briefly.

## What the tests cover

`backend/launch.test.ts` saves a settings file in a fresh user data folder, then launches the built app with the sandbox on. It checks that the page renders, that the renderer runs in the OS sandbox, that `window.portfolio` exists and `window.require` doesn't, and that the app opens the saved folder. The folder is a copy of this repository, so the test never touches the real checkout.

`backend/storage/portfolio.test.ts` saves into a copy of this repository and compares every file before and after. A save without edits changes nothing, which also shows that the generators reproduce the committed site files. An edit to one photo changes only its catalog entry and, unless it is a lock, the photography script. A save that fails while writing leaves every file as it was. `backend/storage/images.test.ts` checks that the image protocol serves a site image and refuses files outside the image folders.

The owner checks the rest by hand with the release checklist.

## Release checklist

Copy this list into the PR description and fill it in for each platform.

- [ ] The installer (`.deb`, `.exe` or `.dmg`) installs, and the installed app launches.
- [ ] Settings shows the app, Electron, Sharp and libvips versions.
- [ ] Choose folder picks the website checkout, and the app opens it after a relaunch.
- [ ] A resized or maximized window comes back that way after a relaunch.
- [ ] After closing the window on a second monitor and unplugging that monitor, the app opens on the remaining display.
- [ ] Photography, Engineering and Archive list their items with images, and Preview opens each page in the default browser.
- [ ] After a discard in GitHub Desktop, Reload shows the discarded state.
- [ ] Linux from source: after the setup above, `Launch.sh` starts the app.
