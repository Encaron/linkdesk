/**
 * E6#57.15a①：产品身份 `electron/product.json` 必须**真的随包进 asar**——两层判据。
 *
 * 病根（2026-09-12 实证，不是推测）：
 *   electron-builder.yml 的 `files:` 白名单原先只有 dist / dist-electron / package.json /
 *   node_modules 四条，**漏了 electron/product.json**。后果链：
 *     asar 里没有该文件 → electron/product.ts:76 的 readFileSync 抛错 → 被 catch 吞掉
 *     → 整个 product.json 退回 DEFAULT_PRODUCT → **updateUrl 变空串**（product.ts:56）
 *     → 更新元数据腿整条失效，而且**不报错**、日志里一个字都没有。
 *   靠人眼开 asar 看产物永远看不出来——本仓为它配了这条门禁。
 *
 * 🔴 这条门禁为什么必须存在（真实事故，写在这里防后人删）：
 *   修这一行时，第一笔改动**只换了注释、没加条目**，我自认为改完了；是重新打包后数 asar 条目
 *   （7602 条不变、`\electron` 仍不存在）才发现。**人眼读 diff 会漏，机械判据不会。**
 *
 * ── 两层判据，各自挂在不同的钩子上（这一分工是刻意的）──
 *
 *   ① 配置层（默认模式，挂 `npm run check`）：electron-builder.yml 的 `files:` 里
 *      必须有一条能覆盖 `electron/product.json`。**不需要任何产物**，每次提交都能拦
 *      「有人顺手删了那一行 / 改成了 asar 根的写法」。
 *
 *   ② 产物层（`--with-artifact`，挂 `npm run electron:build` 尾部）：
 *      新打的 win-unpacked/resources/app.asar 里**真有**该条目，**且内容能解析、updateUrl 非空**。
 *      拦「配置在、产物里真没有」——配置与产物是两份独立证据，①过不代表②过。
 *
 * 🔴 ②**不能**挂 `npm run check`：它判的是构建产物，而提交时磁盘上通常躺着一份**上一次**的
 *   win-unpacked。拿旧产物判新配置 ⇒ 常态假红（违反三档门禁的闸 1「红灯前零误报」）；
 *   改成「找不到就跳过」⇒ 恒绿假门禁（memory `e6-gate-philosophy-three-tier`）。
 *   故本文件默认模式只跑①，②显式 `--with-artifact` 才跑、且缺产物**判红不跳过**。
 *   同款取舍的先例：scripts/assert-installer-name.mjs 头注「为什么本门禁不挂 npm run check」。
 *
 * ── 目标路径的真值从哪来（与 assert-installer-name.mjs 刻意相反）──
 *   那边契约**写死**在脚本里，因为它防的是「有人改配置、断言跟着一起变 ⇒ 恒真」；
 *   这里反着：product.ts 的 `productJsonPath()` 是**消费方、是活的真值**，配置必须去迎合它。
 *   若把路径也写死一份，就等于给活依赖复刻快照——product.ts 哪天改了路径，门禁还在查旧位置
 *   （memory `snapshot-shadows-truth-bug-class` ①：快照遮蔽真值）。故：
 *     现场从 electron/product.ts 抽路径 → 抽不出来**大声退回契约字面量**（绝不静默跳过）。
 *   铁律「契约要显式，实现要现场读」——契约字面量留在下面的 CONTRACT_REL 里可见。
 *
 * ⚠️ 本条**不**断言版本号一致（product.json.version vs package.json.version）：
 *   dev 期 product.json 故意留占位 0.1.0，覆写它的是壳发布脚本 + 发布门禁
 *   （E6#57.15a②/#57.15d）——那是另一条任务，别在这里顺手加，加了必假红。
 *
 * ── 第二主体：安装器资源齐套（件 3a，判据 ④⑤⑥）──
 *   `build/installer/` 是自绘安装界面的家（引导器壳源码 ＋ 页面三件套 ＋ 词条）。它与 product.json
 *   同属「**少了不报错、只是白屏/半套**」那一类：页面三件套少一件 = 白屏，词条少一份 = 语言下拉空，
 *   生成器少了 = 产品态 exe 里没有内嵌页面（旁边也没有 app.html 可读）。
 *   两层的钩子与 product.json **刻意一致**（理由同一套）：
 *     ① 源层（默认模式，挂 `npm run check`）——**仓里那份源**在不在、口径对不对。`out/` 是
 *        .gitignore 的 ⇒ 「盘上有」不等于「仓里有」；这一层不需要任何产物，每次提交都能拦。
 *     ② 产物层（`--with-artifact`）——`out\` 里的 exe 与页面三件套真在、**不是旧货**（mtime 比源新）、
 *        词条副本与源逐字节相同、exe ≤5MB 预算。拦「改了源忘了 `build.cmd`」——README §三 坑 11
 *        就是这个：改完 `syswrite.cpp` 忘了重建，harness 绿的是**旧壳**。
 *
 * 用法：
 *   node scripts/check-packaging-files.mjs                  # ①②… 源层/配置层（npm run check）
 *   node scripts/check-packaging-files.mjs --with-artifact  # 含产物层（electron:build 尾部）
 *   node scripts/check-packaging-files.mjs --self-test      # 纯内存自测，不碰磁盘产物
 * 退出码 0 = 全过；1 = 有红拦（打印到 stderr）。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// @electron/asar 是 CJS（无 exports 字段）⇒ 走 default 导入再取键，最稳。
// ⚠️ 它此前只是 app-builder-lib 的**传递依赖**——本仓已把它显式写进 devDependencies
//    （memory [[phantom-transitive-browser-polyfill]] E6#16：隐形传递垫片不碰）。
import asarNamespace from "@electron/asar";

import { blockList, nestedValue } from "./lib/yaml-lite.mjs";

const asar = asarNamespace.default ?? asarNamespace;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BUILDER_YML = join(ROOT, "electron-builder.yml");
const PRODUCT_TS = join(ROOT, "electron", "product.ts");

/**
 * 🔴 契约字面量——`electron/product.ts` 的 `productJsonPath()` 期望形状。
 * 只在「现场抽取失败」时兜底，且兜底时会**大声**打一行（见 main）。
 */
