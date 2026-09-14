/**
 * ThemeEngine 共享测试 fixture——虚构值（硬约束 21：demo-* 不指真实插件）。
 * MOCK_THEME 族 / RECIPE 族 / GLASS_VARS / 真实主题读取 helper——registry/apply/recipe/fonts/
 * seeds/mix/accent/integration 各组测试复用（模块级单份定义，防 jscpd 同款复制）。
 *
 * ⚠️ 命名故意用 `.mock.ts`（无测试用例的纯 fixture 数据）：audit-i18n /mock/i 与
 * eslint no-hardcoded-hex /mock/i 两门禁一致豁免测试桩数据（含主题色值/中文配色名）。
 * 不要改回 testFixtures.ts——会同时击穿 i18n 审计（中文配色名当 UI 文案）与 hex 门禁。
 */

import fs from "node:fs";
import path from "node:path";
import { parseThemeRecipe } from "../../../registry/appearance/ThemeRegistry";
import { normalizePath } from "../../../utils/path/pathUtils";
import type { Theme } from "../ThemeEngine";
import type { ThemeRecipe } from "../../../types/theme";

export const MOCK_THEME: Theme = {
  name: "Test Dark",
  type: "dark",
  colors: { bg: "#000", fg: "#fff", accent: "#ff0000" },
};

export const MOCK_THEME2: Theme = {
  name: "Test Light",
  type: "light",
  colors: { bg: "#fff", fg: "#000" },
};

/* 真实主题 JSON 读取 helper（模块级单份，避免 jscpd 同款复制）——
 * 读真实 recipe 文件 → parseThemeRecipe → 返回 { raw, recipe }。
 * 2026-09-05 塌平单根（原 plugins/user/theme-*）。
 *
 * 🔴 E6#99（L7 第 7.2 轮）：**官方主题插件的源码已外移各自独立仓** ⇒ 仓内 `plugins/theme-*` 不存在了。
 *   本 helper 的**意图不变**（拿真实配方做端到端裁决，而不是虚构 fixture），只是「真实」的落点换了。
 * 🔴 E6#101（L7 第 7.4 轮）：随包种子**收敛到 6 只基础插件**（D4 判据「断网零插件能否自救」）⇒
 *   当年**为测试造的**那些主题（songti / terminal / pill / panorama / aurora-glass / zones）不再随包，
 *   种子 zip 也没了。**测试要的是「真实配方文本」，不是「随包」这件事**——两者诉求第一次分开，
 *   故第三跳读 `dev-fixtures/theme-recipes/` 的**冻结快照**（来源与边界见该目录 README）。
 *   链路（按「离真相近」排序）：
 *     ① 仓内源码（开发夹具）→ 直接读文件；
 *     ② 随包种子 zip（仍在箱内的基础插件）→ 读包内同一条目；
 *     ③ 冻结快照（已改为纯市场的主题）→ 读快照文件。
 *   **断言一条没减**；改配方请去插件仓，「改完立刻能验」的等价断言归 7.5 的 `E6#102f`。
 *   JSZip 是异步 API ⇒ helper 变 `async`，调用点加 `await`。 */
const ROOT = process.cwd();

/** 从随包种子 zip 里取一个文本条目（相对插件根） */
async function readFromSeedZip(pluginId: string, entry: string): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zipPath = path.join(ROOT, "bundled-plugins", `${pluginId}.linkdesk-plugin`);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const hit = Object.keys(zip.files).find((n) => n === entry || n.endsWith(`/${entry}`));
  if (!hit) throw new Error(`种子 ${pluginId}.linkdesk-plugin 里没有条目 ${entry}`);
  return zip.file(hit)!.async("string");
}

/** 读插件工程里的文本：仓内源码 → 随包种子 zip → 冻结快照（三跳，见上）
 *  不导出——唯一消费者是本文件的 `loadRealRecipe`（knip 对未使用导出会报红）。 */
async function readPluginText(rel: string): Promise<string> {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
  const m = /^plugins\/([^/]+)\/(.+)$/.exec(normalizePath(rel));
  if (!m) throw new Error(`读不到 ${rel}（既不在仓内，也不像 plugins/<id>/… 形态）`);
  const [, pluginId, entry] = m;
  if (fs.existsSync(path.join(ROOT, "bundled-plugins", `${pluginId}.linkdesk-plugin`))) {
    return readFromSeedZip(pluginId, entry);
  }
  const snapshot = path.join(ROOT, "dev-fixtures", "theme-recipes", pluginId, entry);
  if (fs.existsSync(snapshot)) return fs.readFileSync(snapshot, "utf8");
  throw new Error(
    `读不到 ${rel}：不是仓内源码、不在随包种子里（它可能已改为纯市场）、也没有冻结快照` +
      `（快照目录 dev-fixtures/theme-recipes/——新增这样的断言时要同笔放一份进去）`,
  );
}

export async function loadRealRecipe(rel: string, id: string, label: string, uiTheme: "light" | "dark") {
  const raw = await readPluginText(rel);
  const recipe = parseThemeRecipe(JSON.parse(raw), { id, label, uiTheme, path: rel });
  return { raw, recipe };
}

/* 共享配方 fixture（虚构值，硬约束 21）——applyRecipe / 资产字体 / 混搭 三组 describe 复用：
 * 模块级单份定义，避免 jscpd 同款复制（每 describe 各写一份 = 重复代码）。 */
export const RECIPE: ThemeRecipe = {
  id: "demo-recipe",
  name: "Demo Recipe",
  type: "dark",
  appearance: {
    radius: { sm: 6, lg: 12 },
    glass: { type: "glass", blur: 14 },
    font: { ui: "Noto Sans SC" },
  },
  colorways: [
    { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
    { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
  ],
};
export const RECIPE_NO_COLOR: ThemeRecipe = {
  id: "demo-plain",
  name: "Demo Plain",
  type: "light",
  colorways: [{ id: "plain", name: "Plain", colors: { "bg-window": "#FAFAFA" } }],
};
export const RECIPE_ASSET: ThemeRecipe = {
  id: "demo-font-recipe",
  name: "Demo Font Recipe",
  type: "dark",
  appearance: { font: { ui: "./resources/DemoFont.woff2" } },
  colorways: [{ id: "base", name: "Base", colors: { "bg-window": "#101014" } }],
};
export const GLASS_VARS = ["glass-blur", "glass-saturate", "glass-tint", "glass-opacity", "glass-specular", "glass-specular-color", "glass-morph"];
