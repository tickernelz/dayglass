const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CFG, fetchAsset } = require("./fetch.cjs");

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

const readMeta = (appDir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  return {
    name: pkg.name,
    email: pkg.email || "",
    homepage: pkg.homepage || "",
    author: pkg.author || "",
  };
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
    const asar = findFile(path.join(outDir, target.root), /^app\.asar$/);
    if (!asar) throw new Error("no app.asar inside the deb payload");
    return {
      appDir: path.dirname(asar),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "zip") {
    run(sevenZip(), ["x", archive, "-o" + outDir, "-y"]);
    const asar = findFile(outDir, /^app\.asar$/);
    if (!asar) throw new Error("no app.asar inside the zip payload");
    return {
      appDir: path.dirname(asar),
      payloadRoot: outDir,
      asarName: "app.asar",
    };
  }
  if (target.kind === "nsis") {
    run(sevenZip(), ["x", archive, "-o" + outDir, "-y"], {});
    const inner = findFile(outDir, /^app-64\.7z$/);
    const appRoot = path.join(outDir, "app");
    if (inner) {
      mkdir(appRoot);
      run(sevenZip(), ["x", inner, "-o" + appRoot, "-y"], {});
      return { appDir: appRoot, payloadRoot: outDir, asarName: "resources/app.asar" };
    }
    const flat = findFile(outDir, /^app\.asar$/);
    if (flat && path.basename(path.dirname(flat)) === "resources") {
      return { appDir: path.dirname(path.dirname(flat)), payloadRoot: outDir, asarName: "resources/app.asar" };
    }
    throw new Error("no application payload found inside the installer");
  }
  throw new Error("unsupported kind: " + target.kind);
};

const packAsar = (appDir, asarPath) => {
  rm(asarPath);
  runAsar(["pack", appDir, asarPath, "--unpack-dir", "node_modules/@img"]);
};

const readControl = (debPath) => {
  const tmp = path.join(WORK, "control-probe");
  rm(tmp);
  mkdir(tmp);
  run("ar", ["x", debPath], { cwd: tmp });
  const controlTar = fs.readdirSync(tmp).find((f) => /^control\.tar\./.test(f));
  if (!controlTar) throw new Error("control tarball missing in " + path.basename(debPath));
  mkdir(path.join(tmp, "control"));
  run("tar", ["-xf", path.join(tmp, controlTar), "-C", path.join(tmp, "control")]);
  const body = fs.readFileSync(path.join(tmp, "control", "control"), "utf8");
  rm(tmp);
  return body;
};

const assertDebIdentity = (debPath, identity) => {
  const control = readControl(debPath);
  const pkg = /^Package:\s*(.+)$/m.exec(control);
  if (!pkg || pkg[1].trim() !== identity) throw new Error("artifact package name is " + (pkg && pkg[1]) + ", expected " + identity);
  const version = /^Version:\s*(.+)$/m.exec(control);
  if (!version || version[1].trim() !== CFG.buildVersion) throw new Error("artifact version is " + (version && version[1]) + ", expected " + CFG.buildVersion);
  console.log("  identity package=" + pkg[1].trim() + " version=" + version[1].trim());
};

const assertZipIdentity = (zipPath, bundle) => {
  const listing = execFileSync(sevenZip(), ["l", "-ba", zipPath], { encoding: "utf8" });
  if (!listing.includes(bundle + "/Contents/MacOS/")) throw new Error("bundle " + bundle + " missing from " + path.basename(zipPath));
  console.log("  identity bundle=" + bundle);
};

