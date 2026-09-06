/**
 * plugin-manifest-loader——主进程 plugin.json 预加载器（E5.7#48）。
 *
 * Registry 主进程化（Phase 11）的写入方：静态声明三表（LangDef / Protocol / FileAssociation）
 * 唯一写入方 = 主进程——本模块启动扫盘 + 装/卸/重装后重扫（方案见
 * docs/02-Electron架构/E5.7_极简Pool/Registry主进程化/Registry主进程化设计.md §2）。
 * 壳渲染进程不写不读这三张表（壳侧注册随 #49/#50 删除）。
 *
 * 扫描路径 = envService 双根（覆盖语义反序：userData 先扫、app 后扫 = app 注册胜出，见 getPluginRoots）：
 *   dev   → {userData}/plugins/ + <项目根>/plugins/（各含 <pluginId>/plugin.json）
 *   prod  → {userData}/plugins/ 单根（E6#17a 消费切换相：resources/ 无源码拷贝、app 根缺位 = 正常，
 *           getPluginRoots 后 line 90 空目录容错 continue——勿按 prod 特例加 if）
 * 2026-09-05 塌平：builtin/user 双目录废除——每个存在的根直接含插件目录（目录名 = pluginId）。
 * 目录名常量见 src/core/utils/plugin/pluginPaths.ts（PLUGINS_DIR，硬约束 12——改一处全生效）；本模块
 * 用 fs.readdir 直扫各根（渲染进程的 import.meta.glob 工厂已随塌平删除——零消费者）。
 *
 * 注册幂等：register* 函数内建去重/覆盖（LangDef 覆盖 / FileAssociation 同插件去重 /
 * Protocol 覆盖）——启动预加载与装/卸重扫双路径天然安全，重复调用覆盖不叠加。
 */

import * as fs from "fs";
import * as path from "path";
import { ipcMain } from "electron";
// 2026-09-05 塌平：builtin/user 双目录废除，根直扫无需 PLUGIN_SUBDIRS——目录名 = pluginId
import type { PluginManifest, LangDefContribution } from "../../src/core/api/types.js";
import { parseManifestJson } from "../../src/pluginLoader/jsonc.js"; // E6#55：作者 plugin.json JSONC——主进程三表预载同走唯一解析入口
import { registerLangDef, clearLangDefs } from "../../src/core/registry/languages/LangDefRegistry.js";
import { clearProtocols } from "../../src/core/registry/ProtocolRegistry.js";
import { registerFileAssociation, clearFileAssociations } from "../../src/core/services/files/FileAssociationService.js";
import { ensureBuiltinProtocols } from "../../src/core/commands/infra/registerBuiltinProtocols.js";
import { IPC } from '../ipc/channels.js';
// E5.8#26 D8 卸载连坐——rescan 时回收孤儿端口（owner 插件已不在扫盘集合 = 被卸载）
import { serialService } from '../services/serial-service.js';
import { envService } from "../services/env-service.js";
import { resolveLspArgsToPluginRoot } from "./lsp-arg-resolve.js";

/**
 * E6#15k：langDef 注册上下文的路径知识单点——语言 id（langDef.id）→ 该语言所属插件根目录。
 * 记录时机 = registerManifestTables（pluginDir 在手处），与 lsp.args 绝对化用的是**同一 pluginDir**
 * （绝对化就是对本条目录做的）。覆盖语义 = 后注册胜，与 LangDefRegistry 的 extension 覆盖同序
 * （多根同 id：app 根最后扫 → 胜，同 loader 发现优先级）。消费方 = lsp-handlers spawn cwd 基准
 * （spawn 消息第三参 = langDef.id，EditorView 传它——python 恰与插件 id 同号）。消灭
 * `isPackaged ? userData : appPath` 双轨猜（壳里「插件根在 userData」的第二处路径知识）。
 */
const _langDefPluginDirById = new Map<string, string>();

/** E6#15k：语言 id → 插件根目录（spawn cwd 单点源）。未注册（插件已卸载/未扫盘）→ undefined，调用方退 userData。 */
export function getLangDefPluginDir(langDefId: string): string | undefined {
  return _langDefPluginDirById.get(langDefId);
}

