/**
 * Pool WebView preload 聚合器（门面）——E5.8#0d.10-4e 收尾。
 *
 * 原 1014 行单文件拆为 13 子模块 + 本聚合器（feature-folder 模式，壳目录规范 §4）：
 *   preload-pool/layout.ts          pool 命名空间 + pool:layout 缓冲（4a）
 *   preload-pool/quickpick.ts       quickPick + quickPickHost（4a）
 *   preload-pool/toast-dialog.ts    toast + dialogHost（4a）
 *   preload-pool/commands.ts        命令注册表 + commands + 壳→池执行桥（4b）
 *   preload-pool/configuration.ts   configuration/config + 配置缓存（4b）
 *   preload-pool/language.ts        language + onLangChanged（4b）
 *   preload-pool/events.ts          createPoolEvents + 心跳 pong（4b）
 *   preload-pool/contextkey.ts      contextKey（4c）
 *   preload-pool/decorations.ts     decorations（4c）
 *   preload-pool/viewcontainer.ts   viewContainer + DTO 白名单（4c）
 *   preload-pool/namespaces-data.ts      serial/filesystem/clipboard/path/env/encoding/search/fileAssociation（4d）
 *   preload-pool/namespaces-workspace.ts workspace/notifications/tabs/p2p/dialog（4d）
 *   preload-pool/namespaces-plugin.ts    pluginManager/plugins/theme/keybindings/pluginState/hotExit/menu/langDef/lsp/protocol/shell/getFilePath/window（4d）
 *
 * 本聚合器职责：import 全部子模块（模块级 IPC 注册在 import 时触发，先于 expose）→
 * 组装 window.linkdesk 命名空间 → contextBridge.exposeInMainWorld。零业务逻辑。
 *
 * Path B：池 = 哑渲染器，壳 = 唯一真相源。池不 import 任何 @src/core/* 模块。
 * 所有核心服务走 window.linkdesk.* → IPC → 壳唯一真相源。
 *
 * API 表面 = 插件侧唯一 preload（E5.7#44：preload-plugin.ts 已删——本文即插件 API 规范载体）
 *         + 池侧命令注册表（registerCommand/unregisterCommands）
 *         + 扩展 workspace API + fileAssociation + search + decorations + encoding + viewContainer
 *         + quickPick.show 插件选择器（E5.7#63 池内本地桥）+ quickPickHost 池渲染桥（E5.7#15 更名）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔥🔥🔥 IPC 通道铁律——新 AI / 任何人修改此文件前必读（E5.5#7b）
 *       E5.7#44：preload-plugin.ts 已删——其文件头铁律原文本迁入此处，本文即唯一载体
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 池渲染进程（插件）接收壳推送事件的通道只有两种。选错 = 静默失效（不报错，事件永远收不到）。
 *
 * 铁律 1：IpcBridge.broadcast 推送 → 池侧 events.on(channel, cb)
 *   壳侧：IpcBridge.broadcast(IPC.config.changed, payload)
 *        → view.webContents.send(IPC.plugin.push, {channel, payload})
 *   池侧必须：events.on(IPC.config.changed, cb)——内部注册 ipcRenderer.on(IPC.plugin.push, handler)
 *        → handler 匹配 data.channel → 调 cb
 *   ✅ 正确：configuration.onChange → events.on(IPC.config.changed, cb)
 *   ✅ 正确：pluginState.onChange  → events.on('plugin-state:changed', cb)
 *   ✅ 正确：theme.onChange（通过 extraHandlers）
 *   ❌ 错误：listenDirect(ipcRenderer, IPC.config.changed, cb)
 *           → 监听直接 IPC 通道，但事件在 IPC.plugin.push 上到达 → 永远收不到。不报错。静默失效。
 *
 * 铁律 2：主进程直接 send → 池侧 listenDirect(ipcRenderer, channel, cb)
 *   ✅ 正确：p2p.on         → listenDirect(ipcRenderer, IPC.p2p.data, cb)（p2p 定向推流，不经 broadcast）
 *
 * 铁律 2.5（E5.8#6.5 起）：数据推流（serial.*、lsp.data、filesystem:changed:*）已归一化走 broadcast →
 *   serial.onData → events.on(IPC.serial.data, cb)（原 listenDirect direct 通道已删）
 *   ❌ 错误：listenDirect(ipcRenderer, IPC.serial.data, cb)——广播走 plugin:push，永远收不到
 *
 * 铁律 3：ipc/event-system.ts 的 listenDirect 会对已知 plugin:push 通道打印 error
 *   新加直接通道 → channel 名加 `:direct` 后缀以跳过告警
 *
 * 快速自查（新加 IPC 订阅时问自己 3 个问题）：
 *   Q1: 壳侧谁发这个事件？→ IpcBridge.broadcast() 还是 view.webContents.send()？
 *   Q2: 经过 plugin:push 分发吗？→ broadcast → 是（用 events.on）；直发 → 否（用 listenDirect）
 *   Q3: 有模块级缓存防竞态吗？→ React mount 前事件可能已到达 → 需缓冲 + onXxx 时立即回放
 *
 * 📖 完整根因分析 + 审计：docs/02-Electron架构/E5.5_多WebView恢复/02-IPC事件推送-插件WebView修复.md
 *
 * 🔒 安全边界（contextBridge 白名单）：
 *   ✅ serial / config / commands / filesystem / clipboard / env
 *   ✅ events / pluginManager / theme / language / keybindings / pluginState
 *   ✅ menu / contextKey / tabs / p2p / dialog / path / notifications
 *   ✅ window（E5.7#5：TitleBarZone 窗口控制——从 preload-shell 同款搬入）
 *   ✅ quickPick（E5.7#63：插件选择器 show——池内本地桥，零 IPC 零新通道）
 *   ✅ workspace（扩展）/ fileAssociation / search / decorations / encoding / viewContainer
 *   ✅ hotExit（E5.7#38：Hot Exit 备份——save/load/clear，主进程落盘）
 *   ✅ lsp / langDef（E5.6#14-fix/#14-lsp：编辑器在池内渲染——preload-shell 同款面迁入）
 *   ❌ pluginInstance / pluginViews / pluginRequest（per-tab 概念，不适用于池）
 */

