const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CFG, CACHE, fetchAsset } = require("./fetch.cjs");

const ROOT = path.resolve(__dirname, "..");
const WORK = path.join(ROOT, "work");
const DIST = path.join(ROOT, "dist");
const ASAR_ENTRY = path.join(ROOT, "node_modules", "@electron", "asar", "bin", "asar.mjs");
const runAsar = (args) => run(process.execPath, [ASAR_ENTRY, ...args]);

const run = (cmd, args, opts = {}) => {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
};
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });

const sevenZip = () => {
  if (sevenZip.cached) return sevenZip.cached;
  const candidates = [];
  if (process.env.SEVEN_ZIP) candidates.push(process.env.SEVEN_ZIP);
  candidates.push(process.platform === "win32" ? "7z.exe" : "7z");
  try {
    const bin = require("7zip-bin").path7za;
    if (process.platform !== "win32") {
      const mode = fs.statSync(bin).mode;
      if (!(mode & 0o111)) fs.chmodSync(bin, mode | 0o755);
    }
    candidates.push(bin);
  } catch {}
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["i"], { stdio: "ignore" });
      sevenZip.cached = candidate;
      return candidate;
    } catch {}
  }
  throw new Error("no working 7z binary found; set SEVEN_ZIP");
};

const findFile = (dir, re) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, re);
      if (hit) return hit;
    } else if (re.test(entry.name)) {
      return full;
    }
  }
  return null;
};

