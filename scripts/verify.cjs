const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, fork } = require("child_process");

const dir = path.resolve(process.argv[2] || "work/app");
const assets = path.join(dir, "dist-renderer/assets");
const js = path.join(assets, fs.readdirSync(assets).find((f) => /^index-.*\.js$/.test(f)));
const css = path.join(assets, fs.readdirSync(assets).find((f) => /^index-.*\.css$/.test(f)));
const read = (f) => fs.readFileSync(f, "utf8");

const jsSrc = read(js);
const cssSrc = read(css);
const preload = read(path.join(dir, "dist-main/main/preload.cjs"));
const mainFile = (rel) => read(path.join(dir, rel));

const syntaxCheck = (file) => {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return "";
  } catch (error) {
    const detail = (error.stderr || error.stdout || Buffer.from("")).toString().trim().split("\n").slice(0, 4).join(" | ");
    return detail || error.message;
  }
};

const bundleFiles = [
  js,
  path.join(dir, "dist-main/main/preload.cjs"),
  path.join(dir, "dist-main/main/displayWakeLock.js"),
  path.join(dir, "dist-main/main/registerIPCHandlers.js"),
  path.join(dir, "dist-main/main/utils/screenshot/takeScreenshot.js"),
  path.join(dir, "dist-main/main/utils/screenshot/sharpWorker.js"),
  path.join(dir, "dist-main/main/utils/screenshot/runSharpWorker.js"),
  path.join(dir, "dist-main/main/utils/screenshot/privacy.js"),
  path.join(dir, "dist-main/main/utils/screenshot/privacyNative.js"),
  path.join(dir, "dist-main/main/utils/platform/PlatformManager.js"),
  path.join(dir, "dist-main/main/utils/platform/WindowsStrategy.js"),
  path.join(dir, "dist-main/main/utils/platform/MacStrategy.js"),
  path.join(dir, "dist-main/main/utils/platform/LinuxStrategy.js"),
  path.join(dir, "dist-main/main/utils/platform/desktopCapturerScreenshot.js"),
];

const syntaxChecks = bundleFiles.map((file) => {
  const failure = syntaxCheck(file);
  if (failure) console.log("  syntax: " + path.relative(dir, file) + " -> " + failure);
  return ["syntax " + path.relative(dir, file), failure === ""];
});

