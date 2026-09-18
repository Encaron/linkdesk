/**
 * 退役登记表（`scripts/host-reserved.json` 的 `retired[]` 栏）——**形状与匹配规则的唯一真相源**。
 *
 * ── 它是什么（E6#116）──
 *   格 2 的「只加不删门禁」拦得住「把插件能用的面拿走」，拦不住之后**没人知道该往哪走**。
 *   `retired[]` 把「拿走」变成**唯一合法出口**：每条写明谁批的、为什么、替身是谁、活口在哪。
 *   核心一句：**退役 ≠ 删除**——退役名**不腾位**（老 `settings.json` 里可能还有值；插件此刻占它 =
 *   顶掉宿主的历史数据，且迁移代码仍会读它），所以它**照旧留在宿主保留面账里**（先例
 *   `app.themeColorMode` 至今仍在 `configKeys` 栏），只是**不再是对插件许过的面**。
 *
 * ── 它**不是**什么（三条不许违反的边界）──
 *   ① ⛔ **不是黑名单 / 不是拒绝墙**：本表只供人看与提示（作者侧提示 = 格 6 的取舍点），
 *      **任何门禁不许拿它去拦插件**（拦 = 拒绝墙，本批不做）。
 *   ② ⛔ **`approvedBy` 不许维护者 AI 自己签**：机械形态 = `用户 · YYYY-MM-DD`（见 `APPROVED_BY_RE`），
 *      写别的署名 ⇒ 对账门禁当场判红。这是「谁批」那条定案的机械化形态。
 *   ③ ⛔ **不碰行号**：`landing` 里的 `file:line` 行号**只作人读提示**——行会漂，断言只做
 *      「文件在 ＋ 名字在该文件里」（见 `check-retired-ledger.mjs`）。
 *
 * ── 匹配规则（`matchFace`）——两个消费者共用这一份，⛔ 别处不许再写一套 ──
 *   · 消费者 1 = `scripts/check-api-surface-additive.mjs`（格 2 的门禁）：面被拿走时**查本表**——
 *     命中 ⇒ 放行并打一行「已登记的退役」；没命中 ⇒ 判红（照旧）。
 *   · 消费者 2 = `scripts/check-retired-ledger.mjs`（本表自己的对账门禁）：退役名**不许**还留在
 *     插件能用的活面上（①②③ 栏），**允许**留在宿主保留面账里（④ 栏——那正是「不腾位」）。
 *   名字写法两档：
 *     · **写末段名**（`getCommands` / `app.themeColorMode` / `ldk-x`）⇒ 后缀匹配。同名跨命名空间会
 *       **一起放行**——这是**有意的**：登记表按**名字**记，不按位置记（要精确到位置写下一档）。
 *     · **要精确到一处就写更长的后缀**（`commands.getCommands`）——匹配式是
 *       `path === name || path.endsWith("." + name)`，写长后缀就只有那一处命中。
 *   `kind` 同时限定**只在哪个栏里找**（`KIND_COLUMNS`）⇒「一个类名退役」绝不会误放行一条字段删除。
 *
 * ── 「还活着」怎么机械判（两种 kind 两条口径，都是从账自己的定义抄来的，**不是新尺子**）──
 *   · **`configKey`**：账的 `$comment` 早就把退役键定义成「曾被宿主使用、**现已不再写入**的键」
 *     ⇒ 判据就是「**还有没有写入 / 声明点**」（`scanWriteShapeInHost`：配置 schema 声明 `"键": {`
 *     与写入 API `setConfigurationValue("键"` 一族）。⚠️ 必须用 `\b` 把 `set` 卡在词首——
 *     `resetConfigurationValue` **含** `setConfigurationValue` 子串，不卡词首会把**清扫点**误判成写入点
 *     （那样第一条正控 `app.themeColorMode` 当场自相矛盾）。测试文件不算（与账的 `configKeys` 采集
 *     口径同侧：测试夹具里出现一个键 ≠ 宿主真在写它）。
 *   · **其余 ④ 栏家族**（contextKey / commandPrefix / appearanceId / protocol）：**无机械判据**，
 *     只做「不许还在 ①②③ 活面上」。理由：宿主保留面账**刻意**把退役名留在账里（不腾位），
 *     而各家族的「写形态」口径互不相同（命令前缀在 `commands/**` 扫、外观 id 在配方目录扫…）
 *     ⇒ 本格**不发明第二把尺子**（红线②）。这半条判据由**人**（登记时写清 `landing`）＋ 格 6 的
 *     作者侧读数从另一头咬，残余边界写在 `check-retired-ledger.mjs` 的档 §8.4。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { ROOT } from "./host-surface.mjs";

/** 账文件（与 `scripts/lib/api-surface.mjs` 的 `LEDGER` 同一条路径——两处都指向唯一那本账） */
export const LEDGER_REL = "scripts/host-reserved.json";

