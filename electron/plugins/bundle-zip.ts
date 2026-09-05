/**
 * bundle-zip——E6#11/#13（1.2-5）`.linkdesk-plugin` zip 共享语义。
 * 自 bundle-ingest.ts 抽出（boot 与 install/extract handler 两调用方同源同一套 zip 规则）：
 *   - 顶层 plugin.json basename 匹配（容忍单层 wrapper 目录、SDK 平铺顶层包）——1.2-4 实机 bug 修复点，
 *     绝不让 extract handler 另写一套绕过重犯；
 *   - pluginId 裁决（manifest.pluginId 优先，缺省 zip 文件基名，双源互验）；
 *   - zip-slip 防护 + wrapper 剥离解压。
 * 铁律 19/20：本模块纯函数/内部调用，非 IPC 监听器——无 ipcRenderer/on。
 */

import * as fs from "fs/promises";
import * as path from "path";
import JSZip from "jszip";
import type { PluginManifest } from "../../src/core/api/types.js";
// E6#55：作者 plugin.json JSONC——全仓唯一解析入口，主进程解压读包同走（与三表预载同源）
import { parseManifestJson } from "../../src/pluginLoader/jsonc.js";

/** zip 包扩展名 */
export const BUNDLE_EXT = ".linkdesk-plugin";

/** 插件 ID 合法性——不能有路径分隔符/相对段/隐藏前缀（防解压目标逃逸 + 伪装） */
export function isSafePluginId(id: string): boolean {
  return (
    id.length > 0 &&
    !id.includes("/") &&
    !id.includes("\\") &&
    id !== "." &&
    id !== ".." &&
    !id.startsWith(".")
  );
}

/**
 * zip 的 pluginId 裁决——SDK 契约：zip 文件名 = `<id>.linkdesk-plugin`（id = manifest.pluginId ?? 项目目录名，
 * 见 plugin-sdk validate.ts derivePluginId）；解压目录名必须与该 id 一致（loader 惯例 pluginId = 目录名）。
 * 优先 manifest.pluginId（作者可声明覆盖），缺省回退 zip 文件基名——两者都可能因改名/手包漂移，双源互验。
 * 返回 null = 无法裁决（manifest.pluginId 非字符串），调用方跳过该 zip。
 */
export function deriveBundlePluginId(rawManifest: Record<string, unknown>, zipBase: string): string | null {
  const rawId = rawManifest.pluginId;
  if (rawId !== undefined && rawId !== null && typeof rawId !== "string") {
    console.warn(`[bundle-zip] plugin.json 的 pluginId 非字符串（${typeof rawId}）——拒绝`);
    return null;
  }
  const candidate = typeof rawId === "string" && rawId.trim() !== "" ? rawId : zipBase;
  return candidate.length > 0 ? candidate : null;
}

/** 从 zip 顶层（容忍单层 wrapper 目录）定位 plugin.json，返回 { manifestRel, wrapperPrefix } */
function locateManifest(zip: JSZip): { manifestRel: string; wrapperPrefix: string } | null {
  const entries = Object.keys(zip.files);
  // zip 规范路径分隔符恒 '/'——仍容 '\\'（个别打包器）。
  // 🔴 匹配「basename === plugin.json」而非 endsWith("/plugin.json")——顶层平铺包（SDK 默认，
  // 条目名就是 "plugin.json" 无前导斜杠）也必须命中；endsWith("/plugin.json") 会漏掉顶层包
  // （2026-09-05 实机门禁实证：demo-pill 平铺包被误判「顶层无 plugin.json」）。
  const normalized = entries
    .map((n) => n.replace(/\\/g, "/"))
    .filter((n) => n.slice(n.lastIndexOf("/") + 1) === "plugin.json");
  if (normalized.length === 0) return null;
  // 优先最小深度（顶层 depth=1）——wrapper 目录 depth=2
  normalized.sort((a, b) => a.split("/").length - b.split("/").length);
  const manifestRel = normalized[0];
  const parts = manifestRel.split("/"); // e.g. "plugin.json" | "sample-theme/plugin.json"
  const wrapperPrefix = parts.length > 1 ? parts[0] : "";
  return { manifestRel, wrapperPrefix };
}

