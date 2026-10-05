#!/usr/bin/env node
/**
 * material-icon-theme → LinkDesk 图标主题 mappings 转换脚本（可复用升级）。
 *
 * E5.8#133.6 精简版：只转换「精选清单」（按类分组的常用图标），不再全量搬运——
 * 用户拍板（2026-08-28）「太多，用普通精简版」；2026-10-05 二轮拍板再扩一档
 * （原精选偏语言生态，Windows 桌面/嵌入式的 .exe/.docx/压缩包/工程配置一概命中不了）。
 * 目标 ~270 个 SVG，覆盖日常场景，git 仍不堆上游 1123 个全量。
 *
 * 用法：node scripts/convert-material-icons.mjs <源 material-icons.json> <插件目录>
 * 例：  node scripts/convert-material-icons.mjs \
 *         "C:/Users/fengy/AppData/Local/Temp/mat-icons/package/dist/material-icons.json" \
 *         E:/linkdesk-plugins/official/theme-iconset-pastel   # E6#99 起插件源码住在独立仓（原 plugins/theme-iconset-pastel）
 *
 * 干的事：
 * 1. 把 VS Code iconTheme 格式（iconDefinitions.iconPath + fileExtensions/fileNames/folderNames）
 *    转成 LinkDesk 双形态 imagePath 格式（extensions/files/folders/foldersExpanded → { imagePath }）。
 * 2. 带 5 个顶层默认图标（file/folder/folderExpanded/rootFolder/rootFolderExpanded）——
 *    E5.8#133.6 默认图标链路：普通文件夹/新建文件/根文件夹未命中匹配表时也用主题彩色图标（对齐 VS Code iconTheme 顶层键）。
 * 3. 只拷贝「被映射引用」的 SVG 进 <插件目录>/icons/material/。
 * 4. 生成 <插件目录>/icons/pastel.json。
 *
 * 许可：material-icon-theme 为 MIT（© Material Extensions）——插件目录附 LICENSE.md 合规。
 * 来源：npm pack material-icon-theme → package/dist/material-icons.json + package/icons/*.svg
 * 升级：重新 npm pack material-icon-theme → 重跑本脚本（精选清单保持不变，缺失键静默跳过）。
 */
import fs from "node:fs";
import path from "node:path";

const [srcJson, pluginDir] = process.argv.slice(2);
if (!srcJson || !pluginDir) {
  console.error("用法: node scripts/convert-material-icons.mjs <源 iconTheme.json> <插件目录>");
  process.exit(1);
}

/* ── 语言生态精选清单（E5.8#133.6 用户拍板按生态分类）──
 * 键名必须用 material 原键：fileExtensions 无点（"py"）、fileNames 小写（"readme.md"/"license"/"dockerfile"）。
 * 清单里 material 缺失的键静默跳过（defToImage → null），不影响其余。
 */
const COMMON_EXTENSIONS = [
  // 前端
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "html", "htm", "css", "scss", "sass", "less", "vue", "svelte",
  // 后端
  "c", "h", "cpp", "cxx", "hpp", "cc", "py", "pyw", "java", "go", "rs",
  "rb", "php", "cs", "kt", "swift", "scala", "lua", "r", "dart",
  // 脚本
  "sh", "bash", "zsh", "bat", "cmd", "ps1",
  // 数据 / 配置
  "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "csv", "sql",
  // 文档 / 标记
  "md", "markdown", "txt",
  // 媒体
  "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf",
  // ── v1.1.0 扩充（用户拍板 2026-10-05：原来的精选太窄，Windows 桌面/嵌入式日常一堆命中不了）──
  // 可执行 / 二进制 / 安装包
  "exe", "msi", "dll", "so", "lib", "a", "o", "obj", "bin", "hex", "wasm",
  "jar", "class", "apk", "deb", "rpm", "dmg", "iso", "img", "dat", "vmdk", "lock",
  // 压缩包
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "zst", "cab",
  // Office / 电子书
  "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp", "rtf", "epub", "key",
  // 字体
  "ttf", "otf", "woff", "woff2", "eot",
  // 图片 / 音视频
  "bmp", "tiff", "psd", "ai", "fig", "sketch",
  "mp3", "mp4", "wav", "avi", "mkv", "mov", "flac", "aac", "ogg", "webm", "m4a", "heic", "avif",
  // 语言扩充（⚠️ 不含 ".v"——material 把 v 归给 V 语言，而嵌入式那边它常是 Verilog，两个解释都成立 ⇒ 不收，宁可回退默认图标）
  "asm", "s", "sv", "svh", "vhd", "vhdl", "graphql", "gql", "prisma", "proto",
  "ex", "exs", "erl", "clj", "cljs", "hs", "jl", "nix", "pl", "pm",
  "hbs", "ejs", "pug", "jade", "twig", "liquid", "astro", "sol", "zig", "nim",
  "groovy", "gradle", "fs", "fsx", "vb", "vbs", "lisp", "scm", "tcl", "coffee", "styl",
  // 数据 / 科学计算
  "ipynb", "sqlite", "sqlite3", "db", "mdb", "parquet", "pkl", "tf", "hcl",
];