const CONTRACT_REL = "electron/product.json";

// ─────────────────────────── 纯判据（可被 --self-test 注入输入） ───────────────────────────

/**
 * 从 electron/product.ts 现场抽出 product.json 相对 app 根的路径。
 * `join(app.getAppPath(), 'electron', 'product.json')` → `electron/product.json`。
 * 抽不出来 → null（调用方退回 CONTRACT_REL 并出声，**不静默跳过**）。
 */
function expectedRelFromProductTs(tsText) {
  const m = /join\(\s*app\.getAppPath\(\)\s*,([\s\S]*?)\)/.exec(tsText);
  if (!m) return null;
  const parts = [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((x) => x[1] ?? x[2])
    .filter((s) => s !== "");
  if (parts.length === 0) return null;
  const rel = parts.join("/");
  // 必须是 json 路径才算抽成功——只抽到半截（例如 'electron'）说明源码形状变了，
  // 与其拿半截路径去判红（误报），不如退回契约字面量并出声。
  return rel.endsWith(".json") ? rel : null;
}

/** 极简 glob → 正则：`**` 跨目录、`*` 不跨目录、`?` 单字符。 */
function globToRe(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** 判据①：配置层 `files:` 列表是否覆盖 expectedRel。 */
function checkConfigList(entries, expectedRel) {
  if (entries === null) {
    return { ok: false, msg: `① 配置层 —— electron-builder.yml 里找不到 \`files:\` 块（配置结构变了？）` };
  }
  if (entries.length === 0) {
    return {
      ok: false,
      msg: "① 配置层 —— `files:` 块在，但一条条目都抽不出来。\n      这不是「没问题」，是解析器不认了：先修 scripts/lib/yaml-lite.mjs 的 blockList()，别放行。",
    };
  }
  const positives = entries.filter((e) => !e.startsWith("!"));
  const negatives = entries.filter((e) => e.startsWith("!")).map((e) => e.slice(1));
  const included = positives.some((p) => globToRe(p).test(expectedRel));
  const excluded = negatives.some((n) => globToRe(n).test(expectedRel));

  if (!included) {
    return {
      ok: false,
      msg: `① 配置层 —— files: 白名单没有覆盖 \`${expectedRel}\`（现有 ${entries.length} 条）。\n      修法：往里加一行 \`- ${expectedRel}\`。少了它 ⇒ product.json 不进 asar ⇒\n      product.ts 的 readFileSync 抛错被吞 ⇒ updateUrl 退成空串 ⇒ 更新元数据腿整条失效且不报错。`,
    };
  }
  if (excluded) {
    return { ok: false, msg: `① 配置层 —— \`${expectedRel}\` 被取反条目排除掉了（! 开头那条）` };
  }
  return { ok: true, msg: `① 配置层 —— files: 覆盖 \`${expectedRel}\`` };
}

/** 判据②：asar 条目表里是否有 expectedRel（在 asar 内的**该目录下**，不是 asar 根）。 */
function checkAsarEntries(entries, expectedRel) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      ok: false,
      msg: "② 产物层 —— asar 条目表读不出来（空表）。\n      别当「没问题」放行：读不出条目 ⇒ 这条判据没在查，先修读表那一步。",
    };
  }
  const norm = entries.map((e) => String(e).replace(/\\/g, "/").replace(/^\/+/, ""));
  if (norm.includes(expectedRel)) {
    return { ok: true, msg: `② 产物层 —— asar 内确实有 \`${expectedRel}\`（共 ${norm.length} 条）` };
  }
  const base = expectedRel.split("/").pop();
  const rootHit = norm.includes(base);
  const hint = rootHit
    ? `\n      🔴 但 asar **根**上有一个 \`${base}\` —— 位置错了。product.ts 找的是 app.getAppPath()/${expectedRel}，\n      根上那份它读不到。electron-builder.yml 里别写成 \`- ${base}\`。`
    : `\n      （asar 内连 \`${base}\` 这个名字都没有。）`;
  return { ok: false, msg: `② 产物层 —— asar 里没有 \`${expectedRel}\`${hint}` };
}