/** `approvedBy` 的机械形态（禁区②）——⛔ 别放宽成「非空就行」，那等于把签名栏作废 */
const APPROVED_BY_RE = /^用户\s*·\s*\d{4}-\d{2}-\d{2}/;

/** `since` 的形态（口径：**写日期**，⛔ 不写版本号——版本是攒着发的，当时间轴会骗人） */
const SINCE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 「真删除」那一档的 `landing` 起头（后面可跟括号说明） */
export const NO_LANDING = "无落点";

/**
 * `kind` ⇒ 该名字**只可能出现在**的面路径前缀。
 * ⚠️ 键 = 登记表里的 `kind` 取值；值 = `flattenSurface()` 拍平后的路径前缀。
 * 🔴 加一档 = 三处同笔：本表 ＋ 任务档 §二 的 kind 词表 ＋ 作者面（若该族对作者可见）。
 */
export const KIND_COLUMNS = {
  apiMember: ["apiNamespaces.", "apiRootMembers.", "poolExposed.", "poolRootMembers."],
  manifestField: ["manifestFields."],
  class: ["hostClassNames."],
  keyframe: ["reservedKeyframes."],
  commandPrefix: ["ledger.commandPrefixes."],
  configKey: ["ledger.configKeys."],
  contextKey: ["ledger.contextKeysHostOnly.", "ledger.contextKeysPublic."],
  appearanceId: [
    "ledger.appearanceRecipeIds.",
    "ledger.appearanceColorwayIds.",
    "ledger.appearanceIconThemeIds.",
    "ledger.appearanceSentinels.",
    "ledger.appearanceIdGrants.",
  ],
  protocol: ["ledger.protocolIds."],
  /** E6#121：`@linkdesk/ui` 导出面（快照 scripts/ui-surface.json 的四栏）。退役另须钉线窗口承接旧插件（00-整理档案 §六4）。 */
  uiExport: ["components.", "hooks.", "helpers.", "types."],
};

/**
 * 「插件能用的活面」= 面快照里**对插件许过的那几栏**（①②③）。
 * 🔴 **`ledger.*` 那几栏刻意不算**：那是宿主保留面账 = **插件不许占**的名字，不是许给插件的面——
 *   退役键**照旧留在那里**（不腾位）。把 `ledger.*` 也算成活面 ⇒ 首条样板 `app.themeColorMode`
 *   当场自相矛盾（它按设计必须留在 `configKeys` 里）。
 */
const LIVE_COLUMNS = [
  "apiNamespaces.",
  "apiRootMembers.",
  "poolExposed.",
  "poolRootMembers.",
  "manifestFields.",
  "hostClassNames.",
  "reservedKeyframes.",
];

/** `retired[]` 一条的字段与类型（形状断言用；⛔ 加字段要三处同笔：这里 ＋ 任务档 ＋ 生成器注） */
const ENTRY_FIELDS = {
  name: "string",
  kind: "string",
  since: "string",
  why: "string",
  replacedBy: "string|null",
  landing: "string",
  approvedBy: "string",
};

