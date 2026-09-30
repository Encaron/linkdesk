/**
 * 「**谁的仓谁译文**」判据——插件自己声明的可渲染文案，必须住在**自己的字典**里。
 *
 * ═══ 为什么必须有它（出处：2026-09-30 用户实机立案 E6#161）═══
 * 用户报「**设置插件自己的翻译没做全，比如自己在设置中的声明项**」——英文界面下设置页左栏
 * 那组「设置插件／打开方式」仍是中文。追下去发现两层：
 *   ① 设置仓**一个 i18n 键都没有**：它的文案一律「`plugin.json` 留中文原文、渲染时才 `t()`」
 *      （E5#109 方案 B），而英文全住**另一个仓**（官方语言包 `lang-defaults`）。
 *   ② 于是「声明项要不要补译」变成**跨仓**的事：设置仓加一条声明，lang-defaults 仓**跟不动**
 *      （它连这个键都不知道）。这不是谁的笔误，是**归属没定**。
 *
 * 用户 2026-09-30 拍板定归属：**谁的仓谁译文**——插件自己声明的可渲染文案，译名住自己的
 * `i18n/<lang>.json`；壳核心文字仍住语言包（那是「一个应用的整体翻译」这件事的载体）。
 * 本模块就是那条规则的机械尺（三层固化第 3 层）。
 *
 * ═══ 判据（两条，severity 不同——理由见下）═══
 *   ① **manifest 声明串**（红）：`plugin.json` 里**有渲染消费方**的字段值（清单见
 *      `RENDERABLE_MANIFEST_FIELDS`，逐条带消费方），若含中文，必须命中本仓**自己声明的字典**
 *      （`contributes.i18n` / `contributes.languages[].path`）的某个 key。
 *      **为什么可以硬判**：声明在**本仓**、渲染在**壳或别的插件**——跨仓追不上，只有本仓能负责。
 *   ② **源码 `t()` 串**（黄）：本仓 `src/**` 里 `t("中文")` 字面量 key 没住在自有字典。
 *      **为什么只能黄**：应用级字典（`lang-defaults`）**是合法提供方**，插件仓里判不出「这个键
 *      是不是别处给的」——硬判必出假红，而假红会让真红失效（同 `warnOnKeyOverlap` 的立论）。
 *      存量缺口按「谁的仓」逐仓迁（settings 是试点）；迁完这条可以升红。
 * ⛔ **域外（本判据不管，别以为漏了）**：值译得对不对；跨仓撞键（归壳侧 `warnOnKeyOverlap`）；
 *   非中文原文的插件（E5.8#37.9 明文：作者可用任意语言原文做 key，缺译文静默回退 = 设计意图，
 *   不是漏翻——故本判据**只审中文串**）。
 *
 * ═══ 消费方（两轴同一份实现，⛔ 不许各写一份）═══
 *   · 作者侧：`create-linkdesk-plugin` 模板的 `scripts/ci-verify.mjs` ③ 段——插件仓 CI 判红
 *     （经 `@linkdesk/plugin-sdk/own-dict-coverage` subpath 引入：插件仓**零新增 devDependency**，
 *      纯数据插件仓也在覆盖内）。
 *   · 壳侧：`scripts/audit-i18n.mjs` 的 manifest 腿——走**全部官方/第三方仓**
 *     （仓清单读 `scripts/lib/plugin-repos.mjs`），并额外做「跨仓池对照」（`lang-defaults` 是合法池）。
 *
 * 用法：
 *   import { checkOwnDictCoverage } from "@linkdesk/plugin-sdk/own-dict-coverage";
 *   const r = checkOwnDictCoverage(process.cwd());   // ⇒ { manifestGap, sourceGap, dict, ... }
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

/** 口径一句话——门禁与文档互钉用（改判据就改这句，两处锚词比对会跟着红） */
export const OWN_DICT_CALIBER =
  "谁的仓谁译文：插件自己声明的可渲染文案（manifest 渲染字段 ＋ 本仓 t() 中文 key）必须住在本仓声明的字典里——声明在谁手里，译名就归谁，跨仓追不上。";

/** 中文（CJK 统一表意）——只有含它的串才进判据（英文/法文原文插件 = 设计允许，见文件头 ⛔ 域外） */
const CJK_RE = /[\u4e00-\u9fff]/;

