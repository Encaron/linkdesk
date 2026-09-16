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
 * 用法：
 *   node scripts/check-reserved-names-doc-sync.mjs              # 挂 npm run check
 *   node scripts/check-reserved-names-doc-sync.mjs --self-test  # 正控 4 ＋ 负控 13（类名列 ＋ 关键帧列）
 * 退出码 0 = 三份一致；1 = 有漂移（打印到 stderr）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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

function selfTest() {
  const cases = [];
  const T = (name, mutate, kinds = []) => {
    const f = fixture(mutate ?? {});
    const got = checkSync(f);
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

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`check-reserved-names-doc-sync self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}

/* ── 入口 ──────────────────────────────────────────────────────────── */

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());

for (const d of DOCS) {
  if (!existsSync(join(ROOT, d.rel))) {
    console.error(`❌ [reserved-names-doc] 作者面文档不存在：${d.rel}`);
    process.exit(1);
  }
}
const docs = DOCS.map((d) => ({ label: d.label, text: readFileSync(join(ROOT, d.rel), "utf8") }));
const reg = loadRegistry();
const violations = checkSync({
  docs,
  registeredKeyframes: reg.keyframes,
  ldkTokens: collectLdkTokens(),
});

if (violations.length === 0) {
  const names = parseReservedNames(docs[0].text).names;
  const ldk = names.filter((n) => n.startsWith("ldk-"));
  const kf = parseReservedKeyframes(docs[0].text).names;
  console.log(
    `✅ [reserved-names-doc] §12 两张表与登记表双向一致（保留名 ${ldk.length} 个、全部为 \`ldk-\` 名；` +
      `关键帧 ${kf.length} 个）；中英两棵树名字集合相等。`
  );
  process.exit(0);
}
console.error(`❌ [reserved-names-doc] ${violations.length} 处不一致（保留名清单的单一真相源）：`);
for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
console.error(
  `   要对齐的两侧：登记表 ${RESERVED_FILE_REL} 的 \`keyframes\` 段 ↔ 两棵树的 §12 关键帧表；` +
    `§12 的「保留名」列则必须只列真实存在的 \`ldk-\` 名（判据见 scripts/check-reserved-names-doc-sync.mjs 文件头）。`
);
process.exit(1);
