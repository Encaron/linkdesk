/**
 * plugin-manifest-loader——主进程 plugin.json 预加载器（E5.7#48）。
 *
 * Registry 主进程化（Phase 11）的写入方：静态声明三表（LangDef / Protocol / FileAssociation）
 * 唯一写入方 = 主进程——本模块启动扫盘 + 装/卸/重装后重扫（方案见
 * docs/02-Electron架构/E5.7_极简Pool/Registry主进程化/Registry主进程化设计.md §2）。
 * 壳渲染进程不写不读这三张表（壳侧注册随 #49/#50 删除）。
 *
 * 扫描路径（electron-builder.yml 实证：plugins/ 走 extraResources、不进 ASAR）：
 *   dev       → <项目根>/plugins/{builtin,user}/<pluginId>/plugin.json
 *   packaged  → <resources>/plugins/{builtin,user}/<pluginId>/plugin.json
 * 目录常量共享 src/core/utils/plugin/pluginPaths.ts 的 PLUGINS_DIR / PLUGIN_SUBDIRS（硬约束 12——
 * 改一处全生效，E5.8#0d.11 自 core/ 根归位 utils/plugin/）；该文件的 glob 工厂是渲染进程
 * import.meta.glob 产物，主进程用 fs.readdir 直扫。
 *
 * 注册幂等：register* 函数内建去重/覆盖（LangDef 覆盖 / FileAssociation 同插件去重 /
 * Protocol 覆盖）——启动预加载与装/卸重扫双路径天然安全，重复调用覆盖不叠加。
 */

import * as fs from "fs";
import * as path from "path";
import { app, ipcMain } from "electron";
import { PLUGINS_DIR, PLUGIN_SUBDIRS } from "../../src/core/utils/plugin/pluginPaths.js"; // E5.8#0d.11：自 core/ 根归位 utils/plugin/
import type { PluginManifest, LangDefContribution } from "../../src/core/api/types.js";
import { parseManifestJson } from "../../src/pluginLoader/jsonc.js"; // E6#55：作者 plugin.json JSONC——主进程三表预载同走唯一解析入口
import { registerLangDef, clearLangDefs } from "../../src/core/registry/languages/LangDefRegistry.js";
import { clearProtocols } from "../../src/core/registry/ProtocolRegistry.js";
import { registerFileAssociation, clearFileAssociations } from "../../src/core/services/files/FileAssociationService.js";
import { ensureBuiltinProtocols } from "../../src/core/commands/infra/registerBuiltinProtocols.js";
import { IPC } from '../ipc/channels.js';
// E5.8#26 D8 卸载连坐——rescan 时回收孤儿端口（owner 插件已不在扫盘集合 = 被卸载）
import { serialService } from '../services/serial-service.js';

/** 插件根目录——dev 用项目根，packaged 用 extraResources 落点 */
function getPluginsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, PLUGINS_DIR)
    : path.join(process.cwd(), PLUGINS_DIR);
}

/** 单个 plugin.json 的三表贡献注册——pluginId 采用目录名（与壳 loader 约定一致） */
function registerManifestTables(pluginId: string, manifest: PluginManifest): void {
  const contributes = manifest.contributes;

  // contributes.langDefs → LangDefRegistry（E4V#40s5b）
  const langDefs = contributes?.langDefs as LangDefContribution[] | undefined;
  if (Array.isArray(langDefs)) {
    for (const def of langDefs) registerLangDef(pluginId, def);
  }

  // contributes.fileAssociations → FileAssociationService（E2c #13a）
  const associations = contributes?.fileAssociations as
    | Array<{ extension: string; pluginId: string; command?: string; displayName?: string }>
    | undefined;
  if (Array.isArray(associations)) {
    for (const fa of associations) {
      registerFileAssociation({
        extension: fa.extension,
        pluginId,
        command: fa.command,
        displayName: fa.displayName,
      });
    }
  }
}

/** E5.8#26 D8——当前已加载插件 ID 集合（rescan 时对比端口 owner，回收被卸载插件的孤儿端口） */
const _loadedPluginIds = new Set<string>();

/**
 * 全量扫盘——启动时 whenReady 调一次；装/卸/重装后经 plugins:rescanManifests 重扫。
 * 错误隔离：单个插件目录缺失 / plugin.json 损坏 → console.error + 跳过该插件，不中断整轮。
 */
export function loadAllPluginManifests(): void {
  // 内置方括号协议——不在任何 plugin.json 里（全仓无插件协议注册，矩阵实证）。
  // 壳 App.tsx 的 ensureBuiltinProtocols() 调用随 #49 删除——主进程成为唯一写入方。
  // parseLine/detect 是 JS 函数：主进程实例持有但永不调用（跨 IPC 返回前剥函数，
  // 与现状壳代理 IpcBridgeHandler 的剥壳行为一致）。
  ensureBuiltinProtocols();

  _loadedPluginIds.clear();
  const root = getPluginsRoot();
  for (const sub of PLUGIN_SUBDIRS) {
    const subDir = path.join(root, sub);
    if (!fs.existsSync(subDir)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(subDir);
    } catch (e) {
      console.error(`[plugin-manifest-loader] 读取插件目录失败: ${subDir}`, e);
      continue;
    }
    for (const name of entries) {
      const manifestPath = path.join(subDir, name, "plugin.json");
      if (!fs.existsSync(manifestPath)) continue;
      // E5.8#26 D8：先登记存在性——plugin.json 解析失败（损坏）也算插件存在，防误连坐
      _loadedPluginIds.add(name);
      try {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        registerManifestTables(name, parseManifestJson(raw));
      } catch (e) {
        console.error(
          `[plugin-manifest-loader] 跳过插件 ${sub}/${name}——plugin.json 解析失败`,
          e
        );
      }
    }
  }
}

let _rescanRegistered = false;

/**
 * 装/卸/重装插件 → 壳 loader 成功路径发 IPC.plugins.rescanManifests → 全清 + 全重扫。
 * 全清后重扫语义干净（等价逐插件 unregister 再 register）；_activeProtocolId 回退
 * "bracket" 与现状 unregisterProtocol 的卸载回退行为一致，行为中性。
 */
export function registerManifestRescanHandler(): void {
  if (_rescanRegistered) return;
  _rescanRegistered = true;
  ipcMain.on(IPC.plugins.rescanManifests, async () => {
    clearLangDefs();
    clearProtocols();
    clearFileAssociations();
    loadAllPluginManifests();
    // E5.8#26 D8 卸载连坐——端口 owner 已不在扫盘集合（插件被卸载移 .disabled/）→ 孤儿端口回收
    await closeOrphanSerialPorts();
  });
}

/**
 * E5.8#26 D8——rescan 后回收孤儿端口：owner 插件已不在扫盘集合（被卸载）→ closePortsByOwner。
 * 挂钩复用 plugins:rescanManifests 既有主进程通道（Phase 2 #8 定案面：不新建生命周期通道）。
 * 判定安全：禁用插件不移目录（仍被扫到）→ 不误回收；owner 未声明的口不在 getPortOwners → 不误关。
 */
async function closeOrphanSerialPorts(): Promise<void> {
  for (const owner of serialService.getPortOwners()) {
    if (!_loadedPluginIds.has(owner)) {
      await serialService.closePortsByOwner(owner);
    }
  }
}
