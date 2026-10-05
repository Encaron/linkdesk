/**
 * npm 作者轴「作者面」的共享判据底座（E6#166 抽出——原先只住在 check-npm-release.mjs 里）。
 *
 * 为什么独立成 lib：E6#166 起 **check-publish-gate.mjs 判据⑤** 也要读同一套东西（ui 的 surface
 * 名单 + 内容哈希 + 发布基线）——「壳发版 ⇔ ui 货不落后」与日常的「黄灯：作者面漂移」是**同一份
 * 判据的两种严厉程度**（闸只在发布那一下红；日常 check 永远黄）。判据本体只许有一份实现，
 * 两个消费者各取所需——与 changelog-section.mjs 同一模式，别各写一套。
 *
 * 消费者：
 *   scripts/check-npm-release.mjs   —— 黄灯 + release:mark 契约（五包全量）
 *   scripts/check-publish-gate.mjs  —— 发布判据⑤（只看 ui）
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, "..", ".."); // scripts/lib/ → 仓库根
const STATE_FILE = join(REPO_ROOT, "scripts", "npm-release-state.json");

/**
 * 🔴 E6#110：surface = 产物真源。真进包的内容住壳仓 src/components/shared/**（prepack 现场编译），
 * 只登记 barrel 目录 ⇒ 改共享组件永不亮灯（1.9 轮实证：四批改名 ui 一次没亮，0.2.0 靠人想起来才发）。
 * ⛔ 不许一把梭 `src/components/shared/**`：language-picker / theme-browser / sidebar-section 三只
 *   壳内专用（不在 barrel、改了不改包内容）会被算成「包内容变了」= 3 处误报（闸 1：零误报才配红灯），
 *   且 expandSurface 无排除语法 ⇒ 逐目录显式列；漏登记的目录由覆盖面断言报红兜住
 *   （断言本体在 check-npm-release.mjs：barrel 引用的 @shared 目录 ⊆ 这份名单，缺一即红）。
 * 🔴 22 目录 = barrel 引用集（2026-09-19 重测口径；`scripts/lib/ui-surface.mjs` 的
 *   `collectUiSharedDirs()` 可随时复核）。新增共享组件 = barrel + 这份名单同笔各加一行，漏一边断言红。
 *   🆕 2026-09-27：24 目录——04「悬停提示系统」件 1 加 hint-tip（barrel 导出 `HintTip`）＋
 *   keybinding-hint（**不在 barrel 但随 HintTip 进包**——键帽件是被 HintTip/ContextMenu 共同消费的
 *   产物真源，它变了包内容就变了，不登记 = 静默漏报；AssertionFn 只查"barrel 有、surface 无"，
 *   surface 多登记一个真进包目录不触发误报）。
 */
export const UI_SURFACE = [
  "packages/linkdesk-ui/src/**",
  "packages/linkdesk-ui/README.md",
  "src/components/shared/badge/**",
  "src/components/shared/button/**",
  "src/components/shared/color-picker/**",
  "src/components/shared/combobox/**",
  "src/components/shared/context-menu/**",
  // 2026-10-03 设置控件案：判据 A 搬入的控件/原子 + 词表正典运行时值
  "src/components/shared/effective-badge/**",
  "src/components/shared/image-picker/**",
  "src/components/shared/segment-preview/**",
  "src/components/shared/settings-hints/**",
  "src/components/shared/source-badge/**",
  "src/components/shared/file-icon/**",
  "src/components/shared/file-path-input/**",
  "src/components/shared/font-family-select/**",
  "src/components/shared/form-row/**",
  "src/components/shared/hint-card/**",
  "src/components/shared/hint-tip/**",
  "src/components/shared/hooks/**",
  "src/components/shared/inline-input/**",
  "src/components/shared/keybinding-hint/**",
  "src/components/shared/markdown-view/**",
  "src/components/shared/number-input/**",
  "src/components/shared/readonly-text/**", // M4 AI#38.12：只读文本展示件（P-2 拍板 A）
  "src/components/shared/overlay-portal/**",
  "src/components/shared/open-with-picker/**", // 2026-10-05「文件打开方式」**纠正案 4.5**：打开方式选择器转正归壳（共享件）
  "src/components/shared/plugin-card/**", // 2026-10-05「文件打开方式」案 4A：按插件浏览插件卡（共享件）
  "src/components/shared/plugin-icon/**",
  "src/components/shared/segmented-radio/**",
  "src/components/shared/section-subtitle/**", // M4 AI#38.12：分节副标题件（P-3 拍板 A）
  "src/components/shared/select-box/**",
  "src/components/shared/slider/**",
  "src/components/shared/string-list-editor/**",
  "src/components/shared/theme-picker/**",
  "src/components/shared/toggle/**",
];