/**
 * **可渲染 manifest 字段清单**——每条 = 一条路径（`steps`）＋ 取值字段（`field`）＋ **消费方**。
 *
 * `steps` 的三种步：
 *   · 普通键名 —— 下钻该键；
 *   · `"*"` —— 对象的值逐个走（贡献点里 `<id>` 段那种开放键名）；
 *   · `"[]"` —— 数组元素逐个走；
 *   · `"**"` —— 沿 `children` 递归（菜单子菜单，任意深度）。
 * `field` 为 `null` ⇒ 落点**自己就是那条字符串**（如 `groupDescriptions` 的值）。
 *
 * 🔴 **改 `schemas/plugin.schema.json` 的渲染字段时，同笔改这里**（两处是同一件事的两面：
 *    schema 说「能声明什么」，本表说「声明了要译」）。⛔ 别把「声明数据」（`commands[].description`
 *    / `params[].description`——2026-09-28 裁决：消费方 = 契约 → AI，零渲染消费方）塞进来；
 *    撤销条件 = 那些说明一旦进 UI。
 * ⛔ 故意**不在表内**的专名/元数据（各有理由，与壳侧旧名单同一口径）：
 *    `contributes.themes[].label` / `languages[].label` / `langDefs[].aliases`（品牌名／语言自称）、
 *    `icons.*.description`（作者面元数据，消费方是**别的作者**不是用户）、以及一切路径/ID/上下文键
 *    （`entry` / `icon` / `render` / `path` / `sidebar` / `when` / `key` / 菜单 `group` 槽位 / `cssVars` /
 *    `tabBehavior` / `minAppVersion` / `screenshots` / `resources`…）。
 */
export const RENDERABLE_MANIFEST_FIELDS = [
  { steps: [], field: "name", consumer: "插件名（市场列表行 / 详情页 / 侧栏标题）" },
  { steps: [], field: "description", consumer: "插件一行说明（详情页 t(description) / 市场列表行）" },
  { steps: ["statusBar", "[]"], field: "label", consumer: "状态栏条目文本" },
  { steps: ["contributes", "commands", "[]"], field: "title", consumer: "命令面板 / 菜单标题" },
  { steps: ["contributes", "commands", "[]"], field: "category", consumer: "命令面板分组名" },
  { steps: ["contributes", "menus", "*", "[]", "**"], field: "label", consumer: "菜单项 / 子菜单标签" },
  { steps: ["contributes", "configuration"], field: "title", consumer: "设置页分组名" },
  { steps: ["contributes", "configuration"], field: "subtitle", consumer: "设置页分组副标题" },
  {
    steps: ["contributes", "configuration", "groupDescriptions", "*"],
    field: null,
    consumer: "设置页分节说明（settings 仓 t(groupDescriptions[组名])）",
  },
  {
    steps: ["contributes", "configuration", "properties", "*"],
    field: "description",
    consumer: "设置项说明（settings 仓 t(prop.description)）",
  },
  {
    steps: ["contributes", "configuration", "properties", "*"],
    field: "group",
    consumer: "设置页二级标题（settings 仓 t(bucket.group)）",
  },
  {
    steps: ["contributes", "configuration", "properties", "*"],
    field: "enumDescriptions",
    consumer: "设置页枚举显示名（值形态：对象 value→名 或 数组）",
    mapValues: true,
  },
  { steps: ["contributes", "viewsContainers", "*"], field: "title", consumer: "侧栏容器标题" },
  { steps: ["contributes", "views", "*", "[]"], field: "title", consumer: "侧栏 / 面板视图标题" },
  { steps: ["contributes", "views", "*", "[]"], field: "singleViewPaneContainerTitle", consumer: "单视图容器标题" },
  { steps: ["contributes", "views", "*", "[]"], field: "titleDescription", consumer: "视图标题说明" },
  { steps: ["contributes", "views", "*", "[]"], field: "titleTooltip", consumer: "视图标题提示" },
  { steps: ["contributes", "views", "*", "[]", "titleActions", "[]"], field: "title", consumer: "视图动作按钮 tooltip / 文本" },
  {
    steps: ["contributes", "views", "*", "[]", "titleActions", "[]", "items", "[]"],
    field: "label",
    consumer: "视图动作下拉项标签",
  },
  { steps: ["contributes", "titleBar", "left", "[]"], field: "label", consumer: "标题栏按钮文本" },
  { steps: ["contributes", "titleBar", "right", "[]"], field: "label", consumer: "标题栏按钮文本" },
  { steps: ["contributes", "fileAssociations", "[]"], field: "displayName", consumer: "「打开方式…」选择器显示名" },
];

