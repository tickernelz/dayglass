# dayglass

Build pipeline that takes an existing Electron desktop time-tracking client and republishes it with privacy and autonomy patches applied. Produces installers for Linux, macOS, and Windows on x64 and arm64.

Nothing here is a fork of application source. The pipeline downloads an upstream release archive, extracts the packed application bundle, rewrites the renderer and main-process code, repacks the archive, and rebuilds the installer for the target platform.

## What the patches change

| Area | Behavior |
| --- | --- |
| Process scanning | Local background-process inspection returns an empty result and never runs |
| Telemetry upload | The periodic reporting of detected processes is removed |
| Auto-update | Update checks and installer handoff are disabled; a build stays on the version you installed |
| Monitor selection | Settings gains a screenshot scope control: all monitors, primary only, or a picked subset |
| Idle detection | Settings gains an idle-detection switch; when off, idle time is neither tracked nor reported |
| Settings layout | The settings panel is regrouped into General, Screenshots, and Idle sections |

Everything else keeps working: screenshots, activity sync, task notes, hotkeys, tray behavior, and sign-in.

## Layout

```
config/upstream.json      release coordinates, version, product name, target matrix
patches/                  declarative patch definitions
  01-monitor-idle.*       settings keys, defaults, provider load, capture call
  02-monitor-idle-ui.*    settings panel rows, scope control, styles
  03-monitor-idle.css.txt appended stylesheet block
  10-liberal.main.json    main-process patches
  11-liberal.renderer.json renderer patches
scripts/
  identifiers.cjs         resolves minified symbol names per build
  fetch.cjs               downloads and caches upstream release assets
  patch.cjs               applies patches to an extracted application directory
  verify.cjs              asserts every patch is present after rewriting
  build.cjs               end-to-end: fetch, extract, patch, verify, repack
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

Downloads are cached in `cache/` and skipped on the next run. `scripts/verify.cjs` exits non-zero if any patch is missing, so a silent upstream change fails the build instead of shipping an unpatched artifact.

## Requirements

| Target | Host needs |
| --- | --- |
| Linux deb | `ar`, `tar`, `xz` |
| macOS zip | `zip`, `unzip` |
| Windows installer | `electron-builder` plus NSIS; Wine on Linux, native toolchain on Windows |

## Continuous integration

`.github/workflows/build.yml` runs the pipeline on a matrix of targets and uploads each artifact. Tagged pushes also attach the artifacts to a GitHub release.

Windows installers are unsigned. macOS bundles are unsigned and not notarized, so the first launch requires the usual override in System Settings. Linux packages install normally.

## Notes

- Patches target the release pinned in `config/upstream.json`. Bumping that version may require updating anchors; `verify.cjs` is the guard.
- No application source is vendored here. Only patch definitions, anchor patterns, and build tooling.
- The upstream application remains the property of its authors. This repository ships no license to it and redistributes nothing on its behalf.
