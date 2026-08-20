/**
 * Mock window.linkdesk 桥——E5.7#31.6。池开发预览（浏览器 mock 模式）专用。
 *
 * 动机：window.linkdesk 只经 Electron preload 注入——浏览器打开池页面永远黑屏
 * （index.html = 壳零可见 DOM + pool-main `if (!poolApi) return` 守卫）。
 * 本模块在 import pool-main 之前同步安装 mock（preview-main 静态 import 顺序
 * 保证 = ESM 执行顺序），池以真实代码路径渲染完整壳 chrome。
 *
 * 🔥 预览渲染的就是生产真组件——Codex 改任何 zone 的 TSX/CSS → HMR 即时生效，
 *   改的就是 src/pool/zones/ 原文件，同一份代码直接进生产。预览不是平行副本，
 *   改 UI 天然顺利（这是本工具的成立理由）。
 *
 * 面（2026-08-15 grep 全量核实 src/pool 消费）：
 *   pool / window / toast / quickPick（插件 API show——E5.7#63）/ quickPickHost / dialogHost
 *   / events / commands / language
 *   + 欢迎页最小补丁：workspace / pluginState / pluginManager（welcome 视图消费——
 *     getFolders 空数组、pluginState.get → null——零插件视图场景足够）
 * 故意不镜像插件命名空间（serial/filesystem/search/...）——样本布局不含插件视图；
 * 若插件视图意外加载，undefined 调用当场报错（响亮失败，开发立刻知道样本边界）。
 *
 * 纪律：fixture 扮演壳角色——数据是"壳已解析后"的最终形态，不 import 任何
 * @src/core 运行时模块（Path B）；动作 console.info 留壳（零 IPC，无壳侧消费）。
 * 生产构建零污染：本模块只被 preview.html 入口引用，vite 仅 command==='serve'
 * 时打包该入口（E5.7#31.7）。
 *
 * 使用：npm run dev 后开 http://localhost:1420/preview.html。
 * 控制台调浮层样式：__mockPool.showQuickPick() / hideQuickPick() / showDialog() /
 * hideDialog() / emit(channel, payload)。
 */

import type { PoolToastData } from "../../core/types/pool/poolToast";
import type { PoolQuickPickData, PluginQuickPickOptions } from "../../core/types/pool/poolQuickPick";
import type { PoolDialogData } from "../../core/types/pool/poolDialog";
import type { PoolLayout } from "../../core/types/pool/poolLayout";
import type { LinkDeskAPI } from "../../core/api/linkdesk-api";
import {
  buildSampleLayout,
  buildSampleToasts,
  buildSampleQuickPick,
  buildSampleDialog,
} from "./sampleLayout";

/* ── 迷你事件总线——events.on/emit 语义（unsubscribe 返回，同 event-system） ── */
/* E5.7#98：on 泛型化对齐契约（载荷按订阅方 cb 推断）——T 运行时擦除，存储走 unknown 边界 */
function createMiniBus() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    on: <T = unknown>(channel: string, cb: (payload: T) => void) => {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
      }
      set.add(cb as (payload: unknown) => void);
      return () => { set.delete(cb as (payload: unknown) => void); };
    },
    emit: (channel: string, payload: unknown) => {
      for (const cb of handlers.get(channel) ?? []) {
        try { cb(payload); } catch (e) {
          console.error(`[mockLinkdesk] events.emit("${channel}") 回调异常:`, e);
        }
      }
    },
  };
}

/* ── 订阅-回放——缓冲回放语义（硬约束 20 同款：preload-pool onLayout/onShow） ── */

function createReplay<T>() {
  let buffer: T | null = null;
  let callback: ((data: T) => void) | null = null;
  let active = false;
  return {
    /** 注册回调——缓冲立即回放并清空（StrictMode 双订阅不重放，preload-pool 同款） */
    subscribe: (cb: (data: T) => void) => {
      callback = cb;
      active = true;
      if (buffer !== null) {
        const replay = buffer;
        buffer = null;
        try { cb(replay); } catch (e) { console.error("[mockLinkdesk] 回放回调异常:", e); }
      }
      return () => { callback = null; active = false; };
    },
    /** 推送——订阅前入缓冲，订阅后直推（只保留最后一份，全量快照语义） */
    push: (data: T) => {
      if (active && callback) {
        try { callback(data); } catch { /* 订阅方静默 */ }
      } else {
        buffer = data;
      }
    },
  };
}

/** 动作留壳——开发预览无壳侧消费，打日志证明点击已注册 */
function makeLogger(label: string) {
  return (...args: unknown[]) => console.info(`[mockLinkdesk] ${label}（壳侧动作，预览 no-op）`, ...args);
}

