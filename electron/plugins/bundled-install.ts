/**
 * bundled-install——E6#15c 首启自动装：把随壳发货的 `bundled-plugins/{builtin,user}/*.linkdesk-plugin`
 * 解压成 `{userData}/plugins/<sub>/<id>/`（保持 builtin/user 双层），供 loader 双根从 userData 统一发现。
 * 内置插件 pre-bundle 独立化（E6#15）后 = 与第三方插件同一条加载路（破特权阶级）。
 *
 * 与 bundle-ingest 的关系：同 zip 语义、不同来源——
 *   ingest 读 userData 手动丢的 zip（消费后删 zip）；
 *   bundled-install 读发货夹（dev repo bundled-plugins / prod resources/bundled-plugins），
 *   它是随壳的永久备份，**不删源**——删了还能再恢复（#15c 恢复主干；removed 标记豁免见下）。
 *
 * builtin/ vs user/ 语义（01-插件独立构建/06-builtin-user-语义规范.md）：子目录名原样保留为
 * `{userData}/plugins/<sub>/`；`core: true` 才决定卸载按钮隐藏，与子目录无关。市场只写 user/。
 *
 * 版本幂等：目标已装同版本 → 跳过（不动）；异版本 → 保留发货源（升级是安装流/市场轮职责，boot 不覆盖）。
 * 成功解压不写账本——installed-plugins.json 唯一 owner 是 renderer PluginInstallService，
 * 其启动 reconcile 自会发现这批落盘插件；main 只做 fs，绝不写账本（无第二 owner）。
 *
 * 🔥 removed 防误恢复（#15c / #18）：用户经卸载 API 删 core:true 插件 → 卸载流写账本 `removed: true`
 * → 重启 boot 读标记跳过恢复。writer 属 #18（core:true 可卸载化）——本轮只有读（有则跳过）+ 恢复主干；
 * 手动删文件夹（无标记）→ 视为意外丢失 → 照常自动恢复。boot 阶段 renderer 未起——账本只读直读
 * `{userData}/installed-plugins.json`（StorageService getFilePath 独立文件），main 不写。
 * 「已恢复系统插件 <name>」toast（Opt-IN 告知）→ renderer 起后送达——#18 卸载流同批接。
 *
 * 1.2-5：单包安装决策抽共享至 ./bundle-zip.ts 的 installBundleCandidate——发货保留语义
 * （deleteSource=false + 损坏重装 recoverCorrupt + removed 豁免）与原 ingest 消费语义同源同一套规则。
 * 本模块只剩候选扫描 + 共享函数薄调用。
 *
 * 铁律 19/20：本模块是启动 boot 调用（main whenReady 一次），非 IPC 监听器。
 */

import * as fs from "fs/promises";
import { existsSync, readdirSync } from "fs";
import * as path from "path";
import { envService } from "../services/env-service.js";
import { scanPluginSubdirs } from "../services/plugin-file-service.js";
import { BUNDLE_EXT, installBundleCandidate } from "./bundle-zip.js";

/** 账本文件（StorageService 独立文件路径的磁盘实位）——boot 只读 removed 标记 */
function ledgerPath(): string {
  return path.join(envService.appDataDir(), "installed-plugins.json");
}

/** 读 removed 标记集——`{ [pluginId]: { removed?: boolean } }` 形态；读失败/无文件 → 空集（宽松处理） */
async function readRemovedMarkers(): Promise<Set<string>> {
  const removed = new Set<string>();
  try {
    if (!existsSync(ledgerPath())) return removed;
    const raw = await fs.readFile(ledgerPath(), "utf-8");
    const ledger = JSON.parse(raw) as Record<string, { removed?: boolean } | undefined>;
    for (const [id, entry] of Object.entries(ledger)) {
      if (entry?.removed === true) removed.add(id);
    }
  } catch (e) {
    console.warn(`[bundled-install] 账本读取失败（removed 标记不可用，视为无豁免）: ${e instanceof Error ? e.message : String(e)}`);
  }
  return removed;
}

/**
 * 首启自动装全部 bundled 插件——main whenReady 调一次（registerProtocol 之后、loadAllPluginManifests 之前，
 * 与 ingestPluginBundles 同批，先于三表扫描/壳发现/协议解析——落盘后这批插件同见）。
 * 发货保留语义（deleteSource=false + 损坏重装 recoverCorrupt=true + removed 豁免集）——逐字节对齐原 restoreOne：
 * 单包失败不抛出（共享函数自记日志）——发货夹任何单包问题都不该拖垮启动。
 */
export async function installBundledPlugins(): Promise<void> {
  const bundledDir = envService.bundledPluginsDir();
  if (!existsSync(bundledDir)) return; // dev 尚未暂存 / prod 无发货夹——无事可做

  const removed = await readRemovedMarkers();
  const userData = envService.userPluginsDir();
  const subDirs = scanPluginSubdirs(bundledDir); // builtin/ + user/（语义双层原样保留）

  for (const sub of subDirs) {
    const dir = path.join(bundledDir, sub);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(BUNDLE_EXT)) continue;
      await installBundleCandidate({
        zipPath: path.join(dir, name),
        sub,
        homeDir: userData,
        tag: "bundled-install",
        deleteSource: false,
        recoverCorrupt: true,
        skipIfRemoved: removed,
      });
    }
  }
}
