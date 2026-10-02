/**
 * 生成引导器壳的内嵌 UI 资源清单（`out/ui.gen.rc` ＋ `out/ui.manifest`），供 build.cmd 的 rc 步骤编译。
 *
 * 为什么要有这一步（件 2a 的硬需求）：
 *   产品形态是**单文件**安装包：`[bootstrapper.exe][marker][app.7z]`。而 1a–1d 的壳是从
 *   **exe 所在目录**读页面的（`app.html` / `app.css` / `app.js` / `i18n\*.json`）。
 *   拼成单文件后那个目录里只有安装包自己 ⇒ 页面 404 ⇒ 整屏空白。
 *   所以页面资源必须**嵌进 exe**，运行时摊到临时目录再映射成 `installer.local`。
 *
 * 开发态照旧：`out\` 下有 `app.html` 时壳**优先用磁盘上的**（改 CSS 不用重编译，见 README §二）。
 * 两条路的选择在 main.cpp 的 `ResolveUiRoot()`，本脚本只负责"嵌入那一份"。
 *
 * 资源 id 分配（🔴 与 main.cpp 的 `kUiManifestRes` / `kUiFileResBase` 是同一份契约）：
 *   id 1   图标（icon.rc，手写）
 *   id 2   7zr.exe（icon.rc，手写）
 *   id 3   ui.manifest（本脚本产出：UTF-8 文本，每行 `id<TAB>相对路径`）
 *   id 10+ UI 文件本体（本脚本产出）
 *
 * "加语言 = 加一个 json" 在这里同样成立：本脚本枚举 `../i18n/*.json`，不加任何代码。
 *
 * 用法：node tools/gen-ui-rc.mjs          （build.cmd 自动调；也可手动跑）
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = resolve(__dirname, "..");           // build/installer/bootstrapper
const OUT = join(HERE, "out");

export const UI_MANIFEST_RES = 3;
export const UI_FILE_RES_BASE = 10;

/** 件 3b 随包字体（Newsreader 拉丁子集）＋ 台账 §五 B 补的 Geist（正体/等宽拉丁子集）
 *  ——`fonts\` 下的这几个文件，由 build.cmd 校验在场。
 *  🔴 Geist 是**变体字体**（一个 woff2 覆盖 100–900 字重）⇒ 只列 400 这一份，
 *     app.css 里用一条 `font-weight:100 900` 的 @font-face 声明，不必再收 500/700 的副本。 */
export const FONT_FILES = [
  "newsreader-latin-400.woff2",
  "newsreader-latin-400-italic.woff2",
  "geist-latin-400.woff2",
  "geist-mono-latin-400.woff2",
];

/** 清单条目：exe 内 id → 页面根下的相对路径（正斜杠，运行时按它建子目录）。 */
export function collectUiFiles() {
  const files = [
    ["app.html", join(HERE, "app.html")],
    ["app.css", join(HERE, "app.css")],
    ["app.js", join(HERE, "app.js")],
  ];
  const i18nDir = join(HERE, "..", "i18n");       // build/installer/i18n（规格 01 §五）
  if (!existsSync(i18nDir)) throw new Error(`i18n 目录不存在：${i18nDir}`);
  for (const name of readdirSync(i18nDir).sort()) {
    // `_` 前缀 = 预留位（如 _template.json），不进清单——与 1c 的 ScanI18nCodes 同口径
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    files.push([`i18n/${name}`, join(i18nDir, name)]);
  }
  // 件 3b：随包字体 ＋ OFL 许可文本。许可文本**故意**一起嵌——SIL OFL 1.1 要求字体分发随附
  // 许可副本，而产品态只有单文件；不嵌进去就「随」不上（临时目录那份会在退出时删掉，
  // 所以仓里的 `fonts/OFL.txt` 与发布页的许可注记才是长期落点，这里只是让它随产物走）。
  for (const name of FONT_FILES) {
    files.push([`fonts/${name}`, join(HERE, "fonts", name)]);
  }
  files.push(["fonts/OFL.txt", join(HERE, "fonts", "OFL.txt")]);
  for (const [rel, abs] of files) {
    if (!existsSync(abs)) throw new Error(`UI 资源缺失：${rel}（${abs}）`);
  }
  return files;
}

function main() {
  const files = collectUiFiles();
  mkdirSync(OUT, { recursive: true });

  const lines = [`${UI_MANIFEST_RES} RCDATA "ui.manifest"`];
  const manifest = [];
  files.forEach(([rel, abs], i) => {
    const id = UI_FILE_RES_BASE + i;
    // rc 的路径相对 rc 文件所在目录（out\），故回退一层。
    // 🔴 反斜杠必须**成对**写：rc 在带引号的文件名里把 `\` 当转义符，`..\app.js` 会被吃成
    // `..pp.js`（`\a` = BEL），报的是 `file not found: ..pp.js`——看不出跟转义有关。
    lines.push(`${id} RCDATA "..\\\\${rel.replace(/\//g, "\\\\")}"`);
    manifest.push(`${id}\t${rel}`);
  });

  writeFileSync(join(OUT, "ui.gen.rc"), lines.join("\r\n") + "\r\n", "latin1");
  writeFileSync(join(OUT, "ui.manifest"), manifest.join("\r\n") + "\r\n", "utf8");
  process.stdout.write(
    `ui.gen.rc: ${files.length} 个 UI 资源（id ${UI_FILE_RES_BASE}..${UI_FILE_RES_BASE + files.length - 1}）` +
      ` ＋ 清单 id ${UI_MANIFEST_RES}\n` +
      files.map(([rel], i) => `  ${UI_FILE_RES_BASE + i}  ${rel}\n`).join("")
  );
  // 交叉校验：清单文本里出现的每一个 rel 都必须真实存在（防"清单与磁盘两张皮"）
  const reread = readFileSync(join(OUT, "ui.manifest"), "utf8");
  if (!reread.includes("app.html")) throw new Error("清单自检失败：读回时没有 app.html");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
