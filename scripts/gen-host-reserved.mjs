#!/usr/bin/env node
/**
 * 宿主保留面账（`scripts/host-reserved.json`）——**生成 ＋ 四向对账**。
 *
 * 是什么：宿主自己占用的名字，分六个家族——命令前缀 / `app.*` 配置键 / 伪 pluginId /
 *   context key / 兜底外观 id / 内置协议 id。插件不得占用这些名字；改动本账 = 一次公共面决策。
 * 出处与判据（唯一真源，本文不重述）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/02-任务-命令id归属落地.md` §六
 *   ＋ 1.31 评估档 §八（机制 A：宿主保留名账进 SDK）。
 *
 * ── 角色变更（E6#111b）──
 *   E6#109j 时它只是**生成侧原型**（文件头自述「只写不读」「无开关、无自测」）；1.32 升为**门禁**：
 *     · 默认跑        = 生成：写壳账 ＋ SDK 副本 ＋ 运行时模块（`npm run audit:plugin-scope:regen`）
 *     · `--check`     = 只读对账，挂 `npm run check`
 *     · `--self-test` = 正控 3 ＋ 负控 8（正控绿 / 负控红）
 *
 * ── 四向对账（`--check` 的判据）──
 *   ① **实况 → 账**：现场重扫（壳源码）扫到、账里没有 ⇒ 红。典型成因：改了宿主命令/设置面**忘了重跑**。
 *   ② **账 → 实况**：账里列了、现场扫不到 ⇒ 红。典型成因：账陈旧、被人手改、那条已被删。
 *   ③ **SDK 副本 ↔ 壳账**：`packages/plugin-sdk/schemas/host-reserved.json` 与壳账**逐字节**相等。
 *      🔴 这一向不是冗余：副本随 npm 包下发，漂了 = **第三方作者读到的判据是过期的**（那一侧的校验
 *      永远绿，而门禁以为自己守住了）。照 `reserved-class-names.json` 的单一真相源形状。
 *   ④ **运行时模块 ↔ 壳账**（E6#111d／1.34 新增）：`src/core/registry/host-reserved.generated.ts`
 *      与账的 `configKeys` / `pseudoPluginIds` **逐元素**相等。壳运行时判保护区读的就是它——
 *      漂了 = **运行时拦的和门禁报的不是同一本账**（最坏的那种漂：两边都「绿」）。
 *   外加两条「不许静默放过」的守门（照 `check-reserved-names-doc-sync.mjs` 的 `table-missing` 口径）：
 *     · 家族**整段缺失** ⇒ 红（段被删/改名，后面的逐条比对就没有意义了）；
 *     · 家族**为空数组** ⇒ 红（扫描器瞎了、目录被搬走时，空家族会**假装**对账通过——这条是给
 *       「宿主把 `src/core/commands` 挪个位置」这类重构留的报警器）。
 *
 * ── 第四份产物：运行时保留面模块（E6#111d／1.34 新增）──
 *   `src/core/registry/host-reserved.generated.ts`——壳**运行时**判保护区用的静态副本（只带
 *   `configKeys` ＋ `pseudoPluginIds` 两个家族）。**为什么必须有**：宿主真键里有**从未被注册**的
 *   `app.schemaVersion`（`settings.json` 的内部标志键，设置 UI 不可见），靠「宿主注册在先」这条
 *   顺序事实判不出来，而**正确性不许押在注册顺序上**（1.33 §11.1 裁决）⇒ 只剩「生成式静态常量」这条路。
 *
 * ── `configKeys` 家族的扫描口径（1.34 扩宽：28 → 35）──
 *   ① `src/App/config/**` **非测试**文件的 `"app.*"` 字面量（含迁移点名的**退役键**——退役键不腾位）
 *   ② `src/App/startup.ts` 的 `"app.*"` 字面量（含仍在读/删的退役键，如 `app.themeColorMode`）
 *   ③ `SCHEMA_VERSION_KEY` 的值（未注册的内部标志键）
 *   🔴 **口径为什么是「文件清单」而不是「src 全域」**：实测 src/ 全域另有一批**同名不同物**的
 *     `app.*` 字面量——命令 id（`app.about` / `app.viewLicense`）、主题种子 token（`app.surfaceTexture`）、
 *     测试夹具（`app.staleA` / `app.staleB` / `app.extra` / `app.plain`）⇒ 全扫会把它们灌进配置键家族
 *     （**假账**：无辜插件会被拒），比缺口更坏。
 *   ⚠️ ② 取**任意形态**（不限于 `"app.x": {`）是有意的：错放 = 名字多保留一个（账 diff 里看得见）；
 *     错漏 = 插件**静默顶替**宿主键（看不见）。两害相权取保守的一侧。
 *
 * ── 口径 ──
 *   六个家族比的都是**名字集合**（生成侧已去重 ＋ 字典序排序）；**顺序不同不算漂移，多一个少一个才算**。
 *   本账记的是「有哪些名字」（名），不是「出现过几处」（处/站点）——数量口径的读数在探针
 *   `scripts/audit-plugin-scope.mjs` 出，两者的口径不可互相引用。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

/** 壳账（生成式产物，唯一真相源） */
const LEDGER_REL = "scripts/host-reserved.json";
/** SDK 副本（随包下发，与壳账逐字节相等） */
const SDK_REL = "packages/plugin-sdk/schemas/host-reserved.json";
/** 运行时副本（壳运行时判保护区读它——见文件头「第四份产物」） */
const RUNTIME_REL = "src/core/registry/host-reserved.generated.ts";

