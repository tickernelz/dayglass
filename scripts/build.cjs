const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CFG, CACHE, fetchAsset } = require("./fetch.cjs");

const ROOT = path.resolve(__dirname, "..");
const WORK = path.join(ROOT, "work");
const DIST = path.join(ROOT, "dist");
const ASAR = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "asar.cmd" : "asar");

const run = (cmd, args, opts = {}) => {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
};
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });

const sevenZip = () => {
  if (process.env.SEVEN_ZIP) return process.env.SEVEN_ZIP;
  try {
    return require("7zip-bin").path7za;
  } catch {
    return process.platform === "win32" ? "7za.exe" : "7z";
  }
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
      appDir: path.join(outDir, "data/opt", CFG.source.bundle.replace(/\.app$/, ""), "resources"),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "zip") {
    run("unzip", ["-q", archive, "-d", outDir]);
    return {
      appDir: path.join(outDir, CFG.source.bundle, "Contents/Resources"),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "nsis") {
    run(sevenZip(), ["x", archive, "-o" + outDir, "-y"], {});
    const inner = path.join(outDir, "$PLUGINSDIR", "app-64.7z");
    if (!fs.existsSync(inner)) throw new Error("app-64.7z missing from installer");
    const appRoot = path.join(outDir, "app");
    mkdir(appRoot);
    run(sevenZip(), ["x", inner, "-o" + appRoot, "-y"], {});
    return { appDir: appRoot, payloadRoot: outDir, asarName: "resources/app.asar" };
  }
  throw new Error("unsupported kind: " + target.kind);
};

const packAsar = (appDir, asarPath) => {
  rm(asarPath);
  run(ASAR, ["pack", appDir, asarPath, "--unpack-dir", "node_modules/@img"]);
};

const repackDeb = (target, out, name) => {
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
  const bundle = path.join(out, CFG.source.bundle);
  const renamed = path.join(out, name + ".app");
  rm(renamed);
  fs.renameSync(bundle, renamed);
  const finalName = name + "-" + CFG.version + "-mac-" + target.arch + ".zip";
  const finalPath = path.join(DIST, finalName);
  rm(finalPath);
  run("zip", ["-qry", finalPath, name + ".app", "-x", "*.DS_Store"], { cwd: out });
  return finalPath;
};

const repackNsis = (target, out, name) => {
  const appRoot = path.join(out, "app");
  const inner = path.join(out, "$PLUGINSDIR", "app-64.7z");
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
  const builder = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "electron-builder.cmd" : "electron-builder");
  run(builder, ["--win", "nsis", "--" + target.arch, "--prepackaged", appRoot, "--config", "builder.json", "--config.electronVersion=" + CFG.electronVersion], {
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
  run(ASAR, ["extract", asarPath, appDir]);
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
