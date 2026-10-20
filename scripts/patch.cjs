const fs = require("fs");
const path = require("path");
const { extract, substitute } = require("./identifiers.cjs");

const ROOT = path.resolve(__dirname, "..");
const PATCHES = path.join(ROOT, "patches");

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(PATCHES, f), "utf8"));
const rendererAsset = (dir, ext) => {
  const assets = path.join(dir, "dist-renderer/assets");
  const hit = fs.readdirSync(assets).filter((f) => new RegExp("^index-.*\\." + ext + "$").test(f));
  if (hit.length !== 1) throw new Error("expected one index." + ext + " in " + assets + ", got " + hit.join(","));
  return path.join(assets, hit[0]);
};

const applyExact = (target, patches, label) => {
  let s = fs.readFileSync(target, "utf8");
  for (const p of patches) {
    const n = s.split(p.old).length - 1;
    if (n !== 1) throw new Error(label + ": " + p.id + " matched " + n + " times (need exactly 1)");
    s = s.replace(p.old, p.new);
    console.log("  ok " + label + " " + p.id);
  }
  fs.writeFileSync(target, s);
};

const applySliced = (target, patches, label) => {
  let s = fs.readFileSync(target, "utf8");
  for (const p of patches) {
    const a = s.indexOf(p.start);
    if (a < 0) throw new Error(label + ": start marker missing for " + p.id);
    const re = new RegExp(p.endRegex, "g");
    re.lastIndex = a + p.start.length;
    const m = re.exec(s);
    if (!m) throw new Error(label + ": end pattern missing for " + p.id);
    const b = m.index + m[0].length;
    const body = s.slice(a, b);
    for (const needle of [].concat(p.expect)) {
      if (!body.includes(needle)) throw new Error(label + ": body check failed for " + p.id + " (" + needle + ")");
    }
    s = s.slice(0, a) + p.new + s.slice(b);
    console.log("  ok " + label + " " + p.id);
  }
  fs.writeFileSync(target, s);
};

const applyWrite = (target, patches, label) => {
  for (const p of patches) {
    const body = fs.readFileSync(path.join(PATCHES, p.from), "utf8");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    console.log("  ok " + label + " " + p.id);
  }
};

const resolveEntries = (entries, ids) =>
  entries.map((p) =>
    ids && p.old !== undefined
      ? { ...p, old: substitute(p.old, ids), new: substitute(p.new, ids) }
      : p
  );

const resolveTarget = (dir, rel) => {
  const m = /^@renderer:(js|css)$/.exec(rel);
  if (m) return rendererAsset(dir, m[1]);
  return path.join(dir, rel);
};

const applyMixed = (dir, entries, label, ids) => {
  const grouped = {};
  for (const p of entries) (grouped[p.file] ||= []).push(p);
  for (const [rel, list] of Object.entries(grouped)) {
    const target = resolveTarget(dir, rel);
    const resolved = resolveEntries(list, ids);
    const name = path.basename(rel);
    const writes = resolved.filter((p) => p.mode === "write");
    const slices = resolved.filter((p) => p.mode === "slice");
    const exact = resolved.filter((p) => !p.mode || p.mode === "exact");
    if (writes.length) applyWrite(target, writes, name);
    if (exact.length) applyExact(target, exact, name);
    if (slices.length) applySliced(target, slices, name);
  }
};

const main = (appDir) => {
  const dir = path.resolve(appDir);
  const ids = extract(fs.readFileSync(rendererAsset(dir, "js"), "utf8"));
  console.log("identifiers: " + JSON.stringify(ids));

  const grouped = {};
  for (const p of readJson("10-liberal.main.json")) (grouped[p.file] ||= []).push(p);
  for (const [rel, patches] of Object.entries(grouped)) {
    applyExact(path.join(dir, rel), patches, path.basename(rel));
  }

  applySliced(rendererAsset(dir, "js"), readJson("11-liberal.renderer.json"), "renderer");

  for (const f of ["01-monitor-idle.renderer.json", "02-monitor-idle-ui.renderer.json"]) {
    const resolved = readJson(f).map((p) => ({
      id: p.id,
      old: substitute(p.old, ids),
      new: substitute(p.new, ids),
    }));
    applyExact(rendererAsset(dir, "js"), resolved, "monitor-idle");
  }

  applyMixed(dir, readJson("04-privacy-wakelock.main.json"), "privacy-wakelock", null);
  applyMixed(dir, readJson("05-privacy-wakelock.renderer.json"), "privacy-wakelock-ui", ids);

  const cssFile = rendererAsset(dir, "css");
  const cssAdd = fs.readFileSync(path.join(PATCHES, "03-monitor-idle.css.txt"), "utf8");
  const css = fs.readFileSync(cssFile, "utf8");
  if (!css.includes("_sectionTitle_o11y_1")) {
    fs.writeFileSync(cssFile, css + cssAdd);
    console.log("  ok css monitor-idle styles appended");
  } else {
    console.log("  skip css (already present)");
  }

  console.log("patched: " + dir);
};

if (require.main === module) {
  try {
    main(process.argv[2] || path.join(ROOT, "work/app"));
  } catch (e) {
    console.error("FAIL " + e.message);
    process.exit(1);
  }
}
