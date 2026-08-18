/**
 * Pool WebView preload 脚本——E5.6#11.5a。
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
 *   主进程：view.webContents.send(IPC.serial.data, payload)（不经 plugin:push 包装，直发池 WebView）
 *   ✅ 正确：serial.onData  → listenDirect(ipcRenderer, IPC.serial.data, cb)
 *   ✅ 正确：serial.onStats → listenDirect(ipcRenderer, IPC.serial.stats, cb)
 *   ✅ 正确：p2p.on         → listenDirect(ipcRenderer, IPC.p2p.data, cb)
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

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { APP_NAMESPACE } from './constants';
import { createEventSystem, listenDirect } from './ipc/event-system';
import { IPC, filesystemChanged } from './ipc/channels';
import { IpcRelay } from './ipc/ipc-relay';
// ── E5.7#97：wire 契约归口——type import 放行（Path B 只禁 value import，决策点 1）──
import type { PoolLayout } from '../src/core/types/pool/poolLayout';
import type {
  ConfigurationChangedPayload,
  ThemeChangedPayload,
  AccentChangedPayload,
  PluginStateChangedPayload,
  TabActivatedPayload,
  WorkspaceActiveChangedPayload,
  SettingsRequestGroupPayload,
  SettingsScrollToPayload,
  PluginPushEnvelope,
} from '../src/core/types/ipc/events';
import type { OpenPortConfig, SerialStats } from '../src/core/types/ipc/serial';
import type { DialogOpenOptions } from '../src/core/types/ipc/dialogs';
import type { WorkspaceFolder } from '../src/core/services/layout/WorkspaceService';
import type { FileChangeEvent } from '../src/core/services/files/FileService';

// E5.7#54：_poolZone 已删——pool.html 无 ?zone= 路由（E5.7#2 单入口），zone 参数链路全摘

// ── E5.6#8b：pool:layout 缓冲回放——IPC 可能在 React mount 前到达 ──
// E5.7#78：手写 buffer+callback+active 三件套 → IpcRelay<T>（electron/ipc/ipc-relay.ts）
const _layoutRelay = new IpcRelay<PoolLayout>();

ipcRenderer.on(IPC.pool.layout, (_event, layout: PoolLayout) => {
  _layoutRelay.push(layout);
});

// ── E5.7#15：pool:quickpick 缓冲回放——QuickPick 哑渲染数据可能在 QuickPickHost mount 前到达 ──
// 对标 pool:layout 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（浮动层是单例态——open/close 全量替换，旧数据回放无意义）。
// DTO 形状与 src/core/types/pool/poolQuickPick.ts 对齐——preload 不 import src（构建边界）。
type PoolQuickPickDataShape = { open: boolean; placeholder?: string; prefix?: string; items?: unknown[] };
const _quickPickBuffer: PoolQuickPickDataShape[] = [];
let _quickPickCallback: ((data: PoolQuickPickDataShape) => void) | null = null;
let _quickPickActive = false;

ipcRenderer.on(IPC.pool.quickpick, (_event, data: PoolQuickPickDataShape) => {
  if (!_quickPickActive || !_quickPickCallback) {
    _quickPickBuffer.length = 0;
    _quickPickBuffer.push(data);
  } else {
    try { _quickPickCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#16：pool:toast 缓冲回放——Toast 哑渲染数据可能在 ToastHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（全量快照语义——新快照整体取代旧快照，回放旧数据无意义）。
// DTO 形状与 src/core/types/pool/poolToast.ts 对齐——preload 不 import src（构建边界）。
type PoolToastDataShape = { toasts: unknown[]; suppressed: boolean };
const _toastBuffer: PoolToastDataShape[] = [];
let _toastCallback: ((data: PoolToastDataShape) => void) | null = null;
let _toastActive = false;

ipcRenderer.on(IPC.pool.toast, (_event, data: PoolToastDataShape) => {
  if (!_toastActive || !_toastCallback) {
    _toastBuffer.length = 0;
    _toastBuffer.push(data);
  } else {
    try { _toastCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#17：pool:dialog 缓冲回放——Dialog 哑渲染数据可能在 DialogHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（单例态——open/close 全量替换，旧数据回放无意义）。
// DTO 形状与 src/core/types/pool/poolDialog.ts 对齐——preload 不 import src（构建边界）。
type PoolDialogDataShape = { open: boolean; title?: string; message?: string; confirmLabel?: string; cancelLabel?: string; isAlert?: boolean };
const _dialogBuffer: PoolDialogDataShape[] = [];
let _dialogCallback: ((data: PoolDialogDataShape) => void) | null = null;
let _dialogActive = false;

ipcRenderer.on(IPC.pool.dialog, (_event, data: PoolDialogDataShape) => {
  if (!_dialogActive || !_dialogCallback) {
    _dialogBuffer.length = 0;
    _dialogBuffer.push(data);
  } else {
    try { _dialogCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#63：插件 quickPick.show 池内本地桥（零 IPC）──
// 机制（清单 #63 🔴 规定）：contextBridge 函数代理——池主世界 QuickPickHost mount 时调
// linkdesk.quickPickHost.registerHost(fn)（主世界函数经代理进隔离世界存储，onShow(cb) 同款
// 已证模式）；插件调 show() 时隔离世界调已存 fn(req, settle)——settle 作为参数代理进主世界，
// 主世界在选择/取消时调用，Promise 全程在隔离世界（返回值只过一道代理）。
// 结算契约：池侧回传 key（条目原数组 index 字符串，null = 取消）——条目对象由本侧（Promise
// 所在地）映射。contextBridge 每次跨世界都是结构化克隆，"resolve 原对象身份"架构不可行
// （2026-08-15 用户验收实证）——插件最终收到结构化副本（VS Code IPC 同款语义）。
// 缓冲回放（硬约束 20）：show() 先于 QuickPickHost mount（插件入口模块早执行）→ 入缓冲，
// registerHost 时按序回放（last-wins 语义在池侧仲裁——旧请求被顶掉 settle(null)）。
// 形状与 src/core/types/pool/poolQuickPick.ts 的 PluginQuickPickOptions 对齐——preload 不 import src。
type PluginQuickPickOptionsShape = { items: unknown[]; placeholder?: string; prefix?: string };
type PluginQuickPickSettle = (key: string | null) => void;
type PluginQuickPickHostFn = (req: { opts: PluginQuickPickOptionsShape }, settle: PluginQuickPickSettle) => void;
let _quickPickHostFn: PluginQuickPickHostFn | null = null;
const _quickPickShowBuffer: Array<{ req: { opts: PluginQuickPickOptionsShape }; settle: PluginQuickPickSettle; reject: (e: Error) => void }> = [];

// ── E5.7#58：viewContainer——池侧真 IPC（问壳侧 ViewContainerService 注册表）──
// 元数据单向流：壳注册表 = 真相源 → pushLayout 推池渲染；插件查询/更新走代理通道问壳。
// 跨进程边界：contextBridge 虽代理嵌套函数（2026-08-15 最小 Electron 实验实证——对象内
// 函数不抛错、Symbol 被消化），但下一步 ipcRenderer.invoke 走真结构化克隆——render/
// actions/pinnedContent 函数字段会抛 DataCloneError → 写方向必须白名单剥壳再 invoke。
// 壳侧注册表对缺 render 的更新保留原 render（ViewContainerService.registerView 内置
// 逻辑）——元数据更新语义成立，渲染组件不受影响。
// DTO 形状与 src/core/services/layout/ViewContainerService.ts 的可序列化子集对齐
// ——preload 不 import src（构建边界）。字段清单与 IpcBridgeHandler.toViewDto（读方向）同一套。

type ViewContainerDtoShape = {
  id: string;
  title: string;
  icon?: string;
  location?: string;
  hideIfEmpty?: boolean;
  order?: number;
  mergeHeaderWhenSingle?: boolean;
};

type ViewDtoShape = {
  id: string;
  title: string;
  role?: string;
  when?: string;
  order?: number;
  collapsed?: boolean;
  canToggleVisibility?: boolean;
  canMoveView?: boolean;
  hideByDefault?: boolean;
  titleDescription?: string;
  singleViewPaneContainerTitle?: string;
  minHeight?: number;
  showActions?: string;
  titleTooltip?: string;
  badge?: string | number;
};

/** 写方向白名单——插件 descriptor 中可跨 IPC 的公开元数据字段（render/actions/pinnedContent
 *  是函数/React 节点——invoke 结构化克隆抛错，池侧剥掉；壳侧更新保留原 render）。 */