/**
 * 有序代码根表——先 userData 后 app（见 loadAllPluginManifests 注释：register* 后写胜 → app 内置最后注册即胜）。
 * 与 plugin-file-service.pluginRoots 同源（app 优先发现）但表注册是覆盖语义需反序扫描——双处都写清同一不变式。
 */
function getPluginRoots(): string[] {
  return [envService.userPluginsDir(), envService.appPluginsDir()];
}

/** 单个 plugin.json 的三表贡献注册——pluginId 采用目录名（与壳 loader 约定一致） */
function registerManifestTables(pluginId: string, manifest: PluginManifest, pluginDir: string): void {
  const contributes = manifest.contributes;

  // contributes.langDefs → LangDefRegistry（E4V#40s5b）
  // E6#15e：注册前把 lsp.args 相对插件根的路径换算为绝对路径（一次绝对化，纯函数语义见 lsp-arg-resolve.ts）。
  // 换算后 registry / IPC / spawn 全程持绝对路径——spawn 侧（lsp-handlers）纯透传绝对 args，无需知道插件目录
  // （E5#114d resolveLspArg ASAR 搬运已随 #15k 删，args 绝对化后其分支永假）。args 无相对路径 → 原 def 原样
  // 注册（零分配）；有 → 浅克隆后注册（LangDefRegistry 存克隆，manifest 解析产物不被改写）。契约：plugin.json
  // lsp.args 相对路径——以插件根目录为基准解析（E6#15l 锚词「插件根目录为基准」，门禁钉 schema/行为一致）。
  const langDefs = contributes?.langDefs as LangDefContribution[] | undefined;
  if (Array.isArray(langDefs)) {
    for (const def of langDefs) {
      const lsp = def.lsp;
      // E6#15k：记语言所属插件根（与 lsp.args 绝对化同一 pluginDir）——spawn cwd 单点源。仅带 lsp 的 langDef
      // 会被 spawn（monarch-only 不启动进程），不占 map。
      if (lsp) _langDefPluginDirById.set(def.id, pluginDir);
      const args = lsp && resolveLspArgsToPluginRoot(lsp.args, pluginDir);
      if (lsp && args !== lsp.args) {
        registerLangDef(pluginId, { ...def, lsp: { ...lsp, args } });
      } else {
        registerLangDef(pluginId, def);
      }
    }
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
 *
 * E6#7（1.2-4）双根：app 根（dev 项目 plugins/ / prod resources）∪ userData 根（{userData}/plugins
 * .linkdesk-plugin 解压家）。userData 插件声明的 langDefs/protocols/fileAssociations 须进主进程三表。
 * 扫描序 = [userData, app]（后写胜）——app 内置同 id 覆盖用户装，与 plugin-file-service 发现
 * 的 app 优先一致，dev 源码插件零回归。
 */
export function loadAllPluginManifests(): void {
  // 内置方括号协议——不在任何 plugin.json 里（全仓无插件协议注册，矩阵实证）。
  // 壳 App.tsx 的 ensureBuiltinProtocols() 调用随 #49 删除——主进程成为唯一写入方。
  // parseLine/detect 是 JS 函数：主进程实例持有但永不调用（跨 IPC 返回前剥函数，
  // 与现状壳代理 IpcBridgeHandler 的剥壳行为一致）。
  ensureBuiltinProtocols();

  _loadedPluginIds.clear();
  _langDefPluginDirById.clear();
  for (const root of getPluginRoots()) {
    if (!fs.existsSync(root)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch (e) {
      console.error(`[plugin-manifest-loader] 读取插件目录失败: ${root}`, e);
      continue;
    }
    for (const name of entries) {
      const manifestPath = path.join(root, name, "plugin.json");
      if (!fs.existsSync(manifestPath)) continue;
      // E5.8#26 D8：先登记存在性——plugin.json 解析失败（损坏）也算插件存在，防误连坐
      _loadedPluginIds.add(name);
      try {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        // E6#15e：pluginDir = 插件根目录（= plugin.json 所在目录，dev 仓库 plugins/<id> / prod userData）——
        // lsp.args 相对路径以它为基准绝对化（sub-1 fallback 落地形态：注册处一次绝对化）。
        registerManifestTables(name, parseManifestJson(raw), path.join(root, name));
      } catch (e) {
        console.error(
          `[plugin-manifest-loader] 跳过插件 ${name}——plugin.json 解析失败`,
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