/** 展开 glob（支持 ** 递归目录），返回相对 repo 根的已存在文件排序列表 */
export function expandSurface(patterns) {
  const out = new Set();
  const walk = (base) => {
    for (const ent of readdirSync(base, { withFileTypes: true })) {
      const abs = join(base, ent.name);
      const rel = relative(REPO_ROOT, abs);
      if (ent.isDirectory()) {
        // src/** 型前缀递归
        const relDir = rel.split(sep).join("/");
        if (patterns.some((p) => p.endsWith("/**") && relDir.startsWith(p.slice(0, -3)))) walk(abs);
      } else {
        out.add(rel.split(sep).join("/"));
      }
    }
  };
  for (const p of patterns) {
    if (p.endsWith("/**")) {
      const dirAbs = join(REPO_ROOT, p.slice(0, -3));
      if (existsSync(dirAbs)) walk(dirAbs);
    } else if (existsSync(join(REPO_ROOT, p))) {
      out.add(p);
    }
  }
  return [...out].sort();
}

/**
 * sha256 over 排序文件列表内容（含路径分隔行——改名即漂移）。
 *
 * 🔴 **必须先归一行尾再入哈希**（2026-09-12 修，实测）：同一份仓库内容，本机工作区是 CRLF、
 * 干净检出是 LF（`.gitattributes` 的 `* text=auto eol=lf` 只约束「之后的检出」，**改写不了已经躺在
 * 盘上的旧字节**）⇒ 读原始字节算哈希 = 同一个内容在两次检出上得到两个哈希 ⇒ 基线**绑死记它的那台机器**。
 * 实证：`HEAD` 内容在本机（CRLF）算出 `8903790d…`、在干净检出（LF）算出 `b027cb7e…`，
 * 一个都对不上基线 ⇒ 换台机器/换次检出就必然误报。同类病本仓一天内已犯过两次
 * （`generate-contract.mjs` 2026-09-11 修、`generate-api-cheatsheet.mjs` 2026-09-12 CI 红），
 * 二者与 `contracts:check` 同款处理：**归一后再比**。
 * ⚠️ 判据不是「归一后灯灭了」（灯灭也可能因为基线本来就旧），而是：
 * **mark 之后，本机工作区与干净检出跑本脚本都必须静默**——不静默即说明还在绑机器。
 */
export function contentHash(surfaceFiles) {
  const h = createHash("sha256");
  const perFile = {};
  for (const rel of surfaceFiles) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const bytes = readFileSync(abs, "utf8").split("\r\n").join("\n");
    h.update(`### ${rel}\n`);
    h.update(bytes);
    // 🆕 E6#110：顺带留逐文件哈希（16 hex 足够防漂移误判）——黄灯亮时能报出漂移文件名单
    perFile[rel] = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  }
  return { hash: h.digest("hex"), perFile };
}

/** 读发布基线（scripts/npm-release-state.json）。缺文件/坏 JSON ⇒ 空数组（= 「无基线」同语义，消费方自行判）。 */
export function readReleaseState() {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return Array.isArray(state.packages) ? state.packages : [];
  } catch {
    return [];
  }
}

/** 逐文件漂移名单：当前 perFile vs 基线 perFile。三个数组都是相对 repo 根路径。 */
export function listSurfaceDrift(currentPerFile, baselinePerFile) {
  const cur = currentPerFile ?? {};
  const base = baselinePerFile ?? {};
  return {
    added: Object.keys(cur).filter((f) => !(f in base)),
    removed: Object.keys(base).filter((f) => !(f in cur)),
    changed: Object.keys(cur).filter((f) => f in base && cur[f] !== base[f]),
  };
}

/** 把漂移名单格式化成黄灯/判据共用的那句（最多列 10 个）；无漂移 ⇒ null。 */
export function formatSurfaceDrift(drift) {
  if (!drift) return null;
  const items = [
    ...drift.added.map((f) => `+ ${f}`),
    ...drift.removed.map((f) => `- ${f}`),
    ...drift.changed.map((f) => `~ ${f}`),
  ];
  const n = items.length;
  return n === 0 ? null : `漂移 ${n} 个文件：${items.slice(0, 10).join("；")}${n > 10 ? `；…共 ${n} 个` : ""}`;
}