/** 扫「还活着」时认的扩展名（**不含 `.md`**——文档里「提过」不等于活着，作者面正是要写「它已退役」） */
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".html", ".json"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "out", "coverage", "build", ".vite"]);
/** 账自己的三份拷贝**不算「还活着」的证据**——账记它正是它的存档（见断言 3） */
const LEDGER_COPIES = new Set([
  "src/core/registry/host-reserved.generated.ts",
  "packages/plugin-sdk/schemas/host-reserved.json",
  "scripts/host-reserved.json",
]);

/**
 * 面路径 ↔ 登记名（见文件头「匹配规则」）。
 * @param {string} path `flattenSurface()` 拍平后的面路径（如 `apiNamespaces.commands.getCommands`）
 * @param {string} name 登记表里的 `name`（末段名或更长后缀）
 */
function matchFace(path, name) {
  if (!path || !name) return false;
  return path === name || path.endsWith("." + name);
}

/** 面路径在不在这个 `kind` 的栏里 */
function inKindColumns(path, kind) {
  const cols = KIND_COLUMNS[kind];
  return Boolean(cols) && cols.some((p) => path.startsWith(p));
}

/** 读登记表（**人工栏**——生成器原样携带，见 `gen-host-reserved.mjs` 的 `readRetiredColumn`） */
export function readRegistry(root = ROOT) {
  const raw = JSON.parse(readFileSync(resolve(root, LEDGER_REL), "utf8"));
  return Array.isArray(raw.retired) ? raw.retired : [];
}

/** 账文件在不在（给「空表」与「账没读到」两种情形分开说话，别把缺读数当 0 条） */
export function ledgerExists(root = ROOT) {
  return existsSync(resolve(root, LEDGER_REL));
}

/**
 * 「这条被拿走的面，有没有已登记的退役替它背书？」——**格 2 门禁的红出口靠它放行**。
 * @returns {{entry:object, how:string}|null} 命中则给出条目与**凭什么**（人读报告用）
 */
