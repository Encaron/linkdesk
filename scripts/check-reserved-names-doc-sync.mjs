#!/usr/bin/env node
/**
 * 作者面文档门禁 ④ —— **保留名清单的单一真相源**（E6#109i 立、E6#109k-b 扩到关键帧）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/11-任务-保留名清单单一真相源.md`
 *   ＋ 总档案 `00-整理档案.md`（件 3）＋ [19 号档 §第 1.19 轮](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/19-任务-收口批-遗留账与系列收口.md)（**关键帧列**）。
 *
 * ── 判据一句话 ──
 *   机器侧真源 = `packages/plugin-sdk/schemas/reserved-class-names.json`；作者读的那份 = §12 的**两张**
 *   表——「保留名」表（类名）与「保留的关键帧名」表（`docs/03-插件制造/05-插件UI写法规约.md` 与
 *   `docs/03-plugin-authoring/05-ui-conventions.md` **两份手抄**）。本门禁把这三份**双向**钉在一起：
 *     ① 两棵树的表**名字集合必须相等**（中英互为译文，不许各写各的）；
 *     ② 表里每个名字**必须真实存在**：`ldk-` 名 ⇒ 必须在宿主源码（`src/` 下的 `*.css`）里定义过；
 *        ⚠️ E6#109l-b 起**只剩这一种形态**——「裸保留名」这个类别已随登记表 `classes` 一起退役
 *        （两个定义域都是结构性规则：自己定义的类名一律 `ldk-` 开头，不再有任何豁免表）。
 *        裸名/其它形态出现在这一列 ⇒ 红（`doc-name-unclassified`）。
 *     ③ **关键帧列同 ① ② ＋ 与登记表的 `keyframes` 段双向**（1.15 立的门禁只守了类名那一列，
 *        剩下的「宿主哪些 `@keyframes` 名字动不得」既没进作者面也没机器守 ⇒ E6#109k-b 补齐）。
 *
 * ── 为什么是「对账门禁」而不是「生成」（详案 §二 给两条路线，这里是拍板与理由）──
 *   详案倾向 (a) 生成，本轮量过形态后改判 (b)，三条硬理由：
 *   ① 表里除名字外还有**两面手写散文**（「来源」列与「说明」列），且**中英各一份**。JSON 里只有
 *      `name` + `why`，而 `why` 是**维护者语**（含插件 id、含 `className="input"` 这类代码片段）——
 *      投影进作者面既泄漏维护者语、又变不出英文 ⇒ 要生成就得往 JSON 加双语散文字段，直接撞详案
 *      禁区 3「不许动 JSON 内容」。
 *   ② 表里那行 `ldk-*` 枚举**根本不在 JSON 里**（它们带前缀、自带命名空间，从不登记）。
 *      ⇒ 纯 JSON 投影生成不出这一行，还得再引入一个真源。
 *   ③ 生成意味着 `docs:build` 要**回写源文档**（今天只读源、只写 `packages/plugin-docs`），会让手写
 *      散文中间的一段变成机器所有——比多一条门禁脆弱得多。
 *   ⇒ 选 (b)：**表照旧手写，名字集合由门禁守**。这也是本仓对这类病用过的药——`check-namespace-matrix.mjs`
 *     的诞生史就是一张手维护的表静默漂移一个月（自称 40 个命名空间、实为 45）。
 *
 * ── 作用域（口径写死，别靠猜）──
 *   · 只扫 §12 那一节（`## 12.` → 下一个 `###`/`##`）。**`### 12.1` 迁移说明不在射程内**——那里的
 *     八个旧基名（`.badge` 等）是**故意**要让作者看到的旧名（升级时要拿它们 grep 自己的 CSS）。
 *   · **类名**：只扫该节里**表头含「保留名」/「Reserved names」那张表的那一列**。列位置按表头找、不写死第几列；
 *     表或该列找不到 ⇒ 红（`table-missing`）——**不许静默放过**（否则改一次表格结构，门禁就瞎了）。
 *   · 这一列里的类名按两种形态识别：`.名字`（裸名）与 `ldk-…`。其余形态（如 `.some-thing`）既不是
 *     登记裸名、也不是 `ldk-` 命名 ⇒ 红（`doc-name-unclassified`），逼一次「这是保留名还是笔误」的判断。
 *   · **关键帧**：同一节里**表头含「保留的关键帧名」/「Reserved keyframe names」那张表的那一列**
 *     （表头刻意与类名表头**不重叠**——「保留的关键帧名」不含子串「保留名」，两张表各自认自己那张，
 *     互不误吃）。列位置同样按表头找；表或该列找不到 ⇒ 红（`table-missing`）。
 *     该列**只放名字**（散文写「说明」列）；混进类名形态（`.foo`）⇒ 红（`keyframe-name-unclassified`）。
 *
 * ── 第二段射程：**非样式家族**的「宿主保留的名字」总表（E6#111k／1.49 追加）──
 *   来历：非样式命名空间归一化（E6#111）把五个家族的判据收紧到红之后，**宿主保留面账**
 *   （`scripts/host-reserved.json`，生成式）必须**进作者面**——作者面没有这张表，插件作者就无从知道
 *   自己正在占用宿主的名字（逐家族后果见 `16-命名规范 §七` 的「你会撞上什么」列：命令 id 归属不明、
 *   设置键顶掉用户的主题、外观 id 撞出两个同名项、上下文旗子被别人的 `when` 读到）。
 *   机器侧真源 = `scripts/host-reserved.json`；作者读的那份 = 两棵树 `16-命名规范` §七 的**总表**
 *   （`| 家族 | 保留的名字 | 你会撞上什么 |` ／ `| Family | Reserved name | … |`）。本段把这三份**双向**钉住：
 *     ① **家族名**必须在那份双语映射里（`FAMILY_LABELS`）：映射外的族名 ⇒ 红（`host-family-unknown`）；
 *        账里冒出映射外的**新家族** ⇒ 也红（`host-family-unmapped`）——账是**生成式**的，加一个家族
 *        必须同笔喂给作者面，否则作者面静默落后（而账、壳运行时、SDK 三份都已经是绿的，没人会察觉）。
 *     ② **账 → 表**：账里每个名字都要在**对应家族**的行里出现（`host-name-unregistered`）。
 *     ③ **表 → 账**：表里每个名字都要在账里（`host-name-not-in-ledger`）——🔴 **两侧都查**：
 *        只查一侧的「对账」在**实况多一条**时照样是绿的（这正是 `gen-host-reserved.mjs --check` 四向的理由）。
 *     ④ **中英两棵树相等**（「家族 ＋ 名字」的集合，`doc-drift`）：同一张表的两个译本，必须同笔改。
 *     ⑤ **一句话规则句必须在**（`host-rule-missing`）：那句「宿主保留的名字不许占；插件自己写的名字必须带
 *        `<pluginId>` 前缀」是这张表存在的理由，也是**不用查表就能记住**的那一条——表能被搬走，规则句不行。
 *   ⚠️ 表按**表头**定位（同一行里同时命中「家族」/「Family」与「保留的名字」/「Reserved name」两列），
 *      **不写死节号、不写死列序**：篇号与列序调整不该把门禁变瞎；但表被搬走／改名／改结构 ⇒
 *      `host-table-missing` 判红（与第一段同一条纪律：**不许静默放过**）。
 *   ⚠️ 与第一段**同文件、同门禁、同一次接线**——加带 `--self-test` 的新尺子必须同批进 `npm run check`，
 *      扩既有门禁天然满足这一条（记忆 `gate-selftest-must-be-wired`：自测自己没接线 = 假门禁）。
 *
 * 用法：
 *   node scripts/check-reserved-names-doc-sync.mjs              # 挂 npm run check
 *   node scripts/check-reserved-names-doc-sync.mjs --self-test  # 正控 6 ＋ 负控 19（样式段 ＋ 非样式段）
 * 退出码 0 = 各份一致；1 = 有漂移（打印到 stderr）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 主入口判定——**被 `import` 时不许自己跑 main、更不许 `process.exit`**（判据函数要能被复用：
 *  1.49 §2.4「货架保真」就是拿 `checkHostDocs` 去跑**文档包里的**两棵树与账；无这道守卫会让
 *  引用方在 import 那一刻被 `process.exit(0)` 静默掐死——假的绿）。 */
