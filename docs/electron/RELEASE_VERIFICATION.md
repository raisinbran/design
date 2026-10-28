# Release Verification

## Observed Results

Verified on 28 October 2026 in a Linux x64 managed workspace with Node 24.19.0, Electron 38.8.6, four available CPUs, Sharp 0.34.5, and libvips 8.17.3. These results do not establish macOS or Windows acceptance.

| Check                                                | Result                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and both production Vite builds           | Passed                                                                                                                                                            |
| Electron unit/integration tests                      | 27 passed, including actual SIGKILL after partial installation and recovery by a fresh service                                                                    |
| Existing photography layout/homepage tests           | Passed, including 330 tag/viewport cases                                                                                                                          |
| Live portfolio validation and validation unit tests  | Passed, six unit cases                                                                                                                                            |
| Existing Python catalog synchronization tests        | Six passed with writable LOCALAPPDATA                                                                                                                             |
| Both final Linux Forge packages                      | Built independently                                                                                                                                               |
| Both packaged HEIC workers                           | Decoded 32 × 24 HEVC fixture; output 1238 bytes with EXIF/XMP rights, package-local Sharp resolution verified                                                     |
| Real packaged Linux windows                          | Passed under Xvfb: independent launches, sandboxed preload, optional linked delivery, rendering, publication receipt, and Studio refresh                          |
| Service-backed Chromium UI                           | Saved all three Studio sections, rendered/published one image, retained output inspection, blocked consumed-token reuse, refreshed Studio, no renderer exceptions |
| Generated photography website                        | Loaded valid legacy and new single-image files with correct image URLs and decoded image dimensions                                                               |
| Production catalogs, originals, and full-size photos | Unchanged by QA; workflows ran in disposable workspaces                                                                                                           |

Packaged worker runs emitted Linux GLib teardown warnings while returning successful image/metadata results. The first native attempt without a display failed in GL/display initialization. A disposable Xvfb runtime under `/tmp` then enabled the successful real-window checks. No system installation or HOME override was needed.

The complete legacy Python/Tk UI suite was not a passing acceptance suite in this headless, read-only-home environment. A broader run reported display/backup-path errors and existing baseline assertions concerning Archive newline snapshots and an appearance preference. Those unrelated legacy behaviors were not changed. The changed catalog validator and targeted synchronization/validation checks passed.

## Measurements

One observed run, without a performance threshold or cross-platform extrapolation:

| Operation                                                          | Measurement                                        |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| Studio packaged launch to bridge-ready window                      | 879 ms                                             |
| Processor packaged launch to bridge-ready window                   | 656 ms                                             |
| Built Studio renderer to initial control in Chromium               | 240 ms                                             |
| Processor crop-toggle interaction, including automation round trip | 53 ms                                              |
| 60 foreground scrolling animation frames                           | 988 ms, approximately 60 fps in this small catalog |
| Ten sequential 12 MP synthetic JPEG renders in fresh workers       | 3.83 s total; 356–420 ms/photo                     |

The batch uses a 4000 × 3000 flat-color JPEG, a 90% crop, 800 px WebP quality 78, watermarks, and rights metadata. It measures worker startup and processing, not filesystem publication or complex real-photo compression. Crop timing measures the control response, not live drag-crop rendering. Background tabs throttle animation frames; scrolling is measured only after bringing Studio to the foreground. Repeated production-hardware measurements remain necessary before retiring Python. Machine-readable observations are in [qa-results](qa-results/).

## Reproduce

From the repository root after `npm ci`:

```sh
npm run typecheck
npm run test:electron
npm run build:electron
npx playwright install chromium
npm run qa:browser
npm run package:electron
npm run qa:packages
npm run qa:native
npm run benchmark:electron
```

`qa:browser` accepts `PORTFOLIO_CHROMIUM_PATH` for an existing Chromium binary. `PORTFOLIO_QA_OUTPUT` preserves browser/native screenshots and metrics outside the disposable fixture. `PORTFOLIO_BENCHMARK_OUTPUT` saves the batch JSON. Linux native windows require a display, for example `xvfb-run -a npm run qa:native`. Loopback checks need network permission in the managed sandbox. The native harness sets an isolated absolute `PORTFOLIO_DATA_DIRECTORY` shared by its two test apps and removes it afterward.

## Native Release Gates Still Open

The workflow `.github/workflows/electron-apps.yml` builds both apps automatically on owner pushes affecting the tools, pull requests, and manual dispatch. It configures macOS and Windows `make`, package-local HEIC/metadata checks, sandboxed native-window independent/linked smoke tests, browser checks, and artifact upload. It has not run remotely in this session. Windows Squirrel shortcut-event handling has unit coverage; installer execution still requires the native gate below.

- [ ] Run and review the macOS and Windows workflow results and uploaded packages/screenshots.
- [ ] Install/extract each delivered package on each supported target architecture; launch each with its companion absent and closed.
- [ ] Run real HEIC import-to-catalog and reframing from a saved original on each installed app.
- [ ] Verify native chooser dialogs, shortcuts, system-theme changes, resize behavior, and concurrent-app conflict/recovery behavior.
- [ ] Exercise Windows Squirrel installation, shortcuts, update, and uninstall; verify macOS application launch behavior.
- [ ] Measure startup, scrolling, crop/control response, and representative photo batches on target hardware.
- [ ] Apply owner-provided signing/notarization credentials for a trusted distribution; recheck the signed artifacts.
- [ ] Complete acceptance before replacing the Python application or deleting legacy content.

Forge's Windows installer and macOS ZIP are unsigned development artifacts unless release credentials are configured. `qa:native` launches the packaged executable/application bundle; it does not execute the installer or prove OS installation/update behavior. Configuration, successful Linux packages, and source tests do not close the native installed-app gates.