/** 判据③：抽出来的内容能解析、且 updateUrl 非空。 */
function checkProductJsonContent(text) {
  if (typeof text !== "string") {
    return { ok: false, msg: "③ 内容层 —— product.json 读不出来（extractFile 失败）" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, msg: `③ 内容层 —— product.json 不是合法 JSON：${e.message}` };
  }
  const url = parsed?.updateUrl;
  if (typeof url !== "string" || url === "") {
    return {
      ok: false,
      msg: "③ 内容层 —— product.json 的 updateUrl 是空串。\n      这正是「文件缺失 ⇒ 退回 DEFAULT_PRODUCT」的兜底值，最隐蔽的一种：程序不报错，更新却整条失效。",
    };
  }
  return { ok: true, msg: `③ 内容层 —— updateUrl = ${url}` };
}

// ═══════════════ 第二主体：安装器资源齐套（件 3a，判据 ④⑤⑥） ═══════════════

const INSTALLER_DIR = join(ROOT, "build", "installer");
const BOOTSTRAPPER_DIR = join(INSTALLER_DIR, "bootstrapper");
const I18N_SRC_DIR = join(INSTALLER_DIR, "i18n");

/**
 * 🔴 契约字面量——引导器**必备源**（取舍同 assert-installer-name ①：从现场抽 ⇒ 有人删了源、
 * 清单跟着一起变 ⇒ 断言恒真 = 假门禁）。
 * 只列「少了就一定坏」的那些：壳、系统写入/进程守卫两模块、页面三件套、构建脚本、图标脚本、
 * 产品态 RCDATA 生成器。**不含** README / tools 下的测试脚本（那些是给人看的，不影响产物）。
 */
const BOOTSTRAPPER_REQUIRED = [
  "bootstrapper/main.cpp",
  "bootstrapper/syswrite.cpp",
  "bootstrapper/syswrite.h",
  "bootstrapper/lk-assoc-exts.generated.h",
  "bootstrapper/procguard.cpp",
  "bootstrapper/procguard.h",
  "bootstrapper/app.html",
  "bootstrapper/app.css",
  "bootstrapper/app.js",
  "bootstrapper/build.cmd",
  "bootstrapper/icon.rc",
  "bootstrapper/tools/gen-ui-rc.mjs",
  // 件 3b：随包字体（用户 2026-10-02 拍板只嵌拉丁子集）＋ OFL 许可文本。
  // 少了 woff2 ⇒ `@font-face` 静默 404、浏览器**默默**用回退体——不报错、只是变样，最难发现；
  // OFL.txt 少了则是许可不合规（SIL OFL 1.1 要求字体分发须随附许可副本）。
  "bootstrapper/fonts/newsreader-latin-400.woff2",
  "bootstrapper/fonts/newsreader-latin-400-italic.woff2",
  // 台账 §五 B：Geist 从来没生效过（评审页与实机都静默回落 Segoe UI）——补齐这套文件
  "bootstrapper/fonts/geist-latin-400.woff2",
  "bootstrapper/fonts/geist-mono-latin-400.woff2",
  "bootstrapper/fonts/OFL.txt",
];

/** **编进 exe** 的源——产物新鲜度的对照面：改其中任何一个而没重跑 `build.cmd` ⇒ exe 是旧货。 */
const BOOTSTRAPPER_COMPILE_SOURCES = [
  "bootstrapper/main.cpp",
  "bootstrapper/syswrite.cpp",
  "bootstrapper/syswrite.h",
  "bootstrapper/lk-assoc-exts.generated.h",
  "bootstrapper/procguard.cpp",
  "bootstrapper/procguard.h",
  "bootstrapper/icon.rc",
  // 字体与许可文本经 `gen-ui-rc.mjs` → `ui.res` 编进 exe（不是编译源，但同样决定产物内容）
  "bootstrapper/fonts/newsreader-latin-400.woff2",
  "bootstrapper/fonts/newsreader-latin-400-italic.woff2",
  "bootstrapper/fonts/geist-latin-400.woff2",
  "bootstrapper/fonts/geist-mono-latin-400.woff2",
  "bootstrapper/fonts/OFL.txt",
];

/** 页面三件套：`build.cmd` 拷进 `out\` **且**由 `gen-ui-rc.mjs` 编进 RCDATA（两态同一份源）。 */
const UI_FILES = ["app.html", "app.css", "app.js"];

/** 随包字体：同上两态，但开发态的副本落在 `out\fonts\`（子目录，故与 UI_FILES 分开判）。 */
const FONT_FILES = [
  "newsreader-latin-400.woff2",
  "newsreader-latin-400-italic.woff2",
  "geist-latin-400.woff2",
  "geist-mono-latin-400.woff2",
];

