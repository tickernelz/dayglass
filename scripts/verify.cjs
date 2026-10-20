const fs = require("fs");
const path = require("path");

const dir = path.resolve(process.argv[2] || "work/app");
const assets = path.join(dir, "dist-renderer/assets");
const js = path.join(assets, fs.readdirSync(assets).find((f) => /^index-.*\.js$/.test(f)));
const css = path.join(assets, fs.readdirSync(assets).find((f) => /^index-.*\.css$/.test(f)));
const read = (f) => fs.readFileSync(f, "utf8");

const jsSrc = read(js);
const cssSrc = read(css);
const main = (rel) => read(path.join(dir, rel));

const checks = [
  ["cheat scan returns empty", main("dist-main/main/utils/checkCheatSoftware.js").includes("return [];\n    const processes")],
  ["ipc cheat returns empty", /ipcMainHandle\("checkCheatSoftware", \(\) => \{\s*return \[\];/.test(main("dist-main/main/registerIPCHandlers.js"))],
  ["updates setup noop", /setupUpdates = \(window\) => \{\s*return;/.test(main("dist-main/main/updates.js"))],
  ["updates install noop", /installUpdate = \(\) => \{\s*return;/.test(main("dist-main/main/updates.js"))],
  ["renderer check noop", jsSrc.includes("async check(){return}")],
  ["renderer sendData noop", jsSrc.includes("async sendData(){return}")],
  ["renderer cheat refs gone", !jsSrc.includes("checkCheatSoftware")],
  ["selected displays setting", jsSrc.includes("SELECTED_DISPLAYS")],
  ["idle detection setting", jsSrc.includes("IDLE_DETECTION_ENABLED")],
  ["monitor scope ui", jsSrc.includes("Screenshot capture scope")],
  ["css monitor styles", cssSrc.includes("_sectionTitle_o11y_1")],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) bad++;
}
console.log(bad === 0 ? "ALL CHECKS PASSED" : bad + " CHECK(S) FAILED");
process.exit(bad === 0 ? 0 : 1);
