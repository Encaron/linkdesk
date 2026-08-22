/**
 * IPC 通道名唯一真相源——E5.7#63.6。
 *
 * 收敛前：通道名在 ipcMain.handle(...) 与 ipcRenderer.invoke(...) 各写一遍裸字符串，
 * 两端零联动——改名改一处漏一处 = 静默 no-op（handler 与调用方悄悄脱钩），
 * 拼错 = 运行时才报错（invoke 恒 reject）。
 * 收敛后：主进程 + preload 双端 import 本文件常量——改名只改一处，拼错 = tsc 错误，通道清单可见化。
 *
 * 结构：按命名空间分组嵌套（IPC.filesystem.readTextFile）。
 * 动态通道（filesystem:changed:${watcherId}）走工厂函数 filesystemChanged()。
 * 验证（#63.6 清单）：grep ipcMain.handle / ipcRenderer.(invoke|send|on) 参数不再含裸字符串（除本文件定义处）。
 *
 * 注意：events.on(...)/broadcast(...) 的 payload 通道名（plugin:installed / lang:changed 等
 * 经 plugin:push 包装的数据名）与本表同名项共享常量——同一字符串两侧同源，天然一致。
 */

/** filesystem:changed:${watcherId}——文件 watcher 变更推送动态通道（file-handlers.ts 发送，preload 双侧监听） */
export function filesystemChanged(watcherId: number): string {
  return `filesystem:changed:${watcherId}`;
}