/** 默认跳过的目录名——构建产物 / 依赖 / 编辑器临时目录 */
export const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  ".git",
  ".vite",
  "coverage",
  "__tests__",
  "build",
]);

/** 参与 `t()` 扫描的源码文件（测试 / mock 不在其列——它们不受这条纪律约束，同 ci-verify 口径） */
export function isSourceFile(relPath) {
  return (
    /\.(ts|tsx|js|jsx)$/.test(relPath) &&
    !/\.(test|spec)\./.test(relPath) &&
    !/\.(fixture|mock)\./.test(relPath) &&
    !/mock/i.test(relPath)
  );
}

/** 本仓**自己声明的**字典文件——`contributes.i18n`（langId → 路径）＋ `contributes.languages[].path` */
export function collectOwnDictDecls(manifest) {
  const out = [];
  const c = manifest?.contributes;
  if (!c || typeof c !== "object") return out;
  if (c.i18n && typeof c.i18n === "object" && !Array.isArray(c.i18n)) {
    for (const [lang, rel] of Object.entries(c.i18n)) {
      if (typeof rel === "string") out.push({ origin: `contributes.i18n.${lang}`, lang, rel });
    }
  }
  if (Array.isArray(c.languages)) {
    for (const l of c.languages) {
      if (l && typeof l.path === "string") {
        out.push({ origin: `contributes.languages[${l.id ?? "?"}]`, lang: String(l.id ?? ""), rel: l.path });
      }
    }
  }
  return out;
}

/**
 * 读本仓声明的字典 → key 集合（key = 原文，与语言无关）。
 * 任一文件读不到 / 解析不动 ⇒ `degraded: true` ＋ `problems`——**调用方据此跳过判红**
 * （字典不完整时「全部 gap」是假红，而假红会让真红失效；那条硬伤由字典完整性那条腿报）。
 */
