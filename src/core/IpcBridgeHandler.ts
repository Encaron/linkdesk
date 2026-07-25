/**
 * IpcBridgeHandler——壳渲染进程侧的桥接处理器
 *
 * E3a #26：监听主进程转发的插件 IPC 请求，路由到壳侧核心服务，返回结果。
 * 在 App 启动时调用 initIpcBridgeHandler() 注册。
 *
 * 流程：主进程 bridge:request → preload → 本模块 → ConfigurationService/CommandRegistry
 *      → preload.respond → 主进程 bridge:response → 返回插件 WebView
 */

import { getConfigurationValue, setConfigurationValue } from "./ConfigurationService";
import { executeCommand } from "./CommandRegistry";
import {
  enablePlugin,
  disablePlugin,
  installPlugin,
  uninstallPlugin,
  reinstallPlugin,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
  isPluginDisabled,
  getLoadedPluginManifests,
} from "../pluginLoader/loader";

export function initIpcBridgeHandler(): void {
  const linkdesk = (window as any).linkdesk;
  if (!linkdesk?.bridge) {
    console.warn("[IpcBridgeHandler] window.linkdesk.bridge 不可用——preload 尚未就绪？");
    return;
  }

  linkdesk.bridge.onRequest(async (req: { requestId: string; channel: string; args: any[] }) => {
    try {
      let result: unknown;

      switch (req.channel) {
        case "config:get": {
          result = getConfigurationValue(req.args[0] as string);
          break;
        }
        case "config:set": {
          const [key, value] = req.args;
          await setConfigurationValue(key as string, value, "user");
          break;
        }
        case "commands:execute": {
          const [commandId, ...rest] = req.args;
          await executeCommand(commandId as string, undefined, ...rest);
          break;
        }

        // ── E3a #31：插件管理 IPC ──
        case "plugins:call": {
          const [method, ...methodArgs] = req.args as [string, ...any[]];
          result = await handlePluginsCall(method, methodArgs);
          break;
        }

        default:
          throw new Error(`未知的 bridge channel: ${req.channel}`);
      }

      linkdesk.bridge.respond(req.requestId, result);
    } catch (e: any) {
      linkdesk.bridge.respond(req.requestId, undefined, e?.message ?? String(e));
    }
  });

  console.log("[IpcBridgeHandler] 已注册 bridge 请求处理器（含 plugins:call）");
}

// ── E3a #31：插件管理方法路由 ──

async function handlePluginsCall(method: string, args: any[]): Promise<unknown> {
  switch (method) {
    case "list":
      return getLoadedPluginManifests().map((p) => ({
        pluginId: p.pluginId,
        manifest: {
          name: p.manifest.name,
          description: p.manifest.description,
          version: p.manifest.version,
          core: p.manifest.core,
          author: p.manifest.author,
          statusBar: p.manifest.statusBar,
        },
      }));
    case "enable":
      return enablePlugin(args[0] as string);
    case "disable":
      return disablePlugin(args[0] as string);
    case "uninstall":
      return uninstallPlugin(args[0] as string);
    case "install":
      return installPlugin(args[0] as string);
    case "reinstall":
      return reinstallPlugin(args[0] as string);
    case "getDisabled":
      return getDisabledPluginInfo();
    case "getUninstalled":
      return getUninstalledPluginInfo();
    case "isDisabled":
      return isPluginDisabled(args[0] as string);
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
