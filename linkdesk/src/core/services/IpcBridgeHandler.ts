/**
 * IpcBridgeHandler——壳渲染进程侧的桥接处理器
 *
 * E3a #26：监听主进程转发的插件 IPC 请求，路由到壳侧核心服务，返回结果。
 * 在 App 启动时调用 initIpcBridgeHandler() 注册。
 *
 * 流程：主进程 bridge:request → preload → 本模块 → ConfigurationService/CommandRegistry
 *      → preload.respond → 主进程 bridge:response → 返回插件 WebView
 */

import { getAllLangDefs } from "../registry/LangDefRegistry";
import { getConfigurationValue, setConfigurationValue, onDidChangeConfiguration, inspectConfiguration, getUserSettings } from "./ConfigurationService";
import { getMergedSchema, getConfigurationContributions, onRequestSettingsGroup, onRequestScrollToSetting, consumeSettingsGroup, consumeScrollToSetting } from "../registry/ConfigurationRegistry";
import { executeCommand, getCommands } from "../registry/CommandRegistry";
import {
  getKeybindings, registerKeybinding, saveUserKeybindings,
  removeKeybindingForCommand, resetKeybindingToDefault,
  findKeybindingForCommand, setKeybindingCaptureActive,
  keybindingResolver,
} from "../registry/KeybindingRegistry";
import { CoreEvents } from "../react/CoreEvents"; // E5.5#7-p2: 快捷键变更广播
import { getAvailableThemes, getCurrentTheme } from "./ThemeEngine";
import { LanguageRegistry } from "../registry/LanguageRegistry";
import { confirm, alert } from "./DialogService"; // E5#67
import { shellEvents } from "../react/ShellEvents"; // E5#68
import { ContextKeyService } from "../registry/ContextKeyService"; // E5#70
import { registerMenuItems, getMenuItems, type ManifestMenuItem } from "../registry/MenuRegistry"; // E5#69
import { getPluginStateValue, setPluginStateValue } from "./PluginStateService"; // E5#71
import { getWorkspaceFolders, getActiveWorkspace, onDidChangeFolders } from "./WorkspaceService"; // E5#85
import { pushToast, dismissToast, updateToast } from "./toast";
import type { ToastSeverity } from "./toast";
import i18n from "../../i18n";
// E5.5#7：插件生命周期广播——设置页等保姆插件依赖此事件刷新配置分组
import { onPluginLifecycleChange } from "../../pluginLoader/lifecycle";
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

/** E5#103: 引用计数——>0 时 handler 活跃。StrictMode double mount/unmount/mount 安全。 */
let _refCount = 0;
let _configUnsub: (() => void) | null = null;
let _lifecycleUnsub: (() => void) | null = null;
let _settingsGroupUnsub: (() => void) | null = null;
let _scrollToUnsub: (() => void) | null = null;
let _keybindingsUnsub: (() => void) | null = null; // E5.5#7-p2
let _workspaceUnsub: (() => void) | null = null; // E5.5#7 Bug B fix：工作区变更广播

