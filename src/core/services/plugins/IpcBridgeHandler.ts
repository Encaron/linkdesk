/**
 * IpcBridgeHandler——壳渲染进程侧的桥接处理器（聚合器门面）
 *
 * E3a #26：监听主进程转发的插件 IPC 请求，路由到壳侧核心服务，返回结果。
 * 在 App 启动时调用 initIpcBridgeHandler() 注册。
 *
 * 流程：主进程 bridge:request → preload → 本模块 → ConfigurationService/CommandRegistry
 *      → preload.respond → 主进程 bridge:response → 返回插件 WebView
 *
 * E5.8#0d.10-10：聚合器角色——channel/method case 全量委派到 IpcBridgeHandler/ 同名夹 8 领域子模块
 * （pluginManager/configuration/commands+tabs/workspace/ui/keybindings/data），本文件零内联业务逻辑：
 * 仅保留 init 装配（bridge guard + ContextKey 注入 + onRequest switch 委派 + subscription assembly）、
 * 复合 unregister（_refCount 归零聚合全部 unsubscribe）、薄 handlePluginsCall。
 * 模块级可变状态仅 _refCount 属主聚合器；订阅属主按域各归子模块（unsubscribe 复合在 unregister 汇聚）。
 * 分层依赖：聚合器 → IpcBridgeHandler/* 领域模块 → 各 Service/Registry。外部消费方（startup/loader/core）导入路径零变更。
 */

// E5.7#49：LangDefRegistry/ProtocolRegistry import 已删——Registry 主进程化后壳侧零消费
// （池经直连 IPC 读主进程实例，见 electron/ipc/registry-handlers.ts）
import { ContextKeyService } from "../../registry/commands/ContextKeyService"; // E5#70（仅 init 的 registerExternalGetter 保留）
import { handlePluginManagerMethod } from "./IpcBridgeHandler/pluginManager"; // E5.8#0d.10-10a：插件管理域（PluginManagementAPI/setPluginAPI 属主迁入）
import { handleConfigChannel, handleConfigurationMethod, subscribeConfiguration, unsubscribeConfiguration } from "./IpcBridgeHandler/configuration"; // E5.8#0d.10-10b：配置域
import { handleCommandsChannel } from "./IpcBridgeHandler/commands"; // E5.8#0d.10-10c：命令域
import { handleTabsChannel } from "./IpcBridgeHandler/tabs"; // E5.8#0d.10-10c：标签页域
import { handleWorkspaceChannel, handleViewContainerChannel, subscribeWorkspace, unsubscribeWorkspace, subscribeViews, unsubscribeViews } from "./IpcBridgeHandler/workspace"; // E5.8#0d.10-10d：工作区/视图容器域
import { handleDialogChannel, handleSettingsChannel, handleSettingsMethod, handleUiMethod, subscribeUi, unsubscribeUi } from "./IpcBridgeHandler/ui"; // E5.8#0d.10-10e：UI 浮层域
import { handleKeybindingsMethod, subscribeKeybindings, unsubscribeKeybindings } from "./IpcBridgeHandler/keybindings"; // E5.8#0d.10-10f：快捷键域
import { handleDataChannel, subscribeData, unsubscribeData } from "./IpcBridgeHandler/data"; // E5.8#0d.10-10g：数据域（pluginState/search/encoding/生命周期广播）
import { handlePanelChannel } from "./IpcBridgeHandler/panel"; // E5.8#34.5：底部面板域（panel.reveal）
import { handleThemeMethod } from "./IpcBridgeHandler/theme"; // E5.8#50.18：主题配方/配色域（theme.* 六方法）
import type { BridgeRequestPayload } from "../../types/ipc/bridge"; // E5.8#46.12：信封契约（含来源窗盖章）
import { handleFactorySlotMethod } from "./IpcBridgeHandler/factory-slots"; // E5.8#41.14：系统插槽域（factorySlots 通用面 + settings 角色别名）
export { setPluginAPI } from "./IpcBridgeHandler/pluginManager"; // E5#43：接口反转——loader 注册自己（loader.ts import 路径不变）
export type { PluginManagementAPI } from "./IpcBridgeHandler/pluginManager"; // core/index export * 透传面保持