export function loadOwnDict(absRoot, manifest) {
  const files = [];
  const problems = [];
  const keys = new Set();
  for (const d of collectOwnDictDecls(manifest)) {
    let raw;
    try {
      raw = readFileSync(join(absRoot, d.rel.split("/").join(sep)), "utf8");
    } catch {
      problems.push(`${d.rel}（${d.origin} 声明但读不到）`);
      continue;
    }
    let dict;
    try {
      dict = JSON.parse(raw);
    } catch (e) {
      problems.push(`${d.rel} 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
      problems.push(`${d.rel} 不是「key → 文案」对象`);
      continue;
    }
    const own = Object.keys(dict);
    own.forEach((k) => keys.add(k));
    files.push({ origin: d.origin, rel: d.rel, lang: d.lang, keys: own });
  }
  return { keys, files, problems, degraded: problems.length > 0 };
}

/** `steps` 逐段下钻 → 落点数组（`"*"` 开放键 / `"[]"` 数组 / `"**"` 沿 children 递归） */
function resolveSteps(node, steps) {
  if (steps.length === 0) return [node];
  const [s, ...rest] = steps;
  if (s === "[]") return Array.isArray(node) ? node.flatMap((n) => resolveSteps(n, rest)) : [];
  if (s === "*") {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    return Object.values(node).flatMap((n) => resolveSteps(n, rest));
  }
  if (s === "**") {
    const out = [];
    const walk = (n) => {
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (!n || typeof n !== "object") return;
      out.push(...resolveSteps(n, rest));
      walk(n.children);
    };
    walk(node);
    return out;
  }
  if (!node || typeof node !== "object") return [];
  return resolveSteps(node[s], rest);
}

/** 落点 → 要判的字符串们（`field: null` ⇒ 落点自己就是；`mapValues` ⇒ 对象/数组两种形态的值） */
function fieldValues(node, spec) {
  if (spec.field == null) return [node];
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const v = node[spec.field];
  if (v === undefined) return [];
  if (spec.mapValues) {
    if (Array.isArray(v)) return v; // 数组形态（壳侧 `enumDescriptions: string[]` 就是这种）
    if (v && typeof v === "object") return Object.values(v); // 对象形态（value → 显示名）
    return [v];
  }
  return [v];
}

/**
 * 收集 manifest 里的**可渲染中文串** → `[{ text, field, consumer }]`（按 text 去重，保留首个落点）。
 * 只收含中文的串：非中文原文插件（设计允许）不在此列。
 */
export function collectRenderableManifestStrings(manifest) {
  const out = [];
  const seen = new Set();
  for (const spec of RENDERABLE_MANIFEST_FIELDS) {
    // 路径可读化：`[]` 贴在前一段上（`contributes.commands[]` 比 `contributes.commands.[]` 好读）
    const where = (spec.steps.length ? spec.steps.join(".") : "(顶层)")
      .replace(/\.\[\]/g, "[]")
      .replace(/\.\*\[\]/g, ".*[]");
    for (const node of resolveSteps(manifest, spec.steps)) {
      for (const v of fieldValues(node, spec)) {
        if (typeof v !== "string" || !CJK_RE.test(v)) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push({ text: v, field: `${where}${spec.field ? `.${spec.field}` : ""}`, consumer: spec.consumer });
      }
    }
  }
  return out;
}

/**
 * 扫本仓 `src/**` 的 `t("…")` 字面量 key → `[{ key, at: ["src/x.tsx", …] }]`（只收含中文的 key）。
 * 与壳侧 `audit-i18n` 的 G2 分工：那边管**标识符形态**的 key（数据键名误走翻译），这边管**中文** key
 * （该不该由本仓提供译名）——**同一份正则**，免得同一个调用点两把尺子说法不同。
 */
export function collectSourceTKeys(absRoot, options = {}) {
  const skipDirs = options.skipDirs ?? DEFAULT_SKIP_DIRS;
  const srcRel = options.srcDir ?? "src";
  const found = new Map();
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (skipDirs.has(e.name) || e.name.startsWith(".")) continue;
        walk(join(absDir, e.name), rel);
        continue;
      }
      if (!e.isFile() || !isSourceFile(rel)) continue;
      let text;
      try {
        text = readFileSync(join(absDir, e.name), "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g)) {
        const key = m[2].replace(/\\(["'\\nrt])/g, (_, c) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
        );
        if (!CJK_RE.test(key)) continue;
        const at = found.get(key) ?? [];
        if (!at.includes(rel)) at.push(rel); // 同一文件里出现多次只记一次（报错读的是「在哪几处」）
        found.set(key, at);
      }
    }
  };
  walk(join(absRoot, srcRel.split("/").join(sep)), srcRel);
  return [...found].map(([key, at]) => ({ key, at }));
}

/**
 * 判据主体——`{ manifestGap, sourceGap, dict, scanned, degraded, problems }`。
 *
 * `manifestGap[i]` = `{ text, field, consumer }`（**红**：声明在本仓，跨仓追不上）；
 * `sourceGap[i]`   = `{ key, at }`（**黄**：应用级字典是合法提供方，本仓判不出「是不是别处给的」）。
 */
export function checkOwnDictCoverage(absRoot, options = {}) {
  const manifest = options.manifest;
  const dict = loadOwnDict(absRoot, manifest);
  const manifestStrings = collectRenderableManifestStrings(manifest);
  const sourceKeys = collectSourceTKeys(absRoot, options);
  return {
    dict,
    scanned: { manifestStrings: manifestStrings.length, sourceKeys: sourceKeys.length },
    manifestGap: manifestStrings.filter((s) => !dict.keys.has(s.text)),
    sourceGap: sourceKeys.filter((k) => !dict.keys.has(k.key)),
    degraded: dict.degraded,
    problems: dict.problems,
  };
}

/** 违规 → 人类可读一行（两轴打印同款，免得同一条错两种说法） */
export function formatOwnDictIssue(issue) {
  if ("text" in issue) return `${JSON.stringify(issue.text)}  @${issue.field}（${issue.consumer}）`;
  return `${JSON.stringify(issue.key)}  t() @${issue.at.slice(0, 3).join(" / ")}${issue.at.length > 3 ? ` 等 ${issue.at.length} 处` : ""}`;
}

/** 违规 → 修法提示（按 severity 给因——两种缺口的修法不同） */
export function ownDictHint(issue) {
  if ("text" in issue) {
    return (
      "声明在你仓里 ⇒ 译名也该住你仓：在本仓 `i18n/<lang>.json` 加一条 `\"原文\": \"译文\"`，" +
      "并在 `plugin.json` 的 `contributes.i18n` 里声明该文件（照 `create-linkdesk-plugin` 模板）。" +
      "⛔ 别去改官方语言包——那条路跨仓，跟不动（本判据的出处就是这个病）。"
    );
  }
  return (
    "本仓 `src` 里的 t() 中文 key 没住自有字典。**黄灯不拦**：它可能由应用级字典（lang-defaults 插件）提供。" +
    "按「谁的仓谁译文」逐条迁进本仓 `i18n/<lang>.json`（迁完在语言包侧删同键，免得撞键出声）。"
  );
}
