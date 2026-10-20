const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const dec = (v) => Buffer.from(v, "base64").toString("utf8");
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "config/release.json"), "utf8"));

const CFG = {
  ...raw,
  bundleName: dec(raw.bundleName),
  targets: Object.fromEntries(
    Object.entries(raw.targets).map(([k, v]) => [k, { ...v, appName: v.appName ? dec(v.appName) : undefined }])
  ),
};

const CACHE = path.join(ROOT, "cache");
const SOURCES = path.join(ROOT, "sources");

const unmask = (buf, mask) => {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ mask;
  return out;
};

const fetchAsset = async (key) => {
  const target = CFG.targets[key];
  if (!target) throw new Error("unknown target: " + key);

  const manifestPath = path.join(SOURCES, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("sources/manifest.json missing");
  const entry = JSON.parse(fs.readFileSync(manifestPath, "utf8")).entries?.[key];
  if (!entry) throw new Error("no source entry for " + key);

  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, entry.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size === entry.size) {
    console.log("cached " + entry.name);
    return dest;
  }

  const dir = path.join(SOURCES, key);
  const missing = entry.parts.filter((p) => !fs.existsSync(path.join(dir, p.name)));
  if (missing.length) throw new Error("source parts missing for " + key + ": " + missing.map((p) => p.name).join(", "));

  const plain = unmask(Buffer.concat(entry.parts.map((p) => fs.readFileSync(path.join(dir, p.name)))), entry.mask);
  const digest = crypto.createHash("sha256").update(plain).digest("hex");
  if (digest !== entry.sha256) throw new Error("source integrity check failed for " + key + ": " + digest);

  fs.writeFileSync(dest, plain);
  console.log("source " + key + " -> " + entry.name + " (" + (plain.length / 1048576).toFixed(1) + " MB)");
  return dest;
};

module.exports = { CFG, CACHE, fetchAsset };

if (require.main === module) {
  const keys = process.argv.slice(2);
  const list = keys.length ? keys : Object.keys(CFG.targets);
  (async () => {
    for (const k of list) await fetchAsset(k);
  })().catch((e) => {
    console.error("FAIL " + e.message);
    process.exit(1);
  });
}
