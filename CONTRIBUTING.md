# Contributing

## Adding a patch

Patch definitions are declarative and live in `patches/`. Three shapes exist.

**Exact replacement** — used when the target text is identical across platforms after placeholder substitution:

```json
{ "id": "my-change", "file": "dist-main/main/foo.js", "old": "exact text", "new": "replacement text" }
```

**Sliced replacement** — used for large minified method bodies where only the boundaries are stable:

```json
{ "id": "my-method", "start": "async foo(){", "endRegex": "\\}\\},\\s*(?=[A-Za-z_$][\\w$]*=class\\{get bar)", "expect": "someMarkerInsideTheBody", "new": "async foo(){return}," }
```

**Placeholder form** — the default for renderer patches. Minified symbol names differ per release and per platform, so refer to them as `{{K}}`, `{{gs}}`, `{{rows}}`, `{{va}}`, `{{APP}}`, and so on. `scripts/identifiers.cjs` resolves them from anchor patterns before patching.

`{{APP}}` is the product string the bundle prints in its own UI labels. Use it whenever a patch needs to match or emit that name.

## Rules the patcher enforces

- Every exact patch must match exactly once. Zero or multiple matches abort the whole run and nothing is written.
- Every sliced patch must find its start marker, its end pattern, and every string listed in `expect` inside the matched body.
- `scripts/verify.cjs` runs after patching and asserts the resulting behavior markers are present. A build fails if any assertion misses.

These guards exist because a silent no-op patch ships an unpatched binary. Never weaken them.

## After an upstream version bump

1. Update `version` in `config/upstream.json`.
2. Run `npm run build -- linux-x64` and read the failure. The first missing identifier names the symbol that changed.
3. Fix anchors in `scripts/identifiers.cjs`, then rerun until `verify.cjs` passes.
4. Repeat for one target per platform — mac and win bundles differ from linux.

## Commit style

Conventional commits, imperative, under 72 characters. Body states why and how it was verified.