const repackDeb = (target, out, meta) => {
  const identity = CFG.identity.linux;
  const optDir = path.join(out, target.root);
  const current = fs.readdirSync(optDir).find((f) => fs.statSync(path.join(optDir, f)).isDirectory());
  if (!current) throw new Error("no application directory inside " + optDir);
  if (current !== identity) fs.renameSync(path.join(optDir, current), path.join(optDir, identity));

  const desktopDir = path.join(out, "data/usr/share/applications");
  if (fs.existsSync(desktopDir)) {
    for (const f of fs.readdirSync(desktopDir)) {
      const full = path.join(desktopDir, f);
      const body = fs
        .readFileSync(full, "utf8")
        .split(current)
        .join(identity)
        .split("\n")
        .map((line) => {
          if (/^Name=/.test(line)) return "Name=" + identity;
          if (/^StartupWMClass=/.test(line)) return "StartupWMClass=" + identity;
          if (/^Icon=/.test(line)) return "Icon=" + identity;
          return line;
        })
        .join("\n");
      fs.writeFileSync(full, body);
      const wanted = identity + ".desktop";
      if (f !== wanted) fs.renameSync(full, path.join(desktopDir, wanted));
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
        if (/^Package:/.test(line)) return "Package: " + identity;
        if (/^Version:/.test(line)) return "Version: " + CFG.buildVersion;
        if (/^Maintainer:/.test(line) && meta.email) return "Maintainer: " + meta.email;
        if (/^Homepage:/.test(line) && meta.homepage) return "Homepage: " + meta.homepage;
        if (/^Vendor:/.test(line)) return "Vendor: " + CFG.identity.appId;
        if (/^Description:/.test(line)) return "Description: " + identity + " time tracking client (patched build)";
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
  const finalName = CFG.publicName + "_" + CFG.buildVersion + "_" + target.arch + ".deb";
  const finalPath = path.join(DIST, finalName);
  rm(finalPath);
  run("ar", ["rc", finalPath, debianBinary, path.join(out, "control.tar.xz"), path.join(out, "data.tar.xz")]);
  assertDebIdentity(finalPath, identity);
  return finalPath;
};

const repackZip = (target, out) => {
  const bundle = CFG.identity.mac;
  if (!fs.existsSync(path.join(out, bundle))) throw new Error("bundle " + bundle + " missing from the extracted archive");
  const finalName = CFG.publicName + "-" + CFG.buildVersion + "-mac-" + target.arch + ".zip";
  const finalPath = path.join(DIST, finalName);
  rm(finalPath);
  run(sevenZip(), ["a", "-tzip", "-mm=Deflate", "-mx=9", finalPath, bundle, "-xr!*.DS_Store"], { cwd: out });
  assertZipIdentity(finalPath, bundle);
  return finalPath;
};

const repackNsis = (target, out) => {
  const identity = CFG.identity.win;
  const appRoot = path.join(out, "app");
  const executable = findFile(appRoot, new RegExp("^" + identity.replace(/\./g, "\\.") + "\\.exe$", "i"));
  if (!executable) throw new Error("executable " + identity + ".exe missing from the unpacked application");
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
        name: CFG.identity.linux,
        productName: identity,
        version: CFG.buildVersion,
        description: identity + " time tracking client (patched build)",
        author: "scrin.io",
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
        appId: CFG.identity.appId,
        productName: identity,
        directories: { output: path.join(DIST, "nsis") },
        win: {
          target: [{ target: "nsis", arch: [target.arch] }],
          signAndEditExecutable: false,
          executableName: identity,
          artifactName: CFG.publicName + "-" + CFG.buildVersion + "-win-" + target.arch + ".exe",
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          deleteAppDataOnUninstall: false,
          shortcutName: identity,
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
  console.log("  identity executable=" + identity + ".exe shortcut=" + identity);
  return finalPath;
};

const main = async () => {
  const key = process.argv[2];
  if (!key) throw new Error("usage: build.cjs <linux-x64|linux-arm64|mac-x64|mac-arm64|win-x64>");
  const target = CFG.targets[key];
  if (!target) throw new Error("unknown target: " + key);
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

  const meta = readMeta(appDir);
  run(process.execPath, [path.join(__dirname, "patch.cjs"), appDir]);
  run(process.execPath, [path.join(__dirname, "verify.cjs"), appDir]);

  packAsar(appDir, asarPath);
  console.log("packed asar");

  const finalPath =
    target.kind === "deb"
      ? repackDeb(target, out, meta)
      : target.kind === "zip"
        ? repackZip(target, out)
        : repackNsis(target, out);
  console.log("artifact: " + path.relative(ROOT, finalPath) + " (" + (fs.statSync(finalPath).size / 1048576).toFixed(1) + " MB)");
};

main().catch((e) => {
  console.error("FAIL " + e.message);
  process.exit(1);
});