export function exemptionFor(facePath, registry) {
  for (const e of registry ?? []) {
    if (!inKindColumns(facePath, e?.kind)) continue;
    if (!matchFace(facePath, e?.name)) continue;
    if (!APPROVED_BY_RE.test(String(e.approvedBy ?? ""))) continue; // 没签名的登记**不算数**（禁区②）
    return { entry: e, how: `${e.kind} · ${e.name} · ${e.approvedBy}` };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   「还活着」的扫描（真跑用；自测拿桩注入，见 check-retired-ledger.mjs）
   ══════════════════════════════════════════════════════════════════════════ */

function walkFiles(root, dir, out = []) {
  let entries;
  try {
    entries = readdirSync(resolve(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walkFiles(root, rel, out);
    else if (CODE_EXT.has(extname(e.name).toLowerCase())) out.push(rel);
  }
  return out;
}

/**
 * 整行注释不算（`//` / `*` / `/*` 起头的行）——`app.mixColor` 就只在 `appearance.ts:394` 的注释里出现过。
 * ⚠️ **只剥整行**，行尾注释与块注释中间的提及**会**算：保守一侧——
 *   多报一处（人读一眼就明白「只是注释」）胜过漏报一处（名字其实还活着却放行）。
 */
function stripLineComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : line;
}

/**
 * 全仓找这个名字的**代码站点**（`src/` ＋ `packages/` ＋ `electron/`，跳过账的三份拷贝与产物目录）。
 * @returns {string[]} `rel:line`（人读）
 */
export function scanNameInHost(name, root = ROOT) {
  if (!name) return [];
  const hits = [];
  for (const dir of ["src", "packages", "electron"]) {
    for (const rel of walkFiles(root, dir)) {
      if (LEDGER_COPIES.has(rel)) continue;
      const text = readFileSync(resolve(root, rel), "utf8");
      if (!text.includes(name)) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (stripLineComment(lines[i]).includes(name)) hits.push(`${rel}:${i + 1}`);
      }
    }
  }
  return hits;
}

/**
 * 找**写入 / 声明点**（只对 `configKey` 用，口径见文件头）。
 * 范围 = `src/` 的**非测试**文件（与账的 `configKeys` 采集口径同侧：生成器 ① 也排除测试文件——
 * 测试夹具里出现一个键不等于宿主真在写它）。
 * @returns {string[]} `rel:line`
 */
export function scanWriteShapeInHost(name, root = ROOT) {
  if (!name) return [];
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarationRe = new RegExp(`"${esc}"\\s*:\\s*\\{`);
  const writeRe = new RegExp(`\\b(?:set|update|write)Configuration\\w*\\s*\\(\\s*"${esc}"`);
  const hits = [];
  for (const rel of walkFiles(root, "src")) {
    if (/\.test\.(ts|tsx)$/.test(rel)) continue;
    const lines = readFileSync(resolve(root, rel), "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const code = stripLineComment(lines[i]);
      if (declarationRe.test(code) || writeRe.test(code)) hits.push(`${rel}:${i + 1}`);
    }
  }
  return hits;
}

/* ══════════════════════════════════════════════════════════════════════════
   对账（形状 ＋ 三条断言；纯函数——自测拿桩注入，真跑注入仓库实况）
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object[]} registry `retired[]`
 * @param {object} io
 * @param {string[]} [io.facePaths] 今天重算的面（`flattenSurface()`）——判「退役了却还活着」
 * @param {(rel:string)=>boolean} [io.exists] 文件在不在
 * @param {(rel:string)=>string} [io.readText] 读文件
 * @param {(name:string)=>string[]} [io.scanAlive] 全仓代码站点（真跑 = `scanNameInHost`）
 * @param {(name:string)=>string[]} [io.scanWriteShape] 写入/声明点（真跑 = `scanWriteShapeInHost`）
 * @returns {{assertion:string, msg:string}[]}
 */
export function checkRegistry(registry, io = {}) {
  const {
    facePaths = [],
    exists = () => true,
    readText = () => "",
    scanAlive = () => [],
    scanWriteShape = () => [],
  } = io;
  const out = [];
  const push = (assertion, msg) => out.push({ assertion, msg });
  if (!Array.isArray(registry)) {
    push("形状", "`retired` 不是数组——它必须是登记表（哪怕空表也要写 `[]`）。");
    return out;
  }

  /* ── 断言 0（形状）：字段齐 ＋ kind 合法 ＋ 签名合规 ＋ 不重名 ── */
  const seen = new Set();
  registry.forEach((e, i) => {
    const at = `retired[${i}]${e?.name ? `（${e.name}）` : ""}`;
    for (const [f, t] of Object.entries(ENTRY_FIELDS)) {
      const v = e?.[f];
      const ok = t === "string|null" ? typeof v === "string" || v === null : typeof v === t;
      if (!ok) push("形状", `${at} 字段 \`${f}\` 缺失或类型不对（要 ${t}）——形状见 scripts/lib/retired-ledger.mjs 头注`);
    }
    if (typeof e?.name === "string" && e.name.trim() === "") push("形状", `${at} \`name\` 是空串`);
    if (e?.kind != null && !KIND_COLUMNS[e.kind]) {
      push("形状", `${at} \`kind\`=${JSON.stringify(e.kind)} 不在词表里（合法值：${Object.keys(KIND_COLUMNS).join(" / ")}）`);
    }
    if (typeof e?.since === "string" && !SINCE_RE.test(e.since)) {
      push("形状", `${at} \`since\`=${JSON.stringify(e.since)} 不是日期形态（口径：写日期，⛔ 不写版本号）`);
    }
    if (typeof e?.approvedBy === "string" && !APPROVED_BY_RE.test(e.approvedBy)) {
      push(
        "形状",
        `${at} \`approvedBy\`=${JSON.stringify(e.approvedBy)} 不是 \`用户 · YYYY-MM-DD\` 形态——` +
          `🔴 「谁批」的定案是**用户本人**：维护者 AI ⛔ 不许自己签（这条是禁区②的机械形态）。`,
      );
    }
    if (typeof e?.name === "string") {
      if (seen.has(e.name)) push("形状", `${at} 与前面的条目**重名**——一条名字只登一次（改名写旧名，替身写 replacedBy）`);
      seen.add(e.name);
    }
  });

  /* ── 断言 1：退役的必须真退役（不许还挂在**插件能用的活面**上；configKey 另判写入点）── */
  for (const e of registry) {
    if (!KIND_COLUMNS[e?.kind]) continue;
    if (KIND_COLUMNS[e.kind].some((p) => LIVE_COLUMNS.includes(p))) {
      for (const p of facePaths) {
        if (!inKindColumns(p, e.kind) || !matchFace(p, e.name)) continue;
        push(
          "断言1",
          `\`${e.name}\` 已登为退役（${e.kind}），却**还在插件能用的活面**上：\`${p}\`——` +
            `要么这条登记写错了（它还活着），要么「退役」这个词被误用（该真删的没删干净）。`,
        );
      }
    }
    if (e.kind === "configKey") {
      const hits = scanWriteShape(e.name);
      if (hits.length) {
        push(
          "断言1",
          `\`${e.name}\` 已登为退役配置键，却**还有写入 / 声明点**（${hits.slice(0, 3).join(" · ")}` +
            `${hits.length > 3 ? ` · …另有 ${hits.length - 3} 处` : ""}）——` +
            `账把退役键定义成「曾被宿主使用、**现已不再写入**的键」⇒ 它其实还活着（登记写错了）。`,
        );
      }
    }
  }

  /* ── 断言 2：写落点的必须绑得住 ／ 断言 3：真删除不许含混 ── */
  for (const e of registry) {
    const landing = String(e?.landing ?? "");
    if (landing.trim() === "") {
      push("断言2", `\`${e?.name}\` 的 \`landing\` 是空的——退役要么写活口（\`file:line\`），要么**明写** \`${NO_LANDING}\`。`);
      continue;
    }
    if (landing.startsWith(NO_LANDING)) {
      const hits = e?.name ? scanAlive(e.name) : [];
      if (hits.length) {
        push(
          "断言3",
          `\`${e.name}\` 的 \`landing\` 写了「${NO_LANDING}」（= 真删除），可它**还在仓里活着**：` +
            `${hits.slice(0, 3).join(" · ")}${hits.length > 3 ? ` · …另有 ${hits.length - 3} 处` : ""}——` +
            `要么它没删干净（那该写活口），要么名字写错了。`,
        );
      }
      continue;
    }
    const m = /^([\w./-]+\.[A-Za-z]+)(?::(\d+))?/.exec(landing);
    if (!m) {
      push("断言2", `\`${e.name}\` 的 \`landing\`=${JSON.stringify(landing)} 里找不到 \`file:line\` 形态的落点。`);
      continue;
    }
    const rel = m[1].split("\\").join("/");
    if (!exists(rel)) {
      push("断言2", `\`${e.name}\` 的落点文件不存在：\`${rel}\`（账里写了个不存在的落点）。`);
      continue;
    }
    if (e?.name && !readText(rel).includes(e.name)) {
      push(
        "断言2",
        `\`${e.name}\` 的落点 \`${rel}\` 里**找不到这个名字**——落点写错了（改名了？文件被重构了？）。` +
          `⚠️ 断言只做「文件在 ＋ 名字在文件里」：**行号会漂，不判行号**。`,
      );
    }
  }

  return out;
}