const IS_MAIN = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const norm = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();
  return norm(argv1) === norm(fileURLToPath(import.meta.url));
})();

/** 机器侧真源（与 `check-css-namespace.mjs` 读**同一份**——别各抄一份） */
const RESERVED_FILE_REL = "packages/plugin-sdk/schemas/reserved-class-names.json";

/** 作者面两棵树（路径 = FILENAME_MAP 里的那对，`check-author-docs-bilingual` 守篇目对齐） */
export const DOCS = [
  { label: "zh（维护者面原文）", rel: "docs/03-插件制造/05-插件UI写法规约.md" },
  { label: "en（作者面主显）", rel: "docs/03-plugin-authoring/05-ui-conventions.md" },
];

/** §12 节：起于 `## 12.`，止于下一个 `###`/`##`（即 `### 12.1` 之前） */
const SECTION_RE = /^##\s*12\./;
const NEXT_RE = /^#{2,3}\s/;
/** 该列的表头（中英） */
const COL_LABEL_RE = /保留名|Reserved names/;
/** 这一列里的两种合法形态（见文件头「作用域」） */
const DOT_CLASS = /(?<!\w)\.([a-zA-Z][\w-]*)/g;
const LDK_NAME = /\b(ldk-[a-z0-9-]+)/g;
/** 关键帧表的表头（中英）——刻意与类名表头**不重叠**（「保留的关键帧名」不含子串「保留名」） */
const KF_COL_LABEL_RE = /保留的关键帧名|Reserved keyframe names/;
/** 关键帧名 token（该列只放名字，散文写「说明」列） */
const KF_NAME = /\b[A-Za-z][A-Za-z0-9-]*\b/g;
/** 关键帧列里混进类名形态（`.foo`）= 放错表了 */
const KF_DOT = /(?<!\w)\.\w/;

/* ══ 第二段射程：非样式家族的「宿主保留的名字」总表（E6#111k／1.49）══════════ */

/** 作者面两棵树里**非样式家族那一篇**（与第一段是两篇不同的文档） */
export const HOST_DOCS = [
  { lang: "zh", label: "zh（维护者面原文）", rel: "docs/03-插件制造/16-命名规范.md" },
  { lang: "en", label: "en（作者面主显）", rel: "docs/03-plugin-authoring/16-naming-conventions.md" },
];

/** 机器侧真源（生成式；它自己的四向对账在 `gen-host-reserved.mjs --check`，这里只做「账 ↔ 作者面」） */
const HOST_LEDGER_REL = "scripts/host-reserved.json";

/** 总表的两种表头——**同一行里同时命中「家族列」与「名字列」**才是那张表（两列都按表头找，不写死列序） */
const FAMILY_COL_RE = /家族|Family/;
const HOST_NAME_COL_RE = /保留的名字|Reserved name/;

/** 一句话规则句的锚（措辞若改，同笔改这里——它守的是「这句不许悄悄消失」） */
const HOST_RULE_RE = /宿主保留的名字不许占|names the host reserves are off limits/;