/** build.cmd 的体积预算（README §4.2「target ≤ 5MB single-file exe」）。 */
const BOOTSTRAPPER_MAX_BYTES = 5 * 1024 * 1024;

/**
 * 词条 key 口径（01 §五 §3.4「key 命名按屏」）：**以 `installer.` 起、点分段、每段全 ASCII 字母数字**。
 * 🔴 刻意**不**收紧到固定段数：本仓真实 key 面里 `installer.customize`（2 段）与
 * `installer.uninstall.confirm.keepdata.sub`（5 段）并存，钉段数 = 假红。
 * 这条判据拦的是**另一类**：漏了 `installer.` 前缀、段里混空格/中文、空段（`a..b`）、尾点。
 */
const I18N_KEY_RE = /^installer(\.[A-Za-z0-9]+)+$/;

/**
 * 判据④（源层）：必备源是否齐全。exists = (rel: string) => boolean（相对 build/installer/）。
 */
function checkInstallerSources(exists) {
  const missing = BOOTSTRAPPER_REQUIRED.filter((rel) => !exists(rel));
  if (missing.length > 0) {
    return {
      ok: false,
      msg:
        `④ 安装器源 —— 引导器缺 ${missing.length} 件：\n` +
        missing.map((rel) => `        - build/installer/${rel}`).join("\n") +
        `\n      🔴 别当「没就没」放过：少的是**随包进 exe 的资源**（页面三件套 / RCDATA 生成器 / 系统写入模块）。\n` +
        `      症状是白屏、语言下拉空、或注册表只写了半套——**都不报错**。`,
    };
  }
  return { ok: true, msg: `④ 安装器源 —— 引导器 ${BOOTSTRAPPER_REQUIRED.length} 件齐套` };
}

/**
 * 判据⑤（源层）：词条齐套与口径。
 * input = [{ name, text }]（`build/installer/i18n/*.json`，**含** `_` 前缀的预留位）；text=null = 读不出来。
 *
 * 只判四件事，**刻意不判 en 与 zh-CN 的键集对称**——件 1c 的 C3 用例（ja 只翻三条键、其余走回落）
 * 把「缺键回落」确立成了**设计**（01 §五 §3.4「加语言 = 加文件，零代码」），对称断言会与设计打架（假红）。
 */
function checkI18n(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, msg: "⑤ 词条 —— 源目录 build/installer/i18n/ 里一份词条都没有（语言清单会空）" };
  }
  const live = files.filter((f) => !String(f.name).startsWith("_")); // `_` 开头 = 预留位，不进清单（同宿主扫描口径）
  if (live.length === 0) {
    return {
      ok: false,
      msg: "⑤ 词条 —— 源目录里一份**非** `_` 开头的词条都没有。\n      `_` 前缀是预留位、不进语言清单（宿主 `readdir` 口径），只剩它们 = 语言下拉是空的。",
    };
  }
  if (!live.some((f) => f.name === "zh-CN.json")) {
    return {
      ok: false,
      msg:
        "⑤ 词条 —— 少了 `zh-CN.json`。它是回落链的**锚**（app.js：当前语言 → zh-CN → 标记里的原文 → key 名），\n" +
        "      删了它，**所有**语言的缺键都会一路掉到标记原文（英文/日文界面里混中文，或整片空白）。",
    };
  }
  const problems = [];
  for (const f of live) {
    if (typeof f.text !== "string") {
      problems.push(`${f.name}：读不出来`);
      continue;
    }
    let j;
    try {
      j = JSON.parse(f.text);
    } catch (e) {
      problems.push(`${f.name}：不是合法 JSON（${e.message}）`);
      continue;
    }
    if (j === null || typeof j !== "object" || Array.isArray(j)) {
      problems.push(`${f.name}：顶层不是对象`);
      continue;
    }
    const wantCode = String(f.name).replace(/\.json$/, "");
    if (j?._meta?.code !== wantCode) {
      problems.push(
        `${f.name}：\`_meta.code\` = ${JSON.stringify(j?._meta?.code)}，与文件名不符` +
          `（宿主把它当下拉 value、页面把它当 lang 值 ⇒ 不符会「选了没反应」）`
      );
    }
    const keys = Object.keys(j).filter((k) => k !== "_meta");
    const badKey = keys.filter((k) => !I18N_KEY_RE.test(k));
    if (badKey.length > 0) {
      problems.push(
        `${f.name}：${badKey.length} 个 key 不合 \`installer.<组>.<名>\` 口径 —— ` +
          `${badKey.slice(0, 3).join(", ")}${badKey.length > 3 ? " …" : ""}`
      );
    }
    const badVal = keys.filter((k) => typeof j[k] !== "string" || j[k].trim() === "");
    if (badVal.length > 0) {
      problems.push(
        `${f.name}：${badVal.length} 个词条是空串/非字符串 —— ` +
          `${badVal.slice(0, 3).join(", ")}${badVal.length > 3 ? " …" : ""}`
      );
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      msg: `⑤ 词条 —— ${problems.length} 处不合口径：\n` + problems.map((p) => `        - ${p}`).join("\n"),
    };
  }
  return { ok: true, msg: `⑤ 词条 —— ${live.length} 份齐套（zh-CN 锚在、口径对，共 ${live.length} 门语言）` };
}

