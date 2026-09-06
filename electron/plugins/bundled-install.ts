/**
 * bundled-install——E6#15c 首启自动装：把随壳发货的 `bundled-plugins/*.linkdesk-plugin`
 * （2026-09-05 塌平单根：发货夹直接放 zip，无 builtin/user 子目录层）解压成
 * `{userData}/plugins/<id>/`，供 loader 单根从 userData 统一发现。core:true 插件与第三方
 * 插件同一条加载路（破特权阶级）——发货 zip 里的插件与手动装的插件在 {userData}/plugins
 * 同一棵树里并列，差异只剩 manifest.core:true（卸载按钮隐藏 + removed 标记豁免恢复）。
 *
 * 与 bundle-ingest 的关系：同 zip 语义、不同来源——
 *   ingest 读 userData 手动丢的 zip（消费后删 zip）；
 *   bundled-install 读发货夹（dev repo bundled-plugins / prod resources/bundled-plugins），
 *   它是随壳的永久备份，**不删源**——删了还能再恢复（#15c 恢复主干；removed 标记豁免见下）。
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

/** dev/test 强制重物化开关（E6#15n 落点④）——CLI `--force-rematerialize-bundled` 或环境变量
 *  `LINKDESK_FORCE_REMATERIALIZE=1` 任一即开。给打包版/编译版测试者替「删 %APPDATA%/linkdesk/plugins/<id>」
 *  手工作业（重打 bundled zip 后同版/异版都不刷新——boot 默认语义，本开关显式覆盖）。
 *  非生产 boot 语义：end-user 不会设此开关；removed 标记仍豁免（不复活用户故意删的插件）。 */
function forceRematerializeEnabled(): boolean {
  return (
    process.argv.includes("--force-rematerialize-bundled") ||
    process.env.LINKDESK_FORCE_REMATERIALIZE === "1"
  );
}

/**
 * 首启自动装全部 bundled 插件——main whenReady 调一次（registerProtocol 之后、loadAllPluginManifests 之前，
 * 与 ingestPluginBundles 同批，先于三表扫描/壳发现/协议解析——落盘后这批插件同见）。
 * 2026-09-05 塌平单根：直扫 bundledDir 顶层 *.linkdesk-plugin → {userData}/plugins/<id>/。
 * 发货保留语义（deleteSource=false + 损坏重装 recoverCorrupt=true + removed 豁免集）——逐字节对齐原 restoreOne：
 * 单包失败不抛出（共享函数自记日志）——发货夹任何单包问题都不该拖垮启动。
 * E6#15n 落点④：forceRematerializeEnabled() 时给每包传 force——删旧目录整树重解压 zip 当前内容。
 */
export async function installBundledPlugins(): Promise<void> {
  const bundledDir = envService.bundledPluginsDir();
  if (!existsSync(bundledDir)) return; // dev 尚未暂存 / prod 无发货夹——无事可做

  const force = forceRematerializeEnabled();
  if (force) {
    console.warn(
      "[bundled-install] 🔥 dev/test 强制重物化开关开启（--force-rematerialize-bundled / LINKDESK_FORCE_REMATERIALIZE=1）——同版异版 bundled 都重解压覆盖已装目录。非生产 boot 语义，removed 标记仍豁免。",
    );
  }

  const removed = await readRemovedMarkers();
  const userData = envService.userPluginsDir();
  for (const name of readdirSync(bundledDir)) {
    if (!name.endsWith(BUNDLE_EXT)) continue;
    await installBundleCandidate({
      zipPath: path.join(bundledDir, name),
      homeDir: userData,
      tag: "bundled-install",
      deleteSource: false,
      recoverCorrupt: true,
      skipIfRemoved: removed,
      ...(force ? { force: true } : {}),
    });
  }
}
