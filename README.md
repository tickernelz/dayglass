# dayglass

Build pipeline that produces patched desktop time-tracking installers for Linux, macOS, and Windows on x64 and arm64.

Only the public surface is renamed. The installed application keeps its own identity on every platform: package name, install directory, executable, bundle identifier, shortcuts, and desktop entry all stay `scrinio` / `scrin.io`. A masked name would break the shortcuts the installer creates and would install something that no longer identifies itself as the app it is.

The source archives live in this repository under `sources/`, stored as masked chunk files with a manifest that records size and checksum. No network access is needed to build, and the pipeline keeps working even if the original distribution channel disappears.

## What the patches change

| Area | Behavior |
| --- | --- |
| Process scanning | Local background-process inspection returns an empty result and never runs |
| Telemetry upload | The periodic reporting of detected processes is removed |
| Auto-update | Update checks and installer handoff are disabled; a build stays on the version you installed |
| Monitor selection | Settings gains a screenshot scope control: all monitors, primary only, or a picked subset |
| Idle detection | Settings gains an idle-detection switch; when off, idle time is neither tracked nor reported |
| Display sleep | While idle detection is off, the display is held awake through a `prevent-display-sleep` blocker so the machine never sleeps the screen out from under a tracked session |
| Screenshot privacy | Settings gains a privacy control that masks every captured frame before it leaves the main process: `off`, `blur`, `mosaic`, or `text` (crisp edges, unreadable glyphs) |
| Settings layout | The settings panel is regrouped into General, Screenshots, and Idle sections |

Everything else keeps working: screenshots, activity sync, task notes, hotkeys, tray behavior, and sign-in.

## Layout

```
config/release.json       version, release suffix, public name, installed identity, target matrix
sources/                  masked source archives plus manifest.json
  <target>/part-NNN.bin
  manifest.json           size, sha256, mask byte, part list per target
patches/                  declarative patch definitions
  01-monitor-idle.*       settings keys, defaults, provider load, capture call
  02-monitor-idle-ui.*    settings panel rows, scope control, styles
  03-monitor-idle.css.txt appended stylesheet block
  04-privacy-wakelock.main.json    wake-lock module, privacy transforms, capture options, IPC
  05-privacy-wakelock.renderer.json privacy setting, privacy control, wake-lock wiring
  files/                  whole-file sources copied into the application tree
  10-liberal.main.json    main-process patches
  11-liberal.renderer.json renderer patches
scripts/
  identifiers.cjs         resolves minified symbol names per build
  fetch.cjs               restores a source archive from sources/ into cache/
  sources.cjs             packs a cache archive back into sources/
  patch.cjs               applies patches to an extracted application directory
  verify.cjs              asserts every patch is present after rewriting
  build.cjs               end-to-end: restore, extract, patch, verify, repack
```

Minified bundles rename every local symbol between releases and between platforms. Patch definitions therefore use placeholders such as `{{K}}`, `{{gs}}`, `{{rows}}`, and `{{APP}}`; `identifiers.cjs` discovers the current names from anchor patterns before any patch is applied.

## Usage

```bash
npm install
npm run build -- linux-x64
npm run build -- linux-arm64
npm run build -- mac-x64
npm run build -- mac-arm64
npm run build -- win-x64
```

Artifacts land in `dist/`:

```
dayglass_<version>_amd64.deb
dayglass_<version>_arm64.deb
dayglass-<version>-mac-x64.zip
dayglass-<version>-mac-arm64.zip
dayglass-<version>-win-x64.exe
```

`<version>` is the upstream version plus this build's own suffix, so a patched artifact never claims to be the upstream release it was cut from. With `"version": "6.23.0"` and `"releaseSuffix": "liberal.3"` in `config/release.json`, the artifact is `dayglass_6.23.0-liberal.3_amd64.deb`. The suffix is what changes when this repository ships a new patch set against the same upstream version; the leading version tracks the application source and only moves when `sources/` moves.

## Public name and installed identity

`config/release.json` separates the two, and nothing else is allowed to blur them:

