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
import { getPluginAssetPath } from '../../src/core/utils/path/pluginAssetPath'; // 2026-11-24（A2/M3）：资产 URL 形状的唯一实现
import type { PluginStateChangedPayload } from '../../src/core/types/ipc/events';
import type { MenuItemDescriptor, PluginInstallRequestOpts, PluginFolderKind, PluginCompatibilityRequest, PluginInstallRequest, PluginUpdatePolicy } from '../../src/core/api/linkdesk-api/types'; // E5.8#20：契约语义类型——menu.getItems 返回面；E6#78：+ 插件目录落点；E6#117：+ 兼容读数请求
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
    // E6#73q：opts = 请求侧身份（pluginId/displayName/origin）——壳侧 job 表按 pluginId 去重 + job 行显示名
    install: (path: string, opts?: PluginInstallRequestOpts) => ipcRenderer.invoke(IPC.plugins.call, 'install', path, opts),
    // E6#13（1.2-5）：显式包安装流名——url/.linkdesk-plugin → 下载解压装；marketplace 安装按钮消费（进度 plugin:installProgress）
    installWithProgress: (path: string, opts?: PluginInstallRequestOpts) => ipcRenderer.invoke(IPC.plugins.call, 'installWithProgress', path, opts),
    // R4-1.2（I16·正典 09 §三·补2）：本地安装——文件夹/.linkdesk-plugin → {userData}/plugins/<id>（五类回执；来源页「添加本地插件」消费）
    installFromDirectory: (path: string, opts?: PluginInstallRequestOpts) => ipcRenderer.invoke(IPC.plugins.call, 'installFromDirectory', path, opts),
    reinstall: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'reinstall', id),
    // E6#11c/#13b（段 B）：安全更新 + 只读查更新——池经 plugins:call 代理到壳 loader（对称契约）
    // E6#33c（锚①）：opts.allowOlder——降级放行（版本下拉选旧版 + F2 确认后传），默认拒 <=
    update: (id: string, opts?: { catalogUrl?: string; url?: string; allowOlder?: boolean }) => ipcRenderer.invoke(IPC.plugins.call, 'update', id, opts),
    checkUpdates: (id: string, catalogUrl: string) => ipcRenderer.invoke(IPC.plugins.call, 'checkUpdates', id, catalogUrl),
    getDisabled: () => ipcRenderer.invoke(IPC.plugins.call, 'getDisabled'),
    getUninstalled: () => ipcRenderer.invoke(IPC.plugins.call, 'getUninstalled'),
    isDisabled: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'isDisabled', id),
  };
  /* jscpd:ignore-end */
}

/**
 * licenses 命名空间——许可验签/权益（R4-1.3（I21·正典 09 §三·补3））。
 * 池侧经 plugins:call 代理到壳（theme.* 同款）→ 壳 IpcBridgeHandler/licenses 域 → 壳 preload →
 * 主进程 IPC（真验签/权益存储都在主进程——裁决层住壳最深处）。市场付费流是唯一预期消费方。
 */
export function buildLicenses() {
  return {
    verify: (key: string, publicKey: string) => ipcRenderer.invoke(IPC.plugins.call, 'licenses.verify', key, publicKey),
    list: () => ipcRenderer.invoke(IPC.plugins.call, 'licenses.list'),
    remove: (pluginId: string) => ipcRenderer.invoke(IPC.plugins.call, 'licenses.remove', pluginId),
  };
}

/**
 * plugins 命名空间——池侧动态 import 运行时安装的插件（E5.6#11.5-fix）。
 * PluginComponent.tsx 的 import.meta.glob 是构建时扫描，运行时安装的插件不在 glob 中。
 * 提供 resolvePath 让 PluginComponent 在 glob 查找失败时 fallback 到动态 import()。
 */
