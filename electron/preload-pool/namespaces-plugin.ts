/**
 * Pool preload 插件服务域命名空间集合——pluginManager/plugins/theme/keybindings/pluginState/
 * hotExit/menu/langDef/lsp/protocol/shell/getFilePath（window 已抽共享模块 electron/window-namespace.ts，
 * E5.8#20——双端口径完全一致，共享消克隆 + 防 setZoom 类漂移复发）。
 * E5.8#0d.10-4d：自 preload-pool.ts 拆出——无模块级状态的薄转发面（invoke/send/listenDirect/events.on）。
 * 依赖方向：namespaces-plugin → electron/ipc（channels/event-system）+ src/core/types（type）；无反向。
 */

import { ipcRenderer, webUtils } from 'electron';
import { IPC } from '../ipc/channels';
import { type EventSystemApi } from '../ipc/event-system';
import type { PluginStateChangedPayload } from '../../src/core/types/ipc/events';
import type { MenuItemDescriptor } from '../../src/core/api/linkdesk-api/types'; // E5.8#20：契约语义类型——menu.getItems 返回面
// E5.8#1b：keybinding 归一化集中——主进程/壳/池三端共用单一权威源（防 E5.7#79 漂移复发）
import { keyboardInputToKeyString } from '../../src/core/utils/keybindingNormalization.js';

/** pluginManager 命名空间——插件生命周期管理 */
export function buildPluginManager() {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（pluginManager 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    list: () => ipcRenderer.invoke(IPC.plugins.call, 'list'),
    enable: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'enable', id),
    disable: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'disable', id),
    uninstall: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'uninstall', id),
    install: (path: string) => ipcRenderer.invoke(IPC.plugins.call, 'install', path),
    // E6#13（1.2-5）：显式包安装流名——url/.linkdesk-plugin → 下载解压装；marketplace 安装按钮消费（进度 plugin:installProgress）
    installWithProgress: (path: string) => ipcRenderer.invoke(IPC.plugins.call, 'installWithProgress', path),
    reinstall: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'reinstall', id),
    // E6#11c/#13b（段 B）：安全更新 + 只读查更新——池经 plugins:call 代理到壳 loader（对称契约）
    update: (id: string, opts?: { catalogUrl?: string; url?: string }) => ipcRenderer.invoke(IPC.plugins.call, 'update', id, opts),
    checkUpdates: (id: string, catalogUrl: string) => ipcRenderer.invoke(IPC.plugins.call, 'checkUpdates', id, catalogUrl),
    getDisabled: () => ipcRenderer.invoke(IPC.plugins.call, 'getDisabled'),
    getUninstalled: () => ipcRenderer.invoke(IPC.plugins.call, 'getUninstalled'),
    isDisabled: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'isDisabled', id),
  };
  /* jscpd:ignore-end */
}

/**
 * plugins 命名空间——池侧动态 import 运行时安装的插件（E5.6#11.5-fix）。
 * PluginComponent.tsx 的 import.meta.glob 是构建时扫描，运行时安装的插件不在 glob 中。
 * 提供 resolvePath 让 PluginComponent 在 glob 查找失败时 fallback 到动态 import()。
 */
export function buildPlugins() {
  return {
    resolvePath: (id: string) => ipcRenderer.invoke(IPC.plugins.resolvePath, id),
    // E6#7（1.2-4）：resolvePath 的兄弟——{ root, entry, bundle }（bundle 入口恒 index.bundle.js；
    // PluginComponent 默认主 tab 入口据此拼 URL，不再硬编码 src/index.tsx）
    resolveEntry: (id: string) => ipcRenderer.invoke(IPC.plugins.resolveEntry, id),
  };
}

/** theme 命名空间——主题查询/应用（06 §2：列表走 API，选中走配置）。
 *  E5.8#50.18：追加 recipe/colorway 六方法 + E5.8#88 八方法（getBaselineSeeds/resetMix）；
 *  旧三方法 getCurrent/getAvailable/apply 保留（既有设置 UI 兼容）。 */