/**
 * 账里的家族 ⇒ 作者面那张表的**双语家族名**（表的族名必须落在这个映射里）。
 * ⚠️ 键 = 账里的字段名（`scripts/host-reserved.json`）；值是**去掉 markdown 强调符后**的族名原文。
 * ⚠️ 加家族 = 三处同笔：账（生成器）＋ 本映射 ＋ 两棵树的总表各一行。
 */
export const FAMILY_LABELS = {
  commandPrefixes: { zh: "宿主命令前缀", en: "Host command prefix" },
  protocolIds: { zh: "宿主协议 id", en: "Host protocol id" },
  pseudoPluginIds: { zh: "宿主伪 pluginId", en: "Host pseudo plugin id" },
  configKeys: { zh: "宿主配置键", en: "Host config key" },
  appearanceRecipeIds: { zh: "宿主配方 id", en: "Host recipe id" },
  appearanceColorwayIds: { zh: "宿主配色 id", en: "Host colorway id" },
  appearanceIconThemeIds: { zh: "宿主图标主题 id", en: "Host icon theme id" },
  appearanceSentinels: { zh: "宿主外观哨兵值", en: "Host appearance sentinel" },
  contextKeysHostOnly: { zh: "宿主专用旗子（插件禁设）", en: "Host-only context key (plugins must not set)" },
  contextKeysPublic: { zh: "宿主公开约定旗子（插件可设）", en: "Shared-contract context key (plugins may set)" },
};

/** 账里**不是名字列表**的字段（不是家族，别当成「漏掉的家族」判红）：
 *  · `$comment` / `version` —— 账的自我描述与**形状**修订号；
 *  · `appearanceIdGrants` —— **证照**映射（`{ 外观 id: [被授权的 pluginId…] }`）：它约束的是
 *    「**谁有权声明**某个宿主兜底 id」，不是「哪些名字被保留」。作者面在「宿主配方 id」那一行的
 *    「你会撞上什么」列里用散文交代它（`light` ← `theme-defaults`），故不进机器对账；
 *  · `retired` —— **退役登记**（E6#116）：它是「谁批的 / 为什么 / 替身是谁 / 还剩哪个活口」的**账**，
 *    形状 ≠ 名字列表（每项是一张记录、不是字符串）⇒ 不按家族对账。它自身的自洽（形状 ＋ 三条断言）
 *    由 `scripts/check-retired-ledger.mjs` 管；「退役名要不要提示给作者」= 格 6 的取舍点。 */
const NON_FAMILY_KEYS = new Set(["$comment", "version", "appearanceIdGrants", "retired"]);

/** 去掉 markdown 强调符／行内代码符并压平空白——族名的比较口径（表里写 `**x**` 与 `x` 等价） */
const normLabel = (s) => String(s).replace(/[*`]/g, "").replace(/\s+/g, " ").trim();

/** 读登记表 → { keyframes: Map<name, why> }
 *  ⚠️ E6#109l-b：`classes` 整块已从登记表删除（两个定义域的类名规则都是结构性的 ⇒ 它没有消费方了）。
 *     本脚本**只剩关键帧一侧的双向对账**；类名列仍守着「表里的名字必须在源码里真实存在」。 */
export function loadRegistry(root = ROOT) {
  const raw = JSON.parse(readFileSync(join(root, RESERVED_FILE_REL), "utf8"));
  const keyframes = new Map();
  for (const x of raw.keyframes ?? []) keyframes.set(x.name, x.why ?? "");
  return { keyframes };
}

/** 取 §12 那一节的行（找不到节 ⇒ null） */
function sectionLines(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => SECTION_RE.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (NEXT_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

/** 表格行 → 单元格（不切被转义的 `\|`） */
const splitCells = (line) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
};

/** markdown 表格的分隔行（`|---|---|`） */
const isSeparator = (line) => {
  const t = line.trim();
  return t.startsWith("|") && t.includes("-") && /^[|\s:-]+$/.test(t);
};

/** 从一个单元格抽类名 token（两种形态；按名字去重） */
export function extractNames(cell) {
  const out = new Map();
  for (const m of String(cell).matchAll(DOT_CLASS)) out.set(m[1], m[1]);
  for (const m of String(cell).matchAll(LDK_NAME)) if (!out.has(m[1])) out.set(m[1], m[1]);
  return [...out.values()];
}

/**
 * 定位 §12 里那张保留名表 → { colIndex, names: string[] }；找不到 ⇒ null。
 * 表头里找「保留名」/「Reserved names」那一列（**不写死列序**）。
 */
export function parseReservedNames(text) {
  const lines = sectionLines(text);
  if (!lines) return null;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    if (!isSeparator(lines[i + 1])) continue;
    const colIndex = splitCells(lines[i]).findIndex((c) => COL_LABEL_RE.test(c));
    if (colIndex < 0) continue;
    const names = new Set();
    for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) {
      for (const n of extractNames(splitCells(lines[j])[colIndex] ?? "")) names.add(n);
    }
    if (names.size === 0) return null;
    return { colIndex, names: [...names] };
  }
  return null;
}

/**
 * 定位 §12 里那张关键帧表 → { colIndex, names: string[], dotted: boolean }；找不到 ⇒ null。
 * 表头里找「保留的关键帧名」/「Reserved keyframe names」那一列（**不写死列序**）。
 */
export function extractKeyframeNames(cell) {
  const out = new Set();
  for (const m of String(cell).matchAll(KF_NAME)) out.add(m[0]);
  return [...out];
}

export function parseReservedKeyframes(text) {
  const lines = sectionLines(text);
  if (!lines) return null;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    if (!isSeparator(lines[i + 1])) continue;
    const colIndex = splitCells(lines[i]).findIndex((c) => KF_COL_LABEL_RE.test(c));
    if (colIndex < 0) continue;
    const names = new Set();
    let dotted = false;
    for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) {
      const cell = splitCells(lines[j])[colIndex] ?? "";
      if (KF_DOT.test(cell)) dotted = true;
      for (const n of extractKeyframeNames(cell)) names.add(n);
    }
    if (names.size === 0) return null;
    return { colIndex, names: [...names], dotted };
  }
  return null;
}

/* ── 第二段：非样式家族的「宿主保留的名字」总表 ↔ 账（双向）──────────────── */

/** 读生成式账（`scripts/host-reserved.json`）。⚠️ 这里**不校验账自身的形状/实况**——那是
 *  `gen-host-reserved.mjs --check` 的四向射程（实况→账／账→实况／SDK 副本逐字节／运行时副本逐元素）。 */
export function loadHostLedger(root = ROOT) {
  return JSON.parse(readFileSync(join(root, HOST_LEDGER_REL), "utf8"));
}

/** 抽一个单元格里的 `` `名字` `` token（这一列**只放名字**，散文写第三列） */
export function extractHostNames(cell) {
  const out = [];
  for (const m of String(cell).matchAll(/`([^`]+)`/g)) {
    const n = m[1].trim();
    if (n) out.push(n);
  }
  return out;
}

/**
 * 定位「宿主保留的名字」总表 → { famCol, nameCol, rows: [{family, names}] }；找不到 ⇒ null。
 * 判据：同一行表头里**同时**有「家族」/「Family」列与「保留的名字」/「Reserved name」列。
 * ⚠️ 篇里另有同形表（`| 名字 | 真源在哪 |` 那张命名总表、`| Name | Examples | … |` 那张豁免说明表）
 *    都不含这两列 ⇒ 不会被误吃。
 */
export function parseHostTable(text) {
  const lines = text.split("\n");
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    if (!isSeparator(lines[i + 1])) continue;
    const cells = splitCells(lines[i]);
    const famCol = cells.findIndex((c) => FAMILY_COL_RE.test(c));
    const nameCol = cells.findIndex((c) => HOST_NAME_COL_RE.test(c));
    if (famCol < 0 || nameCol < 0 || famCol === nameCol) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = splitCells(lines[j]);
      rows.push({ family: normLabel(c[famCol] ?? ""), names: extractHostNames(c[nameCol] ?? "") });
    }
    if (rows.length === 0) return null;
    return { famCol, nameCol, rows };
  }
  return null;
}