export function buildPlugins() {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（plugins 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    resolvePath: (id: string) => ipcRenderer.invoke(IPC.plugins.resolvePath, id),
    // E6#7（1.2-4）：resolvePath 的兄弟——{ root, entry, bundle }（bundle 入口恒 index.bundle.js；
    // PluginComponent 默认主 tab 入口据此拼 URL，不再硬编码 src/index.tsx）
    resolveEntry: (id: string) => ipcRenderer.invoke(IPC.plugins.resolveEntry, id),
    // E6#117：兼容读数（只读 invoke——main 直答，与壳 preload 同面同通道；市场插件格 5 消费）
    getCompatibility: (req: PluginCompatibilityRequest) => ipcRenderer.invoke(IPC.plugins.getCompatibility, req),
    // ── P1 壳托管安装/更新确认（2026-11-24 拍板 D1/D2/D3/D5/D8）──
    // 远端（市场/AI）唯一合法安装入口：壳算 ConfirmPlan → 出确认卡 → 用户确认 → 壳内签票 → 执行。
    // 旧链 pluginManager.install/update 的**远程来源**在壳分发层一律拒（no-token）——本命名空间不是可选装饰。
    requestInstall: (req: PluginInstallRequest) => ipcRenderer.invoke(IPC.plugins.call, 'requestInstall', req),
    requestUpdateBatch: (reqs: PluginInstallRequest[]) => ipcRenderer.invoke(IPC.plugins.call, 'requestUpdateBatch', reqs),
    // 两步确认（D1′：UI 归市场）——prepare 只算计划、commit 才签票执行；不 commit 就装不上
    prepareInstall: (req: PluginInstallRequest) => ipcRenderer.invoke(IPC.plugins.call, 'prepareInstall', req),
    prepareUpdateBatch: (reqs: PluginInstallRequest[]) => ipcRenderer.invoke(IPC.plugins.call, 'prepareUpdateBatch', reqs),
    commitInstall: (planId: string, opts?: { confirmed?: boolean }) =>
      ipcRenderer.invoke(IPC.plugins.call, 'commitInstall', planId, opts),
    discardInstall: (planId: string) => ipcRenderer.invoke(IPC.plugins.call, 'discardInstall', planId),
    // 只读预览（不改状态、不入队）——确认卡内改设置后原地重算；AI 也能先看「这次会问哪几个」
    previewUpdatePlan: (reqs: PluginInstallRequest[], opts?: { forceAsk?: boolean }) =>
      ipcRenderer.invoke(IPC.plugins.call, 'previewUpdatePlan', reqs, opts),
    getUpdatePolicy: () => ipcRenderer.invoke(IPC.plugins.call, 'getUpdatePolicy'),
    setUpdatePolicy: (patch: Partial<PluginUpdatePolicy>) => ipcRenderer.invoke(IPC.plugins.call, 'setUpdatePolicy', patch),
    listSourceTrust: () => ipcRenderer.invoke(IPC.plugins.call, 'listSourceTrust'),
    trustSource: (entry: { sourceId: string; url: string; repo?: string; publisher?: string }) =>
      ipcRenderer.invoke(IPC.plugins.call, 'trustSource', entry),
    untrustSource: (sourceId: string) => ipcRenderer.invoke(IPC.plugins.call, 'untrustSource', sourceId),
  };
  /* jscpd:ignore-end */
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
    // 2026-11-24 语义归属：选图＋入库一步——插件只传 schema 声明的 {domain,target}（起始目录/过滤器全在壳）
    pickImage: (options: { domain: string; target: string }) =>
      ipcRenderer.invoke(IPC.appearance.pickImage, options),
  };
}

/** storage 命名空间（池半边）——宿主存储键 → 落盘路径（设置插件打开 settings.json 用）。
 *  revealCache/cacheDir 是壳侧命令面，池不注入（PoolExposed 只 Pick getFilePath）。 */
export function buildStorage() {
  return {
    getFilePath: (key: string) => ipcRenderer.invoke(IPC.storage.getFilePath, key),
  };
}

/** pluginAssets 命名空间（2026-11-24 A2/M3）：插件包内资产 URL。
 *  🔴 唯一实现 = `getPluginAssetPath`（与主进程协议解析同源）——插件⛔ 自行拼 `linkdesk://${id}/…`。 */
export function buildPluginAssets() {
  return {
    getUrl: (pluginId: string, relativePath: string = "") =>
      getPluginAssetPath(pluginId, relativePath),
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
    clearKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'clearKeybindingForCommand', commandId),
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
    // E6#78：插件磁盘位置 / 打开插件目录（主进程解析路径——池内零安装路径知识）
    pluginLocation: (pluginId: string) => ipcRenderer.invoke(IPC.shell.pluginLocation, pluginId),
    openPluginFolder: (pluginId: string, kind: PluginFolderKind) =>
      ipcRenderer.invoke(IPC.shell.openPluginFolder, pluginId, kind),
    // T4：受控 openExternal——白名单在**主进程**（`sanitizeExternalUrl`，与 window.open 外链路由同源），
    // 池侧只转发：闸门放在唯一能拿到 OS 能力的那一端，preload 处不做第二份校验。
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shell.openExternal, url),
  };
  /* jscpd:ignore-end */
}

/** getFilePath——桥接 Chromium File API 与沙箱文件系统（E5.6#11.5-bug4：FileTreeDnD handleDrop 解外部拖入文件真实路径） */
export function buildGetFilePath() {
  return {
    getFilePath: (file: File) => webUtils.getPathForFile(file),
  };
}