/** Promise 版留壳动作——契约面 Promise<void>/Promise<unknown> 的桩（window.openFolder 等） */
function makeAsyncLogger(label: string) {
  return async (...args: unknown[]) => console.info(`[mockLinkdesk] ${label}（壳侧动作，预览 no-op）`, ...args);
}

/**
 * 安装 mock linkdesk。幂等：真实 preload 已注入则跳过（Electron 打开
 * preview.html 时真 API 优先）。
 */
export function installMockLinkdesk(): void {
  if (window.linkdesk) return;

  const events = createMiniBus();
  const layoutReplay = createReplay<PoolLayout>();
  const toastReplay = createReplay<PoolToastData>();
  const quickPickReplay = createReplay<PoolQuickPickData>();
  const dialogReplay = createReplay<PoolDialogData>();

  // E5.7#63：插件 quickPick.show 本地桥——preload-pool 同款语义（hostFn 存储 + 缓冲回放 +
  // 结算契约：池侧回传 key → 本侧映射条目，null → undefined——插件收到结构化副本同款约定）。
  // 预览模式下 QuickPickHost 一样调 registerHost 注册渲染入口，show() 转交渲染。
  let quickPickHostFn: ((req: { opts: PluginQuickPickOptions }, settle: (key: string | null) => void) => void) | null = null;
  const quickPickShowBuffer: Array<{ req: { opts: PluginQuickPickOptions }; settle: (key: string | null) => void; reject: (e: Error) => void }> = [];

  // 初始数据先入缓冲——池 onLayout/onShow 订阅时回放（preload-pool 缓冲语义）
  layoutReplay.push(buildSampleLayout());
  toastReplay.push({ toasts: buildSampleToasts(), suppressed: false });

  // 池侧命令注册表——preload-pool 同款语义（池注册优先，壳侧 fallback 无壳 → 日志）
  const poolCommands = new Map<string, (...args: unknown[]) => unknown>();
  // E5.7#97：泛型签名对齐 LinkDeskAPI（execute<T>/executeCommand<T>）——mock 无壳侧实现恒返回 undefined
  const executeCommand = <T = void>(id: string, ...args: unknown[]): Promise<T> => {
    const handler = poolCommands.get(id);
    if (handler) {
      // E5.7#63.8 全仓归一：token 占位剥离——壳 CommandRegistry / 池 preload / 本 mock 三处同语义，handler 只收 realArgs
      const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
      return Promise.resolve(handler(...realArgs) as T);
    }
    console.info(`[mockLinkdesk] commands.executeCommand("${id}")——无壳侧实现，预览 no-op`);
    return Promise.resolve(undefined as T);
  };

  // E5.7#97：satisfies Partial<LinkDeskAPI>——逐命名空间契约检查保留（桩与真实面形状失配
  // 当场报错），整体残缺面是刻意设计（无壳侧消费面 + 插件命名空间故意不镜像 →
  // undefined 调用响亮失败）。边界一处断言，全文件零 any。
  const mockLinkdesk = {
    pool: {
      onLayout: layoutReplay.subscribe,
      ready: makeLogger("pool.ready"),
      sidebarAction: makeLogger("pool.sidebarAction"),
      tabAction: makeLogger("pool.tabAction"),
      // E5.8#30.16（P8）：dev 预览无插件注册——关闭一律放行（beforeClose 返回 true，Handler 注册/注销留日志）
      registerBeforeClose: makeLogger("pool.registerBeforeClose"),
      unregisterBeforeClose: makeLogger("pool.unregisterBeforeClose"),
      beforeClose: async () => true,
      // ── 壳侧面（preview 无壳侧消费——留壳日志 + no-op 订阅）──
      pushLayout: makeLogger("pool.pushLayout"),
      onReady: () => () => {},
      toggleDevTools: makeLogger("pool.toggleDevTools"),
      onSidebarAction: () => () => {},
      onTabAction: () => () => {},
      pushQuickPick: makeLogger("pool.pushQuickPick"),
      onQuickPickAction: () => () => {},
      pushToast: makeLogger("pool.pushToast"),
      onToastAction: () => () => {},
      pushDialog: makeLogger("pool.pushDialog"),
      onDialogAction: () => () => {},
      onMemoryPressure: () => () => {},
    },
    window: {
      minimize: makeLogger("window.minimize"),
      maximize: makeLogger("window.maximize"),
      unmaximize: makeLogger("window.unmaximize"),
      close: makeLogger("window.close"),
      setZoom: makeLogger("window.setZoom"),
      toggleDevTools: makeAsyncLogger("window.toggleDevTools"),
      isMaximized: async () => false,
      onMaximizeChange: () => () => {},
    },
    toast: {
      onShow: toastReplay.subscribe,
      dismiss: makeLogger("toast.dismiss"),
      action: makeLogger("toast.action"),
    },
    // E5.7#63：插件 API（quickPick）与池渲染桥（quickPickHost）分命名空间——dialog/dialogHost 同款归一
    quickPick: {
      show: (opts: PluginQuickPickOptions) => new Promise((resolve, reject) => {
        if (!opts || !Array.isArray(opts.items)) {
          reject(new Error("quickPick.show(opts)：opts.items 必须为数组"));
          return;
        }
        const req = { opts };
        // preload-pool 同款结算——key → opts.items[Number(key)]，null → undefined
        const settle = (key: string | null) => resolve(key === null ? undefined : opts.items[Number(key)]);
        if (quickPickHostFn) {
          try { quickPickHostFn(req, settle); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
        } else {
          quickPickShowBuffer.push({ req, settle, reject });
        }
      }),
    },
    quickPickHost: {
      registerHost: (fn: (req: { opts: PluginQuickPickOptions }, settle: (key: string | null) => void) => void) => {
        quickPickHostFn = fn;
        for (const p of quickPickShowBuffer.splice(0)) {
          try { quickPickHostFn(p.req, p.settle); } catch (e) { p.reject(e instanceof Error ? e : new Error(String(e))); }
        }
        return () => { quickPickHostFn = null; };
      },
      onShow: quickPickReplay.subscribe,
      select: makeLogger("quickPickHost.select"),
      highlight: makeLogger("quickPickHost.highlight"),
      close: makeLogger("quickPickHost.close"),
      itemAction: makeLogger("quickPickHost.itemAction"),
    },
    dialogHost: {
      onShow: dialogReplay.subscribe,
      confirm: makeLogger("dialogHost.confirm"),
      cancel: makeLogger("dialogHost.cancel"),
    },
    commands: {
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
        poolCommands.set(id, handler);
      },
      unregisterCommands: (pluginId: string) => {
        for (const [id] of poolCommands) {
          if (id.startsWith(`${pluginId}.`)) poolCommands.delete(id);
        }
      },
      executeCommand,
      execute: executeCommand, // 向后兼容别名（preload-pool 同款）
      getCommands: async () => [],
    },
    events,
    language: {
      // i18n 无语言资源 → key 回退（中文原文直显）——getInitial null + onChange no-op
      getCurrent: async () => "zh-CN",
      getAvailable: async () => [],
      set: makeAsyncLogger("language.set"),
      getInitial: () => null,
      onChange: () => () => {},
    },

    // ── 欢迎页最小补丁（WelcomePoolView 消费面——零插件视图场景足够） ──
    workspace: {
      getFolders: async () => [],
      getActive: async () => undefined,
      setActive: makeAsyncLogger("workspace.setActive"),
      openFolder: makeAsyncLogger("workspace.openFolder"),
      addFolder: makeAsyncLogger("workspace.addFolder"),
      removeFolder: makeAsyncLogger("workspace.removeFolder"),
      onDidChangeFolders: () => () => {},
      onDidChangeActiveWorkspace: () => () => {},
    },
    pluginState: {
      get: async () => undefined,
      set: makeAsyncLogger("pluginState.set"),
      // E5.8#20：契约 onChange 补面——预览 mock 无状态，no-op 订阅
      onChange: () => () => {},
    },
    pluginManager: {
      list: async () => [],
      enable: makeAsyncLogger("pluginManager.enable"),
      disable: makeAsyncLogger("pluginManager.disable"),
      uninstall: makeAsyncLogger("pluginManager.uninstall"),
      // E5.7#81：返回契约形状（预览 no-op 恒成功）
      install: async (path: string) => {
        console.info(`[mockLinkdesk] pluginManager.install（壳侧动作，预览 no-op）`, path);
        return { success: true, pluginId: path, version: "0.0.0-dev" };
      },
      reinstall: makeAsyncLogger("pluginManager.reinstall"),
      getDisabled: async () => [],
      getUninstalled: async () => [],
      isDisabled: async () => false,
    },
    // E5.8#34.5：panel 命名空间——预览无壳侧消费，留壳日志（插件调 reveal 的桩）
    panel: {
      reveal: makeAsyncLogger("panel.reveal"),
    },
  } satisfies Partial<LinkDeskAPI>;

  window.linkdesk = mockLinkdesk as unknown as LinkDeskAPI;

  // 控制台浮层调样式入口——Codex 改浮层 UI 时：__mockPool.showQuickPick() 等
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__mockPool = {
    showQuickPick: () => quickPickReplay.push(buildSampleQuickPick()),
    hideQuickPick: () => quickPickReplay.push({ open: false, placeholder: "", items: [] }),
    showDialog: () => dialogReplay.push(buildSampleDialog()),
    hideDialog: () => dialogReplay.push({ open: false }),
    emit: events.emit,
  };
}

// 模块副作用：安装必须在 pool-main 副作用之前——preview-main 静态 import 顺序保证
installMockLinkdesk();
