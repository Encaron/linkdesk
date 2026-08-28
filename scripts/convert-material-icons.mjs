#!/usr/bin/env node
/**
 * material-icon-theme → LinkDesk 图标主题 mappings 转换脚本（一次性，可复用升级）。
 *
 * 用法：node scripts/convert-material-icons.mjs <源 material-icons.json> <插件目录>
 * 例：  node scripts/convert-material-icons.mjs \
 *         "C:/Users/fengy/AppData/Local/Temp/mat-icons/package/dist/material-icons.json" \
 *         plugins/user/theme-iconset-pastel
 *
 * 干的事：
 * 1. 把 VS Code iconTheme 格式（iconDefinitions.iconPath + fileNames/fileExtensions/folderNames）
 *    转成 LinkDesk 双形态 imagePath 格式（files/extensions/folders/foldersExpanded → { imagePath }）。
 * 2. 只拷贝「被映射引用」的 SVG 进 <插件目录>/icons/material/（避免全量 1251 平铺）。
 * 3. 生成 <插件目录>/icons/pastel.json（全量映射，零 font 段——纯 SVG 图像资产形态）。
 *
 * 许可：material-icon-theme 为 MIT（© Material Extensions）——插件目录附 LICENSE.md 合规。
 * 来源：npm pack material-icon-theme → package/dist/material-icons.json + package/icons/*.svg
 */
import fs from "node:fs";
import path from "node:path";

const [srcJson, pluginDir] = process.argv.slice(2);
if (!srcJson || !pluginDir) {
  console.error("用法: node scripts/convert-material-icons.mjs <源 iconTheme.json> <插件目录>");
  process.exit(1);
}

const theme = JSON.parse(fs.readFileSync(srcJson, "utf8"));
const defs = theme.iconDefinitions ?? {};
if (!Object.keys(defs).length) {
  console.error("iconDefinitions 为空——不是合法 VS Code iconTheme？");
  process.exit(1);
}

// ── 1. iconDefinition key → imagePath（相对插件根） ──
const defToImage = (key) => {
  const d = defs[key];
  if (!d) return null;
  if (d.iconPath) {
    // "./../icons/xxx.svg" → "icons/material/xxx.svg"
    const name = path.basename(d.iconPath);
    return `icons/material/${name}`;
  }
  // fontCharacter-only 定义（material 5.x 全 SVG，理论不触发；万一出现则跳过）
  return null;
};

// ── 2. 转换映射段（VS Code → LinkDesk） ──
const extToEntry = (ext) => ({ imagePath: defToImage(theme.fileExtensions[ext]) });
const fileToEntry = (name) => ({ imagePath: defToImage(theme.fileNames[name]) });
const folderToEntry = (name) => ({ imagePath: defToImage(theme.folderNames[name]) });
const folderExpToEntry = (name) => ({ imagePath: defToImage(theme.folderNamesExpanded[name]) });

const build = (map, keyTransform = (k) => k) => {
  const out = {};
  for (const [k, defKey] of Object.entries(map ?? {})) {
    const imagePath = defToImage(defKey);
    if (imagePath) out[keyTransform(k)] = { imagePath };
  }
  return out;
};

const mappings = {
  // VS Code fileExtensions key 无点（"ts"）→ LinkDesk extensions key 带点（".ts"）
  extensions: build(theme.fileExtensions, (k) => `.${k}`),
  files: build(theme.fileNames),
  folders: build(theme.folderNames),
  foldersExpanded: build(theme.folderNamesExpanded),
};

// ── 3. 收集被引用 SVG → 拷贝 ──
const matDir = path.join(pluginDir, "icons", "material");
fs.mkdirSync(matDir, { recursive: true });
const srcIconsDir = path.join(path.dirname(srcJson), "..", "icons"); // dist/.. → package/icons
let copied = 0, missing = 0;
const seen = new Set();
const allEntries = [
  ...Object.values(mappings.extensions),
  ...Object.values(mappings.files),
  ...Object.values(mappings.folders),
  ...Object.values(mappings.foldersExpanded),
];
for (const e of allEntries) {
  const rel = e.imagePath; // icons/material/xxx.svg
  const fileName = path.basename(rel);
  if (seen.has(fileName)) continue;
  seen.add(fileName);
  const src = path.join(srcIconsDir, fileName);
  if (!fs.existsSync(src)) { missing++; continue; }
  fs.copyFileSync(src, path.join(matDir, fileName));
  copied++;
}

// ── 4. 写 mappings JSON ──
const outJson = path.join(pluginDir, "icons", "pastel.json");
fs.writeFileSync(
  outJson,
  JSON.stringify(mappings, null, 2) + "\n"
);

// ── 5. 统计 ──
const totals = {
  extensions: Object.keys(mappings.extensions).length,
  files: Object.keys(mappings.files).length,
  folders: Object.keys(mappings.folders).length,
  foldersExpanded: Object.keys(mappings.foldersExpanded).length,
};
console.log(`转换完成 → ${outJson}`);
console.log(`  映射: ${JSON.stringify(totals)} = ${Object.values(totals).reduce((a, b) => a + b, 0)} 条`);
console.log(`  SVG 拷贝: ${copied} 个 → ${matDir}/`);
if (missing) console.warn(`  ⚠ 缺失 SVG: ${missing} 个（映射引用但源不存在——保留映射，运行时 404 走保底）`);
console.log(`  JSON 体积: ${(fs.statSync(outJson).size / 1024).toFixed(1)} KB`);