function toViewMetaDto(descriptor: Record<string, unknown>): Record<string, unknown> {
  return {
    id: descriptor.id,
    title: descriptor.title,
    role: descriptor.role,
    when: descriptor.when,
    order: descriptor.order,
    collapsed: descriptor.collapsed,
    canToggleVisibility: descriptor.canToggleVisibility,
    canMoveView: descriptor.canMoveView,
    hideByDefault: descriptor.hideByDefault,
    titleDescription: descriptor.titleDescription,
    singleViewPaneContainerTitle: descriptor.singleViewPaneContainerTitle,
    minHeight: descriptor.minHeight,
    showActions: descriptor.showActions,
    titleTooltip: descriptor.titleTooltip,
    badge: descriptor.badge,
  };
}

// ── E5.7#60：文件装饰——池内本地注册表（零 IPC）──
// 设计文档定性（Registry主进程化设计.md §3）：FileDecorationRegistry 不迁——provider 是
// JS 函数不可跨进程，E5.7 中 provider 与消费方（文件树）同在 Pool → 真源放池内。
// 原壳链（decorations:getDecoration 代理 + decorations:changed 广播 + 壳侧恒空注册表）
// 随本任务整删——池直答比壳往返快一轮且恒空代理是死路。
// provider 经 contextBridge 代理进隔离世界存储（同渲染进程函数代理可用——E5.7#58 实验
// 实证）；插件卸载后模块销毁 → 代理调用抛错 → 自愈剔除。池重建（崩溃恢复）注册表随
// preload 重置，插件入口重跑时重新注册（_poolCommands 同款语义）。
// 形状与 src/core/registry/FileDecorationRegistry.ts 的 FileDecoration 对齐（该文件已
// 随本任务整删——唯一活文档在 01-插件API契约 §3.24）——preload 不 import src（构建边界）。
type DecoDtoShape = { badge?: string; tooltip?: string; color?: string; propagate?: boolean };
type DecoProviderShape = {
  provideDecoration: (uri: string) => DecoDtoShape | null | Promise<DecoDtoShape | null>;
  onDidChangeFileDecorations?: (cb: (uris: string[] | void) => void) => () => void;
};
const _decoProviders = new Map<string, { provider: DecoProviderShape; unsub?: () => void }>();
const _decoListeners = new Set<(uris: string[]) => void>();

function _fireDecoChange(uris: string[]): void {
  for (const cb of _decoListeners) {
    try { cb(uris); } catch { /* contextBridge 回调静默失败 */ }
  }
}