| Key | Used for | Example |
| --- | --- | --- |
| `publicName` | artifact file names and release titles only | `dayglass` |
| `identity.linux` | deb package name, install directory, binary, desktop entry, icon, startup class | `scrinio` |
| `identity.mac` | macOS bundle directory name inside the zip | `scrin.io.app` |
| `identity.win` | Windows executable, product name, and shortcut name | `scrin.io` |
| `identity.appId` | NSIS app id and deb vendor | `scrin.io` |

Every artifact is checked against its identity after repacking: a deb whose `Package:` or `Version:` disagrees, a zip without `scrin.io.app/Contents/MacOS`, or a Windows payload without `scrin.io.exe` fails the build instead of shipping. That check exists because a renamed payload installs fine and then leaves a dead shortcut behind.

An earlier build renamed the installed identity to match the public name, so a machine carrying that build has a package called `dayglass` and a desktop entry pointing at a directory that no longer exists. Installing this build is a separate package, not an upgrade: remove the old one first (`sudo apt remove dayglass` on Linux, uninstall from Apps on Windows) before installing `scrinio`.

Restored archives are cached in `cache/` and reused on the next run. `scripts/verify.cjs` exits non-zero if any patch is missing, so a silent bundle change fails the build instead of shipping an unpatched artifact.

## Screenshot privacy

The privacy mode is applied inside the main process, after the monitors are composited and before the frame is encoded, so the unmasked frame never reaches the renderer, the local database, or the network.

| Mode | Transform | Effect |
| --- | --- | --- |
| `off` | none | Frame is captured as the screen shows it |
| `blur` | gaussian blur, sigma scaled to the frame | Nothing on the frame stays legible |
| `mosaic` | nearest-neighbour downscale then upscale to block size | Coarse blocks, no glyph survives |
| `text` | lanczos downscale to 22% then upscale with sharpening | Edges and layout stay crisp, every glyph is destroyed |

Transforms run in the existing sharp worker child process; if sharp is unavailable the capture falls back to `nativeImage` resampling, and if that also fails the screenshot is dropped instead of being uploaded unmasked. `scripts/verify.cjs` renders a text fixture, runs the worker for each mode, and asserts that detail collapses while the frame size is preserved.

## Display sleep

Electron's `powerSaveBlocker` with `prevent-display-sleep` holds the display awake on Windows, macOS, and Linux whenever idle detection is switched off, and releases it as soon as idle detection comes back on. The renderer drives it from the settings provider at startup and on every toggle; `scripts/verify.cjs` exercises the module against a stubbed `powerSaveBlocker` to prove it starts once, releases once, and re-arms.

## Replacing a source archive

Drop the new archive into `cache/` under the name the manifest expects, run `node scripts/sources.cjs <target>`, and commit the resulting `sources/` directory. The mask byte and chunk size are internal; the manifest is what the build trusts.

## Requirements

| Target | Host needs |
| --- | --- |
| Linux deb | `ar`, `tar`, `xz` |
| macOS zip | 7-Zip |
| Windows installer | `electron-builder` plus NSIS; Wine on Linux, native toolchain on Windows |

## Continuous integration

`.github/workflows/build.yml` runs the pipeline on a matrix of targets and uploads each artifact. Tagged pushes also attach the artifacts to a GitHub release. No step contacts an external release host.

Cut a release by pushing a tag that matches the build version:

```bash
git tag v6.23.0-liberal.1
git push origin v6.23.0-liberal.1
```

The tag builds every target in the matrix, attaches the five artifacts to the release, and is the only supported way to publish. `workflow_dispatch` runs the matrix without a release, which is the cheap way to check an anchor change before tagging.

Windows installers are unsigned. macOS bundles are unsigned and not notarized, so the first launch requires the usual override in System Settings. Linux packages install normally.

## Notes

- Patches target the version pinned in `config/release.json`. Changing it may require updating anchors; `verify.cjs` is the guard.
- No application source is vendored here. Only source archives, patch definitions, anchor patterns, and build tooling.
- The packaged application remains the property of its authors. This repository ships no license to it and redistributes nothing on its behalf.