/**
 * 读 zip buffer → 定位 + 解析 plugin.json。返回 { zip, manifest, wrapperPrefix }；
 * 无法定位 / plugin.json 解析失败 → null（调用方自记日志，语义各自保留：boot 跳过、extract 报错）。
 */
export async function openPluginZip(buffer: Buffer): Promise<{
  zip: JSZip;
  manifest: PluginManifest;
  wrapperPrefix: string;
} | null> {
  const zip = await JSZip.loadAsync(buffer);
  const located = locateManifest(zip);
  if (!located) return null;
  const raw = await zip.files[located.manifestRel].async("string");
  let manifest: PluginManifest;
  try {
    manifest = parseManifestJson(raw);
  } catch {
    return null;
  }
  return { zip, manifest, wrapperPrefix: located.wrapperPrefix };
}

/** 解压单个 zip 到 target 目录——zip-slip 防护 + wrapper 剥离。返回 false = 非致命失败（zip 保留）。 */
export async function extractZip(zip: JSZip, target: string, wrapperPrefix: string): Promise<boolean> {
  const targetAbs = path.resolve(target);
  for (const rawName of Object.keys(zip.files)) {
    const entry = zip.files[rawName];
    const norm = rawName.replace(/\\/g, "/");
    // wrapper 剥离：plugin.json 在某单层 wrapper 目录内 → 只取其下内容（wrapper 根 = 插件根）；
    // 顶层即 plugin.json（SDK 默认）→ 全部条目按原名保留（插件内容可任意嵌 themes/dist/ 等子目录）
    let rel: string;
    if (wrapperPrefix) {
      if (!(norm === wrapperPrefix || norm.startsWith(wrapperPrefix + "/"))) continue;
      if (norm === wrapperPrefix) continue; // wrapper 目录标记本身
      rel = norm.slice(wrapperPrefix.length + 1);
    } else {
      rel = norm;
    }
    // zip-slip：拒绝相对段/绝对路径——目标必须落在 target 内
    const dest = path.resolve(targetAbs, rel);
    if (dest !== targetAbs && !dest.startsWith(targetAbs + path.sep)) {
      console.error(`[bundle-zip] 跳过 zip-slip 条目: ${rawName}`);
      return false;
    }
    if (entry.dir) {
      await fs.mkdir(dest, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const buf = Buffer.from(await entry.async("uint8array"));
    await fs.writeFile(dest, buf);
  }
  return true;
}

/**
 * 单个 `.linkdesk-plugin` → `{homeDir}/<pluginId>/` 安装决策——boot 两源共用（1.2-5 P1 抽共享）。
 * 2026-09-05 塌平单根：homeDir = 用户安装家（envService.userPluginsDir = {userData}/plugins），直接含插件目录，
 * 无 builtin/user 子目录层。差异全走参数：manual ingest（userData 丢包消费）vs bundled 发货（源保留可恢复）。
 * 幂等：已装同版本 → （deleteSource 时）消费源 zip；异版本 → 不动源（升级归安装流）。
 * 单包失败不抛出（记日志）——任何单包问题不拖垮启动。
 * 返回 outcome 供调用方/测试断言。
 */
export type BundleInstallOutcome =
  | "installed"
  | "same-version"
  | "version-kept"
  | "removed-skipped"
  | "invalid";

export interface BundleInstallParams {
  zipPath: string;
  /** 安装目标家 = {userData}/plugins（envService.userPluginsDir）——直接含插件目录，无子目录层 */
  homeDir: string;
  /** 日志前缀（方括号内，如 "bundle-ingest"）——调用方身份 */
  tag: string;
  /** 消费语义：装好/同版本后是否删源 zip——manual ingest=true；bundled 发货夹=false（永久备份） */
  deleteSource: boolean;
  /** 已装目录 plugin.json 损坏时：true=视为缺失重装恢复（bundled）；false=消费源 zip 跳过（ingest 原语义） */
  recoverCorrupt: boolean;
  /** 豁免集（pluginId 命中 → 跳过，不恢复不消费）——bundled removed 标记；ingest 无此语义不传 */
  skipIfRemoved?: Set<string>;
}

export async function installBundleCandidate(p: BundleInstallParams): Promise<BundleInstallOutcome> {
  const { zipPath, homeDir, tag } = p;
  const base = path.basename(zipPath);
  try {
    const buffer = await fs.readFile(zipPath);
    const opened = await openPluginZip(buffer);
    if (!opened) {
      console.warn(`[${tag}] ${base} 顶层无 plugin.json 或解析失败——跳过（zip 保留待查）`);
      return "invalid";
    }
    const { zip, manifest, wrapperPrefix } = opened;
    const zipBase = base.replace(BUNDLE_EXT + "$", "").replace(/\.linkdesk-plugin$/i, "");
    const pluginId = deriveBundlePluginId(manifest as unknown as Record<string, unknown>, zipBase);
    if (!pluginId || !isSafePluginId(pluginId)) {
      console.warn(`[${tag}] ${base} pluginId 非法（${pluginId ?? "空"}）——跳过（zip 保留）`);
      return "invalid";
    }

    // removed 豁免最前：用户故意删除（账本 removed:true）→ 目标目录无论存在/缺失/损坏都不复活。
    // ingest 无此语义（空集）——位置放这里对 ingest 零影响；对 bundled 是唯一自洽语义
    // （残留目录 + removed 并存 → removed 胜，永不自动恢复）。
    if (p.skipIfRemoved?.has(pluginId)) {
      console.log(`[${tag}] ${pluginId} 在账本标记 removed——跳过自动恢复（用户故意删除）`);
      return "removed-skipped";
    }

    const target = path.join(homeDir, pluginId);
    const targetManifest = path.join(target, "plugin.json");

    if (await fs.stat(targetManifest).then(() => true, () => false)) {
      try {
        const existing = parseManifestJson(await fs.readFile(targetManifest, "utf-8"));
        if (existing.version === manifest.version) {
          if (p.deleteSource) await fs.unlink(zipPath).catch(() => {});
          console.log(`[${tag}] ${pluginId}@${manifest.version} 已在 ${pluginId}——${p.deleteSource ? "删除重复 zip" : "跳过（源保留）"}`);
          return "same-version";
        }
        console.warn(`[${tag}] ${pluginId} 已装 ${existing.version}，包为 ${manifest.version}——异版本不动（升级归安装流）`);
        return "version-kept";
      } catch {
        if (!p.recoverCorrupt) {
          await fs.unlink(zipPath).catch(() => {});
          console.log(`[${tag}] ${pluginId} 已装目录 plugin.json 损坏——消费重复 zip，跳过`);
          return "same-version";
        }
        // recoverCorrupt（bundled）：视为缺失，落下方恢复
      }
    }

    const ok = await extractZip(zip, target, wrapperPrefix);
    if (!ok) {
      console.warn(`[${tag}] ${pluginId} zip-slip 等安全拒绝——跳过（zip 保留）`);
      return "invalid";
    }
    if (p.deleteSource) await fs.unlink(zipPath).catch(() => {});
    console.log(`[${tag}] ✅ ${p.deleteSource ? "解压安装" : "自动装"} ${pluginId}@${manifest.version} → ${pluginId}${p.deleteSource ? "（删 zip）" : "（源保留）"}`);
    return "installed";
  } catch (e) {
    console.error(`[${tag}] ${base} 处理失败: ${e instanceof Error ? e.message : String(e)}`);
    return "invalid";
  }
}
