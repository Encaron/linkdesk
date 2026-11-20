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
 * 安装源校验的结构化分类结果——R4-1.2（I16·正典 09 §三·补2）五类回执的判定单点。
 * reason 封闭集合与 PluginLocalInstallReason 的前三类同形（io/exists 归磁盘段，不在 manifest 层）。
 * detail = 同 reason 的子 case（文案皮用——validateInstallManifest 按 detail 挑既有文案，⛔ 判定规则不在此重建）。
 */
export type InstallManifestRejection = "bad-manifest" | "unsafe-id" | "core-forbidden";
export type InstallManifestRejectionDetail = "shape" | "pluginId-type" | "version" | "id-shape" | "host-pseudo" | "core";

/** installFromDirectory（本地安装）专属：manifest 层校验不拒 core:true 的缺省行为——本地安装流拒（本地不得自封内置）。 */
export interface ClassifyInstallManifestOpts {
  /** true = manifest.core === true 判 core-forbidden（默认 false——dev 树安装流维持「消毒 core→false」旧语义） */
  rejectCore?: boolean;
}

/**
 * E5.7#81 校验规则的**结构化分类器**（R4-1.2 拆出）——校验规则的唯一事实源，
 * validateInstallManifest 是它的抛错皮。返回 reason 而非抛错（五类回执需要分类）。纯函数（测试覆盖）。
 * 校验顺序即 reject 优先级：形状 → pluginId 形状 → 宿主伪身份 → version → core（仅 rejectCore）。
 */
export function classifyInstallManifest(
  manifest: unknown,
  sourceDirName: string,
  opts?: ClassifyInstallManifestOpts,
):
  | { ok: true; pluginId: string; version: string; name: string }
  | { ok: false; reason: InstallManifestRejection; detail: InstallManifestRejectionDetail } {
  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, reason: "bad-manifest", detail: "shape" };
  }
  const m = manifest as Record<string, unknown>;
  const rawId = m.pluginId;
  if (rawId !== undefined && rawId !== null && typeof rawId !== "string") {
    return { ok: false, reason: "bad-manifest", detail: "pluginId-type" };
  }
  const pluginId = rawId === undefined || rawId === null ? sourceDirName : (rawId as string);
  if (!SAFE_PLUGIN_ID.test(pluginId)) {
    return { ok: false, reason: "unsafe-id", detail: "id-shape" };
  }
  // E6#111d（1.34）判据 4：宿主伪身份面——形状判据管不了它（"app" 是完全合法的形状），归 unsafe-id
  if (HOST_PSEUDO_PLUGIN_IDS.includes(pluginId)) {
    return { ok: false, reason: "unsafe-id", detail: "host-pseudo" };
  }
  const version = m.version;
  if (typeof version !== "string" || version.trim() === "") {
    return { ok: false, reason: "bad-manifest", detail: "version" };
  }
  // R4-1.2：本地安装拒 core:true（本地不得自封内置）——dev 树安装流不走此分支（继续走消毒 core→false）
  if (opts?.rejectCore && m.core === true) {
    return { ok: false, reason: "core-forbidden", detail: "core" };
  }
  const name = typeof m.name === "string" && m.name.trim() !== "" ? m.name : pluginId;
  return { ok: true, pluginId, version, name };
}

/**
 * E5.7#81：安装源 manifest 校验——纯函数（测试覆盖）。
 * 返回规范化三元组（pluginId/version/name），不合法即抛错。
 * R4-1.2 起内部 = classifyInstallManifest 的抛错皮（规则单源＝分类器；本函数只保 E5.7#81/E6#111d 文案契约）。
 *
 * 校验规则：
 *   - pluginId 裁决：manifest.pluginId 优先（支持目录名 ≠ pluginId 的正确安装）；
 *     缺省回退源目录名——loader 惯例 pluginId = 目录名（存量插件可省此字段，强制要求会误拒合法插件）
 *   - 两条路径的 id 都必须过 SAFE_PLUGIN_ID（禁止路径字符/空白/中文目录名兜底）
 *   - version 必填（版本处理的前置）
 *   - name 缺省回退 pluginId
 */
export function validateInstallManifest(manifest: unknown, sourceDirName: string): { pluginId: string; version: string; name: string } {
  const result = classifyInstallManifest(manifest, sourceDirName);
  if (result.ok) return { pluginId: result.pluginId, version: result.version, name: result.name };
  const { reason, detail } = result;
  if (reason === "bad-manifest") {
    if (detail === "shape") throw new Error(`plugin.json 内容不是对象`);
    if (detail === "pluginId-type") throw new Error(`plugin.json 的 pluginId 必须是字符串`);
    const id = (manifest as Record<string, unknown>).pluginId;
    throw new Error(`插件 "${typeof id === "string" && id ? id : sourceDirName}" 缺少 version 字段`);
  }
  // unsafe-id——两个子 case 各保既有文案
  const id = (manifest as Record<string, unknown>).pluginId;
  const pluginId = typeof id === "string" && id ? id : sourceDirName;
  if (detail === "id-shape") {
    throw new Error(
      `pluginId "${pluginId}" 不合法（只允许字母/数字/._-，开头须为字母或数字）` +
      `——manifest 未声明 pluginId 时以源目录名兜底，请改名目录或在 plugin.json 声明 pluginId`,
    );
  }
  throw new Error(
    `pluginId "${pluginId}" 是宿主自己的身份："app" / "appearance" / "update" 是宿主自己的身份` +
    `（宿主用它注册配置/外观/更新），插件用它 ⇒ 冲突检测永不响、注销会摘掉宿主条目。` +
    `改用别的 id（例如 "${pluginId}-你的插件名"）——源目录名兜底这条路径同样受限，故也必须改目录名。`,
  );
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
