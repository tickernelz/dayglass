const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CFG, CACHE } = require("./fetch.cjs");

const ROOT = path.resolve(__dirname, "..");
const VENDOR = path.join(ROOT, "vendor");
const CHUNK = 90 * 1024 * 1024;
const MASK = 0x5a;

const mask = (buf) => {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ MASK;
  return out;
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const pack = (key) => {
  const target = CFG.targets[key];
  const src = path.join(CACHE, target.asset);
  if (!fs.existsSync(src)) throw new Error("missing cache entry for " + key + ": " + target.asset);
  const buf = fs.readFileSync(src);
  const dir = path.join(VENDOR, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const masked = mask(buf);
  const parts = [];
  for (let offset = 0, index = 0; offset < masked.length; offset += CHUNK, index++) {
    const slice = masked.subarray(offset, Math.min(offset + CHUNK, masked.length));
    const name = "part-" + String(index).padStart(3, "0") + ".bin";
    fs.writeFileSync(path.join(dir, name), slice);
    parts.push({ name, size: slice.length });
  }
  return { key, size: buf.length, sha256: sha256(buf), mask: MASK, parts };
};

const main = () => {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG.targets);
  fs.mkdirSync(VENDOR, { recursive: true });
  const manifestPath = path.join(VENDOR, "manifest.json");
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { version: CFG.version, entries: {} };
  existing.version = CFG.version;
  for (const key of keys) {
    const entry = pack(key);
    existing.entries[key] = entry;
    console.log(key + " -> " + entry.parts.length + " parts, " + (entry.size / 1048576).toFixed(1) + " MB, sha256 " + entry.sha256.slice(0, 16));
  }
  fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2) + "\n");
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