const COMMON_FILE_NAMES = [
  // 前端工程
  "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json",
  "vite.config.ts", "next.config.js", "webpack.config.js", "rollup.config.js",
  // 后端工程
  "go.mod", "go.sum", "requirements.txt", "pyproject.toml", "pom.xml",
  // 构建
  "makefile", "cmakelists.txt", "dockerfile", "docker-compose.yml",
  // 配置
  ".gitignore", ".env.local", ".npmrc", ".editorconfig", ".gitattributes",
  // 文档
  "readme.md", "changelog.md", "license", "license.md",
  // ── v1.1.0 扩充（同上）──
  // 工程 / 构建配置
  "meson.build", "justfile", "gradle.properties", ".clangd",
  "jest.config.js", "vitest.config.ts", "angular.json", "nuxt.config.js", "svelte.config.js",
  ".prettierrc", ".eslintrc", ".eslintignore", ".babelrc",
  ".nvmrc", ".node-version", ".python-version", ".ruby-version",
  "pnpm-lock.yaml", "yarn.lock", "pipfile", "poetry.lock",
  "gemfile", "rakefile", ".npmignore", ".yarnrc", ".gitmodules",
  "jenkinsfile", ".travis.yml", ".bazelrc",
  ".htaccess", "robots.txt", "favicon.ico",
  ".env.development", ".env.production",
  // 文档（无扩展名的 readme/changelog 单独成键）
  "readme", "changelog", "contributing.md", "todo.md", "authors",
  "security.md", "code_of_conduct.md", "license.txt",
];

const COMMON_FOLDERS = [
  // 源码 / 产物
  "src", "dist", "build", "out", "node_modules", "target", "bin",
  // 版本控制 / 工程
  ".git", ".github", ".vscode", ".idea",
  // 文档 / 测试
  "docs", "test", "tests", "spec", "e2e", "coverage",
  // 资源 / 结构
  "components", "assets", "public", "lib", "libs", "config", "include", "vendor",
];

/* ── 上游归属在本仓语境下不合适时的本地改指（每条都要写清为什么）──
 * 键是 material 的 fileExtensions 原键，值是上游 iconDefinition key。
 */
const EXTENSION_OVERRIDES = {
  // material 把 .o/.obj 归给 `3d`（那是给 Wavefront 3D 模型用的）——
  // 在工程/嵌入式语境里它们是编译目标文件，跟着 .a/.lib 走「库/目标文件」才对。
  o: "lib",
  obj: "lib",
};

/* ── 本地自绘图标（上游没有，资产住本仓 icons/material/，不由本脚本拷贝）──
 * 拷 SVG 的那一步会跳过这些名字；映射仍照常写进 pastel.json。
 */
const LOCAL_EXTENSIONS = {
  // Keil uVision 工程/选项文件——material-icon-theme 与 vscode-icons 两个主流包都没有 Keil 图标
  // （vscode-icons 那个 file_type_uv 是 Python 的 uv 包管理器，无关）⇒ 本仓自绘 icons/material/uvprojx.svg。
  uvproj: "uvprojx",
  uvprojx: "uvprojx",
  uvopt: "uvprojx",
  uvoptx: "uvprojx",
};
const LOCAL_ICON_FILES = new Set(Object.values(LOCAL_EXTENSIONS).map((n) => `${n}.svg`));

/* ── 1. iconDefinition key → imagePath（相对插件根） ── */
const theme = JSON.parse(fs.readFileSync(srcJson, "utf8"));
const defs = theme.iconDefinitions ?? {};
if (!Object.keys(defs).length) {
  console.error("iconDefinitions 为空——不是合法 VS Code iconTheme？");
  process.exit(1);
}

const defToImage = (key) => {
  const d = defs[key];
  if (!d) return null;
  if (d.iconPath) {
    // "./../icons/xxx.svg" → "icons/material/xxx.svg"
    return `icons/material/${path.basename(d.iconPath)}`;
  }
  // fontCharacter-only 定义（material 全 SVG，理论不触发；万一出现则跳过）
  return null;
};

/* ── 2. 转换映射段（VS Code → LinkDesk，带精选清单过滤） ── */
const build = (map, keys, keyTransform = (k) => k, resolve = (k, v) => v) => {
  const out = {};
  for (const k of keys) {
    const imagePath = defToImage(resolve(k, map?.[k]));
    if (imagePath) out[keyTransform(k)] = { imagePath };
  }
  return out;
};

