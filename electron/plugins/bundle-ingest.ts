/**
 * bundle-ingest——E6#7（1.2-4）启动解压：把 userData 插件家待安装的 `*.linkdesk-plugin`
 * zip 解压成目录 `{userData}/plugins/<pluginId>/`，成功后删 zip（幂等——重启不再重解压）。
 *
 * 目的地架构（1.2-4 调研钉死 + 2026-09-05 塌平单根）：用户安装包代码家 = {userData}/plugins
 * （env-service.userPluginsDir）——**直接**含插件目录（<id>/），无 builtin/user 子目录层；与只读
 * app 插件根（dev 项目 plugins/、prod resources/plugins）分开（AI执行守则 陷阱 1「不要混」）。
 * 本 ingest 只是「认包」地基：手动放 zip → 重启 → 解压出现，随后 loader 单根发现、
 * linkdesk:// 协议、账本 reconcile 同见这批包。
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
 * E6#11/#13（1.2-5）：单包安装决策抽共享至 ./bundle-zip.ts 的 installBundleCandidate——
 * 本模块（消费语义 deleteSource）与 bundled-install（发货保留语义）、插件安装流（主进程
 * extract handler）同源同一套规则。本模块只剩候选扫描 + 共享函数薄调用，boot 行为不变。
 *
 * 铁律 19/20：本模块是启动 boot 调用（main whenReady 一次），非 IPC 监听器——无 ipcRenderer/on。
 */

import { existsSync, readdirSync } from "fs";
import * as path from "path";
import { envService } from "../services/env-service.js";
// 1.2-5 共享单包安装决策（boot 与 install/extract handler 同源）
import { BUNDLE_EXT, installBundleCandidate } from "./bundle-zip.js";

/**
 * 启动解压全部待安装包——main whenReady 调一次（registerProtocol 之后、loadAllPluginManifests 之前）。
 * 2026-09-05 塌平单根：只扫 {userData}/plugins 顶层的 *.linkdesk-plugin（手动丢包姿势）——
 * 解压目标 = 同根 <pluginId>/（顶层就是插件家，无 builtin/user 子目录层）。
 * 单 zip 失败不抛出（记日志跳过）——任何 zip 问题都不该拖垮应用启动。
 */
export async function ingestPluginBundles(): Promise<void> {
  const userData = envService.userPluginsDir();
  if (!existsSync(userData)) return; // 从未装过任何东西——无包可认

  const candidates: string[] = [];
  for (const name of readdirSync(userData)) {
    if (name.endsWith(BUNDLE_EXT)) candidates.push(path.join(userData, name));
  }
  if (candidates.length === 0) return;

  // 消费语义（deleteSource=true）：装好/同版本/损坏已装都删源 zip；损坏已装不重装（recoverCorrupt=false）。
  // 与 bundled-install 的差异全走 installBundleCandidate 参数，无 removed 豁免集。
  for (const zipPath of candidates) {
    await installBundleCandidate({
      zipPath,
      homeDir: userData,
      tag: "bundle-ingest",
      deleteSource: true,
      recoverCorrupt: false,
    });
  }
}