/**
 * 核心判据（纯函数，`--self-test` 与真跑共用）：账 ↔ 两棵树的总表，双向 ＋ 中英互译 ＋ 规则句。
 * @param {{docs:{lang:"zh"|"en",label:string,text:string}[], ledger:object}} input
 * @returns {{kind:string,msg:string}[]}
 */
export function checkHostDocs({ docs, ledger }) {
  const violations = [];
  const seen = new Set();
  const push = (kind, msg) => {
    const key = kind + "|" + msg;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ kind, msg });
  };

  // ⓪ 账里冒出映射外的家族 ⇒ 红（账是生成式的：加家族不同笔喂作者面，作者面就静默落后）
  for (const key of Object.keys(ledger)) {
    if (NON_FAMILY_KEYS.has(key) || FAMILY_LABELS[key]) continue;
    push(
      "host-family-unmapped",
      `账（${HOST_LEDGER_REL}）里有家族 \`${key}\`，但作者面的双语家族映射（scripts/check-reserved-names-doc-sync.mjs ` +
        `的 \`FAMILY_LABELS\`）里没有它——账加了家族就必须**同笔**让作者面知道（作者不知道它，就无从避让：` +
        `账、壳运行时、SDK 副本三份照样全绿，只有作者在读一份过期的表）。改法：补 \`FAMILY_LABELS\` ＋ 两棵树的总表各加行。`,
    );
  }

  // ① 两棵树各自先过「规则句在不在」＋「总表找不找得到」
  const parsed = new Map();
  for (const d of docs) {
    if (!HOST_RULE_RE.test(d.text)) {
      push(
        "host-rule-missing",
        `${d.label}：找不到一句话规则句（「宿主保留的名字不许占；插件自己写的名字必须带 \`<pluginId>\` 前缀」）——` +
          `这句是整张表存在的理由，也是**不用查表就能记住**的那一条。改法：补回去（中英同笔）；` +
          `若确实要改措辞，同笔改 scripts/check-reserved-names-doc-sync.mjs 的 \`HOST_RULE_RE\`。`,
      );
    }
    const p = parseHostTable(d.text);
    if (!p) {
      push(
        "host-table-missing",
        `${d.label}：找不到「宿主保留的名字」总表（同一行表头须同时含「家族」/「Family」与「保留的名字」/「Reserved name」，` +
          `且至少一行内容）——门禁的射程就是这张表；表被移走/改名/改结构，作者面的宿主保留面就成了瞎子，` +
          `所以这里按「红」处理。若确实要改表形，请同笔改本脚本的解析口径。`,
      );
      continue;
    }
    parsed.set(d.label, p);
  }
  if (parsed.size !== docs.length) return violations; // 表都没了 ⇒ 后面的比对没有意义

  // ② 表 → 账（逐个名字）：族名必须在映射里；名字必须在该家族的账上
  const pairSets = new Map(); // label → Set<"家族键|名字">
  for (const d of docs) {
    const labelToKey = new Map();
    for (const [k, v] of Object.entries(FAMILY_LABELS)) labelToKey.set(normLabel(v[d.lang]), k);
    const pairs = new Set();
    for (const row of parsed.get(d.label).rows) {
      const key = labelToKey.get(row.family);
      if (!key) {
        push(
          "host-family-unknown",
          `${d.label}：总表里出现了映射外的家族名「${row.family}」——族名对不上，这一行的名字就没法和账对上（` +
            `对不上时若静默跳过，整行会**既不报错也不被检查**）。改法：改成 \`FAMILY_LABELS\` 里的双族名之一，或同笔补映射。`,
        );
        continue;
      }
      for (const n of row.names) {
        pairs.add(key + "|" + n);
        if (!(ledger[key] ?? []).includes(n)) {
          push(
            "host-name-not-in-ledger",
            `${d.label}：\`${n}\` 被列在「${row.family}」下，但账（${HOST_LEDGER_REL}）的 \`${key}\` 里没有它——` +
              `作者会白白避让一个并不保留的名字（代价＝把该带前缀的名字写成别的样子），或者反过来**账漏了一条**。` +
              `改法：从表里删掉，或补进账并重跑 \`npm run audit:plugin-scope:regen\`。`,
          );
        }
      }
    }
    pairSets.set(d.label, pairs);
  }

  // ③ 账 → 表（逐家族逐名字）：这一侧专治「实况/账多一条」——只查②的对账在实况多一条时是绿的
  for (const d of docs) {
    const pairs = pairSets.get(d.label);
    for (const [key, v] of Object.entries(FAMILY_LABELS)) {
      for (const n of ledger[key] ?? []) {
        if (pairs.has(key + "|" + n)) continue;
        push(
          "host-name-unregistered",
          `${d.label}：账里「${v[d.lang]}」有 \`${n}\`，作者面的总表里没有——作者读不到它就会照用` +
            `（后果见该行「你会撞上什么」列）。改法：补进表里（**两棵树都要**），或从账里摘掉（那是一次公共面决策）。`,
        );
      }
    }
  }

  // ④ 中英两棵树：同一张表的两个译本，集合必须相等
  if (pairSets.size === 2) {
    const [a, b] = docs.map((d) => d.label);
    const pa = pairSets.get(a);
    const pb = pairSets.get(b);
    const onlyA = [...pa].filter((x) => !pb.has(x));
    const onlyB = [...pb].filter((x) => !pa.has(x));
    if (onlyA.length > 0 || onlyB.length > 0) {
      const fmt = (xs) => xs.map((x) => x.replace("|", " → ")).sort().join("、");
      push(
        "doc-drift",
        `两棵树的「宿主保留的名字」集合不一致：${a} 独有 [${fmt(onlyA)}]；${b} 独有 [${fmt(onlyB)}]。` +
          `中英是同一张表的两个译本，必须同笔改。`,
      );
    }
  }
  return violations;
}

