/**
 * bundle-ingest——E6#7（1.2-4）启动解压：把 userData 插件家待安装的 `*.linkdesk-plugin`
 * zip 解压成目录 `{userData}/plugins/<sub>/<pluginId>/`，成功后删 zip（幂等——重启不再重解压）。
 *
 * 目的地架构（1.2-4 已调研钉死）：用户安装包代码家 = {userData}/plugins/{builtin|user}/<id>/
 * （env-service.userPluginsDir）——与只读 app 插件根（dev 项目 plugins/、prod resources/plugins）
 * 分开（AI执行守则 陷阱 1「不要混」）。市场安装后续轮写 user/ + 走正规安装流（#11→#13）；
 * 本 ingest 只是「认包」地基：手动放 zip → 重启 → 解压出现，随后 loader 双根发现、
 * linkdesk:// 协议、账本 reconcile 同见这批包。
 *
 * zip 落点 → sub 归属：文件在 `{userData}/plugins/<sub>/` 下 → sub 原样；直接丢
 * `{userData}/plugins/` 顶层（最常见手动姿势）→ 默认 sub = 'user'。
 *
 * 安全 / 健壮：
 *   - zip-slip 防护：每个条目的解压目标须解析在 target 目录内（'..' / 绝对路径拒绝并跳过该 zip）。
 *   - 顶层 plugin.json 定位：容忍单层 wrapper 目录（SDK 打包默认无 wrapper——顶层即 plugin.json）。
 *   - 失败不抛出：单个 zip 失败记日志跳过（不阻断启动）；无 plugin.json 的 zip 保留原地待查。
 *   - 幂等：目标目录已存在且版本相同 → 删 zip（已消费）；版本不同 → 保留 zip（覆盖/更新是
 *     #11→#13 安装流的职责，本轮不做）。
 *   - JSON/纯贡献包（theme/lang——无 index.bundle.js）允许落盘：data-role 消费（loader 只注册
 *     贡献，数据走 linkdesk://），不需要 JS 入口。
 *
 * E6#11/#13（1.2-5）：zip 语义（定位/裁决/解压/pluginId 校验）抽共享至 ./bundle-zip.ts——
 * 本模块（boot）与插件安装流（主进程 extract handler）同源同一套规则，boot 行为不变。
 *
 * 铁律 19/20：本模块是启动 boot 调用（main whenReady 一次），非 IPC 监听器——无 ipcRenderer/on。
 */

import * as fs from "fs/promises";
import { existsSync, readdirSync } from "fs";
import * as path from "path";
import JSZip from "jszip";
import { envService } from "../services/env-service.js";
import { scanPluginSubdirs } from "../services/plugin-file-service.js";
// E6#55：作者 plugin.json JSONC——全仓唯一解析入口，主进程解压读包同走（与三表预载同源）
import { parseManifestJson } from "../../src/pluginLoader/jsonc.js";
import type { PluginManifest } from "../../src/core/api/types.js";
// 1.2-5 共享 zip 语义（boot 与 install/extract handler 同源）
import { BUNDLE_EXT, deriveBundlePluginId, extractZip, isSafePluginId, locateManifest } from "./bundle-zip.js";

/** 顶层直接丢包的默认 sub（最常见手动姿势） */
const DEFAULT_SUB = "user";

/**
 * 启动解压全部待安装包——main whenReady 调一次（registerProtocol 之后、loadAllPluginManifests 之前）。
 * 单 zip 失败不抛出（记日志跳过）——任何 zip 问题都不该拖垮应用启动。
 */
export async function ingestPluginBundles(): Promise<void> {
  const userData = envService.userPluginsDir();
  if (!existsSync(userData)) return; // 从未装过任何东西——无包可认

  const subDirs = scanPluginSubdirs(userData);
  const candidates: Array<{ zipPath: string; sub: string }> = [];
  for (const sub of subDirs) {
    const dir = path.join(userData, sub);
    for (const name of readdirSync(dir)) {
      if (name.endsWith(BUNDLE_EXT)) candidates.push({ zipPath: path.join(dir, name), sub });
    }
  }
  // 顶层直接丢包 → 默认 user（最常见的"放一个 zip"姿势）
  for (const name of readdirSync(userData)) {
    if (name.endsWith(BUNDLE_EXT)) candidates.push({ zipPath: path.join(userData, name), sub: DEFAULT_SUB });
  }
  if (candidates.length === 0) return;

  for (const { zipPath, sub } of candidates) {
    try {
      const buffer = await fs.readFile(zipPath);
      const zip = await JSZip.loadAsync(buffer);
      const located = locateManifest(zip);
      if (!located) {
        console.warn(`[bundle-ingest] ${path.basename(zipPath)} 顶层无 plugin.json——跳过（zip 保留待查）`);
        continue;
      }
      const manifestRaw = await zip.files[located.manifestRel].async("string");
      let manifest: PluginManifest;
      try {
        manifest = parseManifestJson(manifestRaw);
      } catch {
        console.warn(`[bundle-ingest] ${path.basename(zipPath)} plugin.json 解析失败——跳过（zip 保留）`);
        continue;
      }
      const zipBase = path.basename(zipPath).replace(/\.linkdesk-plugin$/i, "");
      const pluginId = deriveBundlePluginId(manifest as unknown as Record<string, unknown>, zipBase);
      if (!pluginId || !isSafePluginId(pluginId)) {
        console.warn(`[bundle-ingest] ${path.basename(zipPath)} pluginId 非法（${pluginId ?? "空"}）——跳过（zip 保留）`);
        continue;
      }
      const target = path.join(userData, sub, pluginId);
      const targetManifest = path.join(target, "plugin.json");
      if (existsSync(targetManifest)) {
        // 幂等判定：已装同版本 → 删 zip（消费）；异版本 → 保留 zip（更新是 #11→#13 职责）
        try {
          const existing = parseManifestJson(await fs.readFile(targetManifest, "utf-8"));
          if (existing.version === manifest.version) {
            await fs.unlink(zipPath);
            console.log(`[bundle-ingest] ${pluginId}@${manifest.version} 已安装——删除重复 zip`);
          } else {
            console.warn(`[bundle-ingest] ${pluginId} 已装 ${existing.version}，包为 ${manifest.version}——保留 zip（更新留给安装流）`);
          }
        } catch {
          await fs.unlink(zipPath); // 已装目录 plugin.json 损坏——重复包消费掉，避免每启报错
        }
        continue;
      }
      const ok = await extractZip(zip, target, located.wrapperPrefix);
      if (!ok) continue; // zip-slip 等——保留 zip
      await fs.unlink(zipPath);
      console.log(`[bundle-ingest] ✅ 解压安装 ${pluginId}@${manifest.version} → ${sub}/${pluginId}（删 zip）`);
    } catch (e) {
      // 非致命——单包失败不影响启动与其他包
      console.error(`[bundle-ingest] ${path.basename(zipPath)} 处理失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