/** 扫一个 i18n 目录成 `[{name, text}]`（读不出来给 text=null，不抛）。 */
function readI18nDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => {
      try {
        return { name, text: readFileSync(join(dir, name), "utf8") };
      } catch {
        return { name, text: null };
      }
    });
}

/**
 * 判据⑥（产物层）：`out\` 里的引导器产物真在、且不是旧货。
 * input = { exe: {size, mtimeMs} | null, compileSourcesMtime: number,
 *           ui: [{name, outExists, outMtime, srcMtime}], i18n: [{name, outExists, same}],
 *           fonts: [{name, outExists, outMtime, srcMtime}] }
 * 纯判定，读盘那一步在 collectBootstrapperArtifacts()。
 */
function checkBootstrapperArtifacts(info) {
  const problems = [];
  if (!info.exe) {
    problems.push("`out\\bootstrapper.exe` 不在 —— 先跑 build/installer/bootstrapper/build.cmd");
  } else {
    if (info.exe.size > BOOTSTRAPPER_MAX_BYTES) {
      problems.push(
        `\`out\\bootstrapper.exe\` = ${info.exe.size} 字节 > 5MB 预算` +
          `（build.cmd 里那道闸也会拦——这里再判一次是因为门禁不该只活在构建脚本里）`
      );
    }
    if (info.exe.mtimeMs < info.compileSourcesMtime) {
      problems.push(
        "`out\\bootstrapper.exe` **比编译源旧** —— 改了 .cpp/.h/icon.rc 却没重跑 build.cmd。\n" +
          "          这就是 README §三 坑 11：harness 会绿，但绿的是**旧壳**。"
      );
    }
  }
  for (const u of info.ui) {
    if (!u.outExists) problems.push(`\`out\\${u.name}\` 不在`);
    else if (u.outMtime < u.srcMtime)
      problems.push(`\`out\\${u.name}\` 比源旧 —— 改了页面没重跑 build.cmd`);
  }
  for (const i of info.i18n) {
    if (!i.outExists) problems.push(`\`out\\i18n\\${i.name}\` 不在 —— 语言清单会少这一门`);
    else if (!i.same) problems.push(`\`out\\i18n\\${i.name}\` 与源不一致 —— 改了词条没重跑 build.cmd`);
  }
  for (const f of info.fonts) {
    if (!f.outExists) problems.push(`\`out\\fonts\\${f.name}\` 不在 —— 开发态预览会静默用回退体`);
    else if (f.outMtime < f.srcMtime)
      problems.push(`\`out\\fonts\\${f.name}\` 比源旧 —— 换了字体没重跑 build.cmd`);
  }
  if (problems.length > 0) {
    return {
      ok: false,
      msg: `⑥ 引导器产物 —— ${problems.length} 处不合口：\n` + problems.map((p) => `        - ${p}`).join("\n"),
    };
  }
  return {
    ok: true,
    msg: `⑥ 引导器产物 —— exe ${info.exe.size} 字节（≤5MB）＋ 页面三件套新于源 ＋ 词条副本与源逐字相同 ＋ 字体副本新于源`,
  };
}