/** 宿主源码里真实出现过的 `ldk-` 类名（共享组件 CSS ＋ 宿主 CSS——池文档里同表的那一批） */
export function collectLdkTokens(root = ROOT) {
  const tokens = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".css")) {
        for (const m of readFileSync(full, "utf8").matchAll(LDK_NAME)) tokens.add(m[1]);
      }
    }
  };
  walk(join(root, "src"));
  return tokens;
}

/** `ldk-sle` 这类**族名**：容器名本身在，或它是某个已存在 token 的前缀段（`ldk-sle-row`） */
const ldkExists = (name, tokens) => tokens.has(name) || [...tokens].some((t) => t.startsWith(name + "-"));

/**
 * 核心判据（纯函数，`--self-test` 与真跑共用）。
 * @param {{docs:{label:string,text:string}[], registeredKeyframes?:Map<string,string>, ldkTokens:Set<string>}} input
 * @returns {{kind:string,msg:string}[]}
 */
export function checkSync({ docs, registeredKeyframes = new Map(), ldkTokens }) {
  const violations = [];
  const parsed = new Map();
  for (const d of docs) {
    const p = parseReservedNames(d.text);
    if (!p) {
      violations.push({
        kind: "table-missing",
        msg:
          `${d.label}：在 §12 里找不到「保留名」表（表头须含「保留名」/「Reserved names」，且表里至少有一个类名）。` +
          `——门禁的射程就是这张表；表被移走/改名/改结构，门禁就成了瞎子，所以这里按「红」处理。` +
          `若确实要改表形，请同笔改 scripts/check-reserved-names-doc-sync.mjs 的解析口径。`,
      });
      continue;
    }
    parsed.set(d.label, p);
  }
  if (parsed.size !== docs.length) return violations; // 表都没了 ⇒ 后面的比对没有意义

  // ① 两棵树的名字集合必须相等（中英互为译文）
  const [a, b] = docs.map((d) => d.label);
  if (parsed.size === 2) {
    const sa = new Set(parsed.get(a).names);
    const sb = new Set(parsed.get(b).names);
    const onlyA = [...sa].filter((n) => !sb.has(n));
    const onlyB = [...sb].filter((n) => !sa.has(n));
    if (onlyA.length > 0 || onlyB.length > 0) {
      violations.push({
        kind: "doc-drift",
        msg:
          `两棵树的保留名集合不一致：${a} 独有 [${onlyA.map((n) => "." + n).join(", ")}]；` +
          `${b} 独有 [${onlyB.map((n) => "." + n).join(", ")}]。中英是同一张表的两个译本，必须同笔改。`,
      });
    }
  }

  // ② 表里的名字必须真实存在；同一处只报一次（两棵树一致时消息会重复）
  const seen = new Set();
  const push = (kind, msg) => {
    const key = kind + "|" + msg;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ kind, msg });
  };
  for (const [label, p] of parsed) {
    for (const name of p.names) {
      if (!name.startsWith("ldk-")) {
        // ⚠️ E6#109l-b：这一列**只放 `ldk-` 名**。原来的「裸保留名」类别已随登记表 `classes` 一起退役
        //    （宿主与共享组件的类名规则都是结构性的 ⇒ 没有任何全局裸名需要作者避让）。
        push(
          "doc-name-unclassified",
          `${label}：表里出现了 \`.${name}\`——这一列**只放 \`ldk-\` 名**（宿主与共享组件自己定义的类名` +
            `一律带 \`ldk-\` 前缀，跨方公共面就这一个命名空间）。裸名不再是一个类别：` +
            `E6#109l-b 起两个定义域的规则都是「自己定义的类名一律 \`ldk-\` 开头」，没有登记表、没有豁免名单。` +
            `改法：删掉这一项（它已不存在），或改成它现在的 \`ldk-\` 名。`,
        );
        continue;
      }
      if (!ldkExists(name, ldkTokens)) {
        push(
          "ldk-name-not-found",
          `${label}：表里列了 \`${name}\`，但宿主源码（src/**/*.css）里没有任何这样的类名——` +
            `作者会照一个不存在的面写代码。改法：删掉这一项，或核对它是否已被改名。`
        );
      }
    }
  }

  /* ── ④ 关键帧列：与登记表 `keyframes` 双向 ＋ 两棵树一致 ＋ 形态（E6#109k-b 补） ── */
  const kfParsed = new Map();
  for (const d of docs) {
    const p = parseReservedKeyframes(d.text);
    if (!p) {
      push(
        "table-missing",
        `${d.label}：在 §12 里找不到「保留的关键帧名」表（表头须含「保留的关键帧名」/「Reserved keyframe names」，` +
          `且表里至少有一个名字）。——宿主关键帧也是保留名的一种：作者面没有这张表，作者就无从知道` +
          `哪些 \`@keyframes\` 名动不得（撞上就是宿主的动画静默不播）。`,
      );
      continue;
    }
    kfParsed.set(d.label, p);
  }
  if (kfParsed.size === docs.length) {
    const [ka, kb] = docs.map((d) => d.label);
    if (kfParsed.size === 2) {
      const sa = new Set(kfParsed.get(ka).names);
      const sb = new Set(kfParsed.get(kb).names);
      const onlyA = [...sa].filter((n) => !sb.has(n));
      const onlyB = [...sb].filter((n) => !sa.has(n));
      if (onlyA.length > 0 || onlyB.length > 0) {
        push(
          "doc-drift",
          `两棵树的**关键帧**名字集合不一致：${ka} 独有 [${onlyA.join(", ")}]；${kb} 独有 [${onlyB.join(", ")}]。` +
            `中英是同一张表的两个译本，必须同笔改。`,
        );
      }
    }
    for (const [label, p] of kfParsed) {
      if (p.dotted) {
        push(
          "keyframe-name-unclassified",
          `${label}：关键帧列里出现了 \`.foo\` 形态——这一列**只放关键帧名**（关键帧名不带点），` +
            `类名走上面那张「保留名」表。`,
        );
      }
      for (const n of p.names) {
        if (!registeredKeyframes.has(n)) {
          push(
            "keyframe-unregistered",
            `${label}：关键帧列里列了 \`${n}\`，但登记表（${RESERVED_FILE_REL}）的 \`keyframes\` 里没有它——` +
              `作者会白白避让一个不存在的名字。改法：从表里删掉，或补进登记表并写明为什么必须是全局的。`,
          );
        }
      }
    }
    for (const n of registeredKeyframes.keys()) {
      for (const [label, p] of kfParsed) {
        if (!p.names.includes(n)) {
          push(
            "keyframe-not-in-doc",
            `${label}：登记表 \`keyframes\` 里的 \`${n}\` 没出现在 §12 的关键帧表里——` +
              `作者读不到它就会拿它当普通名字用（撞名后果：宿主的动画被顶掉，且不报错）。` +
              `改法：把它补进表里（两棵树都要），或从登记表摘掉。`,
          );
        }
      }
    }
  }
  return violations;
}

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */
const fixture = ({
  hostCell = "`.ldk-input`",
  ldk = "`ldk-badge`, `ldk-titlebar`",
  kfCell = "`ldk-selectbox-in`",
  kfEnCell = null,
  kfRegistry = ["ldk-selectbox-in"],
  kfTable = true,
}) => {
  const kfZh = kfTable ? `| 保留的关键帧名 | 说明 |\n|---|---|\n| ${kfCell} | 共享组件下拉入场动画 |\n\n` : "";
  const kfEn = kfTable
    ? `| Reserved keyframe names | Notes |\n|---|---|\n| ${kfEnCell ?? kfCell} | the shared dropdown's entrance animation |\n\n`
    : "";
  return {
    docs: [
      {
        label: "zh-fixture",
        text: `## 12. CSS 类名\n\n| 来源 | 保留名 | 说明 |\n|---|---|---|\n| 宿主全局工具类 | ${hostCell} | 说明一 |\n| 共享组件类名 | ${ldk} | 说明二 |\n\n${kfZh}### 12.1 迁移\n\n升级后拿这八个旧基名 \`.badge\`、\`.toggle\` grep 自己的 CSS。\n`,
      },
      {
        label: "en-fixture",
        text: `## 12. CSS Class Names\n\n| Source | Reserved names | Notes |\n|---|---|---|\n| Host global utility classes | ${hostCell} | note one |\n| Shared component classes | ${ldk} | note two, e.g. the badge one |\n\n${kfEn}### 12.1 Upgrading\n\ngrep your CSS for the eight old base names \`.badge\`, \`.toggle\`.\n`,
      },
    ],
    registeredKeyframes: new Map(kfRegistry.map((n) => [n, "fixture"])),
    ldkTokens: new Set(["ldk-badge", "ldk-badge--accent", "ldk-titlebar", "ldk-titlebar-btn", "ldk-input"]),
  };
};