export const IPC = {
  app: {
    preloadReady: 'app:preloadReady',
    heartbeat: 'app:heartbeat',
  },
  bridge: {
    response: 'bridge:response',
    broadcast: 'bridge:broadcast',
    request: 'bridge:request',
  },
  clipboard: {
    readText: 'clipboard:readText',
    writeText: 'clipboard:writeText',
    writeFileList: 'clipboard:writeFileList',
  },
  commands: {
    execute: 'commands:execute',
    executeResult: 'commands:executeResult',
    register: 'commands:register',
    registerShell: 'commands:registerShell',
    unregister: 'commands:unregister',
  },
  config: {
    get: 'config:get',
    set: 'config:set',
    changed: 'config:changed',
    changedNotify: 'config:changed-notify',
  },
  contextKey: {
    set: 'contextKey:set',
    changed: 'contextKey:changed',
  },
  dialog: {
    confirm: 'dialog:confirm',
    alert: 'dialog:alert',
    open: 'dialog:open',
  },
  encoding: {
    detect: 'encoding:detect',
    decode: 'encoding:decode',
    encode: 'encoding:encode',
  },
  env: { get: 'env:get' },
  fileAssociation: {
    getPluginFor: 'fileAssociation:getPluginFor',
  },
  filesystem: {
    readTextFile: 'filesystem:readTextFile',
    writeTextFile: 'filesystem:writeTextFile',
    readBinaryFile: 'filesystem:readBinaryFile',
    writeBinaryFile: 'filesystem:writeBinaryFile',
    listDir: 'filesystem:listDir',
    readdir: 'filesystem:readdir',
    exists: 'filesystem:exists',
    createDir: 'filesystem:createDir',
    copy: 'filesystem:copy',
    rename: 'filesystem:rename',
    remove: 'filesystem:remove',
    watch: 'filesystem:watch',
    unwatch: 'filesystem:unwatch',
  },
  hotExit: {
    save: 'hot-exit:save',
    load: 'hot-exit:load',
    clear: 'hot-exit:clear',
  },
  keyboard: {
    syncShortcuts: 'keyboard:syncShortcuts',
    executeShortcut: 'keyboard:executeShortcut',
  },
  langDef: { get: 'langDef:get' },
  lsp: {
    spawn: 'lsp:spawn',
    write: 'lsp:write',
    dispose: 'lsp:dispose',
    data: 'lsp:data',
  },
  menu: {
    registerItems: 'menu:registerItems',
    getItems: 'menu:getItems',
  },
  // E5.8#34.5：底部面板——插件 linkdesk.panel.reveal 请求（IpcBridge 代理到壳）
  // E5.8#39.5：revealFloating——悬浮面板声明制通用 API（同链：代理到壳 → shellEvents → App hook）
  panel: {
    reveal: 'panel:reveal',
    revealFloating: 'panel:reveal-floating',
  },
  path: {
    appDataDir: 'path:appDataDir',
    join: 'path:join',
  },
  plugin: {
    push: 'plugin:push',
    emit: 'plugin:emit',
  },
  pluginState: {
    get: 'pluginState:get',
    set: 'pluginState:set',
  },
  plugins: {
    call: 'plugins:call',
    listDirs: 'plugins:listDirs',
    listDisabledDirs: 'plugins:listDisabledDirs',
    readManifest: 'plugins:readManifest',
    resolvePath: 'plugins:resolvePath',
    rescanManifests: 'plugins:rescanManifests',
  },
  pool: {
    layout: 'pool:layout',
    pushLayout: 'pool:push-layout',
    ready: 'pool:ready',
    ping: 'pool:ping',
    pong: 'pool:pong',
    toggleDevTools: 'pool:toggleDevTools',
    sidebarAction: 'pool:sidebar-action',
    tabAction: 'pool:tab-action',
    quickpick: 'pool:quickpick',
    quickpickShow: 'pool:quickpick-show',
    quickpickAction: 'pool:quickpick-action',
    toast: 'pool:toast',
    toastShow: 'pool:toast-show',
    toastAction: 'pool:toast-action',
    dialog: 'pool:dialog',
    dialogShow: 'pool:dialog-show',
    dialogAction: 'pool:dialog-action',
    // E5.8#37（Phase 8 类型 B）：壳内悬浮面板——pushPanel 哑渲染数据 + 动作回传
    floatingPanel: 'pool:floating-panel',
    floatingPanelShow: 'pool:floating-panel-show',
    floatingPanelAction: 'pool:floating-panel-action',
    // E5.8#43-1（A4）：多窗口底座——壳→主创建/关闭池窗 + 主→壳 OS 关窗通知（壳驱动，主进程执行）
    createWindow: 'pool:create-window',
    closeWindow: 'pool:close-window',
    windowClosed: 'pool:window-closed',
  },
  protocol: {
    listProtocols: 'protocol:listProtocols',
    getActiveProtocolId: 'protocol:getActiveProtocolId',
    setActiveProtocolId: 'protocol:setActiveProtocolId',
  },
  p2p: {
    send: 'p2p:send',
    data: 'p2p:data',
  },
  search: { searchFiles: 'search:searchFiles' },
  serial: {
    listPorts: 'serial:listPorts',
    getStatus: 'serial:getStatus',
    openPort: 'serial:openPort',
    closePort: 'serial:closePort',
    sendData: 'serial:sendData',
    sendText: 'serial:sendText',
    setDtr: 'serial:setDtr',
    setRts: 'serial:setRts',
    data: 'serial:data',
    stats: 'serial:stats',
    system: 'serial:system',
  },
  shell: {
    showItemInFolder: 'shell:showItemInFolder',
    startDrag: 'shell:startDrag',
    openInTerminal: 'shell:openInTerminal',
  },
  system: { memoryPressure: 'system:memory-pressure' },
  tabs: {
    create: 'tabs:create',
    openOrFocus: 'tabs:openOrFocus',
    focus: 'tabs:focus',
    close: 'tabs:close',
    focusBySourceId: 'tabs:focusBySourceId',
    updateLabelBySourceId: 'tabs:updateLabelBySourceId',
    closeBySourceId: 'tabs:closeBySourceId',
  },
  theme: { changed: 'theme:changed' },
  viewContainer: {
    getContainer: 'viewContainer:getContainer',
    getViews: 'viewContainer:getViews',
    getView: 'viewContainer:getView',
    registerView: 'viewContainer:registerView',
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    unmaximize: 'window:unmaximize',
    close: 'window:close',
    isMaximized: 'window:isMaximized',
    toggleDevTools: 'window:toggleDevTools',
    maximizeChange: 'window:maximize-change',
    // E5.7#79：缩放——壳配置 window.zoomLevel onApply → 应用到池 WCV（主进程缓存供崩溃重建重放）
    setZoom: 'window:setZoom',
  },
  workspace: {
    getFolders: 'workspace:getFolders',
    getActive: 'workspace:getActive',
    setActive: 'workspace:setActive',
    openFolder: 'workspace:openFolder',
    addFolder: 'workspace:addFolder',
    removeFolder: 'workspace:removeFolder',
  },
} as const;