/** E5#103: 引用计数——>0 时 handler 活跃。StrictMode double mount/unmount/mount 安全。 */
let _refCount = 0;

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

  bridge.onRequest(async (req: BridgeRequestPayload) => {
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

        // ── E5#71：插件持久化存储——集中缓存 + 文件持久化（IpcBridgeHandler/data 域委派）──
        case "pluginState:get":
        case "pluginState:set":
          result = await handleDataChannel(req.channel, req.args);
          break;

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

        // ── E5.6#11.5g5：文件搜索 + 编码——池插件跨进程使用 FileSearcher/EncodingService（IpcBridgeHandler/data 域委派）──
        case "search:searchFiles":
        case "encoding:detect":
        case "encoding:decode":
        case "encoding:encode":
          result = await handleDataChannel(req.channel, req.args);
          break;

        // ── E5.7#58：viewContainer——池插件查询/更新壳侧视图注册表（IpcBridgeHandler/workspace 域，元数据 DTO）──
        case "viewContainer:getContainer":
        case "viewContainer:getViews":
        case "viewContainer:getView":
        case "viewContainer:registerView":
          result = await handleViewContainerChannel(req.channel, req.args);
          break;

        // ── E5#69 + E5#70：菜单 + ContextKey——插件声明式读写菜单 / SET 状态（IpcBridgeHandler/ui 域委派）──
        case "menu:registerItems":
        case "menu:getItems":
        case "contextKey:set":
          result = await handleSettingsChannel(req.channel, req.args);
          break;

        // ── E5#68：标签页操作——插件调壳的 tabs API（IpcBridgeHandler/tabs 域）──
        case "tabs:create":
        case "tabs:openOrFocus":
        case "tabs:focus":
        case "tabs:close":
        case "tabs:focusBySourceId":
        case "tabs:updateLabelBySourceId":
        case "tabs:closeBySourceId":
          // E5.8#46.12：信封来源窗章传给标签页域——按窗路由 sourceId 族
          result = await handleTabsChannel(req.channel, req.args, req.sourceWindowId);
          break;

        // ── E5.8#34.5：底部面板——插件调壳的 linkdesk.panel API（IpcBridgeHandler/panel 域）──
        case "panel:reveal":
        case "panel:reveal-floating": // E5.8#39.5：悬浮面板声明制（同域委派）
          result = await handlePanelChannel(req.channel, req.args);
          break;

        // ── E5#67：弹窗归一化——插件调壳的 ConfirmDialog（IpcBridgeHandler/ui 域委派）──
        case "dialog:confirm":
        case "dialog:alert":
        // E6#71c：富内容确认——插件自绘确认内容（同域委派）
        case "dialog:confirmContent":
          result = await handleDialogChannel(req.channel, req.args);
          break;

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

  // ── E5.5#7：插件生命周期变更 → 广播到插件 WebView → 设置页等保姆插件刷新（IpcBridgeHandler/data 域）──
  subscribeData(linkdesk);

  // ── E5.5#7：壳→设置页导航——齿轮"设置"跳转到指定分组/配置项（IpcBridgeHandler/ui 域）──
  subscribeUi(linkdesk);

  // ── E5.5#7-p2：快捷键变更广播——设置页快捷键子栏实时刷新（IpcBridgeHandler/keybindings 域）──
  subscribeKeybindings(linkdesk);

  // ── E5.5#7 Bug B fix + E5.6#11.5-A + E5.6#19e：工作区/活跃工作区/视图变更广播（IpcBridgeHandler/workspace 域）──
  subscribeWorkspace(linkdesk);
  subscribeViews(linkdesk);
}

/** E5#103: 注销 IPC bridge handler——引用计数归零时清理订阅。 */
export function unregisterIpcBridgeHandler(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0) {
    unsubscribeConfiguration();
    unsubscribeWorkspace();
    unsubscribeViews();
    unsubscribeUi();
    unsubscribeKeybindings();
    unsubscribeData();
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
    case "installWithProgress": // E6#13（1.2-5）：显式包安装流名（同 installPlugin 路由——url/zip 自适应）
    case "reinstall":
    case "update": // E6#11c（段 B）：安全更新（#11c 原子 + unloadPlugin 机械路径）
    case "checkUpdates": // E6#13b（段 B）：只读查更新
    case "getDisabled":
    case "getUninstalled":
    case "isDisabled":
    case "getCommands":
    case "resolveCommandOwner": // E6#111b：命令归属查询（池侧 on-command 激活取真属主；H3 修点）
      return handlePluginManagerMethod(method, args);
    // ── E5.5#7-p2：快捷键 IPC——插件 WebView 零 @src/core import（IpcBridgeHandler/keybindings 域委派）──
    case "getKeybindings":
    case "getKeybindingConflicts":
    case "registerKeybinding":
    case "saveUserKeybindings":
    case "removeKeybindingForCommand":
    case "resetKeybindingToDefault":
    case "findKeybindingForCommand":
    case "setKeybindingCaptureActive":
      return handleKeybindingsMethod(method, args);
    // ── 配置（E5.5#7：设置页 IPC 化）——IpcBridgeHandler/configuration 域委派 ──
    case "getSchema":
    case "getConfigurationContributions":
    case "inspectConfiguration":
    case "getUserSettings":
      return handleConfigurationMethod(method, args);
    // ── E5.5#7：壳→设置页导航 + 外观查询（IpcBridgeHandler/ui 域委派）──
    case "consumeSettingsGroup":
    case "consumeScrollToSetting":
    case "consumeOpenKeybindings":
    case "getAvailableThemes":
    case "getCurrentTheme":
    case "getAvailableLanguages":
    case "getCurrentLanguage":
      return handleSettingsMethod(method, args);
    // ── E5.8#41.14：系统插槽枚举/切换——任意 factoryRole 多候选并存查询 + 活动落盘
    //    （IpcBridgeHandler/factory-slots 域委派；settings.* 三方法为 #41.12 兼容别名）
    //    （区别于 handleSettingsMethod 的设置页导航）──
    case "listSettingsPlugins":
    case "getActiveSettingsPlugin":
    case "setActiveSettingsPlugin":
    case "listFactorySlotRoles":
    case "listFactorySlotPlugins":
    case "getActiveFactorySlot":
    case "setActiveFactorySlot":
      return handleFactorySlotMethod(method, args);
    // E5.7#49：getLangDef/getAllLangDefs/protocol:* 五个代理 case 已删——Registry 主进程化后
    // 池经直连 IPC 读主进程实例（electron/ipc/registry-handlers.ts），不再经壳中转。
    // E3j #76：插件通知——跨进程触发壳侧 toast（IpcBridgeHandler/ui 域委派）
    case "showNotification":
    case "updateNotification":
    case "finishNotification":
    case "cancelNotification":
      return handleUiMethod(method, args);
    // ── E5.8#50.18+#88：主题配方/配色（八方法）——IpcBridgeHandler/theme 域委派（查询壳侧权威/应用落配置）──
    case "theme.listRecipes":
    case "theme.getActive":
    case "theme.getEffectiveTokens":
    case "theme.setRecipe":
    case "theme.setColorway":
    case "theme.resetAppearance":
    case "theme.resetMix":
    case "theme.getBaselineSeeds":
      return handleThemeMethod(method, args);
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