/* 非样式家族那一段的自测夹具（账 ＋ 两棵树的总表 ＋ 规则句） */
const hostFixture = ({
  famZh = "宿主命令前缀",
  famEn = "Host command prefix",
  nameZh = "`app.`",
  nameEn = null,
  ledger = { commandPrefixes: ["app."] },
  rule = true,
  table = true,
  extraTable = "",
} = {}) => {
  const ruleZh = rule ? "**一句话规则：宿主保留的名字不许占；插件自己写的名字必须带 `<pluginId>` 前缀。**\n\n" : "";
  const ruleEn = rule
    ? "**The one-sentence rule: names the host reserves are off limits; every name you invent must carry your `<pluginId>` prefix.**\n\n"
    : "";
  const tblZh = table ? `| 家族 | 保留的名字 | 你会撞上什么 |\n|---|---|---|\n| ${famZh} | ${nameZh} | 说明 |\n\n` : "";
  const tblEn = table
    ? `| Family | Reserved name | What happens if you take it |\n|---|---|---|\n| ${famEn} | ${nameEn ?? nameZh} | note |\n\n`
    : "";
  return {
    docs: [
      { lang: "zh", label: "zh-fixture", text: `${extraTable}## 七、宿主保留的名字\n\n${ruleZh}${tblZh}` },
      { lang: "en", label: "en-fixture", text: `## 7. Names the host reserves\n\n${ruleEn}${tblEn}` },
    ],
    ledger,
  };
};

