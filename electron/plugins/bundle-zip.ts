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
export function locateManifest(zip: JSZip): { manifestRel: string; wrapperPrefix: string } | null {
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
