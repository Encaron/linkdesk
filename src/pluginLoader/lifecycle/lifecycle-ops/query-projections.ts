/**
 * 查询投影——把插件状态投影成市场/加载计数消费的形状（已加载 / 列表 / 禁用 / 已卸载）+ 重装。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `lifecycle-ops.ts` 原样搬出，零行为变更。
 * 依赖方向：query-projections → resolution/*；**不被本域内其他子模块依赖**（投影层在末端）。
 */

import type { PluginManifest } from "../../../core/api/types";
import { linkdesk, errMsg } from "../../resolution/state";
// E5.8#15.5：getLoadDiagnostics——挂起插件的 pendingReason（list() 数据源合并读取）
import { getLoadDiagnostics } from "../../resolution/loadState";
import {
  loadedPluginIds,
  getMetadataCache,
  getDisabledList,
  getManifestById,
  getAllManifestEntries,
  _pendingPlugins,
  // E6#73j（G6）：住所判据唯一源——市场「可更新」徽标/更新钮据此遮蔽死钮
  isPluginUpdatable,
} from "../../resolution/state";
import { loadPlugin } from "../../resolution/runtime";

/** 判断插件是否被禁用 */
export function isPluginDisabled(pluginId: string): boolean {
  return getDisabledList().includes(pluginId);
}

/** 获取所有已加载插件的 manifest（含非视图插件 + 运行时加载的插件） */
export function getLoadedPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest }> = [];

  // 1. 🔴 E6#80：**运行时加载的插件优先**——「本次会话读到的」排在「启动快照」前面（顺序原为
  //    index→cache，2026-09-11 反转）。不变式：status==="installed" 的缓存条目只可能由 fresh 读盘写入
  //    （loadPlugin Step1 / refreshManifestFromDisk），manifestIndex 却只在启动期水合一次。旧顺序下
  //    **旧快照把新数据遮蔽**（seen 已记 → 第 2 段跳过），实机表现 = 卸载后重装、盘上已是新版本而市场
  //    详情页仍报旧版本、徽标不收敛。（仅 loadedPluginIds 中有的，防僵尸缓存）
  const cache = getMetadataCache();
  const seen = new Set<string>();
  for (const [pluginId, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && meta.manifest && loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest: meta.manifest });
      seen.add(pluginId);
    }
  }

  // 2. 索引兜底（E6#9c：readAllManifests 水合 + loadPlugin/refresh 回写——缓存未就绪时的查表）
  for (const [pluginId, manifest] of getAllManifestEntries()) {
    if (loadedPluginIds.has(pluginId) && !seen.has(pluginId)) {
      result.push({ pluginId, manifest });
    }
  }

  return result;
}

/**
 * marketplace list() 数据源——已加载 + 缺依赖挂起（pending）插件。
 * 🔥 与 getLoadedPluginManifests 的分工（E5.8#15.5）：后者只含已加载——AppInitializer 的
 *   pluginsLoaded 计数 / ProfileService 插件清单 / FactorySlots 必须只见 active 插件，
 *   挂起插件混入 = 语义回归（pending ≠ loaded）；本函数仅供 IPC list 展示——挂起插件带
 *   pendingReason（"等待依赖: xxx"，读状态机诊断面），marketplace 列表/详情可见。
 *   禁用/未安装插件不进本函数——走 getDisabledPluginInfo / getUninstalledPluginInfo 各自 API。
 *   不变式：_pendingPlugins ∩ loadedPluginIds = ∅（sweep 清僵尸）——防御性 skip 保留。
 *
 *   E6#73j（G6）：逐条随行 `updatable`（住所 = userData 安装家才可被包更新）——市场详情页据此
 *   遮蔽「更新到 vX」死钮。判据只在 `isPluginUpdatable` 一处，本函数只做透传。
 */
export function getListPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest; pendingReason?: string; updatable: boolean }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest; pendingReason?: string; updatable: boolean }> =
    getLoadedPluginManifests().map((p) => ({ ...p, updatable: isPluginUpdatable(p.pluginId) }));
  for (const [pluginId, manifest] of _pendingPlugins) {
    if (loadedPluginIds.has(pluginId)) continue; // 僵尸挂起登记——防御（sweep 已清）
    result.push({ pluginId, manifest, pendingReason: getLoadDiagnostics(pluginId).pendingReason, updatable: isPluginUpdatable(pluginId) });
  }
  return result;
}