/* ── 3. 顶层默认图标（E5.8#133.6：对齐 VS Code iconTheme 顶层键 file/folder/…） ── */
const DEFAULT_ICON_MAP = [
  ["file", "file"],
  ["folder", "folder"],
  ["folderExpanded", "folderExpanded"],
  ["rootFolder", "rootFolder"],
  ["rootFolderExpanded", "rootFolderExpanded"],
];
const defaultIcons = {};
for (const [lkKey, matKey] of DEFAULT_ICON_MAP) {
  const imagePath = defToImage(theme[matKey]);
  if (imagePath) defaultIcons[lkKey] = { imagePath };
}

const mappings = {
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/icon-theme.schema.json",
  ...defaultIcons,
  // VS Code fileExtensions key 无点（"ts"）→ LinkDesk extensions key 带点（".ts"）
  extensions: build(theme.fileExtensions, COMMON_EXTENSIONS, (k) => `.${k}`, (k, v) => EXTENSION_OVERRIDES[k] ?? v),
  files: build(theme.fileNames, COMMON_FILE_NAMES),
  folders: build(theme.folderNames, COMMON_FOLDERS),
  foldersExpanded: build(theme.folderNamesExpanded, COMMON_FOLDERS),
};

/* 本地自绘图标补进映射表（资产已在仓里，这里只写映射；缺资产则报错——那是真坏了） */
for (const [ext, icon] of Object.entries(LOCAL_EXTENSIONS)) {
  const rel = `icons/material/${icon}.svg`;
  if (!fs.existsSync(path.join(pluginDir, rel))) {
    console.error(`✗ 本地图标缺资产：${rel}（映射 ${ext} 引用它，但仓里没有）`);
    process.exit(1);
  }
  mappings.extensions[`.${ext}`] = { imagePath: rel };
}

/* ── 4. 收集被引用 SVG → 拷贝 ── */
const matDir = path.join(pluginDir, "icons", "material");
fs.mkdirSync(matDir, { recursive: true });
const srcIconsDir = path.join(path.dirname(srcJson), "..", "icons"); // dist/.. → package/icons
let copied = 0, missing = 0;
const seen = new Set();
const allEntries = [];
for (const v of Object.values(mappings)) {
  if (v && typeof v === "object") {
    if ("imagePath" in v) allEntries.push(v); // 默认图标 = 单条目 { imagePath }
    else allEntries.push(...Object.values(v)); // 匹配表 = { name: { imagePath } }
  }
}
for (const e of allEntries) {
  const rel = e.imagePath; // icons/material/xxx.svg
  const fileName = path.basename(rel);
  if (seen.has(fileName)) continue;
  seen.add(fileName);
  if (LOCAL_ICON_FILES.has(fileName)) continue; // 本仓自绘资产，不从上游拷也不计缺失
  const src = path.join(srcIconsDir, fileName);
  if (!fs.existsSync(src)) { missing++; continue; }
  fs.copyFileSync(src, path.join(matDir, fileName));
  copied++;
}

/* ── 5. 写 mappings JSON ── */
const outJson = path.join(pluginDir, "icons", "pastel.json");
fs.writeFileSync(outJson, JSON.stringify(mappings, null, 2) + "\n");

/* ── 6. 统计 ── */
const totals = {
  file: mappings.file ? 1 : 0,
  folder: mappings.folder ? 1 : 0,
  folderExpanded: mappings.folderExpanded ? 1 : 0,
  rootFolder: mappings.rootFolder ? 1 : 0,
  rootFolderExpanded: mappings.rootFolderExpanded ? 1 : 0,
  extensions: Object.keys(mappings.extensions).length,
  files: Object.keys(mappings.files).length,
  folders: Object.keys(mappings.folders).length,
  foldersExpanded: Object.keys(mappings.foldersExpanded).length,
};
const keyCount = totals.extensions + totals.files + totals.folders + totals.foldersExpanded;
console.log(`转换完成 → ${outJson}`);
console.log(`  默认图标: ${["file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"].filter((k) => mappings[k]).length}/5`);
console.log(`  映射: extensions ${totals.extensions} / files ${totals.files} / folders ${totals.folders} / foldersExpanded ${totals.foldersExpanded} = ${keyCount} 条`);
console.log(`  SVG 拷贝: ${copied} 个 → ${matDir}/`);
if (missing) console.warn(`  ⚠ 缺失 SVG: ${missing} 个（映射引用但源不存在——保留映射，运行时 404 走保底）`);
console.log(`  JSON 体积: ${(fs.statSync(outJson).size / 1024).toFixed(1)} KB`);
