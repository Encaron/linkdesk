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
import { getMergedSchema } from "./ConfigurationRegistry";
import { executeCommand, getCommands } from "./CommandRegistry";
import { getAvailableThemes, getCurrentTheme } from "./ThemeEngine";
import { LanguageRegistry } from "./LanguageRegistry";
import { pushToast, dismissToast, updateToast } from "./toast";
import type { ToastSeverity } from "./toast";
import i18n from "../i18n";
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

let _initialized = false;

export function initIpcBridgeHandler(): void {
  if (_initialized) return;
  _initialized = true;

  const linkdesk = (window as any).linkdesk;
  if (!linkdesk?.bridge) {
    _initialized = false; // 失败时重置，允许重试
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
          result = await executeCommand(commandId as string, undefined, ...rest);
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
          contributes: p.manifest.contributes,
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
    // E3j #74：linkdesk API——跨进程查询壳侧注册表
    case "getCommands":
      return getCommands();
    case "getSchema":
      return getMergedSchema();
    case "getAvailableThemes":
      return getAvailableThemes();
    case "getCurrentTheme":
      return getCurrentTheme()?.name ?? null;
    case "getAvailableLanguages":
      return LanguageRegistry.getAll();
    case "getCurrentLanguage":
      return i18n.language;
    // E3j #76：插件通知——跨进程触发壳侧 toast
    case "showNotification": {
      const [message, options] = args as [string, { type?: string; progress?: boolean } | undefined];
      const severity: ToastSeverity =
        options?.type === "error" ? "error" :
        options?.type === "warning" ? "warning" : "info";
      const id = pushToast({
        message,
        severity,
        ttl: options?.progress ? 0 : undefined, // 进度条：不自动消失
      });
      return options?.progress ? id : undefined;
    }
    case "updateNotification": {
      const [handleId, message] = args as [string, string];
      updateToast(handleId, message);
      break;
    }
    case "finishNotification": {
      const [handleId, message] = args as [string, string | undefined];
      dismissToast(handleId);
      if (message) pushToast({ message, severity: "info" });
      break;
    }
    case "cancelNotification": {
      const [handleId] = args as [string];
      dismissToast(handleId);
      break;
    }
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
