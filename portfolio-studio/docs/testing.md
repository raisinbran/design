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

`backend/launch.test.ts` saves a settings file in a fresh user data folder, then launches the built app with the sandbox on. It checks that the page renders, that the renderer runs in the OS sandbox, that `window.portfolio` exists and `window.require` doesn't, and that the app opens the saved folder. It then edits one photo description, presses Save, and compares the catalog and the photography script with the expected bytes. The folder is a copy of this repository, so the test never touches the real checkout.

`backend/storage/portfolio.test.ts` saves into a copy of this repository and compares every file before and after. A save without edits changes nothing, which also shows that the generators reproduce the committed site files. An edit to one photo changes only its catalog entry and, unless it is a lock, the photography script. An edit to one Engineering body or Archive caption changes only that record and its page section. A body with a script, an event handler and a `javascript:` link reaches the page without them. A save that fails while writing leaves every file as it was. `backend/storage/images.test.ts` checks that the image protocol serves a site image and refuses files outside the image folders.

`backend/imaging/render.test.ts` renders a HEIC and a rotated JPEG and checks that each comes out as an upright WebP, at most 800 px on the long side, with the rights in EXIF and XMP and the AI-training notice. It checks that a JPEG with GPS and a camera's metadata keeps none of it, and that a straightened white image has no dark corners. The HEIC is `backend/imaging/fixtures/rotated.heic`, a 64 × 32 red and blue image stored with a HEIF rotation; the JPEGs are images from this repository. `backend/storage/add.test.ts` adds a photo to a copy of this repository and checks that only the image, the catalog and the photography script change, with the new tag at the end of the tags. It also checks that a new photo named like an existing one, ignoring case, changes nothing, that Overwrite replaces that photo's image, description and tags in place, keeping its visibility, priority and lock, and that Edit Image replaces only the image and its size.

`frontend/photography/arrangement.test.ts` checks that drags and Suggest Arrangement leave locked photos at their indexes. `frontend/app/editor.test.ts` checks that an edit made while a save runs stays unsaved. `frontend/app/ItemList.test.ts` checks that two items with the same title get distinct ids, which become page anchors. `backend/site/gallery.test.ts` runs the website's `js/photography.js` on the real catalog with a small fake DOM, and checks that the gallery shows visible photos in catalog order, with and without a tag filter.

The owner checks the rest by hand with the release checklist.

## Release checklist

Copy this list into the PR description and fill it in for each platform.

- [ ] The installer (`.deb`, `.exe` or `.dmg`) installs, and the installed app launches.
- [ ] Settings shows the app, Electron, Sharp and libvips versions.
- [ ] Choose folder picks the website checkout, and the app opens it after a relaunch.
- [ ] A resized or maximized window comes back that way after a relaunch.
- [ ] After closing the window on a second monitor and unplugging that monitor, the app opens on the remaining display.
- [ ] Photography, Engineering and Archive list their items with images, and Preview opens each page in the default browser.
- [ ] In Photography, an edit, a lock, a drag and Suggest Arrangement each save, undo and redo work, and the saved page shows the new order.
- [ ] In Engineering and Archive, an edit, an added item and a drag each save, and only their sections of the page change.
- [ ] In the Photo Editor, a phone HEIC imports, and rotate, straighten and the crop handles work with a mouse and a trackpad. Add to Photo Catalog changes only the new image, `data/media-catalog.json` and `js/photography-catalog.js`.
- [ ] The added image shows the watermark, and `exiftool` lists the author, copyright, usage terms and AI-training notice, and no GPS.
- [ ] After a relaunch, the draft list still shows an unfinished import. Edit Image reopens an added photo, and after moving its original, Relink finds it.
- [ ] After a discard in GitHub Desktop, Reload shows the discarded state.
- [ ] Linux from source: after the setup above, `Launch.sh` starts the app.