/** 六个家族——键名 ＋ 中文标签（报错文本与自测共用，避免两处各写一份） */
export const FAMILIES = [
  { key: "commandPrefixes", label: "宿主命令前缀" },
  { key: "configKeys", label: "宿主 app.* 配置键" },
  { key: "pseudoPluginIds", label: "宿主伪 pluginId" },
  { key: "contextKeys", label: "宿主机读/写的 context key" },
  { key: "appearanceIds", label: "宿主兜底外观 id" },
  { key: "protocolIds", label: "宿主内置协议 id" },
];

const LEDGER_COMMENT =
  "宿主保留面账（生成式·定稿 E6#111b／1.32）——插件不得占用这些名字；改动本账 = 一次公共面决策，" +
  "改完壳仓命令/设置/协议面必须重跑 scripts/gen-host-reserved.mjs（npm run audit:plugin-scope:regen）。" +
  "⚠️ configKeys 含**退役键**（曾被宿主使用、现已不再写入的键）：退役键**不腾出保留面**——" +
  "老 settings.json 里可能还留着值，插件此刻占它 = 顶掉的是宿主的历史数据（且迁移代码仍会读它）。";

function walk(dir, f, out = []) {
  let e;
  try {
    e = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const x of e) {
    if (["node_modules", ".git", "dist"].includes(x.name)) continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) walk(p, f, out);
    else if (f(p)) out.push(p);
  }
  return out;
}

