const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CFG, CACHE } = require("./fetch.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCES = path.join(ROOT, "sources");
const CHUNK = 40 * 1024 * 1024;
const MASK = 0x5a;

const mask = (buf) => {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ MASK;
  return out;
};

const localName = (key, target) => {
  const ext = target.kind === "deb" ? "deb" : target.kind === "zip" ? "zip" : "exe";
  return CFG.publicName + "-" + key + "." + ext;
};

const pack = (key) => {
  const target = CFG.targets[key];
  const name = localName(key, target);
  const src = path.join(CACHE, name);
  if (!fs.existsSync(src)) {
    const alt = fs.readdirSync(CACHE).filter((f) => f.endsWith("." + name.split(".").pop()));
    throw new Error("missing cache entry " + name + " (cache has: " + alt.join(", ") + ")");
  }
  const buf = fs.readFileSync(src);
  const dir = path.join(SOURCES, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const masked = mask(buf);
  const parts = [];
  for (let offset = 0, index = 0; offset < masked.length; offset += CHUNK, index++) {
    const slice = masked.subarray(offset, Math.min(offset + CHUNK, masked.length));
    const partName = "part-" + String(index).padStart(3, "0") + ".bin";
    fs.writeFileSync(path.join(dir, partName), slice);
    parts.push({ name: partName, size: slice.length });
  }
  return { key, name, size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), mask: MASK, parts };
};

const main = () => {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG.targets);
  fs.mkdirSync(SOURCES, { recursive: true });
  const manifestPath = path.join(SOURCES, "manifest.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { version: CFG.version, entries: {} };
  manifest.version = CFG.version;
  for (const key of keys) {
    const entry = pack(key);
    manifest.entries[key] = entry;
    console.log(key + " -> " + entry.name + ", " + entry.parts.length + " parts, " + (entry.size / 1048576).toFixed(1) + " MB");
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("manifest: " + path.relative(ROOT, manifestPath));
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("FAIL " + e.message);
    process.exit(1);
  }
}
