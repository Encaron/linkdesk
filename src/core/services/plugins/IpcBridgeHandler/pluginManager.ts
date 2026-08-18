/**
 * IpcBridgeHandler 插件管理域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10a）。
 * PluginManagementAPI 接口 + _pluginAPI 属主 + handlePluginManagerMethod 10 方法 verbatim。
 * 依赖方向：pluginManager → CommandRegistry（getCommands）；被聚合器委派。
 */

import { getCommands } from "../../../registry/commands/CommandRegistry";

// E5#43：接口反转——核心定义 PluginManagementAPI，loader 注册自己。
// 桥不知道加载器的存在，只知道"有人注册了这些能力"。
export interface PluginManagementAPI {
  enablePlugin(id: string): Promise<{ success: boolean; error?: string }>;
  disablePlugin(id: string): Promise<{ success: boolean; error?: string }>;
  installPlugin(id: string): Promise<{ success: boolean; error?: string }>;
  uninstallPlugin(id: string): Promise<{ success: boolean; error?: string }>;
  reinstallPlugin(id: string): Promise<{ success: boolean; error?: string }>;
  getDisabledPluginInfo(): unknown;
  getUninstalledPluginInfo(): unknown;
  isPluginDisabled(id: string): boolean;
  getLoadedPluginManifests(): Array<{ pluginId: string; manifest: { name: string; description?: string; version?: string; core?: boolean; author?: string; statusBar?: unknown; contributes?: unknown } }>;
}

let _pluginAPI: PluginManagementAPI | null = null;
export function setPluginAPI(api: PluginManagementAPI): void { _pluginAPI = api; }

/** E3a #31：插件管理方法路由——list/enable/disable/uninstall/install/reinstall/getDisabled/getUninstalled/isDisabled/getCommands */
export async function handlePluginManagerMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "list":
      return _pluginAPI!.getLoadedPluginManifests().map((p) => ({
        pluginId: p.pluginId,
        manifest: {
          name: p.manifest.name,
          description: p.manifest.description,
          version: p.manifest.version,
          core: p.manifest.core,
          author: p.manifest.author,
          statusBar: p.manifest.statusBar,
          contributes: p.manifest.contributes,
        },
      }));
    case "enable":
      return _pluginAPI!.enablePlugin(args[0] as string);
    case "disable":
      return _pluginAPI!.disablePlugin(args[0] as string);
    case "uninstall":
      return _pluginAPI!.uninstallPlugin(args[0] as string);
    case "install":
      return _pluginAPI!.installPlugin(args[0] as string);
    case "reinstall":
      return _pluginAPI!.reinstallPlugin(args[0] as string);
    case "getDisabled":
      return _pluginAPI!.getDisabledPluginInfo();
    case "getUninstalled":
      return _pluginAPI!.getUninstalledPluginInfo();
    case "isDisabled":
      return _pluginAPI!.isPluginDisabled(args[0] as string);
    // E3j #74：linkdesk API——跨进程查询壳侧注册表
    case "getCommands": {
      // 🔥 handler 是函数——结构化克隆拒绝 → 返回前剥去
      return getCommands().map(({ handler: _h, ...rest }) => rest);
    }
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