/** 读盘：把判据⑥要的现场收成一个纯数据对象。 */
function collectBootstrapperArtifacts() {
  const outDir = join(BOOTSTRAPPER_DIR, "out");
  const stat = (p) => {
    try {
      const s = statSync(p);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return null;
    }
  };
  const exe = stat(join(outDir, "bootstrapper.exe"));
  const compileSourcesMtime = BOOTSTRAPPER_COMPILE_SOURCES.reduce((mx, rel) => {
    const s = stat(join(INSTALLER_DIR, rel));
    return s ? Math.max(mx, s.mtimeMs) : mx;
  }, 0);
  const srcFiles = readI18nDir(I18N_SRC_DIR);
  return {
    exe,
    compileSourcesMtime,
    ui: UI_FILES.map((name) => {
      const src = stat(join(BOOTSTRAPPER_DIR, name));
      const out = stat(join(outDir, name));
      return { name, outExists: out !== null, outMtime: out?.mtimeMs ?? 0, srcMtime: src?.mtimeMs ?? 0 };
    }),
    i18n: srcFiles.map((f) => {
      const out = join(outDir, "i18n", f.name);
      if (!existsSync(out)) return { name: f.name, outExists: false, same: false };
      let same = false;
      try {
        same = readFileSync(out, "utf8") === f.text;
      } catch {
        same = false;
      }
      return { name: f.name, outExists: true, same };
    }),
    fonts: FONT_FILES.map((name) => {
      const src = stat(join(BOOTSTRAPPER_DIR, "fonts", name));
      const out = stat(join(outDir, "fonts", name));
      return { name, outExists: out !== null, outMtime: out?.mtimeMs ?? 0, srcMtime: src?.mtimeMs ?? 0 };
    }),
  };
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  // 现场文本一律用「本仓真实形状」的片段——注释行必须被跳过，这是实际配置里的情况。
  const YAML_OK = [
    "files:",
    "  - dist/**/*",
    "  - dist-electron/**/*",
    "  - package.json",
    "  - node_modules/**/*",
    "  - electron/product.json",
    "  # 🔴 块内注释：必须被跳过，不能被当成条目",
    "  - build/icon.ico",
    "",
  ].join("\n");
  // 修复前的真实形状（2026-09-12 之前 electron-builder.yml 就是这 4 条）
  const YAML_BEFORE_FIX = [
    "files:",
    "  - dist/**/*",
    "  - dist-electron/**/*",
    "  - package.json",
    "  - node_modules/**/*",
    "",
  ].join("\n");
  const YAML_ROOT_WRONG = ["files:", "  - dist/**/*", "  - product.json", ""].join("\n");
  const YAML_NO_FILES = ["appId: com.linkdesk.app", "asar: true", ""].join("\n");
  const YAML_GLOB_OK = ["files:", "  - dist/**/*", "  - electron/**/*", ""].join("\n");
  const YAML_NEGATED = [
    "files:",
    "  - dist/**/*",
    "  - electron/product.json",
    '  - "!electron/product.json"',
    "",
  ].join("\n");

  const REQUIRED = "electron/product.json";
  const list = (y) => blockList(y, "files");

  // 真实 asar 形状（2026-09-12 实测：打包后顶层 = 这 5 个）
  const ASAR_OK = [
    "\\node_modules",
    "\\dist-electron",
    "\\dist",
    "\\electron",
    "\\electron\\product.json",
    "\\package.json",
  ];
  // 修复前的真实 asar 形状（顶层 4 个，没有 electron 目录）
  const ASAR_BEFORE_FIX = ["\\node_modules", "\\dist-electron", "\\dist", "\\package.json"];
  const ASAR_ROOT = ["\\dist", "\\product.json", "\\package.json"];
  const ASAR_EMPTY = [];

  const REAL_CONTENT = JSON.stringify(
    {
      nameLong: "LinkDesk",
      version: "0.1.0",
      updateUrl: "https://api.github.com/repos/encaron/linkdesk/releases/latest",
    },
    null,
    2
  );

  // 件 3a 夹具：词条（形状照本仓真实两份）与产物现场（纯数据，不读盘）
  const I18N_OK = [
    {
      name: "zh-CN.json",
      text: JSON.stringify({ _meta: { code: "zh-CN", label: "中文" }, "installer.home.title": "安装就一步" }),
    },
    {
      name: "en.json",
      text: JSON.stringify({ _meta: { code: "en", label: "English" }, "installer.home.title": "One step" }),
    },
  ];
  const ART_OK = {
    exe: { size: 3_000_000, mtimeMs: 2000 },
    compileSourcesMtime: 1000,
    ui: UI_FILES.map((name) => ({ name, outExists: true, outMtime: 2000, srcMtime: 1000 })),
    i18n: [
      { name: "zh-CN.json", outExists: true, same: true },
      { name: "en.json", outExists: true, same: true },
    ],
    fonts: FONT_FILES.map((name) => ({ name, outExists: true, outMtime: 2000, srcMtime: 1000 })),
  };

  const cases = [
    // 判据①
    ["① 配置层", checkConfigList(list(YAML_OK), REQUIRED), true],
    ["① 配置层(修复前形状)", checkConfigList(list(YAML_BEFORE_FIX), REQUIRED), false],
    ["① 配置层(写成 asar 根)", checkConfigList(list(YAML_ROOT_WRONG), REQUIRED), false],
    ["① 配置层(无 files 块)", checkConfigList(list(YAML_NO_FILES), REQUIRED), false],
    ["① 配置层(等价 glob)", checkConfigList(list(YAML_GLOB_OK), REQUIRED), true],
    ["① 配置层(被取反排除)", checkConfigList(list(YAML_NEGATED), REQUIRED), false],
    ["① 配置层(空表)", checkConfigList([], REQUIRED), false],
    // 判据②
    ["② 产物层", checkAsarEntries(ASAR_OK, REQUIRED), true],
    ["② 产物层(修复前形状)", checkAsarEntries(ASAR_BEFORE_FIX, REQUIRED), false],
    ["② 产物层(错放 asar 根)", checkAsarEntries(ASAR_ROOT, REQUIRED), false],
    ["② 产物层(空表)", checkAsarEntries(ASAR_EMPTY, REQUIRED), false],
    // 判据③
    ["③ 内容层", checkProductJsonContent(REAL_CONTENT), true],
    ["③ 内容层(updateUrl 空串)", checkProductJsonContent(REAL_CONTENT.replace(/"https[^"]*"/, '""')), false],
    ["③ 内容层(坏 JSON)", checkProductJsonContent("{ not json"), false],
    // 路径抽取（真值来源）
    [
      "路径抽取(现场)",
      {
        ok:
          expectedRelFromProductTs("return join(app.getAppPath(), 'electron', 'product.json');") ===
          REQUIRED,
        msg: "expectedRelFromProductTs",
      },
      true,
    ],
    [
      "路径抽取(源码形状变了 ⇒ 退回契约)",
      { ok: expectedRelFromProductTs("const p = getPath();") === null, msg: "null" },
      true,
    ],
    // ── 判据④：安装器必备源（件 3a）──
    ["④ 安装器源", checkInstallerSources(() => true), true],
    ["④ 安装器源(少一件页面三件套)", checkInstallerSources((rel) => rel !== "bootstrapper/app.js"), false],
    ["④ 安装器源(少 RCDATA 生成器)", checkInstallerSources((rel) => rel !== "bootstrapper/tools/gen-ui-rc.mjs"), false],
    ["④ 安装器源(空目录)", checkInstallerSources(() => false), false],
    // ── 判据⑤：词条齐套与口径（件 3a）──
    ["⑤ 词条", checkI18n(I18N_OK), true],
    [
      "⑤ 词条(缺 zh-CN 锚)",
      checkI18n([{ name: "en.json", text: JSON.stringify({ _meta: { code: "en" }, "installer.home.title": "x" }) }]),
      false,
    ],
    [
      "⑤ 词条(code 与文件名不符)",
      checkI18n([{ name: "zh-CN.json", text: JSON.stringify({ _meta: { code: "zh" }, "installer.home.title": "x" }) }]),
      false,
    ],
    [
      "⑤ 词条(key 不合 installer. 前缀口径)",
      checkI18n([{ name: "zh-CN.json", text: JSON.stringify({ _meta: { code: "zh-CN" }, homeTitle: "x" }) }]),
      false,
    ],
    [
      "⑤ 词条(key 段里混空格)",
      checkI18n([{ name: "zh-CN.json", text: JSON.stringify({ _meta: { code: "zh-CN" }, "installer.home title": "x" }) }]),
      false,
    ],
    [
      "⑤ 词条(两段 key `installer.customize` ⇒ 合规，本仓真实存在)",
      checkI18n([{ name: "zh-CN.json", text: JSON.stringify({ _meta: { code: "zh-CN" }, "installer.customize": "自定义" }) }]),
      true,
    ],
    [
      "⑤ 词条(空串值)",
      checkI18n(I18N_OK.map((f) => (f.name === "en.json" ? { ...f, text: JSON.stringify({ _meta: { code: "en" }, "installer.home.title": "" }) } : f))),
      false,
    ],
    ["⑤ 词条(坏 JSON)", checkI18n([{ name: "zh-CN.json", text: "{ not json" }]), false],
    ["⑤ 词条(读不出来)", checkI18n([{ name: "zh-CN.json", text: null }]), false],
    [
      "⑤ 词条(只有 `_` 前缀的预留位)",
      checkI18n([
        { name: "_template.json", text: JSON.stringify({ _meta: { code: "x" }, "installer.home.title": "x" }) },
      ]),
      false,
    ],
    ["⑤ 词条(空目录)", checkI18n([]), false],
    // ⭐ 这一条钉住「**刻意不判对称**」：ja 只翻一条键、其余走回落，是本仓确立的设计（件 1c C3）
    [
      "⑤ 词条(第三语言只翻一条键 ⇒ 合规，回落是设计不是缺漏)",
      checkI18n([
        ...I18N_OK,
        { name: "ja.json", text: JSON.stringify({ _meta: { code: "ja" }, "installer.home.title": "ワンステップ" }) },
      ]),
      true,
    ],
    [
      "⑤ 词条(zh-CN 里带 _ 前缀键共存 ⇒ 只 _meta 被豁免，别的 _ 键要判)",
      checkI18n([{ name: "zh-CN.json", text: JSON.stringify({ _meta: { code: "zh-CN" }, _note: "预留", "installer.home.title": "x" }) }]),
      false,
    ],
    // ── 判据⑥：引导器产物（件 3a）──
    ["⑥ 引导器产物", checkBootstrapperArtifacts(ART_OK), true],
    ["⑥ 引导器产物(exe 缺)", checkBootstrapperArtifacts({ ...ART_OK, exe: null }), false],
    [
      "⑥ 引导器产物(exe 比编译源旧 ⇒ 坑 11 旧壳)",
      checkBootstrapperArtifacts({ ...ART_OK, compileSourcesMtime: 9000 }),
      false,
    ],
    ["⑥ 引导器产物(超 5MB 预算)", checkBootstrapperArtifacts({ ...ART_OK, exe: { size: 6 * 1024 * 1024, mtimeMs: 2000 } }), false],
    ["⑥ 引导器产物(页面三件套旧)", checkBootstrapperArtifacts({ ...ART_OK, ui: ART_OK.ui.map((u) => (u.name === "app.css" ? { ...u, outMtime: 1 } : u)) }), false],
    ["⑥ 引导器产物(页面三件套缺)", checkBootstrapperArtifacts({ ...ART_OK, ui: ART_OK.ui.map((u) => (u.name === "app.js" ? { ...u, outExists: false } : u)) }), false],
    ["⑥ 引导器产物(词条副本不一致)", checkBootstrapperArtifacts({ ...ART_OK, i18n: [{ name: "en.json", outExists: true, same: false }] }), false],
    ["⑥ 引导器产物(词条副本缺)", checkBootstrapperArtifacts({ ...ART_OK, i18n: [{ name: "en.json", outExists: false, same: false }] }), false],
    ["⑥ 引导器产物(字体副本缺)", checkBootstrapperArtifacts({ ...ART_OK, fonts: ART_OK.fonts.map((f) => ({ ...f, outExists: false })) }), false],
    ["⑥ 引导器产物(字体副本旧)", checkBootstrapperArtifacts({ ...ART_OK, fonts: ART_OK.fonts.map((f) => (f.name.endsWith("italic.woff2") ? { ...f, outMtime: 1 } : f)) }), false],
  ];

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    const want = wantOk ? "应过" : "应红";
    process.stdout.write(
      `${pass ? "✅" : "🔴"} ${tag} ${want} —— 实得 ${result.ok ? "过" : "红"}\n`
    );
    if (!pass) fail(result.msg);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例：负例确实会红、正例确实会过）——门禁不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const checks = [];

  // 目标路径：现场读 product.ts（真值）；抽不出来 ⇒ 大声退回契约字面量，绝不静默跳过。
  let expectedRel = CONTRACT_REL;
  try {
    const tsText = readFileSync(PRODUCT_TS, "utf8");
    const live = expectedRelFromProductTs(tsText);
    if (live === null) {
      process.stderr.write(
        `⚠️  抽取失败：没能从 ${PRODUCT_TS} 的 productJsonPath() 里读出 product.json 路径，` +
          `本次退回契约字面量 ${CONTRACT_REL}。\n    这不是「没问题」——是现场读取的抽取器不认新写法了，` +
          `请核对 product.ts 并同步 expectedRelFromProductTs()。\n`
      );
    } else if (live !== CONTRACT_REL) {
      process.stderr.write(
        `⚠️  现场抽出的路径 = ${live}，与契约字面量 ${CONTRACT_REL} 不同。\n    本次以**现场为准**（product.ts 是消费方 = 真值）；请同步更新本文件头注与 electron-builder.yml 注释。\n`
      );
      expectedRel = live;
    } else {
      expectedRel = live;
    }
  } catch (e) {
    process.stderr.write(
      `⚠️  读不到 ${PRODUCT_TS}（${e.message}），本次退回契约字面量 ${CONTRACT_REL}。\n`
    );
  }

  // ① 配置层
  const yamlText = readFileSync(BUILDER_YML, "utf8");
  checks.push(checkConfigList(blockList(yamlText, "files"), expectedRel));

  // ④⑤ 安装器资源（源层：不需要任何产物 ⇒ 每次提交都能拦「有人删了源 / 改坏了词条口径」）
  checks.push(checkInstallerSources((rel) => existsSync(join(INSTALLER_DIR, rel))));
  checks.push(checkI18n(readI18nDir(I18N_SRC_DIR)));

  // ②③ 产物层（仅在显式要求时跑；缺产物判红，不跳过）
  if (process.argv.includes("--with-artifact")) {
    const outDirRaw = nestedValue(yamlText, "directories", "output") ?? "dist";
    const asarPath = join(resolve(ROOT, outDirRaw), "win-unpacked", "resources", "app.asar");

    if (!existsSync(asarPath)) {
      checks.push({
        ok: false,
        msg: `② 产物层 —— 找不到打包产物：${asarPath}\n      本模式只该挂在 electron:build 尾部跑；产物不在 ⇒ 这条判据没在查，判红（不静默跳过）。`,
      });
    } else {
      const entries = asar.listPackage(asarPath);
      checks.push(checkAsarEntries(entries, expectedRel));
      let text = null;
      try {
        text = asar.extractFile(asarPath, expectedRel).toString("utf8");
      } catch (e) {
        text = null;
        process.stderr.write(`⚠️  extractFile 抛错：${e.message}\n`);
      }
      checks.push(checkProductJsonContent(text));
    }

    // ⑥ 引导器产物（同一钩子：electron:build 尾部——那时 build.cmd 刚跑过，缺产物判红不跳过）
    checks.push(checkBootstrapperArtifacts(collectBootstrapperArtifacts()));
  }

  for (const c of checks) {
    process.stdout.write(`${c.ok ? "✅" : "🔴"} ${c.msg}\n`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    fail(
      `目标路径：${expectedRel}\n  配置：${BUILDER_YML}\n  安装器资源：${INSTALLER_DIR}\n  （两层判据的分工与病根见本文件头注）`
    );
    process.exit(1);
  }
}

main();
