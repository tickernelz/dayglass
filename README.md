# dayglass

Build pipeline that produces patched desktop time-tracking installers for Linux, macOS, and Windows on x64 and arm64.

The source archives live in this repository under `sources/`, stored as masked chunk files with a manifest that records size and checksum. No network access is needed to build, and the pipeline keeps working even if the original distribution channel disappears.

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
config/release.json       version, product name, target matrix
sources/                  masked source archives plus manifest.json
  <target>/part-NNN.bin
  manifest.json           size, sha256, mask byte, part list per target
patches/                  declarative patch definitions
  01-monitor-idle.*       settings keys, defaults, provider load, capture call
  02-monitor-idle-ui.*    settings panel rows, scope control, styles
  03-monitor-idle.css.txt appended stylesheet block
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

Restored archives are cached in `cache/` and reused on the next run. `scripts/verify.cjs` exits non-zero if any patch is missing, so a silent bundle change fails the build instead of shipping an unpatched artifact.

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

Windows installers are unsigned. macOS bundles are unsigned and not notarized, so the first launch requires the usual override in System Settings. Linux packages install normally.

## Notes

- Patches target the version pinned in `config/release.json`. Changing it may require updating anchors; `verify.cjs` is the guard.
- No application source is vendored here. Only source archives, patch definitions, anchor patterns, and build tooling.
- The packaged application remains the property of its authors. This repository ships no license to it and redistributes nothing on its behalf.