export function buildTheme() {
  return {
    getCurrent: () => ipcRenderer.invoke(IPC.plugins.call, 'getCurrentTheme'),
    getAvailable: () => ipcRenderer.invoke(IPC.plugins.call, 'getAvailableThemes'),
    apply: (themeId: string) => ipcRenderer.invoke(IPC.config.set, 'app.theme', themeId),
    // ── E5.8#50.18 + #88：配方/配色 API（经 plugins:call 代理 → 壳 IpcBridgeHandler/theme 域）──
    listRecipes: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.listRecipes'),
    getActive: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.getActive'),
    getEffectiveTokens: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.getEffectiveTokens'),
    setRecipe: (recipeId: string) => ipcRenderer.invoke(IPC.plugins.call, 'theme.setRecipe', recipeId),
    setColorway: (colorwayId: string) => ipcRenderer.invoke(IPC.plugins.call, 'theme.setColorway', colorwayId),
    resetAppearance: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.resetAppearance'),
    resetMix: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.resetMix'),
    getBaselineSeeds: () => ipcRenderer.invoke(IPC.plugins.call, 'theme.getBaselineSeeds'),
  };
}

/** appearance 命名空间——外观资产（E5.8#50.11：选择图片拷贝入库——受控来源；E5.8#153：打开存储位置） */
export function buildAppearance() {
  return {
    importImage: (sourcePath: string) => ipcRenderer.invoke(IPC.appearance.importImage, sourcePath),
    // E5.8#153：背景图齿轮「打开存储位置」——主进程解析 userData/appearance 并 openPath（池内无路径知识）
    revealStorage: () => ipcRenderer.invoke(IPC.appearance.revealStorage),
  };
}

/** keybindings 命名空间——快捷键查询/注册/捕获 */
export function buildKeybindings(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（keybindings 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    getKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindings'),
    getConflicts: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindingConflicts'),
    registerKeybinding: (binding: unknown) => ipcRenderer.invoke(IPC.plugins.call, 'registerKeybinding', binding),
    saveUserKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'saveUserKeybindings'),
    removeKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'removeKeybindingForCommand', commandId),
    resetKeybindingToDefault: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'resetKeybindingToDefault', commandId),
    findKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'findKeybindingForCommand', commandId),
    setKeybindingCaptureActive: (active: boolean) => ipcRenderer.invoke(IPC.plugins.call, 'setKeybindingCaptureActive', active),
    keyboardEventToKeyString: (e: KeyboardEvent): string => {
      if (!e?.key) return '';
      // E5.8#1b：归一化委托单一权威源（keyboardInputToKeyString 含 E5.7#79 +→= 修复）
      return keyboardInputToKeyString({
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        key: e.key,
        code: e.code,
      });
    },
    onChange: (cb: () => void) => events.on('keybindings:changed', cb),
  };
  /* jscpd:ignore-end */
}

/** pluginState 命名空间——插件持久化存储 */
export function buildPluginState(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（pluginState 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    // E5.8#20：补泛型 + `| undefined`（契约 get<T = unknown>(pluginId, key): Promise<T | undefined>）——
    // 主进程无键返回 undefined，签名承诺与运行时一致
    get: <T = unknown>(pluginId: string, key: string): Promise<T | undefined> =>
      ipcRenderer.invoke(IPC.pluginState.get, pluginId, key),
    set: (pluginId: string, key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke(IPC.pluginState.set, pluginId, key, value),
    onChange: (pluginId: string, key: string, cb: (value: unknown) => void) => {
      return events.on('plugin-state:changed', (data: PluginStateChangedPayload) => {
        if (data?.pluginId === pluginId && data?.key === key) {
          cb(data.value);
        }
      });
    },
  };
  /* jscpd:ignore-end */
}

/**
 * hotExit 命名空间——Hot Exit 备份（E5.7#38：脏内容落盘走主进程，池渲染进程零直写 %APPDATA%）。
 * 路径约定单源在主进程 hot-exit-handlers.ts：<sha256(filePath)>.dirty。
 * 只读 load（不消费）——StrictMode 双 mount / 跨组移动 remount 都要能重复读。
 */
