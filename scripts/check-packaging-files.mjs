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
 * 用法：
 *   node scripts/check-packaging-files.mjs                  # ① 配置层（npm run check）
 *   node scripts/check-packaging-files.mjs --with-artifact  # ①+② 产物层（electron:build 尾部）
 *   node scripts/check-packaging-files.mjs --self-test      # 纯内存自测，不碰磁盘产物
 * 退出码 0 = 全过；1 = 有红拦（打印到 stderr）。
 */

import { existsSync, readFileSync } from "node:fs";
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
  }

  for (const c of checks) {
    process.stdout.write(`${c.ok ? "✅" : "🔴"} ${c.msg}\n`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    fail(
      `目标路径：${expectedRel}\n  配置：${BUILDER_YML}\n  （两层判据的分工与病根见本文件头注）`
    );
    process.exit(1);
  }
}

main();