/** 禁用列表投影行——字段与契约 `PluginInfoEntry`（contracts/linkdesk.d.ts）逐项对齐，本函数是它唯一生产者 */
type DisabledPluginInfo = {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  core?: boolean;
  updatable: boolean;
  icon?: PluginManifest["icon"];
  iconSource?: PluginManifest["iconSource"];
  marketIcon?: PluginManifest["marketIcon"];
  marketIconSource?: PluginManifest["marketIconSource"];
};

/** 获取禁用插件的基本信息（在 plugins/.disabled/ 下）
 *  E6#30.5b：带 core 旗标——详情页禁用分支卸载钮守 E6#18「core:true 详情页不画」（缓存 manifest 内含 core）
 *  E6#106：带图标四字段——禁用行的展示图数据通道（同 E6#65a 给 list() 补图标通道的同一先例）。
 *    禁用插件**仍在盘上**（disable 只记名单、目录原地不动），本地包内图标可达；不补这四个字段，禁用行
 *    只能退到目录条目取图，而目录条目的图标是「未装态」形态（绝对 URL）⇒ **断网时禁用行裂图**。 */
export function getDisabledPluginInfo(): DisabledPluginInfo[] {
  // B2 fix: 优先从缓存读——支持glob 外的插件（glob 中无清单）
  const cache = getMetadataCache();
  const disabled = getDisabledList();
  const result: DisabledPluginInfo[] = [];
  for (const pluginId of disabled) {
    // E6#73j（G6）：禁用**不改住所**（disable 只记名单，目录原地不动）——userData 家的禁用插件照样可更新
    const updatable = isPluginUpdatable(pluginId);
    const cached = cache[pluginId];
    if (cached) {
      result.push({
        pluginId,
        name: cached.name,
        description: cached.description,
        version: cached.version,
        core: cached.manifest?.core,
        updatable,
        icon: cached.manifest?.icon,
        iconSource: cached.manifest?.iconSource,
        marketIcon: cached.manifest?.marketIcon,
        marketIconSource: cached.manifest?.marketIconSource,
      });
      continue;
    }
    // 兜底：manifestIndex 中读（E6#9c——readAllManifests 水合 + glob 种子双源；此分支仅用于缓存未就绪的极端情况）
    const m = getManifestById(pluginId);
    if (m) {
      result.push({
        pluginId,
        name: m.name || pluginId,
        description: m.description,
        version: m.version,
        core: m.core,
        updatable,
        icon: m.icon,
        iconSource: m.iconSource,
        marketIcon: m.marketIcon,
        marketIconSource: m.marketIconSource,
      });
    }
  }
  return result;
}

/** 获取已卸载插件列表（B2 fix：从元数据缓存读，不依赖文件系统——插件目录已被移走）*/
export async function getUninstalledPluginInfo(): Promise<Array<{ pluginId: string; name: string; description?: string; version?: string }>> {
  // B2 fix: 从缓存读——不依赖 Rust 目录扫描（目录已被移走）也不依赖 globally（glob 外的插件不存在于此）
  const cache = getMetadataCache();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const [, meta] of Object.entries(cache)) {
    if (meta.status === "uninstalled") {
      result.push({ pluginId: meta.pluginId, name: meta.name, description: meta.description, version: meta.version });
    }
  }
  return result;
}

/**
 * 从 .disabled/ 坟场移回重新安装——仅 app 树分支卸载（保留副本）可撤销恢复。
 * E6#18c：userData 家卸载 = 目录真删 + removed 墓碑，**无坟场副本**——真恢复走市场/手装 zip
 * （拍板④），本函数对 userData 已卸载插件必然「未找到」失败。卸载 toast 的「撤销」只在
 * restorable（app 树）时展示（lifecycle consumer 端3），与本函数能力对齐。
 * 移回后需全页刷新——Vite dev server 的 import.meta.glob 在启动时扫描，需重扫才能识别移回的插件。
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const env = await linkdesk().env.get();
    const src = `${env.appPluginsDir}/.disabled/${pluginId}`;
    const dest = `${env.appPluginsDir}/${pluginId}`; // 2026-09-05 塌平单根（原 appPluginsDir/user/<id>）
    if (!(await linkdesk().filesystem.exists(src))) {
      throw new Error(`已卸载的插件 "${pluginId}" 未找到`);
    }
    if (await linkdesk().filesystem.exists(dest)) {
      throw new Error(`插件 "${pluginId}" 已存在`);
    }
    await linkdesk().filesystem.copy(src, dest);
    await linkdesk().filesystem.remove(src);

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断
    await loadPlugin(pluginId, "reinstall");
    // E5.7#48：主进程三表重扫
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();
    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}
