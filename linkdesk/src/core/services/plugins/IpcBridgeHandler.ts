/**
 * IpcBridgeHandler——壳渲染进程侧的桥接处理器
 *
 * E3a #26：监听主进程转发的插件 IPC 请求，路由到壳侧核心服务，返回结果。
 * 在 App 启动时调用 initIpcBridgeHandler() 注册。
 *
 * 流程：主进程 bridge:request → preload → 本模块 → ConfigurationService/CommandRegistry
 *      → preload.respond → 主进程 bridge:response → 返回插件 WebView
 */

// E5.7#49：LangDefRegistry/ProtocolRegistry import 已删——Registry 主进程化后壳侧零消费
// （池经直连 IPC 读主进程实例，见 electron/ipc/registry-handlers.ts）
import { onRequestSettingsGroup, onRequestScrollToSetting, consumeSettingsGroup, consumeScrollToSetting } from "../../registry/ConfigurationRegistry";
import { getCommands } from "../../registry/commands/CommandRegistry"; // E5.8#0d.10-10c：execute/register 等五命令符号随 commands 域迁出，仅 menu:getItems 保留 getCommands
import {
  getKeybindings, registerKeybinding, saveUserKeybindings,
  removeKeybindingForCommand, resetKeybindingToDefault,
  findKeybindingForCommand, setKeybindingCaptureActive,
  keybindingResolver,
} from "../../registry/commands/KeybindingRegistry";
import { CoreEvents } from "../../react/events/CoreEvents"; // E5.5#7-p2: 快捷键变更广播
import { getAvailableThemes, getCurrentTheme } from "../ui/ThemeEngine";
import { LanguageRegistry } from "../../registry/languages/LanguageRegistry";
import { confirm, alert } from "../ui/DialogService"; // E5#67
import { ContextKeyService } from "../../registry/commands/ContextKeyService"; // E5#70
import { registerMenuItems, getMenuItems, type ManifestMenuItem } from "../../registry/commands/MenuRegistry"; // E5#69
import { getPluginStateValue, setPluginStateValue } from "./PluginStateService"; // E5#71
import { pushToast, dismissToast, updateToast } from "../ui/toast";
import type { ToastSeverity } from "../ui/toast";
import i18n from "../../../i18n";
// E5.5#7：插件生命周期广播——设置页等保姆插件依赖此事件刷新配置分组
import { onPluginLifecycleChange } from "../../../pluginLoader/lifecycle";
// E5.6#11.5-A：fileAssociation——池插件跨进程查询
// （decorations 的壳侧代理已随 E5.7#60 整删——注册表池内化，见 preload-pool 模块级注释）
// E5.6#11.5g5：文件搜索 + 编码——池插件跨进程使用 FileSearcher + EncodingService
import { searchFiles } from "../files/FileSearcher";
import { EncodingService } from "../files/EncodingService";
import { handlePluginManagerMethod } from "./IpcBridgeHandler/pluginManager"; // E5.8#0d.10-10a：插件管理域（PluginManagementAPI/setPluginAPI 属主迁入）
import { handleConfigChannel, handleConfigurationMethod, subscribeConfiguration, unsubscribeConfiguration } from "./IpcBridgeHandler/configuration"; // E5.8#0d.10-10b：配置域
import { handleCommandsChannel } from "./IpcBridgeHandler/commands"; // E5.8#0d.10-10c：命令域
import { handleTabsChannel } from "./IpcBridgeHandler/tabs"; // E5.8#0d.10-10c：标签页域
import { handleWorkspaceChannel, handleViewContainerChannel, subscribeWorkspace, unsubscribeWorkspace, subscribeViews, unsubscribeViews } from "./IpcBridgeHandler/workspace"; // E5.8#0d.10-10d：工作区/视图容器域
export { setPluginAPI } from "./IpcBridgeHandler/pluginManager"; // E5#43：接口反转——loader 注册自己（loader.ts import 路径不变）
export type { PluginManagementAPI } from "./IpcBridgeHandler/pluginManager"; // core/index export * 透传面保持

