/**
 * `@linkdesk/ui` 导出面——提取 / 序列化 / diff 的**唯一口径**（E6#121）。
 *
 * ── 它守的是哪句话 ──
 *   L9「UI 集中供给」把 `@linkdesk/ui` 从「编译进插件 bundle」翻转为「池 vendor 单实例供给」。
 *   翻转后插件运行时只有**壳那一版**组件——每个导出名从此是终身承诺（作者面 npm i 的只是
 *   类型 + dev 解析体）。⇒ 导出面**只许新增、不许删除 / 改名**，由
 *   `scripts/check-ui-surface-additive.mjs` 常驻判红（写侧 = `scripts/gen-ui-surface.mjs`）。
 *
 * ── 真相源 ──
 *   `packages/linkdesk-ui/src/index.ts`（barrel，头注释自称「公共导出面的唯一真相源」）。
 *   导出行是规整的 `export { default as X } from "@shared/…"` / `export { X } from …` /
 *   `export type { … } from …`——正则逐行提取，⛔ 不引 AST 依赖（照 `lib/api-surface.mjs` 的朴素风格）。
 *
 * ── 分类（只影响快照的归档栏目，不影响判红——任何一栏缺项都红）──
 *   · `components`  默认导出（`export { default as X }`）＋ 具名组件（InlineInput / PluginIcon /
 *                   FileIconResolver / OverlayPortal 等具名非 hook 非 helper 导出）——**新导出的默认落栏**；
 *   · `hooks`       名字 `use` 开头（useClickPreview 一族，E6#15h）；
 *   · `helpers`     显式清单（pickIdentityArt / DEFAULT_PLUGIN_IDENTITY_URI / inferSliderStep /
 *                   urlSourceKey——函数与常量，非组件）；
 *   · `types`       `export type { … }`（对插件许诺的类型面，同样只加不删）。
 *   新增导出不认识就落 `components`——⛔ 不许为了「归档好看」在门禁里发明第四道判断。
 *
 * ── 集合语义 ──
 *   所有数组排序后写入 ⇒ 只改顺序、只改 barrel 注释**不产生 diff**（判红的输入只有名字集合）。
 *   · E6#110 起另有 `collectUiSharedDirs()`——barrel 引用的 `@shared/<dir>` 目录集（黄灯名单覆盖面断言的输入）。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..");
export const BARREL_REL = "packages/linkdesk-ui/src/index.ts";
export const SNAPSHOT_REL = "scripts/ui-surface.json";

export const CATEGORIES = ["components", "hooks", "helpers", "types"];

/** helpers 栏的显式清单（见头注「分类」）——新增 helper 在这里加一行名即可 */
const HELPER_NAMES = new Set(["pickIdentityArt", "DEFAULT_PLUGIN_IDENTITY_URI", "inferSliderStep", "urlSourceKey"]);

const RE_DEFAULT = /^export\s*\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']([^"']+)["']/;
const RE_TYPE = /^export\s+type\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/;
const RE_NAMED = /^export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/;

/** 读 barrel 源码 → `{ components, hooks, helpers, types }`（各栏排序）。非导出行 / 注释行跳过。 */
export function collectUiSurface(root = ROOT) {
  const src = readBarrel(root);
  const surface = { components: new Set(), hooks: new Set(), helpers: new Set(), types: new Set() };
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const mDefault = RE_DEFAULT.exec(line);
    if (mDefault) {
      surface.components.add(mDefault[1]);
      continue;
    }
    const mType = RE_TYPE.exec(line);
    if (mType) {
      for (const name of mType[1].split(",").map((s) => s.trim()).filter(Boolean)) surface.types.add(name);
      continue;
    }
    const mNamed = RE_NAMED.exec(line);
    if (mNamed) {
      for (const name of mNamed[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (name.startsWith("use")) surface.hooks.add(name);
        else if (HELPER_NAMES.has(name)) surface.helpers.add(name);
        else surface.components.add(name);
      }
      continue;
    }
    if (line.startsWith("export ")) {
      throw new Error(`${BARREL_REL} 出现本提取器不认识的导出行：${line}\n（新导出形状要么改归 lib/ui-surface.mjs 的口径，要么别用该形状）`);
    }
  }
  return {
    components: [...surface.components].sort(),
    hooks: [...surface.hooks].sort(),
    helpers: [...surface.helpers].sort(),
    types: [...surface.types].sort(),
  };
}

/**
 * barrel 引用的 `@shared/<dir>` 目录集（排序）——E6#110 黄灯名单「覆盖面断言」的输入。
 * 🔴 与 collectUiSurface 同一组正则、同一份 barrel——同一把尺子的第二个读数，⛔ 不在别处另写解析器
 * （仓里出现第二个 barrel 解析器 = 又一把会自我漂移的尺子，正是 E6#110 要防的病）。
 * 形状纪律与 collectUiSurface 同步：不认识的导出行照样抛（fail-closed，别让新形状悄悄绕出名单）。
 */
export function collectUiSharedDirs(root = ROOT) {
  const src = readBarrel(root);
  const dirs = new Set();
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const m = RE_DEFAULT.exec(line) ?? RE_TYPE.exec(line) ?? RE_NAMED.exec(line);
    if (!m) {
      if (line.startsWith("export ")) {
        throw new Error(
          `${BARREL_REL} 出现本提取器不认识的导出行：${line}\n（新导出形状要么改归 lib/ui-surface.mjs 的口径，要么别用该形状）`,
        );
      }
      continue;
    }
    if (typeof m[2] === "string" && m[2].startsWith("@shared/")) {
      dirs.add(m[2].slice("@shared/".length).split("/")[0]);
    }
  }
  return [...dirs].sort();
}

function readBarrel(root) {
  return readFileSync(resolve(root, BARREL_REL), "utf8");
}

/** 快照 JSON 文本（键序固定；count = 四栏导出名总数，与 barrel 头注释的计数互为对账） */
export function serializeSurface(surface) {
  const count = CATEGORIES.reduce((acc, c) => acc + surface[c].length, 0);
  return JSON.stringify({ generatedAt: new Date().toISOString(), ...surface, count }, null, 2) + "\n";
}

/** 两份快照 diff：`removed` = 面被拿走（判红），`added` = 面变多（允许方向）。路径 = `<栏>.<名>`。 */
export function diffUiSurface(base, current) {
  const removed = [];
  const added = [];
  for (const cat of CATEGORIES) {
    const before = new Set(base?.[cat] ?? []);
    const now = new Set(current?.[cat] ?? []);
    for (const n of now) if (!before.has(n)) added.push(`${cat}.${n}`);
    for (const n of before) if (!now.has(n)) removed.push(`${cat}.${n}`);
  }
  return { removed: removed.sort(), added: added.sort() };
}

/** 快照拍平成面路径（人读 / 放行匹配用） */
export function flattenUiSurface(surface) {
  return CATEGORIES.flatMap((cat) => (surface?.[cat] ?? []).map((n) => `${cat}.${n}`));
}

/** 快照形状防烂：不是对象 / 缺栏 ⇒ false（门禁对烂快照 fail-closed） */
export function isUiSurfaceShape(snap) {
  return Boolean(snap) && typeof snap === "object" && CATEGORIES.every((c) => Array.isArray(snap[c]));
}