import { contextBridge } from 'electron';
import { APP_NAMESPACE } from './constants';
// ── E5.8#0d.10-4：13 子模块聚合——import 即触发模块级 IPC 注册（硬约束 20：先于 expose）──
import { buildPool } from './preload-pool/layout';
import { buildQuickPick, buildQuickPickHost } from './preload-pool/quickpick';
import { buildToast, buildDialogHost } from './preload-pool/toast-dialog';
import { buildCommands } from './preload-pool/commands';
import { buildConfiguration } from './preload-pool/configuration';
import { buildLanguage } from './preload-pool/language';
import { createPoolEvents } from './preload-pool/events';
import { buildContextKey } from './preload-pool/contextkey';
import { buildDecorations } from './preload-pool/decorations';
import { buildViewContainer } from './preload-pool/viewcontainer';
import {
  buildSerial,
  buildFilesystem,
  buildClipboard,
  buildPath,
  buildEnv,
  buildEncoding,
  buildSearch,
  buildFileAssociation,
} from './preload-pool/namespaces-data';
import { buildWorkspace, buildNotifications, buildTabs, buildP2p, buildDialog } from './preload-pool/namespaces-workspace';
import {
  buildPluginManager,
  buildPlugins,
  buildTheme,
  buildKeybindings,
  buildPluginState,
  buildHotExit,
  buildMenu,
  buildLangDef,
  buildLsp,
  buildProtocol,
  buildShell,
  buildGetFilePath,
  buildWindow,
} from './preload-pool/namespaces-plugin';

try {
  const events = createPoolEvents();
  const configurationObj = buildConfiguration(events);
  const commandsObj = buildCommands(events);

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    // ── 数据域（4d）──
    serial: buildSerial(events),
    filesystem: buildFilesystem(events),
    clipboard: buildClipboard(),
    path: buildPath(),
    env: buildEnv(),
    encoding: buildEncoding(),
    search: buildSearch(),
    fileAssociation: buildFileAssociation(),

    // ── 工作区/交互域（4d）──
    workspace: buildWorkspace(events),
    notifications: buildNotifications(),
    tabs: buildTabs(events),
    p2p: buildP2p(),
    dialog: buildDialog(),

    // ── 插件服务域（4d）──
    pluginManager: buildPluginManager(),
    plugins: buildPlugins(),
    theme: buildTheme(),
    keybindings: buildKeybindings(events),
    pluginState: buildPluginState(events),
    hotExit: buildHotExit(),
    menu: buildMenu(),
    langDef: buildLangDef(),
    lsp: buildLsp(events),
    protocol: buildProtocol(),
    shell: buildShell(),
    getFilePath: buildGetFilePath().getFilePath,
    window: buildWindow(),

    // ── 配置/命令/语言/事件（4b）──
    configuration: configurationObj,
    config: configurationObj,
    commands: commandsObj,
    language: buildLanguage(),
    events,

    // ── 池专属 + 哑渲染桥（4a）──
    pool: buildPool(),
    quickPick: buildQuickPick(),
    quickPickHost: buildQuickPickHost(),
    toast: buildToast(),
    dialogHost: buildDialogHost(),

    // ── 上下文/装饰/视图容器（4c）──
    contextKey: buildContextKey(),
    decorations: buildDecorations(),
    viewContainer: buildViewContainer(),
  });
} catch (err) {
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-pool] 暴露 window.linkdesk 失败:', err);
}
