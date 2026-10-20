const fs = require("fs");

const PATTERNS = {
  K: /([A-Za-z_$][\w$]*)\.HOTKEYS\]:n,/,
  Po: /e\}\(\{\}\),([A-Za-z_$][\w$]*)=\{\[[A-Za-z_$][\w$]*\.HOTKEYS\]/,
  Fo: /\},([A-Za-z_$][\w$]*)=\{settings:/,
  gs: /getValue\(([A-Za-z_$][\w$]*)\.HideFromTaskBar\)/,
  Il: /([A-Za-z_$][\w$]*)=class extends EventTarget\{minutes=0;constructor\(e\)\{super\(\),this\.rootContext=e,this\.runLoop\(\)/,
  No: /([A-Za-z_$][\w$]*)=\{header:`_header_1011x_1`/,
  Mo: /jsx\)\(([A-Za-z_$][\w$]*),\{checked:e\.checked,onChange:e\.onChange,disabled:e\.disabled\}\)/,
  rows: /([A-Za-z_$][\w$]*)=\[\{label:`Launch ([\w.]+) on system startup`/,
  va: /([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.settingGroup,\{\[\2\.disabled\]:!!e\.disabled\}\)/,
  vis: /checked:i,onChange:m,isVisible:(![01])\}\];/,
  tray: /\{label:`((?:Minimize button minimizes|Hide) [\w.]+ (?:to tray|from dock))`,checked:i,onChange:m,/,
  APP: /\{label:`Launch ([\w.]+) on system startup`/,
};

const extract = (source) => {
  const out = {};
  for (const [key, re] of Object.entries(PATTERNS)) {
    const m = source.match(re);
    if (!m) throw new Error("identifier not found: " + key);
    out[key] = m[1];
  }
  return out;
};

const substitute = (template, ids) => template.replace(/\{\{([A-Za-z]+)\}\}/g, (m, key) => {
  if (!(key in ids)) throw new Error("unknown placeholder: " + key);
  return ids[key];
});

module.exports = { extract, substitute };

if (require.main === module) {
  const src = fs.readFileSync(process.argv[2], "utf8");
  console.log(JSON.stringify(extract(src)));
}
