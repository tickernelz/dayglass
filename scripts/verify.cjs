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
  ["notice setting default", jsSrc.includes("SCREENSHOT_NOTICE_MODE]:`both`")],
  ["notice lead default", jsSrc.includes("SCREENSHOT_NOTICE_LEAD]:10")],
  ["notice setting persisted", /setValue\([A-Za-z_$][\w$]*\.ScreenshotNoticeMode/.test(jsSrc)],
  ["notice lead persisted", /setValue\([A-Za-z_$][\w$]*\.ScreenshotNoticeLead/.test(jsSrc)],
  ["notice ui mode control", jsSrc.includes("Screenshot notification mode")],
  ["notice ui lead control", jsSrc.includes("Screenshot warning lead time")],
  ["notice uses the native notification bridge", jsSrc.includes("showSystemNotification({title:`Screenshot in")],
  ["taken notice uses the native notification bridge", jsSrc.includes("showSystemNotification({title:`Screenshot taken`")],
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

const noticePersistenceChecks = () => {
  const marker = ".SCREENSHOT_NOTICE_MODE)await r.setValue(";
  const at = jsSrc.indexOf(marker);
  if (at < 0) {
    console.log("  notice setter snippet not found in the bundle");
    return [["notice setter snippet present", false]];
  }
  const from = jsSrc.lastIndexOf("else if(e===", at);
  const to = jsSrc.indexOf(".ScreenshotNoticeLead,i);", at) + ".ScreenshotNoticeLead,i);".length;
  const snippet = jsSrc.slice(from, to);
  const kName = /^else if\(e===([A-Za-z_$][\w$]*)\.SCREENSHOT_NOTICE_MODE/.exec(snippet);
  const gsName = /r\.setValue\(([A-Za-z_$][\w$]*)\.ScreenshotNoticeMode/.exec(snippet);
  if (!kName || !gsName) {
    console.log("  notice setter snippet could not be resolved: " + snippet.slice(0, 80));
    return [["notice setter snippet resolvable", false]];
  }
  const fn = new Function("e", "i", kName[1], gsName[1], "r", "return (async () => { if (false) {} " + snippet + " })()");

  const runSetter = async (key, value) => {
    const writes = [];
    const r = { setValue: async (k, v) => { writes.push([k, v]); } };
    const K = { SCREENSHOT_NOTICE_MODE: "modeKey", SCREENSHOT_NOTICE_LEAD: "leadKey" };
    const gs = { ScreenshotNoticeMode: "screenshotNoticeMode", ScreenshotNoticeLead: "screenshotNoticeLead" };
    await fn(key, value, K, gs, r);
    return writes;
  };

  return (async () => {
    const modeWrites = await runSetter("modeKey", "before");
    const leadWrites = await runSetter("leadKey", 15);
    const otherWrites = await runSetter("someOtherKey", true);
    return [
      ["notice mode is written to storage", modeWrites.length === 1 && modeWrites[0][0] === "screenshotNoticeMode" && modeWrites[0][1] === "before"],
      ["notice lead is written to storage", leadWrites.length === 1 && leadWrites[0][0] === "screenshotNoticeLead" && leadWrites[0][1] === 15],
      ["notice setter ignores unrelated settings", otherWrites.length === 0],
    ];
  })();
};

const noticeChecks = () => {
  const gsMatch = /getValue\(([A-Za-z_$][\w$]*)\.HideFromTaskBar\)/.exec(jsSrc);
  const start = jsSrc.indexOf("noticeMode=await");
  const end = jsSrc.indexOf("}).catch(()=>{}));", start);
  if (!gsMatch || start < 0 || end < 0) {
    console.log("  notice snippet not found in the bundle");
    return [["notice harness snippet present", false]];
  }
  const gs = gsMatch[1];
  const snippet = jsSrc.slice(start, end + "}).catch(()=>{}));".length);
  const body = "return (async () => { let " + snippet + " return true; })()";
  const harness = new Function(gs, "window", "t", "n", body);

  const run = async (opts) => {
    const calls = [];
    const stub = {
      rootContext: {
        varsRepository: {
          getValue: async (key) => (key === "mode" ? opts.mode : opts.lead),
        },
        employmentRepository: {
          getEmployment: async () => ({ disableScreenshots: !!opts.disabled }),
        },
      },
      noticeMinute: undefined,
    };
    const win = {
      mainAPI: {
        showSystemNotification: (payload) => {
          calls.push(payload);
          return Promise.resolve(true);
        },
      },
    };
    const activity = { fromTime: Date.now() - 60000 + opts.dueMs, employmentId: "e" };
    const keys = { ScreenshotNoticeMode: "mode", ScreenshotNoticeLead: "lead" };
    await harness.call(stub, keys, win, activity, 1);
    return { calls, stub, win, keys, activity };
  };

  const post = jsSrc.slice(jsSrc.indexOf("noticeAfter&&a?.imageData"), jsSrc.indexOf("let o=this.getRandomInterval(i);", jsSrc.indexOf("noticeAfter&&a?.imageData")));
  const postHarness = new Function("noticeAfter", "a", "window", post);

  const runPost = (noticeAfter, hasImage) => {
    const calls = [];
    const win = { mainAPI: { showSystemNotification: (payload) => { calls.push(payload); return Promise.resolve(true); } } };
    const shot = hasImage ? { imageData: { buffer: { length: 1024 } } } : { imageData: null };
    postHarness(noticeAfter, shot, win);
    return calls;
  };

  return (async () => {
    const checks = [];
    const full = await run({ mode: "both", lead: 10, dueMs: 10000, disabled: false });
    checks.push(["notice fires inside the lead window", full.calls.length === 1]);
    checks.push(["notice counts down the remaining seconds", /Screenshot in 10s/.test(full.calls[0]?.title || "")]);

    await harness.call(full.stub, full.keys, full.win, full.activity, 1);
    checks.push(["notice does not repeat for the same minute", full.calls.length === 1]);

    checks.push(["notice stays silent before the window", (await run({ mode: "both", lead: 10, dueMs: 30000, disabled: false })).calls.length === 0]);
    checks.push(["notice stays silent once the capture is already due", (await run({ mode: "both", lead: 10, dueMs: -2000, disabled: false })).calls.length === 0]);
    checks.push(["notice stays silent when the mode is off", (await run({ mode: "off", lead: 10, dueMs: 10000, disabled: false })).calls.length === 0]);
    checks.push(["notice stays silent for after-only", (await run({ mode: "after", lead: 10, dueMs: 10000, disabled: false })).calls.length === 0]);
    checks.push(["notice stays silent when screenshots are disabled", (await run({ mode: "both", lead: 10, dueMs: 10000, disabled: true })).calls.length === 0]);
    checks.push(["notice honours a custom lead time", (await run({ mode: "both", lead: 30, dueMs: 25000, disabled: false })).calls.length === 1]);
    checks.push(["notice honours a short lead time", (await run({ mode: "before", lead: 5, dueMs: 4000, disabled: false })).calls.length === 1]);

    const taken = runPost(true, true);
    checks.push(["taken notice fires after a capture", taken.length === 1 && /Screenshot taken/.test(taken[0]?.title || "")]);
    checks.push(["taken notice skips a failed capture", runPost(true, false).length === 0]);
    checks.push(["taken notice stays silent for before-only", runPost(false, true).length === 0]);
    return checks;
  })();
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
    checks.push(...(await noticePersistenceChecks()));
  } catch (error) {
    console.log("FAIL notice persistence harness: " + error.message);
    checks.push(["notice persistence harness executed", false]);
  }
  try {
    checks.push(...(await noticeChecks()));
  } catch (error) {
    console.log("FAIL notice harness: " + error.message);
    checks.push(["notice harness executed", false]);
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