export function initIpcBridgeHandler(): void {
  _refCount++;
  if (_refCount > 1) return; // 已注册——只加引用计数

  // ── E5#19b fix: ContextKey 注入 preload 同步 store——解决 IPC 延迟致键盘分发竞态 ──
  if (window.linkdesk?.contextKey?._getValue) {
    ContextKeyService.registerExternalGetter(
      (key: string) => window.linkdesk.contextKey._getValue(key),
    );
  }

  const linkdesk = window.linkdesk;
  if (!linkdesk?.bridge) {
    _refCount = 0; // 失败时重置，允许重试
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
          // E5.5#7-fix：去掉多余 undefined——否则 context 被挤到 args[1]，handler 读 args[0] 永远为 undefined
          result = await executeCommand(commandId as string, ...rest);
          break;
        }

        // ── E3a #31：插件管理 IPC ──
        case "plugins:call": {
          const [method, ...methodArgs] = req.args as [string, ...any[]];
          result = await handlePluginsCall(method, methodArgs);
          break;
        }

        // ── E5#71：插件持久化存储——集中缓存 + 文件持久化 ──
        case "pluginState:get": {
          const [pluginId, key] = req.args as [string, string];
          result = getPluginStateValue(pluginId, key);
          break;
        }
        case "pluginState:set": {
          const [pluginId, key, value] = req.args as [string, string, unknown];
          await setPluginStateValue(pluginId, key, value);
          // E5#84f：广播变更到所有 WebView——pluginState.onChange 订阅者收到通知
          try { window.linkdesk?.events?.emit("plugin-state:changed", { pluginId, key, value }); } catch { /* 静默 */ }
          break;
        }

        // ── E5#85：workspace——插件查询工作区信息 ──
        case "workspace:getFolders": {
          result = getWorkspaceFolders();
          break;
        }
        case "workspace:getActive": {
          result = getActiveWorkspace();
          break;
        }

        // ── E5#69：菜单——插件声明式读写 ──
        case "menu:registerItems": {
          const [menuId, pluginId, items] = req.args as [string, string, ManifestMenuItem[]];
          registerMenuItems(menuId as any, pluginId, items);
          break;
        }
        case "menu:getItems": {
          // E5.5#7-p3：壳侧一站式过滤——when 匹配 + 命令标题 + 快捷键解析。
          // ContextMenu/MenuRenderer 不再 import @src/core——零依赖纯渲染。
          const [menuId, context] = req.args as [string, Record<string, unknown> | undefined];
          const raw = getMenuItems(menuId as any) as ManifestMenuItem[];
          const allCmds = getCommands();
          result = raw
            .filter((item): item is Exclude<ManifestMenuItem, string> => {
              if (typeof item === "string") return false; // 分隔符/字符串引用——壳侧不返回
              const cmd = allCmds.find(c => c.id === item.command);
              const whenExpr = item.when ?? cmd?.when;
              return ContextKeyService.matches(whenExpr, context as Record<string, unknown> | undefined);
            })
            .map((item) => {
              const cmd = allCmds.find(c => c.id === item.command);
              const kb = findKeybindingForCommand(item.command);
              return {
                ...item,
                title: cmd?.title,
                shortcut: kb?.key,
              };
            });
          break;
        }

        // ── E5#70：ContextKey——插件 SET 状态 ──
        case "contextKey:set": {
          const [key, value] = req.args as [string, unknown];
          ContextKeyService.setValue(key, value);
          break;
        }

        // ── E5#68：标签页操作——插件调壳的 tabs API ──
        case "tabs:create": {
          const [type, opts] = req.args as [string, Record<string, unknown>?];
          // E5#99：壳统一守卫——未知类型路由到 editor（对标 VS Code 文本编辑器 fallback）
          shellEvents.emit("tab:create", { type: type || "editor", opts });
          break;
        }
        case "tabs:openOrFocus": {
          const [type, opts] = req.args as [string, Record<string, unknown>?];
          shellEvents.emit("tab:openOrFocus", { type, opts });
          break;
        }
        case "tabs:focus": {
          const [tabId] = req.args as [string];
          shellEvents.emit("tab:focus", { tabId });
          break;
        }
        case "tabs:close": {
          const [tabId] = req.args as [string];
          shellEvents.emit("tab:close", { tabId });
          break;
        }
        case "tabs:focusBySourceId": {
          const [sourceId] = req.args as [string];
          shellEvents.emit("tab:focusBySourceId", { sourceId });
          break;
        }
        case "tabs:updateLabelBySourceId": {
          const [sourceId, label] = req.args as [string, string];
          shellEvents.emit("tab:updateLabelBySourceId", { sourceId, label });
          break;
        }
        case "tabs:closeBySourceId": {
          const [sourceId] = req.args as [string];
          shellEvents.emit("tab:closeBySourceId", { sourceId });
          break;
        }

        // ── E5#67：弹窗归一化——插件调壳的 ConfirmDialog ──
        case "dialog:confirm": {
          const [message] = req.args as [string];
          result = await confirm({ title: "", message });
          break;
        }
        case "dialog:alert": {
          const [message] = req.args as [string];
          await alert({ title: "", message });
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

  // 订阅配置变更 → 通知主进程广播 config:changed → preload onChange 回调触发
  // SettingsView 直调 setConfigurationValue 绕过 IPC proxy，需要此通道补齐
  _configUnsub = onDidChangeConfiguration((key: string, value: unknown) => {
    linkdesk.bridge.notifyConfigChanged?.(key, value);
  });

  // ── E5.5#7：插件生命周期变更 → 广播到插件 WebView → 设置页等保姆插件刷新 ──
  _lifecycleUnsub = onPluginLifecycleChange.event(() => {
    try { linkdesk.events?.emit("plugin-lifecycle:changed", {}); } catch { /* 静默 */ }
  });

  // ── E5.5#7：壳→设置页导航——齿轮"设置"跳转到指定分组 ──
  // M1 双通道 B 的 IPC 版：壳 onRequestSettingsGroup Emitter → broadcast → 插件 WebView events.on
  _settingsGroupUnsub = onRequestSettingsGroup.event((pluginId) => {
    try { linkdesk.events?.emit("settings:requestGroup", { pluginId }); } catch { /* 静默 */ }
  });
  // E3f #53e：壳→设置页滚动到指定配置项
  _scrollToUnsub = onRequestScrollToSetting.event((key) => {
    try { linkdesk.events?.emit("settings:scrollTo", { key }); } catch { /* 静默 */ }
  });

  // ── E5.5#7-p2：快捷键变更广播——设置页快捷键子栏实时刷新 ──
  _keybindingsUnsub = CoreEvents.onDidChangeKeybindings.event(() => {
    try { linkdesk.events?.emit("keybindings:changed", {}); } catch { /* 静默 */ }
  });

  // ── E5.5#7 Bug B fix：工作区变更广播——编辑器 TS 影子 model 需重扫 ──
  _workspaceUnsub = onDidChangeFolders(() => {
    try { linkdesk.events?.emit("workspace:changed", {}); } catch { /* 静默 */ }
  });
}

/** E5#103: 注销 IPC bridge handler——引用计数归零时清理订阅。 */
export function unregisterIpcBridgeHandler(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0) {
    _configUnsub?.();
    _configUnsub = null;
    _lifecycleUnsub?.();
    _lifecycleUnsub = null;
    _settingsGroupUnsub?.();
    _settingsGroupUnsub = null;
    _scrollToUnsub?.();
    _scrollToUnsub = null;
    _keybindingsUnsub?.();
    _keybindingsUnsub = null;
    _workspaceUnsub?.();
    _workspaceUnsub = null;
  }
}