/** 读一个文件，读不到返回 ""（扫描源缺失 ⇒ 少几条账项，由对账的 family-empty／ledger-missing 兜） */
function tryRead(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * 现场重扫壳仓 → 账对象（五个家族，均已去重 ＋ 字典序）。
 * ⚠️ 扫描口径就是本函数：**改了扫描口径 = 改了公共面判据**，同笔在 §六 记一笔。
 * @param {string} [root] 壳仓根（自测可传 fixture 根；不传 = 真仓）
 */
export function collectHostReserved(root = ROOT) {
  /* ① 宿主命令前缀 */
  const prefix = new Set();
  for (const f of walk(path.join(root, "src", "core", "commands"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/command:\s*"([a-zA-Z][^"]*)"/g)) {
      prefix.add(m[1].split(".")[0] + ".");
    }
  }
  /* ② 宿主 app.* 配置键（E6#111d／1.34 扩口径 = 三源，见文件头「configKeys 家族的扫描口径」） */
  const keys = new Set();
  for (const f of walk(path.join(root, "src", "App", "config"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/"(app\.[a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  }
  for (const m of tryRead(path.join(root, "src", "App", "startup.ts")).matchAll(/"(app\.[a-zA-Z0-9_.]+)"/g)) {
    keys.add(m[1]);
  }
  {
    const m = tryRead(path.join(root, "src", "core", "services", "configuration", "schemaMigrations.ts")).match(
      /SCHEMA_VERSION_KEY\s*=\s*"(app\.[a-zA-Z0-9_.]+)"/,
    );
    if (m) keys.add(m[1]);
  }
  /* ③ 宿主伪 pluginId */
  const pseudo = ["app"];
  for (const f of walk(path.join(root, "src", "App"), (x) => x.endsWith(".ts"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/registerConfiguration\(\s*"([a-z][a-z0-9-]*)"/g)) pseudo.push(m[1]);
  }
  /* ④ 宿主/共享组件写入 ＋ 宿主 when 读取的 context key */
  const ctxWrite = new Set(),
    ctxRead = new Set();
  for (const f of walk(path.join(root, "src"), (x) => /\.tsx?$/.test(x) && !x.includes(".test."))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/ContextKeyService\.setValue\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
    for (const m of src.matchAll(/contextKey[?.]*\.set[?.]*\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
    for (const m of src.matchAll(/when:\s*["'`]([^"'`]+)["'`]/g)) {
      for (const t of m[1].split(/[^A-Za-z0-9_]+/)) {
        if (!t || ["true", "false", "and", "or", "not", "in", "regex"].includes(t)) continue;
        if (/^[a-z]/.test(t)) ctxRead.add(t);
      }
    }
  }
  for (const k of ["activeEditor", "editorHasSelection", "editorCount"]) {
    ctxWrite.add(k);
    ctxRead.add(k);
  }
  /* ⑤ 宿主兜底外观 id —— 从 registerFallbackThemes 体内取 id: "..."（配方 id ＋ 配色变体 id） */
  const appearance = new Set();
  {
    const f = path.join(root, "src", "core", "services", "ui", "ThemeEngine", "registry.ts");
    const src = fs.readFileSync(f, "utf8");
    const at = src.indexOf("export function registerFallbackThemes");
    const body = src.slice(at, at + 1200);
    for (const m of body.matchAll(/\bid:\s*"([^"]+)"/g)) appearance.add(m[1]);
  }
  /* ⑤b updateActionable / updateButtonLabel —— 以常量注册（非字面量），补上 */
  {
    const f = path.join(root, "src", "core", "commands", "shell", "updateCommands.ts");
    for (const m of fs.readFileSync(f, "utf8").matchAll(/export const UPDATE_[A-Z_]*KEY\s*=\s*"([^"]+)"/g)) {
      ctxWrite.add(m[1]);
      ctxRead.add(m[1]);
    }
  }
  /* ⑥ 宿主内置协议 id —— `registerProtocol({ id: "..." })` 的宿主写入点（与命令 id 同一个全局名册，
   *    E6#111b 判据⑦：插件协议 id 不得撞它。今日唯一写入点 = 内置方括号协议） */
  const protocols = new Set();
  for (const f of walk(path.join(root, "src"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/registerProtocol\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["']([^"']+)["']/g)) protocols.add(m[1]);
  }

  return {
    $comment: LEDGER_COMMENT,
    commandPrefixes: [...prefix].sort(),
    configKeys: [...keys].sort(),
    pseudoPluginIds: [...new Set(pseudo)].sort(),
    contextKeys: [...new Set([...ctxWrite, ...ctxRead])].sort(),
    appearanceIds: [...appearance].sort(),
    protocolIds: [...protocols].sort(),
  };
}

/**
 * 账 vs 实况逐家族对账（纯函数，`--self-test` 与真跑共用）。
 * @returns {{kind:string,msg:string}[]}
 */
export function diffFamilies(ledger, actual) {
  const violations = [];
  for (const f of FAMILIES) {
    const L = ledger?.[f.key];
    const A = actual?.[f.key];
    if (!Array.isArray(L) || !Array.isArray(A)) {
      violations.push({
        kind: "family-missing",
        msg:
          `「${f.label}」（${f.key}）段缺失：${Array.isArray(L) ? "实况扫描" : "账"}一侧没有这个数组。` +
          `——门禁的射程就是这五个家族；家族被删/改名，逐条比对就失去意义（不许静默放过）。` +
          `若确实要改家族构成，请同笔改 scripts/gen-host-reserved.mjs 的 FAMILIES 与 §六 判据。`,
      });
      continue;
    }
    if (A.length === 0 || L.length === 0) {
      violations.push({
        kind: "family-empty",
        msg:
          `「${f.label}」（${f.key}）是空家族（${A.length === 0 ? "实况扫描" : "账"}一侧为空）。` +
          `——宿主不可能一个都没有：空家族只会出现在「扫描目录被搬走/改名」或「账段被清空」时，` +
          `而它会让对账**假装通过**。红在这里是为了逼一次核对，不是逼你删掉这一条。`,
      });
      continue;
    }
    const ls = new Set(L);
    const as = new Set(A);
    const missing = A.filter((n) => !ls.has(n)); // 实况有、账里没有
    const stale = L.filter((n) => !as.has(n)); // 账里有、实况没有
    if (missing.length > 0) {
      violations.push({
        kind: "ledger-missing",
        msg:
          `「${f.label}」：现场有而账里没有 [${missing.join(", ")}]——多半是改了宿主命令/设置面**忘了重跑**。` +
          `改法：npm run audit:plugin-scope:regen（生成式账不许手补）。`,
      });
    }
    if (stale.length > 0) {
      violations.push({
        kind: "ledger-stale",
        msg:
          `「${f.label}」：账里列了而现场扫不到 [${stale.join(", ")}]——账陈旧、被手改，或那条真的没了。` +
          `改法：确认它确实不存在后跑 npm run audit:plugin-scope:regen（regen 会据此重写，不留旧项）。`,
      });
    }
  }
  return violations;
}

/** SDK 副本 ↔ 壳账（逐字节；纯函数） */
export function diffSdk(sdkRaw, ledgerRaw) {
  if (sdkRaw == null) {
    return [
      {
        kind: "sdk-missing",
        msg:
          `SDK 副本不存在：${SDK_REL}——插件作者侧的新规则读的就是这一份，缺了等于判据没下发。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  if (sdkRaw !== ledgerRaw) {
    return [
      {
        kind: "sdk-drift",
        msg:
          `SDK 副本与壳账**逐字节不同**（${SDK_REL} vs ${LEDGER_REL}）——两份必须同源。` +
          `🔴 副本随 npm 包下发：漂了 = 第三方作者读到的判据是过期的（他那侧全绿，而这里以为守住了）。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  return [];
}

/** 三向合并（`--check` 与自测共用的唯一入口） */
export function checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw, runtimeExpected }) {
  return [
    ...diffFamilies(ledger, actual),
    ...diffSdk(sdkRaw, ledgerRaw),
    ...diffRuntime(runtimeRaw, runtimeExpected ?? renderRuntimeModule(ledger)),
  ];
}

/**
 * 渲染运行时保留面模块（纯函数——生成与 `--check` 第四向**共用同一份渲染**，⛔ 不许两处各写一份）。
 * 只带运行时真正要用的两个家族：`configKeys`（保护区）＋ `pseudoPluginIds`（宿主身份判别）。
 * ⚠️ 另外四个家族（命令前缀 / context key / 外观 id / 协议 id）**故意不进运行时**：它们的判据在
 *   作者侧门禁（SDK lint）出，壳运行时不需要它们——塞进来只会多一份要同步的东西。
 */
export function renderRuntimeModule(reserved) {
  const arr = (name, values) =>
    `export const ${name}: readonly string[] = [\n${values.map((v) => `  ${JSON.stringify(v)},`).join("\n")}\n];\n`;
  return `/**
 * 🔴 **生成式文件——别手改。** 生成器 = \`scripts/gen-host-reserved.mjs\`（\`npm run audit:plugin-scope:regen\`）。
 *
 * 是什么：宿主保留面的**运行时副本**——壳运行时（\`ConfigurationRegistry\`）用它判两件事：
 *   · \`HOST_RESERVED_CONFIG_KEYS\`——插件不得占用的宿主配置键（保护区；撞了 ⇒ 拒绝注册 ＋ console.error）
 *   · \`HOST_PSEUDO_PLUGIN_IDS\`——宿主自己的注册身份（\`app\` = 壳通用 / \`appearance\` = 外观 / \`update\` = 更新）
 *
 * 为什么运行时需要一份**静态**副本（而不是「看谁先注册」）：
 *   宿主真键里有**从未被注册**的（\`app.schemaVersion\`——settings.json 的内部标志键），
 *   靠「宿主注册在先」这条顺序事实判不出来。**正确性不许押在注册顺序上**（1.33 §11.1 裁决）。
 *
 * 三份同源：壳账 \`scripts/host-reserved.json\` · SDK 副本 \`packages/plugin-sdk/schemas/host-reserved.json\`
 *   · 本文件。漂移由 \`node scripts/gen-host-reserved.mjs --check\` 拦（四向对账）。
 */
${arr("HOST_RESERVED_CONFIG_KEYS", reserved.configKeys)}
${arr("HOST_PSEUDO_PLUGIN_IDS", reserved.pseudoPluginIds)}`;
}

/** 运行时模块 ↔ 壳账（逐元素；纯函数。缺 = missing，内容不同 = drift） */
export function diffRuntime(runtimeRaw, expectedRaw) {
  if (runtimeRaw == null) {
    return [
      {
        kind: "runtime-missing",
        msg:
          `运行时保留面模块不存在：${RUNTIME_REL}——壳运行时判保护区读的就是它，缺了等于保护区当场失效。` +
          `改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  if (runtimeRaw !== expectedRaw) {
    return [
      {
        kind: "runtime-drift",
        msg:
          `运行时保留面模块与壳账不一致（${RUNTIME_REL}）——运行时拦的键和门禁报的键不是同一本账，` +
          `而这种漂**两边都显示为绿**（运行时不会报"我这份是旧的"）。改法：npm run audit:plugin-scope:regen。`,
      },
    ];
  }
  return [];
}

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */
function fixture() {
  const ledger = {
    $comment: LEDGER_COMMENT,
    commandPrefixes: ["app.", "view."],
    configKeys: ["app.theme"],
    pseudoPluginIds: ["app"],
    contextKeys: ["inputFocus"],
    appearanceIds: ["dark"],
    protocolIds: ["bracket"],
  };
  const raw = JSON.stringify(ledger, null, 2) + "\n";
  return { ledger, raw, actual: JSON.parse(JSON.stringify(ledger)) };
}

function selfTest() {
  const cases = [];
  const T = (name, mutate = () => ({}), kinds = []) => {
    const f = fixture();
    const r = mutate(f) ?? {};
    const ledger = r.ledger ?? f.ledger;
    const actual = r.actual ?? f.actual;
    const sdkRaw = r.sdkRaw === undefined ? f.raw : r.sdkRaw;
    const ledgerRaw = r.ledgerRaw ?? f.raw;
    // 运行时副本默认与（可能被改过的）账同步——只有专门测第四向的负控才显式传 runtimeRaw
    const runtimeRaw = r.runtimeRaw === undefined ? renderRuntimeModule(ledger) : r.runtimeRaw;
    const got = checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw });
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };

  // 🔴 正控
  T("正控①：账 = 实况 = SDK 副本 = 运行时模块 ⇒ 绿");
  T("正控②：账里家族内顺序颠倒（集合不变）⇒ 绿（比的是集合，不是顺序）", (f) => {
    f.ledger.commandPrefixes = [...f.ledger.commandPrefixes].reverse();
    return {};
  });
  T("正控③：运行时模块与账逐元素相同（第四向基线）⇒ 绿", (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger) }));

  // 🔴 负控①：实况多一条（改了宿主面忘重跑）
  T(
    "负控①：实况多一条命令前缀 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.commandPrefixes = [...f.actual.commandPrefixes, "core."];
      return {};
    },
    ["ledger-missing"],
  );
  // 🔴 负控②：账多一条（陈旧 / 手改）
  T(
    "负控②：账多一条配置键 ⇒ 红（ledger-stale）",
    (f) => {
      f.ledger.configKeys = [...f.ledger.configKeys, "app.ghost"];
      return {};
    },
    ["ledger-stale"],
  );
  // 🔴 负控③：家族整段被删（后面逐条比对已无意义）
  T(
    "负控③：账里 contextKeys 段被删 ⇒ 红（family-missing）",
    (f) => {
      delete f.ledger.contextKeys;
      return {};
    },
    ["family-missing"],
  );
  // 🔴 负控④：实况某家族为空（扫描目录被搬走 ⇒ 空家族会假装通过）
  T(
    "负控④：实况某家族为空 ⇒ 红（family-empty）",
    (f) => {
      f.actual.appearanceIds = [];
      return {};
    },
    ["family-empty"],
  );
  // 🔴 负控⑤：SDK 副本不存在
  T("负控⑤：SDK 副本缺失 ⇒ 红（sdk-missing）", () => ({ sdkRaw: null }), ["sdk-missing"]);
  // 🔴 负控⑥：SDK 副本漂移（改一个字）
  T(
    "负控⑥：SDK 副本与壳账不同 ⇒ 红（sdk-drift）",
    () => ({ sdkRaw: JSON.stringify(fixture().ledger, null, 2).replace('"dark"', '"light"') + "\n" }),
    ["sdk-drift"],
  );
  // 🔴 负控⑦：运行时模块漂一个键（第四向——最坏的那种漂：两边都"绿"）
  T(
    "负控⑦：运行时模块里一个配置键被改 ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"app.theme"', '"app.themeX"') }),
    ["runtime-drift"],
  );
  // 🔴 负控⑧：运行时模块不存在
  T("负控⑧：运行时模块缺失 ⇒ 红（runtime-missing）", () => ({ runtimeRaw: null }), ["runtime-missing"]);

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`gen-host-reserved self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}

/* ── 入口 ──────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());

const ledgerPath = path.join(ROOT, LEDGER_REL);
const sdkPath = path.join(ROOT, SDK_REL);

if (args.includes("--check")) {
  if (!fs.existsSync(ledgerPath)) {
    console.error(`❌ [host-reserved] 账文件不存在：${LEDGER_REL}（跑 npm run audit:plugin-scope:regen 生成）`);
    process.exit(1);
  }
  const ledgerRaw = fs.readFileSync(ledgerPath, "utf8");
  let ledger;
  try {
    ledger = JSON.parse(ledgerRaw);
  } catch (e) {
    console.error(`❌ [host-reserved] 账文件不是合法 JSON：${LEDGER_REL}——${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const actual = collectHostReserved();
  const sdkRaw = fs.existsSync(sdkPath) ? fs.readFileSync(sdkPath, "utf8") : null;
  const runtimePath = path.join(ROOT, RUNTIME_REL);
  const runtimeRaw = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : null;
  const violations = checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw });
  if (violations.length === 0) {
    const counts = FAMILIES.map((f) => `${f.label} ${ledger[f.key].length}`).join(" · ");
    console.log(`✅ [host-reserved] 四向一致（账 = 现场重扫 = SDK 副本 = 运行时模块）：${counts}`);
    process.exit(0);
  }
  console.error(`❌ [host-reserved] ${violations.length} 处不一致（宿主保留面账）：`);
  for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
  console.error(
    `   要对齐的四侧：现场重扫（壳源码）↔ ${LEDGER_REL} ↔ ${SDK_REL} ↔ ${RUNTIME_REL}；` +
      `判据见 scripts/gen-host-reserved.mjs 文件头。`,
  );
  process.exit(1);
}

// 默认：生成（写壳账 ＋ SDK 副本 ＋ 运行时模块）
const out = collectHostReserved();
const raw = JSON.stringify(out, null, 2) + "\n";
fs.writeFileSync(ledgerPath, raw);
fs.mkdirSync(path.dirname(sdkPath), { recursive: true });
fs.writeFileSync(sdkPath, raw);
const runtimePath = path.join(ROOT, RUNTIME_REL);
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
fs.writeFileSync(runtimePath, renderRuntimeModule(out));
console.log("壳账", LEDGER_REL, "＋ SDK 副本", SDK_REL, "＋ 运行时模块", RUNTIME_REL, "已重写");
console.log("命令前缀", out.commandPrefixes.length, JSON.stringify(out.commandPrefixes));
console.log("app.* 键", out.configKeys.length);
console.log("伪 pluginId", JSON.stringify(out.pseudoPluginIds));
console.log("context key", out.contextKeys.length, JSON.stringify(out.contextKeys));
console.log("宿主兜底外观 id", JSON.stringify(out.appearanceIds));
console.log("宿主内置协议 id", JSON.stringify(out.protocolIds));