function selfTest() {
  const cases = [];
  const T = (name, mutate, kinds = []) => {
    const f = fixture(mutate ?? {});
    const got = checkSync(f);
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };
  // 第二段（非样式家族）那条尺子的同一套收发
  const H = (name, mutate, kinds = []) => {
    const got = checkHostDocs(hostFixture(mutate ?? {}));
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };

  // 🔴 正控：三份一致 ⇒ 零违规（顺带钉住「英文散文里的 `e.g.` 不会被当成类名 `.g`」这条口径）
  T("正控：两棵树一致 ＋ 关键帧与登记表一致 ⇒ 绿");
  T("正控：列内散文里的 `e.g.` 不被误判成类名 ⇒ 绿", { hostCell: "`.ldk-input` (e.g. the plain one)" });
  T("正控：写成 `.ldk-badge` 也算 `ldk-` 形态 ⇒ 绿", { ldk: "`.ldk-badge`, `ldk-titlebar`" });

  // 🔴 负控①（**已翻面**）：这一列**只放 `ldk-` 名**——裸名（`.input`）从此是错的
  //   （E6#109l-b 前它是「裸保留名」类别、要查登记表；`classes` 退役后该类别不存在 ⇒ 直接判红）
  T("负控①：列里出现裸名 `.input` ⇒ 红（裸保留名类别已退役）", { hostCell: "`.input`" }, ["doc-name-unclassified"]);

  // 负控②：这一列里出现既非裸名、也非 `ldk-` 命名的第三种形态（`.some-widget`）
  T("负控②：列里出现 `.some-widget` ⇒ 红", { hostCell: "`.ldk-input`, `.some-widget`" }, ["doc-name-unclassified"]);

  // 负控③：两棵树各自为政（中英手抄漂移——改英文树那一份，中文不动）
  {
    const f = fixture({});
    f.docs[1].text = f.docs[1].text.replace("`ldk-titlebar`", "`ldk-toolbar`");
    const got = checkSync(f);
    cases.push(["负控③：中英两棵树名字不一致 ⇒ 红", got.some((v) => v.kind === "doc-drift"), got.map((v) => v.kind)]);
  }

  // 负控④：表里列了宿主源码里不存在的 `ldk-` 名
  T("负控④：表里 ldk- 名在宿主源码里不存在 ⇒ 红", { ldk: "`ldk-badge`, `ldk-toolbar`" }, ["ldk-name-not-found"]);

  // 负控⑤：§12 节整段消失
  {
    const f = fixture({});
    f.docs[0].text = f.docs[0].text.replace("## 12. CSS 类名", "## 11. 别的");
    const got = checkSync(f);
    cases.push(["负控⑤：§12 节找不到 ⇒ 红", got.some((v) => v.kind === "table-missing"), got.map((v) => v.kind)]);
  }

  // 负控⑥：表头那一列被改名（表格还在，但门禁认不出这一列）
  {
    const f = fixture({});
    f.docs[0].text = f.docs[0].text.replace("| 来源 | 保留名 | 说明 |", "| 来源 | 名字 | 说明 |");
    f.docs[1].text = f.docs[1].text.replace("| Source | Reserved names | Notes |", "| Source | Names | Notes |");
    const got = checkSync(f);
    cases.push(["负控⑥：保留名列被改名 ⇒ 红", got.some((v) => v.kind === "table-missing"), got.map((v) => v.kind)]);
  }

  // ── 关键帧列（E6#109k-b 补：1.15 的门禁只守了类名那一列）──
  T("正控：关键帧表与登记表 `keyframes` 一致 ⇒ 绿", { kfCell: "`ldk-notif-icon-spin`", kfRegistry: ["ldk-notif-icon-spin"] });
  T(
    "负控⑦：文档侧关键帧被改名 ⇒ 红",
    { kfCell: "`ldk-selectbox-out`" },
    ["keyframe-unregistered", "keyframe-not-in-doc"],
  );
  T("负控⑧：登记表多一个关键帧、表里没有 ⇒ 红", { kfRegistry: ["ldk-selectbox-in", "ldk-brand-x-in"] }, ["keyframe-not-in-doc"]);
  T("负控⑨：关键帧表整张消失 ⇒ 红", { kfTable: false }, ["table-missing"]);
  T("负控⑩：关键帧列里混进 `.foo` 形态 ⇒ 红", { kfCell: "`.foo`" }, ["keyframe-name-unclassified"]);
  T("负控⑪：登记表一条关键帧都没有（=`keyframes` 段被清空）⇒ 红", { kfRegistry: [] }, ["keyframe-unregistered"]);
  {
    // 负控⑫：两棵树关键帧各自为政（只改英文树那一份）
    const f = fixture({ kfEnCell: "`ldk-selectbox-enter`" });
    const got = checkSync(f);
    cases.push(["负控⑫：中英两棵树关键帧不一致 ⇒ 红", got.some((v) => v.kind === "doc-drift"), got.map((v) => v.kind)]);
  }

  // ── 第二段：非样式家族的「宿主保留的名字」总表 ↔ 账（E6#111k／1.49 追加）──
  H("正控：账 ↔ 两棵树总表双向一致 ＋ 规则句在 ⇒ 绿");
  H("正控：篇内另有同形表（`| 名字 | 真源在哪 |`）不被误吃 ⇒ 绿", {
    extraTable: "| 名字 | 真源在哪 |\n|---|---|\n| 插件身份 id | `plugin.json` |\n\n",
  });
  H("正控：族名为 `**` 强调形态（`**宿主命令前缀**`）与账仍对得上 ⇒ 绿", { famZh: "**宿主命令前缀**" });
  // 负控⑬：表里多一个账里没有的名字（作者白白避让 / 或账漏了一条）
  H("负控⑬：表里 `core.` 不在账里 ⇒ 红", { nameZh: "`app.`、`core.`" }, ["host-name-not-in-ledger"]);
  // 负控⑭：**反向**——账里有、表里没有（只查一个方向的对账在这里是绿的）
  H("负控⑭：账里 `core.` 表里没有 ⇒ 红", { ledger: { commandPrefixes: ["app.", "core."] } }, [
    "host-name-unregistered",
  ]);
  // 负控⑮：族名不在双语映射里（例如英文树把族名改了个说法）
  H("负控⑮：族名「Host command prefixes」不在映射里 ⇒ 红", { famEn: "Host command prefixes" }, [
    "host-family-unknown",
  ]);
  // 负控⑯：账里冒出映射外的新家族（账是生成式的 ⇒ 加家族不同笔喂作者面就静默落后）
  H("负控⑯：账里多一个映射外的新家族 ⇒ 红", { ledger: { commandPrefixes: ["app."], newReservedThing: ["x"] } }, [
    "host-family-unmapped",
  ]);
  // 负控⑰：总表整张消失（含表头被改名/列被拿掉）
  H("负控⑰：两棵树的总表整张消失 ⇒ 红", { table: false }, ["host-table-missing"]);
  // 负控⑱：一句话规则句被删（表还在）
  H("负控⑱：一句话规则句被删 ⇒ 红", { rule: false }, ["host-rule-missing"]);
  // 负控⑲：两棵树各自为政（同一家族、不同名字）
  H("负控⑲：中英两棵树名字不一致 ⇒ 红", { nameEn: "`core.`", ledger: { commandPrefixes: ["app.", "core."] } }, [
    "doc-drift",
  ]);

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`check-reserved-names-doc-sync self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}

/* ── 入口 ──────────────────────────────────────────────────────────── */

if (IS_MAIN) main();

/** 主流程（仅直接运行时执行；被 import 时只暴露判据函数） */
function main() {
  if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());

  for (const d of [...DOCS, ...HOST_DOCS]) {
    if (!existsSync(join(ROOT, d.rel))) {
      console.error(`❌ [reserved-names-doc] 作者面文档不存在：${d.rel}`);
      process.exit(1);
    }
  }
  const docs = DOCS.map((d) => ({ label: d.label, text: readFileSync(join(ROOT, d.rel), "utf8") }));
  const styleViolations = checkSync({
    docs,
    registeredKeyframes: loadRegistry().keyframes,
    ldkTokens: collectLdkTokens(),
  });

  const hostDocs = HOST_DOCS.map((d) => ({
    lang: d.lang,
    label: d.label,
    text: readFileSync(join(ROOT, d.rel), "utf8"),
  }));
  const hostViolations = checkHostDocs({ docs: hostDocs, ledger: loadHostLedger() });

  const violations = [...styleViolations, ...hostViolations];

  if (violations.length === 0) {
    const names = parseReservedNames(docs[0].text).names;
    const ldk = names.filter((n) => n.startsWith("ldk-"));
    const kf = parseReservedKeyframes(docs[0].text).names;
    const hostRows = parseHostTable(hostDocs[0].text).rows;
    const hostNames = hostRows.reduce((n, r) => n + r.names.length, 0);
    console.log(
      `✅ [reserved-names-doc] 两段射程都一致：` +
        `①（样式）§12 两张表与登记表双向一致（保留名 ${ldk.length} 个、全部为 \`ldk-\` 名；关键帧 ${kf.length} 个）；` +
        `②（非样式）§七「宿主保留的名字」总表与账 ${HOST_LEDGER_REL} 双向一致` +
        `（家族 ${Object.keys(FAMILY_LABELS).length} 个 · 表 ${hostRows.length} 行 / ${hostNames} 个名字 · 规则句在）。` +
        `两棵树的名字集合各自相等。`
    );
    process.exit(0);
  }
  console.error(`❌ [reserved-names-doc] ${violations.length} 处不一致（保留名清单的单一真相源）：`);
  for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
  console.error(
    `   要对齐的三份：①（样式）登记表 ${RESERVED_FILE_REL} 的 \`keyframes\` 段 ↔ 两棵树的 §12 关键帧表；` +
      `§12 的「保留名」列必须只列真实存在的 \`ldk-\` 名。` +
      `②（非样式）账 ${HOST_LEDGER_REL} ↔ 两棵树 16-命名规范 §七 的「宿主保留的名字」总表` +
      `（**家族名与名字两侧都查**，中英两个译本必须相等）。判据见 scripts/check-reserved-names-doc-sync.mjs 文件头。`
  );
  process.exit(1);
}