export function buildHotExit() {
  return {
    save: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.hotExit.save, filePath, content),
    load: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.hotExit.load, filePath),
    clear: (filePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.hotExit.clear, filePath),
  };
}

/** menu 命名空间——菜单项注册/查询 */
export function buildMenu() {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（menu 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
      ipcRenderer.invoke(IPC.menu.registerItems, menuId, pluginId, items),
    // E5.8#20：补返回类型（契约 getItems(): Promise<MenuItemDescriptor[]>）——主进程返回壳侧解析后的描述形状
    getItems: (menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]> =>
      ipcRenderer.invoke(IPC.menu.getItems, menuId, context),
  };
  /* jscpd:ignore-end */
}

/**
 * langDef 命名空间——语言定义注册表（主进程 LangDefRegistry）。
 * Registry 主进程化：plugin-manifest-loader 预加载进主进程实例，直连 langDef:get（1 跳）。
 * 只返回可序列化字段 { id, lsp }——monarch tokenizer 函数不可跨进程（主进程侧剥壳）。
 */
export function buildLangDef() {
  return {
    get: (extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null> =>
      ipcRenderer.invoke(IPC.langDef.get, extension),
  };
}

/** lsp 命名空间——LSP 桥（编辑器在池内渲染需 LSP 通信：自动补全/F12/诊断/重命名） */
export function buildLsp(events: EventSystemApi) {
  return {
    spawn: (command: string, args: string[] | undefined, pluginId: string) =>
      ipcRenderer.invoke(IPC.lsp.spawn, { command, args, pluginId }),
    write: (channelId: string, data: string) =>
      ipcRenderer.send(IPC.lsp.write, { channelId, data }),
    dispose: (channelId: string) =>
      ipcRenderer.invoke(IPC.lsp.dispose, { channelId }),
    // E5.8#6.5：lsp:data 走 broadcast → plugin:push 分发 → events.on（原 listenDirect direct 已删）
    onData: (cb: (channelId: string, data: string) => void) =>
      events.on<{ channelId: string; data: string }>(IPC.lsp.data, ({ channelId, data }) => cb(channelId, data)),
  };
}

/**
 * protocol 命名空间——协议注册表（主进程 ProtocolRegistry）。
 * Registry 主进程化：内置方括号协议由 plugin-manifest-loader 汇入主进程实例，
 * 直连 protocol:* 通道（1 跳）；返回前主进程剥 parseLine/detect（JS 函数不可跨进程）。
 */
export function buildProtocol() {
  return {
    listProtocols: (): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>> =>
      ipcRenderer.invoke(IPC.protocol.listProtocols),
    getActiveProtocolId: (): Promise<string> =>
      ipcRenderer.invoke(IPC.protocol.getActiveProtocolId),
    setActiveProtocolId: (protocolId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.protocol.setActiveProtocolId, protocolId),
  };
}

/**
 * shell 命名空间——revealInOS / openInTerminal / startDrag。
 * 这些是主进程 handler（main.ts ipcMain.handle），非壳渲染进程 handler，
 * 因此不走 PROXY_CHANNELS——直接 ipcRenderer.invoke。
 */
export function buildShell() {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（shell 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    showItemInFolder: (p: string) => ipcRenderer.invoke(IPC.shell.showItemInFolder, p),
    openInTerminal: (dirPath: string, terminalExe?: string, customCommand?: string) =>
      ipcRenderer.invoke(IPC.shell.openInTerminal, dirPath, terminalExe, customCommand),
    startDrag: (filePath: string, iconPath?: string) =>
      ipcRenderer.send(IPC.shell.startDrag, filePath, iconPath),
  };
  /* jscpd:ignore-end */
}

/** getFilePath——桥接 Chromium File API 与沙箱文件系统（E5.6#11.5-bug4：FileTreeDnD handleDrop 解外部拖入文件真实路径） */
export function buildGetFilePath() {
  return {
    getFilePath: (file: File) => webUtils.getPathForFile(file),
  };
}