const staticChecks = [
  ["cheat scan returns empty", mainFile("dist-main/main/utils/checkCheatSoftware.js").includes("return [];\n    const processes")],
  ["ipc cheat returns empty", /ipcMainHandle\("checkCheatSoftware", \(\) => \{\s*return \[\];/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
  ["updates setup noop", /setupUpdates = \(window\) => \{\s*return;/.test(mainFile("dist-main/main/updates.js"))],
  ["updates install noop", /installUpdate = \(\) => \{\s*return;/.test(mainFile("dist-main/main/updates.js"))],
  ["renderer check noop", jsSrc.includes("async check(){return}")],
  ["renderer sendData noop", jsSrc.includes("async sendData(){return}")],
  ["renderer cheat refs gone", !jsSrc.includes("checkCheatSoftware")],
  ["selected displays setting", jsSrc.includes("SELECTED_DISPLAYS")],
  ["idle detection setting", jsSrc.includes("IDLE_DETECTION_ENABLED")],
  ["monitor scope ui", jsSrc.includes("Screenshot capture scope")],
  ["css monitor styles", cssSrc.includes("_sectionTitle_o11y_1")],

  ["wake lock uses prevent-display-sleep", mainFile("dist-main/main/displayWakeLock.js").includes('powerSaveBlocker.start("prevent-display-sleep")')],
  ["wake lock ipc registered", /ipcMainHandle\("setDisplayWakeLock", \(enabled\) => \{/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
  ["display list ipc registered", /ipcMainHandle\("getDisplays", \(\) => \{/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
  ["preload wake lock bridge", preload.includes('setDisplayWakeLock: (enabled) => ipcInvoke("setDisplayWakeLock", enabled)')],
  ["preload display list bridge", preload.includes('getDisplays: () => ipcInvoke("getDisplays")')],
  ["screenshot ipc takes options", /ipcMainHandle\("takeScreenshot", \(options\) =>/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
  ["screenshot entry reads privacy", mainFile("dist-main/main/utils/screenshot/takeScreenshot.js").includes("normalizePrivacyMode(options.privacy)")],
  ["privacy applied to combined image", mainFile("dist-main/main/utils/screenshot/takeScreenshot.js").includes("combineCompressImages(result, privacy)")],
  ["privacy worker request field", mainFile("dist-main/main/utils/screenshot/runSharpWorker.js").includes("privacy,")],
  ["privacy modes in worker", mainFile("dist-main/main/utils/screenshot/sharpWorker.js").includes("case PrivacyMode.MOSAIC")],
  ["privacy native fallback wired", mainFile("dist-main/main/utils/screenshot/takeScreenshot.js").includes("applyNativePrivacy(buffer, privacy)")],
  ["privacy native fallback used by every path", mainFile("dist-main/main/utils/screenshot/takeScreenshot.js").split("nativeImageJpegFallback(nonEmptyBuffers[0], privacy)").length - 1 === 4],
  ["display ids reach desktopCapturer", mainFile("dist-main/main/utils/platform/desktopCapturerScreenshot.js").includes("wanted.includes(String(s.displayId))")],
  ["privacy setting default", jsSrc.includes("SCREENSHOT_PRIVACY_MODE]:`off`")],
  ["privacy ui control", jsSrc.includes("Screenshot privacy mode")],
  ["privacy ui labels fit four modes", jsSrc.includes("labels={off:`Off`,blur:`Blur`,mosaic:`Mosaic`,text:`Text`}")],
  ["settings rows reuse component variable", !/\{\{rows\}\}=\[/.test(jsSrc) || jsSrc.includes("h.filter(e=>e.isVisible!==!1)")],
  ["privacy capture argument", jsSrc.includes("privacy:await this.rootContext.varsRepository.getValue")],
  ["wake lock follows setting toggle", jsSrc.includes("setDisplayWakeLock(i===!1)")],
  ["wake lock applied on settings load", jsSrc.includes("setDisplayWakeLock((d??!0)===!1)")],
  ["css segmented rows fit four modes", cssSrc.includes("grid-auto-flow:column")],
];

const textSvg = [
  '<svg width="900" height="240" xmlns="http://www.w3.org/2000/svg">',
  '<rect width="900" height="240" fill="#ffffff"/>',
  '<text x="24" y="56" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#000000">CONFIDENTIAL SALARY REPORT 2026</text>',
  '<text x="24" y="112" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#000000">Account 1234 5678 9012 balance 9,876,543.21</text>',
  '<text x="24" y="168" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#000000">Signed by the payroll manager on October 20</text>',
  Array.from({ length: 40 }, (_, i) => '<rect x="24" y="' + (190 + i * 1) + '" width="850" height="1" fill="#000000"/>').join(""),
  "</svg>",
].join("");

const runWorker = (workerPath, buffers, privacy) =>
  new Promise((resolve, reject) => {
    const child = fork(workerPath, { stdio: ["ignore", "ignore", "pipe", "ipc"], serialization: "advanced" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("worker timeout for " + privacy));
    }, 30000);
    child.on("message", (msg) => {
      if (!msg || msg.type !== "result") return;
      clearTimeout(timer);
      try {
        child.kill("SIGTERM");
      } catch {}
      if (msg.ok) resolve(msg);
      else reject(new Error(privacy + ": " + msg.error));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.send({ type: "process", id: "verify-" + privacy, buffers, format: "png", skipCanary: true, privacy });
  });

const detailScore = async (sharp, buffer) => {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) {
      sum += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]);
    }
  }
  return sum / (info.width * info.height);
};

const flatPairRatio = async (sharp, buffer) => {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let flat = 0;
  let total = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) {
      total++;
      if (data[y * info.width + x] === data[y * info.width + x - 1]) flat++;
    }
  }
  return flat / total;
};

const pixelChecks = async () => {
  let sharp;
  try {
    sharp = require(path.join(dir, "node_modules", "sharp"));
  } catch (error) {
    console.log("SKIP privacy pixel checks (sharp not loadable for this target: " + error.message + ")");
    return [];
  }
  const workerPath = path.join(dir, "dist-main/main/utils/screenshot/sharpWorker.js");
  const original = await sharp(Buffer.from(textSvg)).png().toBuffer();
  const originalDetail = await detailScore(sharp, original);
  const originalFlat = await flatPairRatio(sharp, original);
  const out = {};
  for (const mode of ["off", "blur", "mosaic", "text"]) {
    const result = await runWorker(workerPath, [original], mode);
    if (!result.buffer || !result.buffer.length) throw new Error("worker returned no buffer for " + mode);
    const meta = await sharp(result.buffer).metadata();
    if (meta.width !== 900 || meta.height !== 240) {
      throw new Error("privacy output resized for " + mode + ": " + meta.width + "x" + meta.height);
    }
    out[mode] = {
      detail: await detailScore(sharp, result.buffer),
      flat: await flatPairRatio(sharp, result.buffer),
    };
  }
  const report = Object.entries(out)
    .map(([mode, m]) => mode + " detail=" + m.detail.toFixed(2) + " flat=" + m.flat.toFixed(2))
    .join(", ");
  console.log("  privacy detail baseline=" + originalDetail.toFixed(2) + " flat=" + originalFlat.toFixed(2) + " | " + report);
  return [
    ["privacy off keeps detail", out.off.detail > originalDetail * 0.9],
    ["privacy blur destroys detail", out.blur.detail < originalDetail * 0.4],
    ["privacy mosaic destroys detail", out.mosaic.detail < originalDetail * 0.5],
    ["privacy mosaic produces blocks", out.mosaic.flat > Math.max(originalFlat, 0.75)],
    ["privacy text destroys glyph detail", out.text.detail < originalDetail * 0.5],
    ["privacy text keeps flat areas smooth", out.text.flat < out.mosaic.flat],
  ];
};

const wakeLockChecks = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wakelock-verify-"));
  try {
    const write = (rel, body) => {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), body);
    };
    write("node_modules/electron/package.json", JSON.stringify({ name: "electron", version: "0.0.0", main: "index.js" }));
    write(
      "node_modules/electron/index.js",
      [
        "const state = { starts: [], stops: [], isStarted(id) { return !state.stops.includes(id); } };",
        "exports.state = state;",
        "exports.powerSaveBlocker = {",
        "  start(type) { state.starts.push(type); return state.starts.length; },",
        "  stop(id) { state.stops.push(id); },",
        "  isStarted(id) { return state.isStarted(id); },",
        "};",
      ].join("\n")
    );
    write("node_modules/electron-log/package.json", JSON.stringify({ name: "electron-log", version: "0.0.0", main: "index.js" }));
    write("node_modules/electron-log/index.js", "const noop = () => {};\nmodule.exports = { info: noop, warn: noop, error: noop, debug: noop };");
    fs.copyFileSync(path.join(dir, "dist-main/main/displayWakeLock.js"), path.join(tmp, "displayWakeLock.mjs"));
    write(
      "run.mjs",
      [
        'import { setDisplayWakeLock, isDisplayWakeLockActive } from "./displayWakeLock.mjs";',
        'const { state } = await import("electron");',
        "const out = {};",
        "out.first = setDisplayWakeLock(true);",
        "out.startsAfterFirst = state.starts.slice();",
        "out.repeat = setDisplayWakeLock(true);",
        "out.startsAfterRepeat = state.starts.slice();",
        "out.active = isDisplayWakeLockActive();",
        "out.off = setDisplayWakeLock(false);",
        "out.stopsAfterOff = state.stops.slice();",
        "setDisplayWakeLock(false);",
        "out.stopsAfterRepeatOff = state.stops.slice();",
        "out.reEnabled = setDisplayWakeLock(true);",
        "out.startsAfterReEnable = state.starts.slice();",
        "out.activeAfterReEnable = isDisplayWakeLockActive();",
        "console.log(JSON.stringify(out));",
      ].join("\n")
    );
    const stdout = execFileSync(process.execPath, ["run.mjs"], { cwd: tmp, encoding: "utf8" });
    const out = JSON.parse(stdout.trim().split("\n").pop());
    console.log("  wake lock state machine: " + JSON.stringify(out));
    return [
      ["wake lock starts display blocker", out.first === true && out.startsAfterFirst.length === 1 && out.startsAfterFirst[0] === "prevent-display-sleep"],
      ["wake lock is idempotent", out.repeat === true && out.startsAfterRepeat.length === 1 && out.active === true],
      ["wake lock releases once", out.off === false && out.stopsAfterOff.length === 1 && out.stopsAfterRepeatOff.length === 1],
      ["wake lock can re-arm", out.reEnabled === true && out.startsAfterReEnable.length === 2 && out.activeAfterReEnable === true],
    ];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const run = async () => {
  const checks = [...syntaxChecks, ...staticChecks];
  try {
    checks.push(...(await pixelChecks()));
  } catch (error) {
    console.log("FAIL privacy pixel checks: " + error.message);
    checks.push(["privacy pixel checks executed", false]);
  }
  try {
    checks.push(...wakeLockChecks());
  } catch (error) {
    console.log("FAIL wake lock state machine: " + error.message);
    checks.push(["wake lock state machine executed", false]);
  }

  let bad = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? "PASS " : "FAIL ") + name);
    if (!ok) bad++;
  }
  console.log(bad === 0 ? "ALL CHECKS PASSED" : bad + " CHECK(S) FAILED");
  process.exit(bad === 0 ? 0 : 1);
};

run();