// ── E3a #31：插件管理方法路由 ──

async function handlePluginsCall(method: string, args: any[]): Promise<unknown> {
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
    // ── E5.5#7-p2：快捷键 IPC——插件 WebView 零 @src/core import ──
    case "getKeybindings":
      return getKeybindings();
    case "getKeybindingConflicts":
      return keybindingResolver.detectConflicts();
    case "registerKeybinding": {
      const [binding] = args as [import("../registry/KeybindingRegistry").Keybinding];
      registerKeybinding(binding);
      break;
    }
    case "saveUserKeybindings":
      return saveUserKeybindings();
    case "removeKeybindingForCommand": {
      const [commandId] = args as [string];
      removeKeybindingForCommand(commandId);
      break;
    }
    case "resetKeybindingToDefault": {
      const [commandId] = args as [string];
      resetKeybindingToDefault(commandId);
      break;
    }
    case "findKeybindingForCommand": {
      const [commandId] = args as [string];
      return findKeybindingForCommand(commandId);
    }
    case "setKeybindingCaptureActive": {
      const [active] = args as [boolean];
      setKeybindingCaptureActive(active);
      break;
    }
    case "getSchema": {
      // 🔥 onApply 是函数——结构化克隆拒绝 → 返回前剥去
      const raw = getMergedSchema();
      const safe: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(raw)) {
        const { onApply: _onApply, ...rest } = prop as unknown as Record<string, unknown>;
        safe[key] = rest;
      }
      return safe;
    }
    // ── E5.5#7：设置页 IPC 化——跨进程查询配置注册表 ──
    case "getConfigurationContributions": {
      // Map 不可序列化 → 转为 entries
      // 🔥 onApply 是函数——结构化克隆拒绝 → 返回前剥去
      const contribs = getConfigurationContributions();
      return Array.from(contribs.entries()).map(([pluginId, contrib]) => {
        const safeProps: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(contrib.properties)) {
          const { onApply: _onApply, ...rest } = prop as unknown as Record<string, unknown>;
          safeProps[key] = rest;
        }
        return [pluginId, { title: contrib.title, properties: safeProps }];
      });
    }
    case "inspectConfiguration": {
      const [key] = args as [string];
      return inspectConfiguration(key);
    }
    case "getUserSettings":
      return getUserSettings();
    // ── E5.5#7：壳→设置页导航——M1 双通道（齿轮"设置"跳转到指定分组/配置项）──
    case "consumeSettingsGroup":
      return consumeSettingsGroup();
    case "consumeScrollToSetting":
      return consumeScrollToSetting();
    case "getAvailableThemes":
      return getAvailableThemes();
    case "getCurrentTheme":
      return getCurrentTheme()?.name ?? null;
    case "getAvailableLanguages":
      return LanguageRegistry.getAll();
    case "getCurrentLanguage":
      return i18n.language;
    case "getAllLangDefs": {
      // E5.5#7 Bug B fix：LangDefRegistry 跨 WebView 同步。
      // 多 WebView 下编辑器在独立 WebView 中运行，LangDefRegistry 为空。
      // 壳侧 loader.ts 注册的 LangDef 通过 IPC 同步到编辑器 WebView。
      return Array.from(getAllLangDefs().entries());
    }
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
