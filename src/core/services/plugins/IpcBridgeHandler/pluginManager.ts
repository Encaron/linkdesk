/**
 * IpcBridgeHandler 插件管理域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10a）。
 * PluginManagementAPI 接口 + _pluginAPI 属主 + handlePluginManagerMethod 10 方法 verbatim。
 * 依赖方向：pluginManager → CommandRegistry（getCommands）；被聚合器委派。
 */

import { getCommands, resolveCommandOwnership } from "../../../registry/commands/CommandRegistry";
import { isRemoteSource } from "../install";
import { resolvePluginManifestForDisplay } from "../../../../pluginLoader/display/displayService";
import type {
  PluginInstallRequestOpts,
  PluginLocalInstallResult,
  PluginUpdateResult,
  PluginUpdateCheckResult,
} from "../../../api/linkdesk-api/types";

// E5#43：接口反转——核心定义 PluginManagementAPI，loader 注册自己。
// 桥不知道加载器的存在，只知道"有人注册了这些能力"。
export interface PluginManagementAPI {
  enablePlugin(id: string): Promise<{ success: boolean; error?: string }>;
  disablePlugin(id: string): Promise<{ success: boolean; error?: string }>;
  // E6#73q：opts = 请求侧身份（pluginId/displayName/origin）——job 表去重 + job 行显示名
  installPlugin(id: string, opts?: PluginInstallRequestOpts): Promise<{ success: boolean; error?: string }>;
  // E6#13（1.2-5）：url/.linkdesk-plugin 包安装流显式名（installPlugin 路由别名——同一流水线同一进度广播）
  installWithProgress(sourcePath: string, opts?: PluginInstallRequestOpts): Promise<{ success: boolean; error?: string }>;
  // R4-1.2（I16·正典 09 §三·补2）：本地安装显式面——五类结构化回执（installFromDirectory 本体在 install-ops）
  installFromDirectory(sourcePath: string, opts?: PluginInstallRequestOpts): Promise<PluginLocalInstallResult>;
  uninstallPlugin(id: string): Promise<{ success: boolean; error?: string }>;
  reinstallPlugin(id: string): Promise<{ success: boolean; error?: string }>;
  // E6#11c（段 B）：安全更新（#11c 原子 + unloadPlugin 机械路径）——opts: { catalogUrl? | url? }
  // E6#33c（锚①）：allowOlder 显式 true 放行降级（版本下拉选旧版 + F2 确认后传）
  updatePlugin(pluginId: string, opts?: { catalogUrl?: string; url?: string; allowOlder?: boolean }): Promise<PluginUpdateResult>;
  // E6#13b（段 B）：只读查更新（fetch catalog + 版本对比；有新版返回 downloadUrl）
  checkPluginUpdates(pluginId: string, catalogUrl: string): Promise<PluginUpdateCheckResult>;
  // E6#73j（G6）：getDisabledPluginInfo 由 unknown 收窄——禁用列表条目随行 updatable
  // （禁用不改住所：userData 家的禁用插件照样可更新，app 树的则否），市场详情页据此判死钮
  // E6#106：随行图标四字段（禁用插件仍在盘上，本地图可达）——禁用行/详情展示图的数据通道
  getDisabledPluginInfo(): Array<{ pluginId: string; name: string; description?: string; version?: string; core?: boolean; updatable: boolean; icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide" | "shared"; marketIcon?: string; marketIconSource?: "codicon" | "svg" | "url" | "lucide" }>;
  getUninstalledPluginInfo(): unknown;
  isPluginDisabled(id: string): boolean;
  // E5.8#15.5：list() 数据源 = 已加载 + 缺依赖挂起（pendingReason 随行）——marketplace 可见 PENDING 状态
  // E6#73j（G6）：updatable 随行——住所判据（userData 安装家才可被包更新），市场据此遮蔽死钮
  getListPluginManifests(): Array<{
    pluginId: string;
    manifest: { name: string; description?: string; version?: string; core?: boolean; author?: string; statusBar?: unknown; contributes?: unknown; requires?: string[]; icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide" | "shared"; marketIcon?: string; marketIconSource?: "codicon" | "svg" | "url" | "lucide"; readme?: { default?: string; locales?: Record<string, string> } };
    pendingReason?: string;
    updatable: boolean;
  }>;
}

let _pluginAPI: PluginManagementAPI | null = null;
export function setPluginAPI(api: PluginManagementAPI): void { _pluginAPI = api; }

/** P1 安装确认：执行端口接线要拿到**当前**注册的 loader API（同 setPluginAPI 的反转方向；⛔ 桥不持实现） */
export function getPluginAPI(): PluginManagementAPI | null { return _pluginAPI; }

/**
 * P1 安装确认（D2 落地形态）——**远程来源的旧安装链在 IPC 分发层一律拒**。
 *
 * 为什么不是「校验 token 后放行」：旧链入参是 `(path, opts)`，装不下 `version + sha256` 绑定，
 * 能验的只有「有没有票」——那是假门禁（随便一张票就能装任何 URL）。所以：
 *   · 远程来源（http/https）⇒ 拒，`no-token`（唯一对外词），日志给壳；
 *   · 本地路径（文件夹 / `.linkdesk-plugin` 包）⇒ 放行（用户手势、无远程来源，2026-11-24 用户拍板）；
 *   · `update` 恒远程（url/catalogUrl）⇒ 一律拒。
 * 合法路径只剩 `plugins.requestInstall / requestUpdateBatch`（壳内确认 → 签票 → 执行端口核销）。
 *
 * 过渡期（壳未发版）正是**一次切换**的窗口：市场 1.4.26 起走新 API；旧市场只会看到 no-token，
 * 不会静默装（spec §9 P1 / §十一.1）。
 */
const NO_TOKEN = "no-token";

/** 拒因日志——只记不入队（用户/作者要能查到「为什么没装」） */
function rejectRemoteInstall(action: string, target: string): void {
  console.warn(`[plugin-install] install:rejected ${NO_TOKEN}——${action} 远程来源必须走 plugins.requestInstall（${target}）`);
}

/** E3a #31：插件管理方法路由——list/enable/disable/uninstall/install/reinstall/getDisabled/getUninstalled/isDisabled/getCommands */
export async function handlePluginManagerMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "list":
      return _pluginAPI!.getListPluginManifests().map((p) => {
        // 显示文本在宿主边界解析（2026-11-24）：市场/任何第三方市场只渲染，不碰插件字典。
        const d = resolvePluginManifestForDisplay(p.pluginId, p.manifest);
        return {
          pluginId: p.pluginId,
          manifest: {
            name: d.name,
            description: d.description,
            version: d.version,
            core: d.core,
            author: d.author,
            statusBar: d.statusBar,
            contributes: d.contributes,
            // E6#30.5e/30.6c3：声明依赖透传——manifest.requires（dependencies.ts 判定缺依赖的消费源）
            requires: d.requires,
            // E6#65a（14 档案批次一数据通道）：icon/iconSource 随行——市场行/详情 PluginIcon 渲染源
            // （resolvePluginIcon 只读这两字段；serial/settings png、marketplace svg、file-tree lucide 即显）
            icon: d.icon,
            iconSource: d.iconSource,
            // E6#67（14 档案批次二·五）：marketIcon/marketIconSource 随行——市场展示图（cover art）数据通道
            // （市场层 pick「marketIcon ?? icon」；壳仍只读 icon 故不影响图标栏/标签栏）
            marketIcon: d.marketIcon,
            marketIconSource: d.marketIconSource,
            readme: (d as { readme?: unknown }).readme,
          },
          // E5.8#15.5：缺依赖挂起原因——marketplace 显示 "等待依赖: xxx"（无挂起 = undefined）
          pendingReason: p.pendingReason,
          // E6#73j（G6）：住所判据透传——市场据此不画「更新到 vX」死钮（app 树/随包发货件更新必失败）
          updatable: p.updatable,
        };
      });
    case "enable":
      return _pluginAPI!.enablePlugin(args[0] as string);
    case "disable":
      return _pluginAPI!.disablePlugin(args[0] as string);
    case "uninstall":
      return _pluginAPI!.uninstallPlugin(args[0] as string);
    case "install":
      // P1 D2：远程来源拒（本地路径放行）——见文件内 rejectRemoteInstall 的说明
      if (isRemoteSource(args[0] as string)) {
        rejectRemoteInstall("install", args[0] as string);
        return { success: false, error: NO_TOKEN };
      }
      return _pluginAPI!.installPlugin(args[0] as string, args[1] as PluginInstallRequestOpts | undefined);
    case "installWithProgress":
      // E6#13（1.2-5）：显式包安装流名——同 installPlugin 路由（目录源/包源自适应）；选调用方喂 url/zip
      // E6#73q：args[1] = 请求侧身份（pluginId/displayName/origin）
      // P1 D2：远程来源拒（本地 .linkdesk-plugin 包放行）
      if (isRemoteSource(args[0] as string)) {
        rejectRemoteInstall("installWithProgress", args[0] as string);
        return { success: false, error: NO_TOKEN };
      }
      return _pluginAPI!.installWithProgress(args[0] as string, args[1] as PluginInstallRequestOpts | undefined);
    case "installFromDirectory":
      // R4-1.2（I16）：本地安装——文件夹/.linkdesk-plugin → {userData}/plugins/<id>，五类回执
      return _pluginAPI!.installFromDirectory(args[0] as string, args[1] as PluginInstallRequestOpts | undefined);
    case "reinstall":
      return _pluginAPI!.reinstallPlugin(args[0] as string);
    case "update":
      // E6#11c（段 B）：安全更新——pluginId + opts { catalogUrl? | url? | allowOlder? }（壳 loader 编排 check→stage→unload→commit→load）
      // P1 D2：update 恒远程（url/catalogUrl）——旧链一律拒；合法路径 = plugins.requestInstall(mode:"update")
      rejectRemoteInstall("update", args[0] as string);
      return { success: false, pluginId: args[0] as string, error: NO_TOKEN };
    case "checkUpdates":
      // E6#13b（段 B）：只读查更新——pluginId + catalogUrl
      return _pluginAPI!.checkPluginUpdates(args[0] as string, args[1] as string);
    case "getDisabled":
      return _pluginAPI!.getDisabledPluginInfo().map((row) => {
        const d = resolvePluginManifestForDisplay(row.pluginId, row);
        return { ...row, name: d.name, description: d.description };
      });
    case "getUninstalled":
      return _pluginAPI!.getUninstalledPluginInfo();
    case "isDisabled":
      return _pluginAPI!.isPluginDisabled(args[0] as string);
    // E3j #74：linkdesk API——跨进程查询壳侧注册表
    case "getCommands": {
      // 🔥 handler 是函数——结构化克隆拒绝 → 返回前剥去
      // S7：附注册归属（pluginId ＋ shellOwned）——AI 桥据此分流「壳命令（壳表）/ 插件命令（只认声明）」，⛔ 按 id 猜。
      // shellOwned = 属主不是任何已装插件（含 app / ai-bridge 等壳内属主）；归属是注册上下文事实，不是名字第一段。
      const installed = new Set(_pluginAPI!.getListPluginManifests().map((p) => p.pluginId));
      return getCommands().map(({ handler: _h, ...rest }) => {
        const owner = resolveCommandOwnership(rest.id).pluginId;
        return { ...rest, pluginId: owner, shellOwned: !installed.has(owner) };
      });
    }
    // E6#111b（H3 修点）：命令归属查询——池侧 on-command 激活取真属主。
    // 🔴 池是单进程共享 realm，preload 无从知道「这次注册/执行是哪个插件的」⇒ 归属解析只在壳一处做，
    //    池只消费。返回 { pluginId, source }；`source:"inferred"` = 推定档（池侧不缓存，声明晚到可翻盘）。
    case "resolveCommandOwner":
      return resolveCommandOwnership(args[0] as string);
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
