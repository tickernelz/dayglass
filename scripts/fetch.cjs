const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "config/upstream.json"), "utf8"));
const dec = (v) => Buffer.from(v, "base64").toString("utf8");

const CFG = {
  ...raw,
  source: {
    owner: dec(raw.source.owner),
    repo: dec(raw.source.repo),
    bundle: dec(raw.source.bundle),
  },
  targets: Object.fromEntries(
    Object.entries(raw.targets).map(([k, v]) => [k, { ...v, asset: dec(v.asset) }])
  ),
};

const CACHE = path.join(ROOT, "cache");
const VENDOR = path.join(ROOT, "vendor");

const download = (url, dest, redirects = 0) =>
  new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error("too many redirects"));
    const req = https.get(url, { headers: { "user-agent": "dayglass-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " for " + url));
      }
      const total = Number(res.headers["content-length"] || 0);
      let seen = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        seen += chunk.length;
        if (total && process.stdout.isTTY) process.stdout.write("\r  " + path.basename(dest) + " " + ((seen / total) * 100).toFixed(0) + "%   ");
      });
      res.pipe(out);
      out.on("finish", () => {
        out.close(() => {
          if (total && seen !== total) return reject(new Error("short read " + seen + "/" + total));
          if (process.stdout.isTTY) process.stdout.write("\n");
          resolve(dest);
        });
      });
      out.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
  });

const readManifest = () => {
  const p = path.join(VENDOR, "manifest.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
};

const unmask = (buf, mask) => {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ mask;
  return out;
};

const fromVendor = (key, manifest, dest) => {
  const entry = manifest && manifest.entries && manifest.entries[key];
  if (!entry) return false;
  const dir = path.join(VENDOR, key);
  if (!entry.parts.every((p) => fs.existsSync(path.join(dir, p.name)))) return false;
  const parts = entry.parts.map((p) => fs.readFileSync(path.join(dir, p.name)));
  const plain = unmask(Buffer.concat(parts), entry.mask);
  const digest = crypto.createHash("sha256").update(plain).digest("hex");
  if (digest !== entry.sha256) throw new Error("vendor integrity check failed for " + key + ": " + digest);
  fs.writeFileSync(dest, plain);
  return true;
};

const fetchAsset = async (key) => {
  const target = CFG.targets[key];
  if (!target) throw new Error("unknown target: " + key);
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, target.asset);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log("cached " + target.asset);
    return dest;
  }
  const manifest = readManifest();
  if (fromVendor(key, manifest, dest)) {
    console.log("vendor " + key + " -> " + target.asset);
    return dest;
  }
  const url = "https://github.com/" + CFG.source.owner + "/" + CFG.source.repo + "/releases/download/v" + CFG.version + "/" + target.asset;
  console.log("fetch " + target.asset);
  await download(url, dest);
  console.log("  " + (fs.statSync(dest).size / 1048576).toFixed(1) + " MB");
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