/** E5#103: 引用计数——>0 时 handler 活跃。StrictMode double mount/unmount/mount 安全。 */
let _refCount = 0;
let _lifecycleUnsub: (() => void) | null = null;
let _settingsGroupUnsub: (() => void) | null = null;
let _scrollToUnsub: (() => void) | null = null;
let _keybindingsUnsub: (() => void) | null = null; // E5.5#7-p2

export function initIpcBridgeHandler(): void {
  _refCount++;
  if (_refCount > 1) return; // 已注册——只加引用计数

  // ── E5#19b fix: ContextKey 注入 preload 同步 store——解决 IPC 延迟致键盘分发竞态 ──
  const contextKeyGetter = window.linkdesk?.contextKey?._getValue;
  if (contextKeyGetter) {
    ContextKeyService.registerExternalGetter((key: string) => contextKeyGetter(key));
  }

  const linkdesk = window.linkdesk;
  if (!linkdesk?.bridge) {
    _refCount = 0; // 失败时重置，允许重试
    console.warn("[IpcBridgeHandler] window.linkdesk.bridge 不可用——preload 尚未就绪？");
    return;
  }
  // E5.7#97：闭包内窄化失效（bridge 非 readonly 属性）——守卫后捕获局部引用，回调内直用
  const bridge = linkdesk.bridge;

  bridge.onRequest(async (req: { requestId: string; channel: string; args: unknown[] }) => {
    try {
      let result: unknown;

      switch (req.channel) {
        case "config:get":
        case "config:set":
          result = await handleConfigChannel(req.channel, req.args);
          break;
        case "commands:execute":
        case "commands:executeResult":
        case "commands:register":
        case "commands:registerShell":
        case "commands:unregister":
          result = await handleCommandsChannel(req.channel, req.args);
          break;

        // ── E3a #31：插件管理 IPC ──
        case "plugins:call": {
          // E5.7#98：wire args 未知元素——unknown 兜底（各 case 内窄化）
          const [method, ...methodArgs] = req.args as [string, ...unknown[]];
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

        // ── E5#85 + E5.6#11.5-A：workspace——插件查询/写工作区信息（IpcBridgeHandler/workspace 域）──
        case "workspace:getFolders":
        case "workspace:getActive":
        case "workspace:setActive":
        case "workspace:openFolder":
        case "workspace:addFolder":
        case "workspace:removeFolder":
          result = await handleWorkspaceChannel(req.channel, req.args);
          break;

        // E5.7#50：fileAssociation:getPluginFor case 已删——主进程 registry-handlers 直答
        // （plugin-manifest-loader 预加载进主进程实例，不再经壳中转）

        // ── E5.7#60：decorations:getDecoration case 已删——注册表池内化（池内直答零 IPC）──

        // ── E5.6#11.5g5：文件搜索——池插件跨进程全文搜索（对齐 FileSearcher.SearchOptions）──
        case "search:searchFiles": {
          const [opts] = req.args as [Parameters<typeof searchFiles>[0]];
          result = await searchFiles(opts);
          break;
        }

        // ── E5.6#11.5g5：编码检测/转换——池插件跨进程使用 EncodingService ──
        case "encoding:detect": {
          const [buffer] = req.args as [Uint8Array];
          result = EncodingService.detect(buffer);
          break;
        }
        case "encoding:decode": {
          const [buffer, encoding] = req.args as [Uint8Array, string];
          result = EncodingService.decode(buffer, encoding);
          break;
        }
        case "encoding:encode": {
          const [text, encoding] = req.args as [string, string];
          result = EncodingService.encode(text, encoding);
          break;
        }

        // ── E5.7#58：viewContainer——池插件查询/更新壳侧视图注册表（IpcBridgeHandler/workspace 域，元数据 DTO）──
        case "viewContainer:getContainer":
        case "viewContainer:getViews":
        case "viewContainer:getView":
        case "viewContainer:registerView":
          result = await handleViewContainerChannel(req.channel, req.args);
          break;

        // ── E5#69：菜单——插件声明式读写 ──
        case "menu:registerItems": {
          const [menuId, pluginId, items] = req.args as [string, string, ManifestMenuItem[]];
          registerMenuItems(menuId, pluginId, items);
          break;
        }
        case "menu:getItems": {
          // E5.5#7-p3：壳侧一站式过滤——when 匹配 + 命令标题 + 快捷键解析。
          // ContextMenu/MenuRenderer 不再 import @src/core——零依赖纯渲染。
          // E5.7#14：显示文本铁律——标签/标题/子项标签壳侧 t() 解析后推送，
          // 池哑渲染原文、不初始化 i18n（浮层归一化设计.md §4.4）。
          const [menuId, context] = req.args as [string, Record<string, unknown> | undefined];
          const raw = getMenuItems(menuId) as ManifestMenuItem[];
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
                label: item.label ? i18n.t(item.label) : item.label,
                title: cmd?.title ? i18n.t(cmd.title) : cmd?.title,
                shortcut: kb?.key,
                // 子项：字符串 = 命令引用原样透传；对象 = 翻译 label。
                // （用 instanceof 而非 typeof——ESLint no-restricted-syntax 对"小写字面量比较"
                //  一律报 pluginId 硬编码误报，typeof x === "string" 是已知误报模式）
                children: item.children?.map((c) =>
                  c instanceof Object ? { ...c, label: c.label ? i18n.t(c.label) : c.label } : c
                ),
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

        // ── E5#68：标签页操作——插件调壳的 tabs API（IpcBridgeHandler/tabs 域）──
        case "tabs:create":
        case "tabs:openOrFocus":
        case "tabs:focus":
        case "tabs:close":
        case "tabs:focusBySourceId":
        case "tabs:updateLabelBySourceId":
        case "tabs:closeBySourceId":
          result = await handleTabsChannel(req.channel, req.args);
          break;

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

      bridge.respond(req.requestId, result);
    } catch (e) {
      bridge.respond(req.requestId, undefined, e instanceof Error ? e.message : String(e));
    }
  });

  console.log("[IpcBridgeHandler] 已注册 bridge 请求处理器（含 plugins:call）");

  // 订阅配置变更 → 通知主进程广播 config:changed → preload onChange 回调触发
  // SettingsView 直调 setConfigurationValue 绕过 IPC proxy，需要此通道补齐
  subscribeConfiguration(bridge);

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

  // ── E5.5#7 Bug B fix + E5.6#11.5-A + E5.6#19e：工作区/活跃工作区/视图变更广播（IpcBridgeHandler/workspace 域）──
  subscribeWorkspace(linkdesk);
  subscribeViews(linkdesk);
}

/** E5#103: 注销 IPC bridge handler——引用计数归零时清理订阅。 */
export function unregisterIpcBridgeHandler(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0) {
    unsubscribeConfiguration();
    _lifecycleUnsub?.();
    _lifecycleUnsub = null;
    _settingsGroupUnsub?.();
    _settingsGroupUnsub = null;
    _scrollToUnsub?.();
    _scrollToUnsub = null;
    _keybindingsUnsub?.();
    _keybindingsUnsub = null;
    unsubscribeWorkspace();
    unsubscribeViews();
  }
}

// ── E3a #31：插件管理方法路由 ──

async function handlePluginsCall(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    // ── 插件管理（E3a #31）——IpcBridgeHandler/pluginManager 域委派（10 方法 verbatim 迁入）──
    case "list":
    case "enable":
    case "disable":
    case "uninstall":
    case "install":
    case "reinstall":
    case "getDisabled":
    case "getUninstalled":
    case "isDisabled":
    case "getCommands":
      return handlePluginManagerMethod(method, args);
    // ── E5.5#7-p2：快捷键 IPC——插件 WebView 零 @src/core import ──
    case "getKeybindings":
      return getKeybindings();
    case "getKeybindingConflicts":
      return keybindingResolver.detectConflicts();
    case "registerKeybinding": {
      const [binding] = args as [import("../../registry/commands/KeybindingRegistry").Keybinding];
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
    // ── 配置（E5.5#7：设置页 IPC 化）——IpcBridgeHandler/configuration 域委派 ──
    case "getSchema":
    case "getConfigurationContributions":
    case "inspectConfiguration":
    case "getUserSettings":
      return handleConfigurationMethod(method, args);
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
    // E5.7#49：getLangDef/getAllLangDefs/protocol:* 五个代理 case 已删——Registry 主进程化后
    // 池经直连 IPC 读主进程实例（electron/ipc/registry-handlers.ts），不再经壳中转。
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
