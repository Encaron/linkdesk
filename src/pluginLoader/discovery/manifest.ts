/**
 * 插件 manifest 归一化 + 安装校验——纯函数集（无副作用，可独立单测）。
 * E5.8#0d.10-1b：自 loader.ts 拆出——E5#12 旧格式归一化 + E5.7#81 安装校验/版本裁决。
 * 🔥 E5.8#37.9：版本冲突消息走 i18n.t（显示文本铁律——错误消息也是用户可见文本）。
 * i18n.t 是幂等查询（key→译文，缺 key 返回 key 本身），不引入副作用——纯函数契约保留。
 * parseMissingKeyHandler 对含 {{var}} 的 key 手动插值（src/i18n/index.ts:14-21）——
 * 缺 key 时返回插值后的中文原文，测试断言（toContain 版本号 / 子串）天然兼容。
 */

import i18n from "../../i18n";
import type { PluginManifest } from "../../core/api/types";
import { compareVersions } from "../../core/utils/plugin/semverUtils";
// E6#111d（1.34）：宿主伪身份清单——**读生成式运行时副本**（不是手写一份清单：手写 = 第二真相源）
import { HOST_PSEUDO_PLUGIN_IDS } from "../../core/registry/host-reserved.generated";

/* ── E5#12：旧格式归一化——纯函数，不 mutate 只读 glob manifest ── */

/** E3 旧格式字段——E5#12 迁移到 contributes 后从 PluginManifest 删除 */
export interface OldFormatManifest {
  themes?: unknown;
  languages?: unknown;
  file?: unknown;
}

/**
 * 旧格式归一化——纯函数。返回 contributes 对象，不修改原 manifest。
 *
 * 只有真正有 themes/languages/file 旧字段的插件才返回新 contributes。
 * settings 等无旧字段插件走这里返回 undefined——安全通过。
 */
export function normalizeManifest(manifest: PluginManifest): Record<string, unknown> | undefined {
  if (manifest.contributes) return manifest.contributes as Record<string, unknown>;

  const old = manifest as Partial<OldFormatManifest>;
  const hasThemes = Array.isArray(old.themes) && old.themes.length > 0;
  const hasLanguages = Array.isArray(old.languages) && old.languages.length > 0;
  const hasFile = typeof old.file === "string" && old.file.length > 0;

  if (!hasThemes && !hasLanguages && !hasFile) return undefined;

  const c: Record<string, unknown> = {};
  if (hasThemes) c.themes = old.themes;
  if (hasLanguages) c.languages = old.languages;
  return c;
}

/**
 * E5.8#37.9.2.3：是否有**侧栏**视图容器——entryless 视图插件进 viewRegistry（图标栏数据源）的判定。
 * 视图容器 location 默认 sidebar（plugin.schema.json default），显式 panel/auxiliarybar 不算图标入口
 * （图标栏点击语义 = 打开侧栏容器，对标 VS Code Activity Bar 只列侧栏/主侧栏视图）。
 * 纯函数（测试覆盖）——数据插件（Python 语言包等）零 viewsContainers → false → 不进 viewRegistry。
 */
export function hasSidebarContainers(manifest: PluginManifest): boolean {
  const vc = manifest.contributes?.viewsContainers;
  if (!vc || typeof vc !== "object" || Array.isArray(vc)) return false;
  return Object.values(vc).some((c) => {
    if (!c || typeof c !== "object") return false;
    const loc = (c as { location?: string }).location;
    return loc === undefined || loc === "sidebar";
  });
}

/* ── E5.7#81：安装源校验 + 版本冲突裁决——纯函数（测试覆盖） ── */

/** E5.7#81：合法 pluginId 形状——安装目录名 = pluginId，路径穿越字符直通文件系统 */
const SAFE_PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * E5.7#81：安装源 manifest 校验——纯函数（测试覆盖）。
 * 返回规范化三元组（pluginId/version/name），不合法即抛错。
 *
 * 校验规则：
 *   - pluginId 裁决：manifest.pluginId 优先（支持目录名 ≠ pluginId 的正确安装）；
 *     缺省回退源目录名——loader 惯例 pluginId = 目录名（lang-defaults/panel-demo
 *     等 manifest 无 pluginId 字段，强制要求会误拒合法插件）
 *   - 两条路径的 id 都必须过 SAFE_PLUGIN_ID（禁止路径字符/空白/中文目录名兜底）
 *   - version 必填（版本处理的前置）
 *   - name 缺省回退 pluginId
 */
export function validateInstallManifest(manifest: unknown, sourceDirName: string): { pluginId: string; version: string; name: string } {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error(`plugin.json 内容不是对象`);
  }
  const m = manifest as Record<string, unknown>;
  const rawId = m.pluginId;
  let pluginId: string;
  if (rawId === undefined || rawId === null) {
    pluginId = sourceDirName;
  } else if (typeof rawId !== "string") {
    throw new Error(`plugin.json 的 pluginId 必须是字符串`);
  } else {
    pluginId = rawId;
  }
  if (!SAFE_PLUGIN_ID.test(pluginId)) {
    throw new Error(
      `pluginId "${pluginId}" 不合法（只允许字母/数字/._-，开头须为字母或数字）` +
      `——manifest 未声明 pluginId 时以源目录名兜底，请改名目录或在 plugin.json 声明 pluginId`,
    );
  }
  // E6#111d（1.34）判据 4：pluginId 不得落在宿主伪身份面（形状判据管不了它——"app" 是个完全合法的形状）
  if (HOST_PSEUDO_PLUGIN_IDS.includes(pluginId)) {
    throw new Error(
      `pluginId "${pluginId}" 是宿主自己的身份："app" / "appearance" / "update" 是宿主自己的身份` +
      `（宿主用它注册配置/外观/更新），插件用它 ⇒ 冲突检测永不响、注销会摘掉宿主条目。` +
      `改用别的 id（例如 "${pluginId}-你的插件名"）——源目录名兜底这条路径同样受限，故也必须改目录名。`,
    );
  }
  const version = m.version;
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(`插件 "${pluginId}" 缺少 version 字段`);
  }
  const name = typeof m.name === "string" && m.name.trim() !== "" ? m.name : pluginId;
  return { pluginId, version, name };
}

/**
 * E5.7#81：版本冲突裁决——纯函数（测试覆盖）。
 * installed 为 null = 目标不存在（可装）；version 为 null = 目标存在但读不到版本。
 * 返回 null = 放行；返回字符串 = 拒绝理由（含双方版本号）。
 */
export function resolveVersionConflict(
  installed: { version: string | null } | null,
  sourceVersion: string,
): string | null {
  if (!installed) return null;
  const iv = installed.version;
  if (!iv) {
    return i18n.t("已安装版本信息读取失败——请先卸载旧版本再安装。");
  }
  const c = compareVersions(sourceVersion, iv);
  if (c === 0) {
    return i18n.t("已安装版本 {{iv}} 与本次提供的 {{sourceVersion}} 相同——无需重复安装。", { iv, sourceVersion });
  }
  if (c < 0) {
    return i18n.t("本次提供的 {{sourceVersion}} 低于已安装的 {{iv}}——已跳过（如需降级请先卸载旧版本）。", { sourceVersion, iv });
  }
  return i18n.t("已安装 {{iv}}，本次提供 {{sourceVersion}}——如需升级请先卸载旧版本再安装。", { iv, sourceVersion });
}