const extract = (target, archive, outDir) => {
  rm(outDir);
  mkdir(outDir);
  if (target.kind === "deb") {
    run("ar", ["x", archive], { cwd: outDir });
    const data = fs.readdirSync(outDir).find((f) => /^data\.tar\.(xz|gz)$/.test(f));
    if (!data) throw new Error("data tarball missing in deb");
    mkdir(path.join(outDir, "data"));
    run("tar", ["-xf", path.join(outDir, data), "-C", path.join(outDir, "data")]);
    return {
      appDir: path.join(outDir, target.root, target.appName, "resources"),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "zip") {
    run(sevenZip(), ["x", archive, "-o" + outDir, "-y"]);
    return {
      appDir: path.join(outDir, CFG.bundleName, "Contents/Resources"),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "nsis") {
    run(sevenZip(), ["x", archive, "-o" + outDir, "-y"], {});
    const inner = findFile(outDir, /^app-64\.7z$/);
    if (!inner) throw new Error("app-64.7z missing from installer");
    const appRoot = path.join(outDir, "app");
    mkdir(appRoot);
    run(sevenZip(), ["x", inner, "-o" + appRoot, "-y"], {});
    return { appDir: appRoot, payloadRoot: outDir, asarName: "resources/app.asar" };
  }
  throw new Error("unsupported kind: " + target.kind);
};

const packAsar = (appDir, asarPath) => {
  rm(asarPath);
  runAsar(["pack", appDir, asarPath, "--unpack-dir", "node_modules/@img"]);
};

const repackDeb = (target, out, name) => {
  const optDir = path.join(out, target.root);
  const oldApp = path.join(optDir, target.appName);
  const newApp = path.join(optDir, name);
  if (fs.existsSync(oldApp) && oldApp !== newApp) {
    rm(newApp);
    fs.renameSync(oldApp, newApp);
  }
  const desktopDir = path.join(out, "data/usr/share/applications");
  if (fs.existsSync(desktopDir)) {
    for (const f of fs.readdirSync(desktopDir)) {
      const full = path.join(desktopDir, f);
      const body = fs.readFileSync(full, "utf8").split(target.appName).join(name);
      fs.writeFileSync(full, body);
      if (f.startsWith(target.appName)) fs.renameSync(full, path.join(desktopDir, f.replace(target.appName, name)));
    }
  }
  const controlDir = path.join(out, "control");
  rm(controlDir);
  mkdir(controlDir);
  run("tar", ["-xf", path.join(out, "control.tar.xz"), "-C", controlDir]);
  const controlFile = path.join(controlDir, "control");
  if (fs.existsSync(controlFile)) {
    const body = fs
      .readFileSync(controlFile, "utf8")
      .split("\n")
      .map((line) => {
        if (/^Package:/.test(line)) return "Package: " + name;
        if (/^Maintainer:/.test(line)) return "Maintainer: dayglass build <noreply@example.invalid>";
        if (/^Homepage:/.test(line)) return "Homepage: https://example.invalid/dayglass";
        if (/^Description:/.test(line)) return "Description: " + name + " time tracking client (patched build)";
        if (/^Vendor:/.test(line)) return "Vendor: dayglass build";
        return line;
      })
      .join("\n");
    fs.writeFileSync(controlFile, body);
  }
  rm(path.join(out, "control.tar.xz"));
  run("tar", ["-cJf", path.join(out, "control.tar.xz"), "-C", controlDir, "."]);
  rm(path.join(out, "data.tar.xz"));
  run("tar", ["-cJf", path.join(out, "data.tar.xz"), "-C", out, "data"]);
  const debianBinary = path.join(out, "debian-binary");
  if (!fs.existsSync(debianBinary)) fs.writeFileSync(debianBinary, "2.0\n");
  const finalName = name + "_" + CFG.version + "_" + target.arch + ".deb";
  const finalPath = path.join(DIST, finalName);
  rm(finalPath);
  run("ar", ["rc", finalPath, debianBinary, path.join(out, "control.tar.xz"), path.join(out, "data.tar.xz")]);
  return finalPath;
};

const repackZip = (target, out, name) => {
  const bundle = path.join(out, CFG.bundleName);
  const renamed = path.join(out, name + ".app");
  rm(renamed);
  fs.renameSync(bundle, renamed);
  const finalName = name + "-" + CFG.version + "-mac-" + target.arch + ".zip";
  const finalPath = path.join(DIST, finalName);
  rm(finalPath);
  run(sevenZip(), ["a", "-tzip", "-mm=Deflate", "-mx=9", finalPath, name + ".app", "-xr!*.DS_Store"], { cwd: out });
  return finalPath;
};

const repackNsis = (target, out, name) => {
  const appRoot = path.join(out, "app");
  const inner = findFile(out, /^app-64\.7z$/);
  if (!inner) throw new Error("app-64.7z missing before repack");
  rm(inner);
  run(sevenZip(), ["a", inner, "./*", "-mx=9"], { cwd: appRoot });
  const buildDir = path.join(out, "builder");
  rm(buildDir);
  mkdir(buildDir);
  fs.writeFileSync(
    path.join(buildDir, "package.json"),
    JSON.stringify(
      {
        name: name,
        productName: name,
        version: CFG.version,
        description: name + " time tracking client (patched build)",
        author: "dayglass build <noreply@example.invalid>",
        main: "dist-main/main/main.js",
        private: true,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(buildDir, "builder.json"),
    JSON.stringify(
      {
        appId: CFG.appId,
        productName: name,
        directories: { output: path.join(DIST, "nsis") },
        win: {
          target: [{ target: "nsis", arch: [target.arch] }],
          signAndEditExecutable: false,
          artifactName: name + "-" + CFG.version + "-win-" + target.arch + ".exe",
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          deleteAppDataOnUninstall: false,
          shortcutName: name,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          differentialPackage: false,
        },
      },
      null,
      2
    )
  );
  const builder = path.join(ROOT, "node_modules", "electron-builder", "cli.js");
  run(process.execPath, [builder, "--win", "nsis", "--" + target.arch, "--prepackaged", appRoot, "--config", "builder.json", "--config.electronVersion=" + CFG.electronVersion], {
    cwd: buildDir,
  });
  const produced = fs.readdirSync(path.join(DIST, "nsis")).filter((f) => f.endsWith(".exe"));
  if (!produced.length) throw new Error("installer not produced");
  const src = path.join(DIST, "nsis", produced[0]);
  const finalPath = path.join(DIST, produced[0]);
  rm(finalPath);
  fs.renameSync(src, finalPath);
  return finalPath;
};

const main = async () => {
  const key = process.argv[2];
  if (!key) throw new Error("usage: build.cjs <linux-x64|linux-arm64|mac-x64|mac-arm64|win-x64>");
  const target = CFG.targets[key];
  if (!target) throw new Error("unknown target: " + key);
  const name = CFG.productName;
  mkdir(DIST);

  const archive = await fetchAsset(key);
  const out = path.join(WORK, key);
  const layout = extract(target, archive, out);
  console.log("extracted " + key);

  const asarPath = path.join(layout.appDir, layout.asarName);
  const appDir = path.join(out, "appsrc");
  rm(appDir);
  mkdir(appDir);
  runAsar(["extract", asarPath, appDir]);
  console.log("extracted asar");

  run(process.execPath, [path.join(__dirname, "patch.cjs"), appDir]);
  run(process.execPath, [path.join(__dirname, "verify.cjs"), appDir]);

  packAsar(appDir, asarPath);
  console.log("packed asar");

  const finalPath = target.kind === "deb" ? repackDeb(target, out, name) : target.kind === "zip" ? repackZip(target, out, name) : repackNsis(target, out, name);
  console.log("artifact: " + path.relative(ROOT, finalPath) + " (" + (fs.statSync(finalPath).size / 1048576).toFixed(1) + " MB)");
};

main().catch((e) => {
  console.error("FAIL " + e.message);
  process.exit(1);
});
