/**
 * Pool preload QuickPick 域——池内本地桥 + 哑渲染缓冲回放。
 * E5.8#0d.10-4a：自 preload-pool.ts 拆出——quickPick 命名空间（插件选择器，池内本地桥零 IPC）
 * + quickPickHost 命名空间（QuickPickHost 渲染桥）。二者共享同一批缓冲状态：
 *   哑渲染数据缓冲（pool:quickpick，壳→池）+ 插件请求缓冲（quickPick.show 先于 Host mount）。
 * 依赖方向：quickpick → electron/ipc（channels）+ src/core/types/pool（type-only，E5.8#20 契约对齐——
 * 原手抄 *Shape 与语义类型漂移，satisfies 实证后改直接 import type；构建期擦除零运行时依赖）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { guardPush } from '../ipc/wire-guard';
import type { PoolQuickPickData, PluginQuickPickOptions, PluginQuickPickRequest } from '../../src/core/types/pool/poolQuickPick';

type PluginQuickPickSettle = (key: string | null) => void;
type PluginQuickPickHostFn = (req: PluginQuickPickRequest, settle: PluginQuickPickSettle) => void;

// ── E5.7#15：pool:quickpick 缓冲回放——QuickPick 哑渲染数据可能在 QuickPickHost mount 前到达 ──
// 对标 pool:layout 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（浮动层是单例态——open/close 全量替换，旧数据回放无意义）。
const _quickPickBuffer: PoolQuickPickData[] = [];
let _quickPickCallback: ((data: PoolQuickPickData) => void) | null = null;
let _quickPickActive = false;

ipcRenderer.on(IPC.pool.quickpick, (_event, data: PoolQuickPickData) => {
  // E5.8#22.5：pool:quickpick 直收点接收边界断言——guard 只记录不阻断，透传缓冲
  guardPush(IPC.pool.quickpick, data);
  if (!_quickPickActive || !_quickPickCallback) {
    _quickPickBuffer.length = 0;
    _quickPickBuffer.push(data);
  } else {
    try { _quickPickCallback(data); } catch { /* contextBridge 回调静默失败 */ }
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
let _quickPickHostFn: PluginQuickPickHostFn | null = null;
const _quickPickShowBuffer: Array<{ req: PluginQuickPickRequest; settle: PluginQuickPickSettle; reject: (e: Error) => void }> = [];

/** 插件 quickPick API——show(opts) → Promise<item | undefined>（池内本地桥，零 IPC） */
export function buildQuickPick() {
  return {
    /**
     * 展示选择器——对标 VS Code window.showQuickPick()。
     * 调用在隔离世界执行：校验后转交 QuickPickHost 注册的 hostFn 渲染（未注册则缓冲）。
     */
    show: (opts: PluginQuickPickOptions) => new Promise<unknown>((resolve, reject) => {
      if (!opts || !Array.isArray(opts.items)) {
        reject(new Error("quickPick.show(opts)：opts.items 必须为数组"));
        return;
      }
      const req: PluginQuickPickRequest = { opts };
      const settle: PluginQuickPickSettle = (key) => resolve(key === null ? undefined : opts.items[Number(key)]);
      if (_quickPickHostFn) {
        try { _quickPickHostFn(req, settle); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
      } else {
        _quickPickShowBuffer.push({ req, settle, reject });
      }
    }),
  };
}

/** 池 QuickPickHost 渲染桥（E5.7#15 → E5.7#63 更名——quickPick 命名空间归插件 API，宿主桥独占 quickPickHost） */
export function buildQuickPickHost() {
  return {
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
    onShow: (cb: (data: PoolQuickPickData) => void) => {
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
  };
}
