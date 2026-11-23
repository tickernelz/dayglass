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
  path.join(dir, "dist-main/main/utils/screenshot/displayCrop.js"),
  path.join(dir, "dist-main/main/utils/screenshot/cropToDisplays.js"),
  path.join(dir, "dist-main/main/utils/screenshot/displayLayout.js"),
  path.join(dir, "dist-main/main/utils/screenshot/displayInfo.js"),
  path.join(dir, "dist-main/main/utils/screenshot/sharpRuntime.js"),
  path.join(dir, "dist-main/main/trayPreferences.js"),
  path.join(dir, "dist-main/main/quitHandler.js"),
  path.join(dir, "dist-main/main/minimizeHandler.js"),
  path.join(dir, "dist-main/main/tray.js"),
  path.join(dir, "dist-main/main/main.js"),
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
  ["display list ipc registered", /ipcMainHandle\("getDisplays", async \(\) => \{/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
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
  ["close to tray setting default", jsSrc.includes("CLOSE_TO_TRAY]:!1")],
  ["close to tray ui row", jsSrc.includes("{label:`Close button minimizes scrin.io to tray`,checked:closeToTray,")],
  ["close to tray persisted", /setValue\([A-Za-z_$][\w$]*\.CloseToTray,i\)/.test(jsSrc)],
  ["tray preferences pushed on settings load", jsSrc.includes("setTrayPreferences({minimizeToTray:o===!0,closeToTray:closeSetting===!0})")],
  ["minimize toggle pushes tray preference", jsSrc.includes("setTrayPreferences({minimizeToTray:i===!0})")],
  ["close toggle pushes tray preference", jsSrc.includes("setTrayPreferences({closeToTray:i===!0})")],
  ["preload tray preferences bridge", preload.includes('setTrayPreferences: (preferences) => ipcInvoke("setTrayPreferences", preferences)')],
  ["ipc tray preferences registered", /ipcMainHandle\("setTrayPreferences", \(preferences\) => \{\s*setTrayPreferences\(preferences\);/.test(mainFile("dist-main/main/registerIPCHandlers.js"))],
  ["linux minimize keeps the window reachable", !mainFile("dist-main/main/registerIPCHandlers.js").includes("window.hide();")],
  ["minimize events reach the renderer on linux", mainFile("dist-main/main/minimizeHandler.js").includes("if (!isWindows && !isLinux)")],
  ["xwayland relaunch runs before the single instance lock", mainFile("dist-main/main/main.js").includes("const gotLock = !relaunchUnderXWaylandForTray() && app.requestSingleInstanceLock();")],
  ["tray missing-host warning wired after ready", mainFile("dist-main/main/main.js").includes("warnTrayUnavailable();")],
  ["tray open restores a minimized window", mainFile("dist-main/main/tray.js").includes("if (mainWindow.isMinimized())\n                    mainWindow.restore();")],
  ["tray quit reveals a hidden window first", /if \(mainWindow && !mainWindow\.isVisible\(\)\) \{\s*mainWindow\.show\(\);\s*mainWindow\.focus\(\);\s*\}\s*app\.quit\(\);/.test(mainFile("dist-main/main/tray.js"))],
  ["linux tray left-click restores the window", mainFile("dist-main/main/tray.js").includes("never hide on click")],
  ["sharp worker forks the resolved runtime", mainFile("dist-main/main/utils/screenshot/runSharpWorker.js").includes("execPath: runtime.execPath,")],
  ["schedule functions injected", jsSrc.includes("function dgScheduleMinutes(") && jsSrc.includes("async function dgScheduleTick(")],
  ["schedule starts with the ui manager", jsSrc.includes("dgScheduleStart(this.rootContext),this.checkUpdateInstalled(),this.pollPowerMode()")],
  ["workflow states keep the numbers the schedule relies on", jsSrc.includes("e[e.SignedOut=0]=`SignedOut`,e[e.Stopped=1]=`Stopped`,e[e.InProgress=2]=`InProgress`,e[e.Paused=3]=`Paused`")],
  ["schedule times persisted", /setValue\([A-Za-z_$][\w$]*\.ScheduleOnTime,i\)/.test(jsSrc) && /setValue\([A-Za-z_$][\w$]*\.ScheduleOffTime,i\)/.test(jsSrc)],
  ["schedule settings load with the other settings", /getValue\([A-Za-z_$][\w$]*\.ScheduleOnTime\),r\.getValue\([A-Za-z_$][\w$]*\.ScheduleOffTime\)/.test(jsSrc)],
  ["schedule section in settings", jsSrc.includes("{section:`Schedule`},{render:")],
  ["schedule styles in the stylesheet", cssSrc.includes("._timeInput_o11y_19") && cssSrc.includes("._scheduleToggle_o11y_18")],
  ["schedule class names in the style map", jsSrc.includes("timeInput:`_timeInput_o11y_19`") && jsSrc.includes("scheduleToggle:`_scheduleToggle_o11y_18`")],
  ["screenshot skips sharp without a runtime", mainFile("dist-main/main/utils/screenshot/takeScreenshot.js").includes("if (sharpHealthy !== true && !(await resolveSharpWorkerRuntime())) {")],
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
  const tail = "}).catch(()=>{}));";
  const end = start < 0 ? -1 : jsSrc.indexOf(tail, start);
  const captureAt = jsSrc.indexOf("Taking screenshot - screenshotDuration:");
  if (!gsMatch || start < 0 || end < 0 || captureAt < 0) {
    console.log("  notice snippet not found in the bundle");
    return [["notice harness snippet present", false]];
  }
  const gs = gsMatch[1];
  const snippet = jsSrc.slice(start, end + tail.length);

  const branchAt = jsSrc.lastIndexOf("if(", captureAt);
  const before = jsSrc.slice(Math.max(0, start - 40), start);
  const ordering = [
    ["notice runs before the capture branch, not inside it", start < branchAt],
    ["notice is inserted at a statement boundary", /;/.test(before) && !/(if\(|&&|,)\s*$/.test(before)],
  ];

  const body = "return (async () => { let " + snippet + " return true; })()";
  const harness = new Function("Date", "t", "n", gs, "window", body);

  const fire = async (opts) => {
    const calls = [];
    const ctx = opts.ctx || {
      noticeKey: opts.noticeKey,
      rootContext: {
        varsRepository: { getValue: async (key) => (key === "mode" ? opts.mode : opts.lead) },
        employmentRepository: { getEmployment: async () => ({ disableScreenshots: !!opts.disabled }) },
      },
    };
    const win = { mainAPI: { showSystemNotification: (p) => { calls.push(p); return Promise.resolve(true); } } };
    const now = opts.now;
    const fakeDate = { now: () => now };
    const activity = { activityId: opts.activityId || "act-1", fromTime: opts.fromTime, employmentId: "e" };
    const keys = { ScreenshotNoticeMode: "mode", ScreenshotNoticeLead: "lead" };
    await harness.call(ctx, fakeDate, activity, opts.nextMinute, keys, win);
    return { calls, ctx };
  };

  const sweep = async (opts) => {
    const fromTime = 1_700_000_000_000;
    const nextMinute = 1;
    const dueAt = fromTime + nextMinute * 60000;
    const fired = [];
    const ctx = {
      noticeKey: undefined,
      rootContext: {
        varsRepository: { getValue: async (key) => (key === "mode" ? opts.mode : opts.lead) },
        employmentRepository: { getEmployment: async () => ({ disableScreenshots: !!opts.disabled }) },
      },
    };
    for (let offset = 1000; offset <= 62000; offset += 1000) {
      const result = await fire({ ...opts, fromTime, nextMinute, now: dueAt - (60000 - offset), ctx });
      if (result.calls.length) fired.push({ offset, title: result.calls[0].title });
    }
    return fired;
  };

  return (async () => {
    const checks = [...ordering];

    const both = await sweep({ mode: "both", lead: 10, disabled: false });
    checks.push(["notice fires once inside the lead window", both.length === 1]);
    checks.push(["notice fires with the remaining seconds", /Screenshot in 10s/.test(both[0]?.title || "")]);
    checks.push(["notice fires ten seconds before the capture, not at it", both[0]?.offset === 50000]);

    const nearCapture = await fire({ mode: "both", lead: 10, disabled: false, fromTime: 1_700_000_000_000, nextMinute: 1, now: 1_700_000_060_000 });
    checks.push(["notice never fires once the capture is due", nearCapture.calls.length === 0]);

    checks.push(["notice stays silent under off", (await sweep({ mode: "off", lead: 10, disabled: false })).length === 0]);
    checks.push(["notice stays silent for after-only", (await sweep({ mode: "after", lead: 10, disabled: false })).length === 0]);
    checks.push(["notice stays silent when screenshots are disabled", (await sweep({ mode: "both", lead: 10, disabled: true })).length === 0]);

    const wide = await sweep({ mode: "before", lead: 30, disabled: false });
    checks.push(["notice honours a 30 second lead", wide.length === 1 && wide[0]?.offset === 30000]);
    const short = await sweep({ mode: "both", lead: 5, disabled: false });
    checks.push(["notice honours a 5 second lead", short.length === 1 && short[0]?.offset === 55000]);

    const repeated = await fire({ mode: "both", lead: 10, disabled: false, fromTime: 1_700_000_000_000, nextMinute: 1, now: 1_700_000_052_000, noticeKey: "act-1:1" });
    checks.push(["notice does not repeat for the same capture", repeated.calls.length === 0]);
    const nextActivity = await fire({ mode: "both", lead: 10, disabled: false, fromTime: 1_700_000_000_000, nextMinute: 1, now: 1_700_000_052_000, noticeKey: "act-0:1", activityId: "act-1" });
    checks.push(["notice fires again for a new activity", nextActivity.calls.length === 1]);

    const post = jsSrc.slice(jsSrc.indexOf("noticeAfter&&a?.imageData"), jsSrc.indexOf("let o=this.getRandomInterval(i);", jsSrc.indexOf("noticeAfter&&a?.imageData")));
    const postHarness = new Function("noticeAfter", "a", "window", post);
    const runPost = (noticeAfter, hasImage) => {
      const calls = [];
      const win = { mainAPI: { showSystemNotification: (p) => { calls.push(p); return Promise.resolve(true); } } };
      postHarness(noticeAfter, hasImage ? { imageData: { buffer: { length: 1024 } } } : { imageData: null }, win);
      return calls;
    };
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

const cropChecks = async () => {
  const { pathToFileURL } = require("url");
  const { pickDisplays, cropRects } = await import(pathToFileURL(path.join(dir, "dist-main/main/utils/screenshot/displayCrop.js")).href);
  const side = [
    { id: 11, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    { id: 22, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  ];
  const stacked = [
    { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } },
    { id: 2, bounds: { x: 320, y: 1440, width: 1920, height: 1080 } },
  ];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rightOnly = cropRects(side, pickDisplays(side, 11, { displayIds: ["11"] }), 3840, 1080);
  const primaryOnly = cropRects(side, pickDisplays(side, 11, { onlyPrimaryScreen: true, displayIds: ["22"] }), 3840, 1080);
  const hidpi = cropRects(side, pickDisplays(side, 11, { displayIds: ["22"] }), 7680, 2160);
  const lower = cropRects(stacked, pickDisplays(stacked, 1, { displayIds: [2] }), 2560, 2520);
  const both = cropRects(side, pickDisplays(side, 11, { displayIds: ["11", "22"] }), 3840, 1080);
  const crop = mainFile("dist-main/main/utils/screenshot/cropToDisplays.js");
  const linux = mainFile("dist-main/main/utils/platform/LinuxStrategy.js");
  return [
    ["crop picks the selected monitor out of a side-by-side frame", same(rightOnly, [{ x: 1920, y: 0, width: 1920, height: 1080 }])],
    ["crop honours primary-only over the picked list", same(primaryOnly, [{ x: 1920, y: 0, width: 1920, height: 1080 }])],
    ["crop scales with a HiDPI frame", same(hidpi, [{ x: 0, y: 0, width: 3840, height: 2160 }])],
    ["crop handles stacked, offset monitors", same(lower, [{ x: 320, y: 1440, width: 1920, height: 1080 }])],
    ["crop returns one region per picked monitor", both !== null && both.length === 2],
    ["crop refuses a frame that does not match the layout", cropRects(side, [side[0]], 1920, 1080) === null],
    ["crop selects nothing for an unknown monitor", pickDisplays(side, 11, { displayIds: ["99"] }).length === 0],
    ["crop drops the frame when no picked monitor is connected", crop.includes("none of the selected displays is connected")],
    ["linux whole-desktop backends are cropped to the selection", linux.includes("cropToDisplays(raw, { onlyPrimaryScreen, displayIds })") && linux.includes("backend.name !== \"desktopCapturer\"")],
  ];
};

const stubModules = (tmp, files) => {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  }
};

const electronLogStub = {
  "node_modules/electron-log/package.json": JSON.stringify({ name: "electron-log", version: "0.0.0", main: "index.js" }),
  "node_modules/electron-log/index.js": "const noop = () => {};\nmodule.exports = { info: noop, warn: noop, error: noop, debug: noop };",
};

const trayChecks = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tray-verify-"));
  try {
    stubModules(tmp, {
      ...electronLogStub,
      "node_modules/electron/package.json": JSON.stringify({ name: "electron", version: "0.0.0", main: "index.js" }),
      "node_modules/electron/index.js": [
        "const { EventEmitter } = require('events');",
        "const app = new EventEmitter();",
        "app.getPath = () => process.env.TRAY_USER_DATA;",
        "app.quit = () => app.emit('before-quit');",
        "exports.app = app;",
        "exports.Notification = class { show() {} };",
        "exports.autoUpdater = new EventEmitter();",
      ].join("\n"),
      "utils/ipc.js": "export const sent = [];\nexport const ipcMainHandle = () => {};\nexport const ipcWebContentsSend = (key) => sent.push(key);",
      "tray.js": "export const destroyTray = () => {};",
      "run.mjs": [
        'import { EventEmitter } from "node:events";',
        'import { app } from "electron";',
        'import { sent } from "./utils/ipc.js";',
        'import { setupQuitHandler } from "./quitHandler.js";',
        'import { getTrayPreferences, setTrayPreferences, needsXWaylandForTray, trayUnavailableWarning } from "./trayPreferences.js";',
        "const out = { loaded: getTrayPreferences() };",
        "if (process.env.TRAY_PHASE === 'write') {",
        "  out.merged = setTrayPreferences({ closeToTray: true });",
        "  out.ignored = setTrayPreferences({ closeToTray: 'yes', minimizeToTray: 1 });",
        "  out.both = setTrayPreferences({ minimizeToTray: true });",
        "} else {",
        "  const win = new EventEmitter();",
        "  win.hidden = 0;",
        "  win.hide = () => { win.hidden++; };",
        "  win.webContents = {};",
        "  setupQuitHandler(win);",
        "  const close = () => { let prevented = false; win.emit('close', { preventDefault: () => { prevented = true; } }); return prevented; };",
        "  setTrayPreferences({ closeToTray: false });",
        "  out.offPrevented = close();",
        "  out.offSent = sent.slice(); out.offHidden = win.hidden;",
        "  setTrayPreferences({ closeToTray: true });",
        "  out.onPrevented = close();",
        "  out.onSent = sent.slice(); out.onHidden = win.hidden;",
        "  app.quit();",
        "  out.quitPrevented = close();",
        "  out.quitSent = sent.slice(); out.quitHidden = win.hidden;",
        "  out.afterQuitPrevented = close();",
        "  out.afterQuitSent = sent.slice(); out.afterQuitHidden = win.hidden;",
        "  const on = { minimizeToTray: true, closeToTray: false };",
        "  const wayland = { XDG_SESSION_TYPE: 'wayland' };",
        "  const gnome = { ...wayland, XDG_CURRENT_DESKTOP: 'GNOME' };",
        "  const ubuntuGnome = { ...wayland, XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };",
        "  const kde = { ...wayland, XDG_CURRENT_DESKTOP: 'KDE' };",
        "  const noHost = () => false;",
        "  const withHost = () => true;",
        "  out.xwayland = [",
        "    needsXWaylandForTray({ platform: 'linux', env: wayland, argv: ['scrinio'], preferences: on, hostAvailable: noHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: wayland, argv: ['scrinio', '--ozone-platform=x11'], preferences: on, hostAvailable: withHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: wayland, argv: ['scrinio', '--ozone-platform-hint=wayland'], preferences: on, hostAvailable: withHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' }, argv: ['scrinio'], preferences: on, hostAvailable: noHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: wayland, argv: ['scrinio'], preferences: { minimizeToTray: false }, hostAvailable: noHost }),",
        "    needsXWaylandForTray({ platform: 'win32', env: wayland, argv: ['scrinio'], preferences: on, hostAvailable: noHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: gnome, argv: ['scrinio'], preferences: on, hostAvailable: noHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: ubuntuGnome, argv: ['scrinio'], preferences: on, hostAvailable: withHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: gnome, argv: ['scrinio'], preferences: on, hostAvailable: withHost }),",
        "    needsXWaylandForTray({ platform: 'linux', env: kde, argv: ['scrinio'], preferences: on, hostAvailable: noHost }),",
        "  ];",
        "  out.warnNoHost = trayUnavailableWarning({ platform: 'linux', env: gnome, preferences: on, hostAvailable: () => false });",
        "  out.warnWithHost = trayUnavailableWarning({ platform: 'linux', env: gnome, preferences: on, hostAvailable: () => true });",
        "  out.warnNoHostNotGnome = trayUnavailableWarning({ platform: 'linux', env: kde, preferences: on, hostAvailable: () => false });",
        "}",
        "console.log(JSON.stringify(out));",
      ].join("\n"),
    });
    fs.copyFileSync(path.join(dir, "dist-main/main/quitHandler.js"), path.join(tmp, "quitHandler.js"));
    fs.copyFileSync(path.join(dir, "dist-main/main/trayPreferences.js"), path.join(tmp, "trayPreferences.js"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
    const userData = path.join(tmp, "user-data");
    const runPhase = (phase) =>
      JSON.parse(
        execFileSync(process.execPath, ["run.mjs"], { cwd: tmp, encoding: "utf8", env: { ...process.env, TRAY_USER_DATA: userData, TRAY_PHASE: phase } })
          .trim()
          .split("\n")
          .pop()
      );
    const fresh = runPhase("write");
    const stored = runPhase("read");
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    console.log("  tray preferences: " + JSON.stringify({ fresh, stored }));
    return [
      ["tray preferences default to off", same(fresh.loaded, { minimizeToTray: false, closeToTray: false })],
      ["tray preferences merge partial updates", same(fresh.merged, { minimizeToTray: false, closeToTray: true }) && same(fresh.both, { minimizeToTray: true, closeToTray: true })],
      ["tray preferences ignore non-boolean values", same(fresh.ignored, { minimizeToTray: false, closeToTray: true })],
      ["tray preferences survive a restart", same(stored.loaded, { minimizeToTray: true, closeToTray: true })],
      ["close asks for quit confirmation when close to tray is off", stored.offPrevented && same(stored.offSent, ["quitApp"]) && stored.offHidden === 0],
      ["close hides to tray when close to tray is on", stored.onPrevented && same(stored.onSent, ["quitApp"]) && stored.onHidden === 1],
      ["quit from the tray still reaches the quit flow", stored.quitPrevented && same(stored.quitSent, ["quitApp", "quitApp"]) && stored.quitHidden === 1],
      ["window close hides again after a cancelled quit", stored.afterQuitPrevented && same(stored.afterQuitSent, ["quitApp", "quitApp"]) && stored.afterQuitHidden === 2],
      ["xwayland only for minimize to tray on a wayland session without an ozone override", same(stored.xwayland, [true, false, false, false, false, false, false, true, true, true])],
      ["tray warning only on GNOME Wayland without a status-notifier host", same([stored.warnNoHost, stored.warnWithHost, stored.warnNoHostNotGnome], [true, false, false])],
    ];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const sharpRuntimeChecks = async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sharp-runtime-verify-"));
  try {
    stubModules(tmp, electronLogStub);
    fs.copyFileSync(path.join(dir, "dist-main/main/utils/screenshot/sharpRuntime.js"), path.join(tmp, "sharpRuntime.mjs"));
    const { pathToFileURL } = require("url");
    const rt = await import(pathToFileURL(path.join(tmp, "sharpRuntime.mjs")).href);
    const worker = "/opt/scrinio/resources/app.asar/dist-main/main/utils/screenshot/sharpWorker.js";
    const unpackedWorker = "/opt/scrinio/resources/app.asar.unpacked/dist-main/main/utils/screenshot/sharpWorker.js";
    const unpackedSharp = "/opt/scrinio/resources/app.asar.unpacked/node_modules/sharp/package.json";
    const disk = (extra) => new Set([unpackedWorker, unpackedSharp, ...extra]);
    const find = (opts) =>
      rt.findSharpWorkerRuntime({
        platform: "linux",
        workerPath: worker,
        env: { PATH: "/a/bin:relative/bin:/b/bin" },
        ...opts,
      });
    const versions = { "/a/bin/node": "18.20.4", "/b/bin/node": "24.18.0", "/usr/bin/node": "22.12.0" };
    const probe = async (candidate) => versions[candidate] ?? null;
    const picked = await find({ exists: (p) => disk(["/a/bin/node", "/b/bin/node", "/usr/bin/node"]).has(p), probe });
    const skipsBroken = await find({ exists: (p) => disk(["/b/bin/node", "/usr/bin/node"]).has(p), probe: async (c) => (c === "/b/bin/node" ? null : versions[c]) });
    const none = await find({ exists: (p) => disk(["/a/bin/node"]).has(p), probe });
    const noUnpacked = await find({ exists: (p) => p !== unpackedSharp, probe });
    const mac = await rt.findSharpWorkerRuntime({ platform: "darwin", workerPath: worker });
    const gate = ["20.18.3", "20.19.0", "21.7.3", "22.6.0", "22.7.0", "v24.18.0", "26.13.0"].map(rt.supportsTypelessEsm);
    return [
      ["sharp runtime picks the first system node that runs the worker", picked && picked.execPath === "/b/bin/node" && picked.workerPath === unpackedWorker],
      ["sharp runtime skips a node that fails to answer", skipsBroken && skipsBroken.execPath === "/usr/bin/node"],
      ["sharp runtime gives up without a usable node", none === null],
      ["sharp runtime gives up without unpacked sharp", noUnpacked === null],
      ["sharp runtime ignores relative PATH entries", !rt.nodeCandidates({ PATH: "relative/bin:/x" }).includes("relative/bin/node")],
      ["sharp runtime keeps the electron fork off linux", mac.execPath === undefined && mac.workerPath === worker],
      ["sharp runtime node version gate", JSON.stringify(gate) === JSON.stringify([false, true, false, false, true, true, true])],
    ];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const displayNameChecks = async () => {
  const { pathToFileURL } = require("url");
  const { parseXrandr, parseKscreen, edidName, labelDisplays, resolveScopeIds } = await import(pathToFileURL(path.join(dir, "dist-main/main/utils/screenshot/displayLayout.js")).href);
  const xr = parseXrandr("Screen 0: minimum 16 x 16\nDP-1 connected 1920x1080+0+0 (normal left) 478mm x 260mm\n   1920x1080 60.00*+\nDP-2 connected primary 1920x1080+1920+0 (normal) 530mm x 300mm\nHDMI-1 disconnected (normal)\n");
  const ks = parseKscreen(JSON.stringify({ outputs: [
    { name: "eDP-1", enabled: true, connected: true, priority: 1, pos: { x: 0, y: 0 }, size: { width: 2880, height: 1800 }, scale: 1.5, rotation: 1 },
    { name: "DP-3", enabled: true, connected: true, priority: 2, pos: { x: 1920, y: 0 }, size: { width: 2560, height: 1440 }, scale: 1, rotation: 2 },
    { name: "DP-4", enabled: false, connected: true, priority: 3, pos: { x: 0, y: 0 }, size: { width: 1, height: 1 }, scale: 1 },
  ] }));
  const edid = Buffer.alloc(128);
  edid[8] = 0x1e; edid[9] = 0x6d; edid[10] = 0x34; edid[11] = 0x12;
  const bare = Buffer.from(edid);
  edid.set([0, 0, 0, 0xfc, 0], 72);
  edid.write("LG ULTRAGEAR\n ", 77, "latin1");
  const electron = [
    { id: 64, label: "", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 65, label: "", bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
  ];
  const names = new Map([["DP-1", "D22e-20"], ["DP-2", "LG ULTRAGEAR"]]);
  const rows = labelDisplays(electron, 64, xr, names);
  const plain = labelDisplays(electron, 64, [], new Map());
  const twins = labelDisplays(electron, 64, xr, new Map([["DP-1", "Same"], ["DP-2", "Same"]]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ipc = mainFile("dist-main/main/registerIPCHandlers.js");
  const linux = mainFile("dist-main/main/utils/platform/LinuxStrategy.js");
  return [
    ["xrandr outputs parsed with primary", same(xr, [{ connector: "DP-1", primary: false, x: 0, y: 0, width: 1920, height: 1080 }, { connector: "DP-2", primary: true, x: 1920, y: 0, width: 1920, height: 1080 }])],
    ["kscreen outputs parsed in logical pixels with priority as primary", same(ks.map((o) => [o.connector, o.primary, o.width, o.height]), [["eDP-1", true, 1920, 1200], ["DP-3", false, 1440, 2560]])],
    ["edid monitor name read from the descriptor", edidName(edid) === "LG ULTRAGEAR"],
    ["edid without a name falls back to vendor and product", edidName(bare) === "GSM 1234"],
    ["displays are named after their monitors", same(rows.map((r) => [r.id, r.label]), [["DP-1", "D22e-20"], ["DP-2", "LG ULTRAGEAR"]])],
    ["primary comes from the system, not the first display", rows[0].primary === false && rows[1].primary === true],
    ["without system outputs the electron data is kept", same(plain.map((r) => [r.id, r.label, r.primary]), [["64", "Display 1", true], ["65", "Display 2", false]])],
    ["identical monitor names are told apart by connector", same(twins.map((r) => r.label), ["Same (DP-1)", "Same (DP-2)"])],
    ["primary only resolves to the system primary", same(resolveScopeIds(rows, { onlyPrimaryScreen: true }).displayIds, ["65"]) && resolveScopeIds(rows, { onlyPrimaryScreen: true }).onlyPrimaryScreen === false],
    ["picked connectors resolve to capture ids", same(resolveScopeIds(rows, { displayIds: ["DP-1"] }).displayIds, ["64"])],
    ["a selection saved with old capture ids still resolves", same(resolveScopeIds(rows, { displayIds: ["65"] }).displayIds, ["65"])],
    ["an unknown selection is passed on and dropped downstream", same(resolveScopeIds(rows, { displayIds: ["gone"] }).displayIds, ["gone"])],
    ["settings list uses the named displays", ipc.includes("await describeDisplays()") && !ipc.includes("`Display ${index + 1}`")],
    ["linux capture resolves the scope before cropping", linux.includes("resolveScopeIds(await describeDisplays(), options)")],
    ["selection count ignores monitors that are no longer connected", jsSrc.includes("${SL.length} of ${L.length} selected")],
  ];
};

const scheduleSource = () => {
  const start = jsSrc.indexOf("function dgScheduleMinutes(");
  if (start < 0) return null;
  const tail = /setInterval\(run,3e4\)\s*\}/.exec(jsSrc.slice(start));
  if (!tail) return null;
  return jsSrc.slice(start, start + tail.index + tail[0].length);
};

const scheduleKeys = { ScheduleOnTime: "on", ScheduleOffTime: "off", ScheduleApplied: "applied", ScheduleSignature: "signature" };

const loadSchedule = (overrides = {}) => {
  const block = scheduleSource();
  const gsName = /getValue\(([A-Za-z_$][\w$]*)\.HideFromTaskBar\)/.exec(jsSrc)[1];
  const timers = { timeouts: [], intervals: [] };
  const win = { mainAPI: { notes: [], showSystemNotification(note) { this.notes.push(note); return Promise.resolve(true); } } };
  const fakeTimeout = (fn, ms) => timers.timeouts.push([fn, ms]);
  const fakeInterval = (fn, ms) => timers.intervals.push([fn, ms]);
  const api = new Function(
    gsName, "window", "console", "setTimeout", "setInterval",
    block + "; return { dgScheduleMinutes, dgScheduleLabel, dgScheduleLatest, dgScheduleTick, dgScheduleStart };"
  )(scheduleKeys, win, overrides.console || console, fakeTimeout, fakeInterval);
  return { api, win, timers };
};

const makeContext = (state, stored = {}) => {
  const store = new Map(Object.entries(stored));
  const writes = [];
  const flow = {
    state,
    currentNote: "note",
    currentProjectId: "project",
    started: 0,
    stopped: 0,
    refuseStart: false,
    async startTracking() {
      this.started += 1;
      if (!this.refuseStart && this.state === 1) this.state = 2;
    },
    stopTracking() {
      this.stopped += 1;
      if (this.state === 2 || this.state === 3) this.state = 1;
    },
  };
  const ctx = {
    workflow: flow,
    varsRepository: {
      getValue: async (key) => store.get(key),
      setValue: async (key, value) => { writes.push([key, value]); store.set(key, value); },
    },
  };
  return { ctx, flow, store, writes };
};

const at = (day, hour, minute, second = 0) => new Date(2026, 10, day, hour, minute, second);

const scheduleChecks = async () => {
  if (!scheduleSource()) return [["schedule block extractable from the bundle", false]];
  const { api, win } = loadSchedule();
  const checks = [];
  const note = (name, ok) => checks.push([name, ok]);

  note("schedule parses a valid time", api.dgScheduleMinutes("07:05") === 425 && api.dgScheduleMinutes("00:00") === 0 && api.dgScheduleMinutes("23:59") === 1439);
  note("schedule rejects malformed times", ["24:00", "7:00", "07:60", "", "07-00", null, undefined, 700].every((v) => api.dgScheduleMinutes(v) === null));

  const latest = (on, off, when) => api.dgScheduleLatest(on, off, when);
  note("schedule has no event without times", latest("", "", at(23, 12, 0)) === null);
  const beforeOn = latest("07:00", "", at(23, 6, 59));
  note("schedule on-only before the time points at yesterday", beforeOn && beforeOn.type === "on" && beforeOn.key.startsWith("2026-11-22@"));
  const atOn = latest("07:00", "", at(23, 7, 0));
  note("schedule fires exactly at the minute", atOn && atOn.key === "2026-11-23@07:00:on");
  note("schedule midday latest is the start", latest("07:00", "17:00", at(23, 12, 0)).type === "on");
  note("schedule evening latest is the stop", latest("07:00", "17:00", at(23, 18, 0)).type === "off");
  note("schedule equal times stop", latest("09:00", "09:00", at(23, 9, 30)).type === "off");
  const night = latest("22:00", "06:00", at(23, 3, 0));
  note("schedule overnight keeps yesterday's start at 03:00", night.type === "on" && night.key.startsWith("2026-11-22@"));
  note("schedule overnight stops at 06:00", latest("22:00", "06:00", at(23, 7, 0)).type === "off");
  note("schedule ignores a malformed time", latest("nope", "17:00", at(23, 18, 0)).type === "off");
  note("schedule label follows the locale clock", /^\d{1,2}:\d{2}/.test(api.dgScheduleLabel("17:05")) && api.dgScheduleLabel("zz") === "");

  const run = async (state, stored, when) => {
    const env = makeContext(state, stored);
    win.mainAPI.notes.length = 0;
    const result = await api.dgScheduleTick(env.ctx, when);
    return { ...env, result, notes: [...win.mainAPI.notes] };
  };
  const base = { on: "07:00", off: "17:00", signature: "07:00|17:00", applied: "2026-11-22@17:00:off" };

  const signedOut = await run(0, { ...base }, at(23, 7, 0));
  note("schedule waits while signed out", signedOut.result === null && signedOut.flow.started === 0 && signedOut.writes.length === 0);

  const first = await run(2, { on: "07:00", off: "17:00" }, at(23, 18, 0));
  note("schedule first run records a baseline without acting", first.result === null && first.flow.stopped === 0 && first.store.get("signature") === "07:00|17:00" && first.store.get("applied") === "2026-11-23@17:00:off");

  const started = await run(1, { ...base }, at(23, 7, 0, 5));
  note("schedule starts a stopped timer at the start time", started.result === "started" && started.flow.started === 1 && started.flow.state === 2);
  note("schedule start passes the current note and project", started.flow.currentNote === "note" && started.flow.currentProjectId === "project");
  note("schedule start announces itself", started.notes.length === 1 && /started by your schedule/.test(started.notes[0].title) && /\d/.test(started.notes[0].message));
  const again = await run(1, { ...base, applied: started.store.get("applied") }, at(23, 7, 0, 35));
  note("schedule does not repeat the same event", again.result === null && again.flow.started === 0);

  const early = await run(1, { ...base }, at(23, 6, 59));
  note("schedule does nothing before the start time", early.result === null && early.flow.started === 0);

  const stopped = await run(2, { ...base, applied: "2026-11-23@07:00:on" }, at(23, 17, 0, 10));
  note("schedule stops a running timer at the stop time", stopped.result === "stopped" && stopped.flow.stopped === 1 && stopped.flow.state === 1);
  note("schedule stop announces itself", stopped.notes.length === 1 && /stopped by your schedule/.test(stopped.notes[0].title));
  const stoppedPaused = await run(3, { ...base, applied: "2026-11-23@07:00:on" }, at(23, 17, 0));
  note("schedule stops a paused timer too", stoppedPaused.result === "stopped" && stoppedPaused.flow.state === 1);

  const manual = await run(2, { ...base, applied: "2026-11-23@17:00:off" }, at(23, 17, 31));
  note("schedule leaves a timer started by hand after the stop time", manual.result === null && manual.flow.stopped === 0 && manual.flow.state === 2);
  const manualStop = await run(1, { ...base, applied: "2026-11-23@07:00:on" }, at(23, 10, 0));
  note("schedule leaves a timer stopped by hand after the start time", manualStop.result === null && manualStop.flow.started === 0);

  const alreadyOn = await run(2, { ...base }, at(23, 7, 0));
  note("schedule start on a running timer is skipped and consumed", alreadyOn.result === "skipped" && alreadyOn.flow.started === 0 && alreadyOn.store.get("applied") === "2026-11-23@07:00:on");
  const pausedOn = await run(3, { ...base }, at(23, 7, 0));
  note("schedule start leaves a paused timer to resume itself", pausedOn.result === "skipped" && pausedOn.flow.started === 0);
  const stoppedOff = await run(1, { ...base, applied: "2026-11-23@07:00:on" }, at(23, 17, 0));
  note("schedule stop on a stopped timer is skipped", stoppedOff.result === "skipped" && stoppedOff.flow.stopped === 0 && stoppedOff.notes.length === 0);

  const changed = await run(2, { ...base, signature: "|", applied: "" }, at(23, 18, 0));
  note("schedule saved after the stop time does not stop the timer", changed.result === null && changed.flow.stopped === 0 && changed.flow.state === 2);
  const nextDay = await run(2, { ...base, applied: changed.store.get("applied") }, at(24, 17, 0));
  note("schedule applies from the next stop time after a change", nextDay.result === "stopped");
  const edited = await run(2, { ...base, on: "08:00", signature: "07:00|17:00" }, at(23, 8, 30));
  note("schedule editing a time re-baselines instead of firing", edited.result === null && edited.flow.started === 0 && edited.store.get("signature") === "08:00|17:00");
  const cleared = await run(2, { ...base, on: "", signature: "07:00|17:00" }, at(23, 18, 0));
  note("schedule clearing one time keeps the other", cleared.store.get("signature") === "|17:00" && cleared.result === null);

  const woke = await run(1, { ...base }, at(23, 8, 30));
  note("schedule catches up after the computer slept through the start", woke.result === "started");
  const sleptPastStop = await run(2, { ...base, applied: "2026-11-23@07:00:on" }, at(23, 18, 30));
  note("schedule catches up after the computer slept through the stop", sleptPastStop.result === "stopped");

  const refusedEnv = makeContext(1, { ...base });
  refusedEnv.flow.refuseStart = true;
  win.mainAPI.notes.length = 0;
  const refusedResult = await api.dgScheduleTick(refusedEnv.ctx, at(23, 7, 0));
  note("schedule reports a start that did not take effect without announcing it", refusedResult === "failed" && win.mainAPI.notes.length === 0 && refusedEnv.store.get("applied") === "2026-11-23@07:00:on");

  const malformed = await run(2, { on: "nope", off: "99:99", signature: "|", applied: "" }, at(23, 18, 0));
  note("schedule treats malformed stored times as unset", malformed.result === null && malformed.flow.stopped === 0);

  const loaded = loadSchedule();
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const gated = {
    workflow: { state: 1 },
    varsRepository: { getValue: async () => { reads += 1; await gate; return ""; }, setValue: async () => {} },
  };
  loaded.api.dgScheduleStart(gated);
  const runCheck = loaded.timers.intervals[0][0];
  runCheck();
  runCheck();
  runCheck();
  const during = reads;
  release();
  note("schedule overlapping checks collapse into one", during === 1);
  note("schedule checks twice a minute after a short delay", loaded.timers.intervals.length === 1 && loaded.timers.intervals[0][1] === 3e4 && loaded.timers.timeouts.length === 1 && loaded.timers.timeouts[0][1] === 5e3);

  const errors = [];
  const failing = loadSchedule({ console: { error: (...args) => errors.push(args) } });
  failing.api.dgScheduleStart({ workflow: { state: 1 }, varsRepository: { getValue: async () => { throw new Error("db down"); }, setValue: async () => {} } });
  const failRun = failing.timers.intervals[0][0];
  failRun();
  await new Promise((resolve) => setTimeout(resolve, 20));
  failRun();
  await new Promise((resolve) => setTimeout(resolve, 20));
  note("schedule survives a failing store and keeps checking", errors.length === 2);

  return checks;
};

const scheduleUiChecks = () => {
  const open = "{section:`Schedule`},{render:";
  const from = jsSrc.indexOf(open);
  const to = from < 0 ? -1 : jsSrc.indexOf("}}];return(", from);
  if (from < 0 || to < 0) return [["schedule ui snippet present", false]];
  const snippet = jsSrc.slice(from + open.length, to + 1);
  const kName = /([A-Za-z_$][\w$]*)\.SCHEDULE_ON_TIME/.exec(snippet);
  const noName = /className:([A-Za-z_$][\w$]*)\.scope\b/.exec(snippet);
  const vaName = /className:([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.monitorRow/.exec(snippet);
  if (!kName || !noName || !vaName) return [["schedule ui snippet resolvable", false]];

  const { api } = loadSchedule();
  const make = (type, props, key) => ({ type, props, key });
  const W = { jsx: make, jsxs: make };
  const proxy = () => new Proxy({}, { get: (_, prop) => String(prop) });
  const classes = (...args) => args.map((a) => (typeof a === "string" ? a : Object.keys(a).filter((k) => a[k]).join(" "))).join(" ");
  const unique = [...new Set([kName[1], noName[1], vaName[1], "W", "t", "schedOn", "schedOff", "dgScheduleLabel"])];
  const build = (schedOn, schedOff) => {
    const calls = [];
    const values = { [kName[1]]: proxy(), [noName[1]]: proxy(), [vaName[1]]: classes, W, t: (key, value) => calls.push([key, value]), schedOn, schedOff, dgScheduleLabel: api.dgScheduleLabel };
    const render = new Function(...unique, "return (" + snippet + ")").apply(null, unique.map((name) => values[name]));
    return { tree: render(), calls };
  };
  const walk = (node, out = []) => {
    if (node === null || node === undefined || typeof node === "string") return out;
    if (Array.isArray(node)) { node.forEach((child) => walk(child, out)); return out; }
    out.push(node);
    walk(node.props && node.props.children, out);
    return out;
  };
  const textOf = (node) => walk(node).map((n) => (n.props && typeof n.props.children === "string" ? n.props.children : "")).join(" ");
  const inputs = (tree, type) => walk(tree).filter((n) => n.type === "input" && n.props.type === type);
  const toggled = (schedOn, schedOff, index, checked) => {
    const view = build(schedOn, schedOff);
    inputs(view.tree, "checkbox")[index].props.onChange({ target: { checked } });
    return view.calls;
  };

  const empty = build("", "");
  const emptyChecks = inputs(empty.tree, "checkbox");
  const emptyTimes = inputs(empty.tree, "time");
  const set = build("07:00", "17:00");
  const setChecks = inputs(set.tree, "checkbox");
  const setTimes = inputs(set.tree, "time");
  const onlyOff = build("", "17:00");
  const same = build("09:00", "09:00");
  const startOn = toggled("", "", 0, true);
  const stopOn = toggled("", "", 1, true);
  const startOff = toggled("07:00", "17:00", 0, false);
  setTimes[1].props.onChange({ target: { value: "18:30" } });
  setTimes[1].props.onChange({ target: { value: "" } });

  return [
    ["schedule ui shows a start and a stop row", emptyChecks.length === 2 && emptyTimes.length === 2],
    ["schedule ui starts unchecked with disabled time fields", emptyChecks.every((c) => c.props.checked === false) && emptyTimes.every((t) => t.props.disabled === true)],
    ["schedule ui explains an empty schedule", /No schedule/.test(textOf(empty.tree))],
    ["schedule ui checking the start row stores a default time", startOn.length === 1 && startOn[0][1] === "09:00" && /SCHEDULE_ON_TIME/.test(startOn[0][0])],
    ["schedule ui checking the stop row stores a default time", stopOn.length === 1 && stopOn[0][1] === "17:00" && /SCHEDULE_OFF_TIME/.test(stopOn[0][0])],
    ["schedule ui unchecking clears the time", startOff.length === 1 && startOff[0][1] === "" && /SCHEDULE_ON_TIME/.test(startOff[0][0])],
    ["schedule ui saves an edited time and ignores a half typed one", set.calls.length === 1 && set.calls[0][1] === "18:30" && /SCHEDULE_OFF_TIME/.test(set.calls[0][0])],
    ["schedule ui shows both set rows enabled", setChecks.every((c) => c.props.checked === true) && setTimes.every((t) => t.props.disabled === false) && setTimes[0].props.defaultValue === "07:00" && setTimes[1].props.defaultValue === "17:00"],
    ["schedule ui describes a start and stop pair", /Starts at .* and stops at /.test(textOf(set.tree))],
    ["schedule ui describes a stop only schedule", /Stops at .* every day\. You start it yourself\./.test(textOf(onlyOff.tree))],
    ["schedule ui says so when both times match", /Both times are the same/.test(textOf(same.tree))],
    ["schedule ui remounts a time field when it is switched on or off", emptyTimes[0].key === "off" && setTimes[0].key === "on"],
    ["schedule ui labels the time fields for assistive tech", setTimes.every((t) => typeof t.props["aria-label"] === "string" && t.props["aria-label"].length > 0)],
  ];
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

  try {
    checks.push(...(await cropChecks()));
  } catch (error) {
    console.log("FAIL monitor crop harness: " + error.message);
    checks.push(["monitor crop harness executed", false]);
  }

  try {
    checks.push(...trayChecks());
  } catch (error) {
    console.log("FAIL tray harness: " + error.message);
    checks.push(["tray harness executed", false]);
  }

  try {
    checks.push(...(await sharpRuntimeChecks()));
  } catch (error) {
    console.log("FAIL sharp runtime harness: " + error.message);
    checks.push(["sharp runtime harness executed", false]);
  }

  try {
    checks.push(...(await displayNameChecks()));
  } catch (error) {
    console.log("FAIL display name harness: " + error.message);
    checks.push(["display name harness executed", false]);
  }

  try {
    checks.push(...(await scheduleChecks()));
  } catch (error) {
    console.log("FAIL schedule harness: " + error.message);
    checks.push(["schedule harness executed", false]);
  }

  try {
    checks.push(...scheduleUiChecks());
  } catch (error) {
    console.log("FAIL schedule ui harness: " + error.message);
    checks.push(["schedule ui harness executed", false]);
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