// ── E5.7#37：心跳 pong——主进程 5s ping，模块顶层自动回复 ──
// 硬约束 20：模块顶层注册（contextBridge.exposeInMainWorld 之前）。
// 刻意不经 React/命名空间 API：pong 必须在 React mount 前就存在——池加载窗口（主进程
// 10s 超时）内 preload 一旦执行即可回复，否则加载中的池被心跳误判卡死误杀。
// 主线程阻塞时事件循环停转，pong 自然停发 = 卡死信号（这正是心跳要检测的）。
// 池命名空间不暴露 onPing 消费 API——零消费方即死代码（无死代码原则），需要时再加。
ipcRenderer.on(IPC.pool.ping, () => {
  ipcRenderer.send(IPC.pool.pong);
});

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
ipcRenderer.on(IPC.contextKey.changed, (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

// ── E5.5#7a: 配置缓存——防 React mount 前事件竞态 ──
const _configCache = new Map<string, unknown>();
ipcRenderer.on(IPC.plugin.push, (_event, data: PluginPushEnvelope) => {
  if (data?.channel === IPC.config.changed) {
    const { key, value } = data.payload as ConfigurationChangedPayload;
    _configCache.set(key, value);
  }
});

// ── E5.6#11.5a：池侧命令注册表——Path B 关键设计 ──
// 池内插件需要注册命令（file-tree ~20 + marketplace ~5 + serial-monitor ~5）。
// handler 是函数闭包——引用池侧 React state/DOM，壳无法执行。
// 因此池 preload 在 contextBridge 隔离世界内维护 Map<string, Function>。
// executeCommand 先查池侧注册表，未找到则 fallback 到壳侧 IPC。
// 🔥 真相源分工（与壳 CommandRegistry 的唯一权威声明一致）：
//   _poolCommands（本表）= 执行真相源——handler 永不离开本进程；
//   壳 CommandRegistry = 显示真相源——title/category/when 只读壳那份。
//   meta 单向同步（commands:register IPC）只回传显示面，壳侧执行走 executeInPool 转发桥。
const _poolCommands = new Map<string, Function>();

try {
  // ── 语言资源缓存 ──
  let _langCache: { lang: string; resources: Record<string, unknown> } | null = null;
  const _langSubscribers = new Set<(data: { lang: string; resources: Record<string, unknown> }) => void>();

  const events = createEventSystem(ipcRenderer, {
    logPrefix: 'preload-pool',
    extraHandlers: {
      [IPC.theme.changed]: (payload) => {
        const { themeType, variables } = payload as ThemeChangedPayload;
        try {
          const root = document.documentElement;
          root.setAttribute('data-theme', themeType ?? 'dark');
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(`--${k}`, v);
          }
        } catch (e) {
          console.error('[preload-pool] theme:changed CSS 注入失败:', e);
        }
      },
      'accent:changed': (payload) => {
        const { variables } = payload as AccentChangedPayload;
        try {
          const root = document.documentElement;
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(k, v);
          }
        } catch (e) {
          console.error('[preload-pool] accent:changed CSS 注入失败:', e);
        }
      },
      'lang:changed': (payload) => {
        _langCache = payload as { lang: string; resources: Record<string, unknown> };
        for (const fn of _langSubscribers) {
          try { fn(_langCache); } catch (e) {
            console.error('[preload-pool] lang:changed 回调异常:', e);
          }
        }
      },
    },
  });

  // ── 命令对象——池侧注册 + 壳侧 fallback ──
  const commandsObj = {
    /**
     * 注册池侧命令——handler 来自 renderer（React 代码），contextBridge 自动代理函数引用。
     * meta 同步到壳注册表（IPC.commands.register IPC）——命令面板/右键菜单的标题、分类、
     * when 过滤全由壳侧 getCommands 消费，池内注册必须回传才可见（含动态 toggle 标题重注册）。
     * 不传 meta 的旧调用向后兼容（纯池内命令，壳侧不可见）。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令 handler 入参类型由插件调用方决定，对标 VS Code registerCommand 的 (...args: any[]) => any
    registerCommand: (id: string, handler: (...args: any[]) => any, meta?: { title?: string; category?: string; when?: string }) => {
      _poolCommands.set(id, handler);
      ipcRenderer.invoke(IPC.commands.register, id, meta ?? null).catch((e) => {
        console.error(`[preload-pool] commands:register 回传失败 (${id}):`, e);
      });
    },
    /** 注销某插件的全部命令（约定：命令 ID 格式为 "pluginId.commandName"）——池侧 handler + 壳侧运行时条目同步注销 */
    unregisterCommands: (pluginId: string) => {
      for (const [id] of _poolCommands) {
        if (id.startsWith(pluginId + '.')) _poolCommands.delete(id);
      }
      ipcRenderer.invoke(IPC.commands.unregister, pluginId).catch((e) => {
        console.error(`[preload-pool] commands:unregister 回传失败 (${pluginId}):`, e);
      });
    },
    /** 执行命令——先查池侧注册表，未找到则 IPC 到壳 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    executeCommand: (id: string, ...args: any[]) => {
      const handler = _poolCommands.get(id);
      if (handler) {
        // 壳侧 executeCommand(id, token, ...realArgs) 的 token 是 CancellationToken。
        // 调用方（ContextMenu/CommandPalette）固定传 undefined 占位。
        // 池 handler 不消费 token——剥离后传 realArgs 给 handler。
        // E5.7#63.8 后壳侧 handler 合同同样只收 args（CommandRegistry 进 handler 前统一剥）——两进程约定归一。
        const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
        return Promise.resolve(handler(...realArgs));
      }
      return ipcRenderer.invoke(IPC.commands.execute, id, ...args);
    },
    /** 向后兼容别名 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定（executeCommand 同款）
    execute: (id: string, ...args: any[]) => {
      const handler = _poolCommands.get(id);
      if (handler) {
        const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
        return Promise.resolve(handler(...realArgs));
      }
      return ipcRenderer.invoke(IPC.commands.execute, id, ...args);
    },
    getCommands: () => ipcRenderer.invoke(IPC.plugins.call, 'getCommands'),
  };

  // ── E5.7 Bug C：壳→池 命令执行请求桥——占位命令的壳侧执行转发到池真实 handler ──
  // 壳 CommandRegistry.executeCommand 遇 placeholder 命令（loader 元数据注册）→
  // events.emit("commands:executeRequest") → 主进程 plugin:push 广播 → 本订阅执行 →
  // invoke(IPC.commands.executeResult) → 壳 IpcBridgeHandler resolvePoolExecution 回传。
  // 订阅放 preload 模块级（对标 extraHandlers）：_poolCommands 就在本隔离世界，无 contextBridge 往返。
  // executeLocal 不 fallback 壳——壳侧该命令就是占位元数据，fallback 只会死循环。
  const executeLocal = (id: string, ...args: unknown[]): Promise<unknown> => {
    const handler = _poolCommands.get(id);
    if (!handler) return Promise.reject(new Error(`命令 "${id}" 未在池内注册`));
    return Promise.resolve(handler(...args));
  };
  const sendExecuteResult = (requestId: string, result: { result?: unknown; error?: string }): void => {
    ipcRenderer.invoke(IPC.commands.executeResult, requestId, result).catch((e) => {
      console.error(`[preload-pool] commands:executeResult 回传失败 (${requestId}):`, e);
    });
  };
  events.on('commands:executeRequest', async (payload) => {
    const { requestId, commandId, args } = (payload ?? {}) as {
      requestId?: string;
      commandId?: string;
      args?: unknown[];
    };
    if (!requestId || !commandId) return;
    try {
      const result = await executeLocal(commandId, ...(Array.isArray(args) ? args : []));
      sendExecuteResult(requestId, { result });
    } catch (e) {
      sendExecuteResult(requestId, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── 配置对象——settings 在池内渲染（E5.7#44：壳侧 configuration 面已删），全量经此面走 IPC ──
  // 通用面 get/set/getSchema/onChange；设置页专用 9 方法见下方 E5.7#76 分隔标注。
  const configurationObj = {
    get: (key: string) => ipcRenderer.invoke(IPC.config.get, key),
    set: (key: string, v: unknown) => ipcRenderer.invoke(IPC.config.set, key, v),
    getSchema: (key?: string) => ipcRenderer.invoke(IPC.plugins.call, 'getSchema', key),
    onChange: (key: string, cb: (v: unknown) => void) => {
      if (key && _configCache.has(key)) {
        try { cb(_configCache.get(key)); } catch { /* contextBridge 回调静默失败 */ }
      }
      return events.on(IPC.config.changed, (d: ConfigurationChangedPayload) => {
        const { key: k, value } = d;
        if (!key || k === key) cb(value);
      });
    },
    // ══ E5.7#76（E5.5#10r/E5.6#65 迁入）：以下 9 个方法为设置页专用
    // （SettingsView 渲染/实时刷新/插件生命周期联动/跳转到分组/跳转到具体配置项）。
    // 通用插件请用上面的 get/set/getSchema/onChange。 ══
    getConfigurationContributions: (): Promise<[string, unknown][]> =>
      ipcRenderer.invoke(IPC.plugins.call, 'getConfigurationContributions'),
    inspectConfiguration: (key: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.plugins.call, 'inspectConfiguration', key),
    getUserSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.plugins.call, 'getUserSettings'),
    onDidChangeConfiguration: (cb: (key: string, value: unknown) => void) => {
      return events.on(IPC.config.changed, (d: ConfigurationChangedPayload) => {
        const { key: k, value } = d;
        try { cb(k, value); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    onPluginLifecycleChange: (cb: () => void) => {
      return events.on('plugin-lifecycle:changed', () => {
        try { cb(); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeSettingsGroup: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.plugins.call, 'consumeSettingsGroup'),
    onRequestSettingsGroup: (cb: (pluginId: string) => void) => {
      return events.on('settings:requestGroup', (d: SettingsRequestGroupPayload) => {
        try { cb(d.pluginId); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeScrollToSetting: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.plugins.call, 'consumeScrollToSetting'),
    onRequestScrollToSetting: (cb: (key: string) => void) => {
      return events.on('settings:scrollTo', (d: SettingsScrollToPayload) => {
        try { cb(d.key); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    // ── 串口（消费端——读/写/监听）──
    serial: {
      listPorts: () => ipcRenderer.invoke(IPC.serial.listPorts),
      getStatus: () => ipcRenderer.invoke(IPC.serial.getStatus),
      openPort: (cfg: OpenPortConfig) => ipcRenderer.invoke(IPC.serial.openPort, cfg),
      closePort: () => ipcRenderer.invoke(IPC.serial.closePort),
      sendData: (data: number[]) => ipcRenderer.invoke(IPC.serial.sendData, data),
      sendText: (text: string, enc: string) => ipcRenderer.invoke(IPC.serial.sendText, text, enc),
      setDtr: (enable: boolean) => ipcRenderer.invoke(IPC.serial.setDtr, enable),
      setRts: (enable: boolean) => ipcRenderer.invoke(IPC.serial.setRts, enable),
      onData: (cb: (text: string) => void) => listenDirect(ipcRenderer, IPC.serial.data, cb),
      onStats: (cb: (stats: SerialStats) => void) => listenDirect(ipcRenderer, IPC.serial.stats, cb),
      onSystem: (cb: (message: string) => void) => listenDirect(ipcRenderer, IPC.serial.system, cb),
    },

    // ── 配置（读/写/订阅/schema）──
    configuration: configurationObj,
    config: configurationObj,

    // ── 命令（池侧注册 + 壳侧 fallback）──
    commands: commandsObj,

    // ── 文件系统（E5.7#63.5 路径守卫——池来源写操作经主进程校验：归一化 + 危险目录拒绝 + workspace 外用户确认，读放行）──
    filesystem: {
      readTextFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readTextFile, p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke(IPC.filesystem.writeTextFile, p, d),
      readBinaryFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readBinaryFile, p),
      writeBinaryFile: (p: string, d: Uint8Array) => ipcRenderer.invoke(IPC.filesystem.writeBinaryFile, p, d),
      listDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.listDir, p),
      exists: (p: string) => ipcRenderer.invoke(IPC.filesystem.exists, p),
      createDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.createDir, p),
      copy: (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.copy, src, dest),
      remove: (p: string) => ipcRenderer.invoke(IPC.filesystem.remove, p),
      watch: (dirPath: string, onEvent: (e: FileChangeEvent) => void) => {
        return ipcRenderer.invoke(IPC.filesystem.watch, dirPath).then((watcherId: number) => {
          const channel = filesystemChanged(watcherId);
          const handler = (_event: Electron.IpcRendererEvent, change: FileChangeEvent) => onEvent(change);
          ipcRenderer.on(channel, handler);
          return () => {
            ipcRenderer.removeListener(channel, handler);
            ipcRenderer.invoke(IPC.filesystem.unwatch, watcherId).catch(() => {});
          };
        });
      },
    },

    // ── 剪贴板 ──
    clipboard: {
      readText: () => ipcRenderer.invoke(IPC.clipboard.readText),
      writeText: (text: string) => ipcRenderer.invoke(IPC.clipboard.writeText, text),
      writeFileList: (paths: string[]) => ipcRenderer.invoke(IPC.clipboard.writeFileList, paths),
    },

    // ── E5.6#11.5a：扩展 workspace——池插件完整工作区操作 ──
    workspace: {
      getFolders: (): Promise<WorkspaceFolder[]> => ipcRenderer.invoke(IPC.workspace.getFolders),
      getActive: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.workspace.getActive),
      setActive: (uri: string) => ipcRenderer.invoke(IPC.workspace.setActive, uri),
      openFolder: () => ipcRenderer.invoke(IPC.workspace.openFolder),
      addFolder: (path: string) => ipcRenderer.invoke(IPC.workspace.addFolder, path),
      removeFolder: (path: string) => ipcRenderer.invoke(IPC.workspace.removeFolder, path),
      onDidChangeFolders: (cb: () => void) => events.on('workspace:changed', cb),
      onDidChangeActiveWorkspace: (cb: (uri: string | null) => void) => {
        return events.on('workspace:activeChanged', (d: WorkspaceActiveChangedPayload) => {
          try { cb(d?.uri ?? null); } catch { /* contextBridge 回调静默失败 */ }
        });
      },
    },

    // ── 环境信息 ──
    env: {
      get: () => ipcRenderer.invoke(IPC.env.get),
    },

    // ── 通知 ──
    notifications: {
      show: (message: string, options?: { type?: string; progress?: boolean }) => {
        return ipcRenderer.invoke(IPC.plugins.call, 'showNotification', message, options)
          .then((handleId: string | undefined) => {
            if (!handleId) return undefined;
            return {
              update: (msg: string) => ipcRenderer.invoke(IPC.plugins.call, 'updateNotification', handleId, msg),
              finish: (msg?: string) => ipcRenderer.invoke(IPC.plugins.call, 'finishNotification', handleId, msg),
              cancel: () => ipcRenderer.invoke(IPC.plugins.call, 'cancelNotification', handleId),
            };
          });
      },
    },

    // ── 插件管理 ──
    pluginManager: {
      list: () => ipcRenderer.invoke(IPC.plugins.call, 'list'),
      enable: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'enable', id),
      disable: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'disable', id),
      uninstall: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'uninstall', id),
      install: (path: string) => ipcRenderer.invoke(IPC.plugins.call, 'install', path),
      reinstall: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'reinstall', id),
      getDisabled: () => ipcRenderer.invoke(IPC.plugins.call, 'getDisabled'),
      getUninstalled: () => ipcRenderer.invoke(IPC.plugins.call, 'getUninstalled'),
      isDisabled: (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'isDisabled', id),
    },

    // ── 🔥 E5.6#11.5-fix：plugins 辅助——池侧动态 import 运行时安装的插件 ──
    // PluginComponent.tsx 的 import.meta.glob 是构建时扫描，运行时安装的插件不在 glob 中。
    // 提供 resolvePath 让 PluginComponent 在 glob 查找失败时 fallback 到动态 import()。
    plugins: {
      resolvePath: (id: string) => ipcRenderer.invoke(IPC.plugins.resolvePath, id),
    },

    // ── 主题查询 ──
    theme: {
      getCurrent: () => ipcRenderer.invoke(IPC.plugins.call, 'getCurrentTheme'),
      getAvailable: () => ipcRenderer.invoke(IPC.plugins.call, 'getAvailableThemes'),
      apply: (themeId: string) => ipcRenderer.invoke(IPC.config.set, 'app.theme', themeId),
    },

    // ── 语言查询 ──
    language: {
      getCurrent: () => ipcRenderer.invoke(IPC.plugins.call, 'getCurrentLanguage'),
      getAvailable: () => ipcRenderer.invoke(IPC.plugins.call, 'getAvailableLanguages'),
      set: (langId: string) => ipcRenderer.invoke(IPC.config.set, 'app.language', langId),
      getInitial: () => _langCache,
      onChange: (cb: (data: { lang: string; resources: Record<string, unknown> }) => void) => {
        _langSubscribers.add(cb);
        return () => { _langSubscribers.delete(cb); };
      },
    },

    // ── 快捷键 ──
    keybindings: {
      getKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindings'),
      getConflicts: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindingConflicts'),
      registerKeybinding: (binding: unknown) => ipcRenderer.invoke(IPC.plugins.call, 'registerKeybinding', binding),
      saveUserKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'saveUserKeybindings'),
      removeKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'removeKeybindingForCommand', commandId),
      resetKeybindingToDefault: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'resetKeybindingToDefault', commandId),
      findKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'findKeybindingForCommand', commandId),
      setKeybindingCaptureActive: (active: boolean) => ipcRenderer.invoke(IPC.plugins.call, 'setKeybindingCaptureActive', active),
      keyboardEventToKeyString: (e: KeyboardEvent): string => {
        const parts: string[] = [];
        if (e.ctrlKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        if (e.metaKey) parts.push('meta');
        const keyMap: Record<string, string> = {
          ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
          Escape: 'escape', Enter: 'enter', Tab: 'tab', Backspace: 'backspace',
          Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
          ' ': 'space',
        };
        if (!e?.key) return '';
        const key = keyMap[e.key] ?? e.key.toLowerCase();
        if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';
        parts.push(key);
        const order = ['ctrl', 'shift', 'alt', 'meta'];
        return parts.sort((a, b) => {
          const ai = order.indexOf(a), bi = order.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        }).join('+');
      },
      onChange: (cb: () => void) => events.on('keybindings:changed', cb),
    },

    // ── 插件持久化存储 ──
    pluginState: {
      get: (pluginId: string, key: string): Promise<unknown> =>
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
    },

    // ── E5.7#38：Hot Exit 备份——脏内容落盘走主进程（池渲染进程零直写 %APPDATA%，审计约束）。
    // 路径约定单源在主进程 hot-exit-handlers.ts：<sha256(filePath)>.dirty。
    // 只读 load（不消费）——StrictMode 双 mount / 跨组移动 remount 都要能重复读。
    hotExit: {
      save: (filePath: string, content: string): Promise<void> =>
        ipcRenderer.invoke(IPC.hotExit.save, filePath, content),
      load: (filePath: string): Promise<string | null> =>
        ipcRenderer.invoke(IPC.hotExit.load, filePath),
      clear: (filePath: string): Promise<void> =>
        ipcRenderer.invoke(IPC.hotExit.clear, filePath),
    },

    // ── 菜单 ──
    menu: {
      registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
        ipcRenderer.invoke(IPC.menu.registerItems, menuId, pluginId, items),
      getItems: (menuId: string, context?: Record<string, unknown>): Promise<unknown[]> =>
        ipcRenderer.invoke(IPC.menu.getItems, menuId, context),
    },

    // ── ContextKey ──
    contextKey: {
      set: (key: string, value: unknown) => {
        _contextKeyStore.set(key, value);
        // E5.8 回归 bug 修复：必须 return invoke Promise——合同 linkdesk-api.ts 声明 set(): Promise<void>，
        // 不 return 则插件 `contextKey.set(...).catch()` 抛 reading 'catch'（E5.8#47 串口 sourceOpen 触发）。
        return ipcRenderer.invoke(IPC.contextKey.set, key, value);
      },
      _getValue: (key: string) => _contextKeyStore.get(key),
    },

    // ── 标签页操作 ──
    tabs: {
      create: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke(IPC.tabs.create, type, opts),
      openOrFocus: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke(IPC.tabs.openOrFocus, type, opts),
      focus: (tabId: string) => ipcRenderer.invoke(IPC.tabs.focus, tabId),
      close: (tabId: string) => ipcRenderer.invoke(IPC.tabs.close, tabId),
      focusBySourceId: (sourceId: string) => ipcRenderer.invoke(IPC.tabs.focusBySourceId, sourceId),
      updateLabelBySourceId: (sourceId: string, label: string) =>
        ipcRenderer.invoke(IPC.tabs.updateLabelBySourceId, sourceId, label),
      closeBySourceId: (sourceId: string) => ipcRenderer.invoke(IPC.tabs.closeBySourceId, sourceId),
      // E5.6#11.5g3: autoReveal——文件树随标签页切换自动定位
      onDidChangeActiveTab: (cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void) => {
        return events.on('tab:activated', (d: TabActivatedPayload) => {
          try { cb(d as { tabId: string; pluginId?: string; filePath?: string }); } catch { /* contextBridge 回调静默失败 */ }
        });
      },
    },

    // ── p2p ──
    p2p: {
      send: (target: string, channel: string, data: unknown) => {
        ipcRenderer.send(IPC.p2p.send, { target, channel, data });
      },
      on: (channel: string, cb: (data: unknown) => void) =>
        listenDirect(ipcRenderer, IPC.p2p.data, (d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        }),
    },

    // ── 弹窗 ──
    // E5.7#73：openFile——插件文件选择器（E5.5#10q/E5.6#62 迁入）。
    // 与 open 同通道（主进程 dialog-handlers.ts IPC.dialog.open）；安全由主进程控制
    // （原生对话框 + 文件存在校验），返回用户选中路径，取消 → null。
    dialog: {
      confirm: (message: string): Promise<boolean> => ipcRenderer.invoke(IPC.dialog.confirm, message),
      alert: (message: string): Promise<void> => ipcRenderer.invoke(IPC.dialog.alert, message),
      open: (opts?: DialogOpenOptions): Promise<string | null> => ipcRenderer.invoke(IPC.dialog.open, opts),
      openFile: (opts?: {
        title?: string;
        filters?: { name: string; extensions: string[] }[];
        directory?: boolean;
      }): Promise<string | null> => ipcRenderer.invoke(IPC.dialog.open, opts),
    },

    // ── path 工具函数 ──
    path: {
      // E5.8#0d.5：池侧补 appDataDir（preload-shell 同款）——settings 插件在池内解析 userData 真实路径。
      // 缺它则 FileService.appDataDir() 池侧返回 "" → getFilePath 得 /settings.json → Windows 解析 E:\settings.json 打不开。
      appDataDir: () => ipcRenderer.invoke(IPC.path.appDataDir),
      normalize: (p: string) => p.replace(/\\/g, '/'),
      join: (...parts: string[]) => parts.map(p => p.replace(/\\/g, '/')).join('/').replace(/\/+/g, '/'),
      basename: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); return s[s.length - 1] || ''; },
      dirname: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); s.pop(); return s.join('/') || '.'; },
      extname: (p: string) => { const b = p.replace(/\\/g, '/').split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    },

    // ── Pool 专属 API ──
    pool: {
      onLayout: (cb: (layout: PoolLayout) => void) => _layoutRelay.onReady(cb),
      ready: () => ipcRenderer.send(IPC.pool.ready), // E5.7#54：不再带 zone——单 Pool 无路由
      sidebarAction: (action: unknown) => ipcRenderer.send(IPC.pool.sidebarAction, action),
      // E5.6#16.5：池→壳 tab 操作（切标签/关闭/拖拽排序/分屏/右键菜单等）
      tabAction: (action: unknown) => ipcRenderer.send(IPC.pool.tabAction, action),
    },

    // ── E5.7#63：插件 quickPick API——show(opts) → Promise<item | undefined>（池内本地桥，零 IPC）──
    // 结算：池侧回传 key → 本侧映射 opts.items[Number(key)]；null（取消/被顶替）→ undefined。
    // 条目对象为本侧克隆（opts 入本侧时已克隆一次）——插件收到结构化副本，非 === 原对象。
    quickPick: {
      /**
       * 展示选择器——对标 VS Code window.showQuickPick()。
       * 调用在隔离世界执行：校验后转交 QuickPickHost 注册的 hostFn 渲染（未注册则缓冲）。
       */
      show: (opts: unknown) => new Promise<unknown>((resolve, reject) => {
        const o = opts as PluginQuickPickOptionsShape | null;
        if (!o || !Array.isArray(o.items)) {
          reject(new Error("quickPick.show(opts)：opts.items 必须为数组"));
          return;
        }
        const req = { opts: o };
        const settle: PluginQuickPickSettle = (key) => resolve(key === null ? undefined : o.items[Number(key)]);
        if (_quickPickHostFn) {
          try { _quickPickHostFn(req, settle); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
        } else {
          _quickPickShowBuffer.push({ req, settle, reject });
        }
      }),
    },

    // ── E5.7#15 → E5.7#63 更名 quickPickHost：池 QuickPickHost 渲染桥（dialogHost 同款命名归一——
    // quickPick 命名空间归插件 API，宿主桥独占 quickPickHost，插件读 API 表面零混淆）──
    quickPickHost: {
      /**
       * E5.7#63：池 QuickPickHost mount 时注册插件请求渲染入口（主世界函数经 contextBridge
       * 代理进隔离世界存储——onShow(cb) 同款模式）。缓冲请求按序回放。返回 unsubscribe。
       */
      registerHost: (fn: PluginQuickPickHostFn) => {
        _quickPickHostFn = fn;
        for (const p of _quickPickShowBuffer.splice(0)) {
          try { _quickPickHostFn(p.req, p.settle); } catch (e) { p.reject(e instanceof Error ? e : new Error(String(e))); }
        }
        return () => {
          _quickPickHostFn = null;
        };
      },
      /** 订阅壳推送的 QuickPick 数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolQuickPickDataShape) => void) => {
        _quickPickCallback = cb;
        _quickPickActive = true;
        if (_quickPickBuffer.length > 0) {
          for (const data of _quickPickBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _quickPickBuffer.length = 0;
        }
        return () => {
          _quickPickCallback = null;
          _quickPickActive = false;
        };
      },
      /** 选中条目——壳按 key 重解析 item 执行 onSelect */
      select: (key: string) => ipcRenderer.send(IPC.pool.quickpickAction, { type: 'select', key }),
      /** 高亮条目——壳按 key 重解析 item 执行 onHighlight */
      highlight: (key: string) => ipcRenderer.send(IPC.pool.quickpickAction, { type: 'highlight', key }),
      /** 关闭（Escape / 点击 backdrop）——壳执行 onClose */
      close: () => ipcRenderer.send(IPC.pool.quickpickAction, { type: 'close' }),
      /** 行内按钮——壳按 key 重解析 item 执行 onItemAction(item, actionId) */
      itemAction: (key: string, actionId: string) =>
        ipcRenderer.send(IPC.pool.quickpickAction, { type: 'itemAction', key, actionId }),
    },

    // ── E5.7#16：Toast 哑渲染订阅——池 ToastHost 消费 ──
    toast: {
      /** 订阅壳推送的 Toast 全量快照（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolToastDataShape) => void) => {
        _toastCallback = cb;
        _toastActive = true;
        if (_toastBuffer.length > 0) {
          for (const data of _toastBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _toastBuffer.length = 0;
        }
        return () => {
          _toastCallback = null;
          _toastActive = false;
        };
      },
      /** 关闭单条——壳按 id 重解析执行 dismissToast */
      dismiss: (id: string) => ipcRenderer.send(IPC.pool.toastAction, { type: 'dismiss', id }),
      /** 行内操作按钮——壳按 id + actionId（位置序号）重解析 onClick */
      action: (id: string, actionId: string) =>
        ipcRenderer.send(IPC.pool.toastAction, { type: 'action', id, actionId }),
    },

    // ── E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费 ──
    // 命名 dialogHost——dialog 命名空间已是插件侧 dialog.confirm/alert/open API
    dialogHost: {
      /** 订阅壳推送的 Dialog 数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolDialogDataShape) => void) => {
        _dialogCallback = cb;
        _dialogActive = true;
        if (_dialogBuffer.length > 0) {
          for (const data of _dialogBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _dialogBuffer.length = 0;
        }
        return () => {
          _dialogCallback = null;
          _dialogActive = false;
        };
      },
      /** 确认（确定按钮 / Enter）——壳侧 settle(true) */
      confirm: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'confirm' }),
      /** 取消（取消按钮 / Escape / backdrop）——壳侧 settle(false) */
      cancel: () => ipcRenderer.send(IPC.pool.dialogAction, { type: 'cancel' }),
    },

    // ── E5.6#11.5a → E5.7#50：文件关联——扩展名→插件ID（主进程 FileAssociationService）──
    // Registry 主进程化：plugin-manifest-loader 预加载进主进程实例，registry-handlers 直答
    // （通道名不变，原"主进程→壳代理"拉直为主进程直答，池侧零改动）
    fileAssociation: {
      getPluginFor: (ext: string): Promise<string | undefined> =>
        ipcRenderer.invoke(IPC.fileAssociation.getPluginFor, ext),
    },

    // ── 🆕 E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行）──
    // E5.6#11.5g5：searchFiles API 对齐 FileSearcher.SearchOptions——pool/plugin 零差异迁移
    search: {
      searchFiles: (opts: {
        roots: string[];
        query: string;
        include?: string;
        exclude?: string;
        caseSensitive?: boolean;
        wholeWord?: boolean;
        useRegex?: boolean;
        maxResults?: number;
        // signal 本地消费——IPC 不传，调用方拿到结果后检查 AbortSignal.aborted 自行丢弃
      }): Promise<Array<{ filePath: string; matches: Array<{ filePath: string; lineNumber: number; lineText: string; matchStart: number; matchEnd: number }> }>> =>
        ipcRenderer.invoke(IPC.search.searchFiles, opts),
    },

    // ── E5.7#60：文件装饰——池内本地注册表（零 IPC，机制见模块级注释）──
    // provider 与消费方同在池——registerProvider 存池内，getDecoration 池内直答。
    // 同步查询契约：跳过返回 Promise 的提供方（原壳注册表同款语义；async 提供方按需再补）。
    // 壳侧执行半程（双进程入口）无此 API——注册只在池内生效（插件可选链守卫，契约 §3.24）。
    decorations: {
      registerProvider: (pluginId: string, provider: DecoProviderShape): void => {
        // 幂等重注册——同 pluginId 覆盖旧条目（插件入口重跑/重装安全）
        const prev = _decoProviders.get(pluginId);
        prev?.unsub?.();
        const entry: { provider: DecoProviderShape; unsub?: () => void } = { provider };
        if (typeof provider.onDidChangeFileDecorations === "function") {
          entry.unsub = provider.onDidChangeFileDecorations((uris) => {
            _fireDecoChange(Array.isArray(uris) ? uris : []);
          });
        }
        _decoProviders.set(pluginId, entry);
        // 注册即全量刷新——文件树重查询拾取新 provider 徽标（VS Code 同款）
        _fireDecoChange([]);
      },
      unregisterProvider: (pluginId: string): void => {
        const entry = _decoProviders.get(pluginId);
        if (!entry) return;
        entry.unsub?.();
        _decoProviders.delete(pluginId);
        _fireDecoChange([]);
      },
      getDecoration: async (uri: string): Promise<DecoDtoShape | null> => {
        for (const [pluginId, { provider }] of _decoProviders) {
          let deco: DecoDtoShape | null | Promise<DecoDtoShape | null>;
          try {
            deco = provider.provideDecoration(uri);
          } catch {
            // 插件已卸载——代理函数目标销毁 → 自愈剔除（重启前不再查询该 provider）
            _decoProviders.delete(pluginId);
            continue;
          }
          if (deco !== null && deco !== undefined && !(deco instanceof Promise)) {
            return deco;
          }
        }
        return null;
      },
      onDidChange: (cb: (uris: string[]) => void): (() => void) => {
        _decoListeners.add(cb);
        return () => { _decoListeners.delete(cb); };
      },
    },

    // ── 🆕 E5.6#11.5a：编码检测/转换 ──
    encoding: {
      detect: (buffer: Uint8Array): Promise<string> =>
        ipcRenderer.invoke(IPC.encoding.detect, buffer),
      decode: (buffer: Uint8Array, encoding: string): Promise<string> =>
        ipcRenderer.invoke(IPC.encoding.decode, buffer, encoding),
      encode: (text: string, encoding: string): Promise<Uint8Array> =>
        ipcRenderer.invoke(IPC.encoding.encode, text, encoding),
    },

    // ── E5.7#58：viewContainer——真 IPC 查询/更新（问壳侧注册表，见模块级白名单注释）──
    viewContainer: {
      getViewContainer: (id: string): Promise<ViewContainerDtoShape | undefined> =>
        ipcRenderer.invoke(IPC.viewContainer.getContainer, id),
      getViews: (containerId: string): Promise<ViewDtoShape[]> =>
        ipcRenderer.invoke(IPC.viewContainer.getViews, containerId),
      getView: (viewId: string): Promise<ViewDtoShape | undefined> =>
        ipcRenderer.invoke(IPC.viewContainer.getView, viewId),
      registerView: (pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void> =>
        ipcRenderer.invoke(IPC.viewContainer.registerView, pluginId, containerId, toViewMetaDto(descriptor)),
    },

    // ── E5.6#11.5i → E5.7#49：langDef——语言定义注册表（主进程 LangDefRegistry）──
    // Registry 主进程化：plugin-manifest-loader 预加载进主进程实例，直连 langDef:get（1 跳）。
    // 只返回可序列化字段 { id, lsp }——monarch tokenizer 函数不可跨进程（主进程侧剥壳）。
    langDef: {
      get: (extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null> =>
        ipcRenderer.invoke(IPC.langDef.get, extension),
    },

    // ── 🆕 E5.6#14-lsp：LSP 桥——编辑器在 MainPool 中需 LSP 通信（自动补全/F12/诊断/重命名）──
    lsp: {
      spawn: (command: string, args: string[] | undefined, pluginId: string) =>
        ipcRenderer.invoke(IPC.lsp.spawn, { command, args, pluginId }),
      write: (channelId: string, data: string) =>
        ipcRenderer.send(IPC.lsp.write, { channelId, data }),
      dispose: (channelId: string) =>
        ipcRenderer.invoke(IPC.lsp.dispose, { channelId }),
      onData: (cb: (channelId: string, data: string) => void) =>
        listenDirect(ipcRenderer, IPC.lsp.data, ({ channelId, data }: { channelId: string; data: string }) => cb(channelId, data)),
    },

    // ── E5.6#11.5h → E5.7#49：protocol——协议注册表（主进程 ProtocolRegistry）──
    // Registry 主进程化：内置方括号协议由 plugin-manifest-loader 汇入主进程实例，
    // 直连 protocol:* 通道（1 跳）；返回前主进程剥 parseLine/detect（JS 函数不可跨进程）。
    protocol: {
      listProtocols: (): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>> =>
        ipcRenderer.invoke(IPC.protocol.listProtocols),
      getActiveProtocolId: (): Promise<string> =>
        ipcRenderer.invoke(IPC.protocol.getActiveProtocolId),
      setActiveProtocolId: (protocolId: string): Promise<void> =>
        ipcRenderer.invoke(IPC.protocol.setActiveProtocolId, protocolId),
    },

    // ── 🔥 E5.6#11.5-bug3a：shell 操作——revealInOS / openInTerminal / startDrag ──
    // 这些是主进程 handler（main.ts ipcMain.handle），非壳渲染进程 handler，
    // 因此不走 PROXY_CHANNELS——直接 ipcRenderer.invoke。
    shell: {
      showItemInFolder: (p: string) => ipcRenderer.invoke(IPC.shell.showItemInFolder, p),
      openInTerminal: (dirPath: string, terminalExe?: string, customCommand?: string) =>
        ipcRenderer.invoke(IPC.shell.openInTerminal, dirPath, terminalExe, customCommand),
      startDrag: (filePath: string, iconPath?: string) =>
        ipcRenderer.send(IPC.shell.startDrag, filePath, iconPath),
    },

    // ── 🔥 E5.6#11.5-bug4：getFilePath——桥接 Chromium File API 与沙箱文件系统 ──
    // 被 FileTreeDnD.ts 的 handleDrop 用于解析外部拖入文件的真实路径。
    // 设计文档误将其归类为"per-tab 概念"——实际是通用工具，非 per-tab。
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── E5.7#5：窗口控制——TitleBarZone 的自定义 ─ □ × 按钮（preload-shell 同款搬入）──
    // 通道是主进程 handler（window:minimize 等）——非壳渲染进程 handler，不走 PROXY_CHANNELS。
    window: {
      minimize:  () => ipcRenderer.send(IPC.window.minimize),
      maximize:  () => ipcRenderer.send(IPC.window.maximize),
      unmaximize:() => ipcRenderer.send(IPC.window.unmaximize),
      close:     () => ipcRenderer.send(IPC.window.close),
      toggleDevTools: () => ipcRenderer.invoke(IPC.window.toggleDevTools),
      isMaximized:() => ipcRenderer.invoke(IPC.window.isMaximized),
      onMaximizeChange: (cb: (maximized: boolean) => void) =>
        listenDirect(ipcRenderer, IPC.window.maximizeChange, (m: boolean) => cb(m)),
    },

    events,
  });
} catch (err) {
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-pool] 暴露 window.linkdesk 失败:', err);
}
