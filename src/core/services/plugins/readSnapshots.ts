/**
 * readSnapshots——M1 读取面（`AI#1` 通知 / `AI#3` 标签）的**壳侧提供者注册表**（core 侧，零 React 依赖）。
 *
 * 🔴 为什么必须有这一层：这两格的答案都长在壳的 React 层——
 *   - 通知面板快照 = `usePoolSync/notif.ts` 的 `buildNotif(t)`（**唯一序列化器**，单一真相源）；
 *   - 标签清单 = `usePoolSync/windowLayout.ts` 的 `serializeGroups(...)` ＋ 壳窗口注册表（React state）。
 * 而 `IpcBridgeHandler`（core）**不能 import hooks**（依赖方向 core → 无 / hooks → core）。
 * 解法 = 本仓既有惯例（`DialogService.registerDialogRenderers` / `CoreCallbacks.updateCoreCallbacks`）：
 * core 持一个槽，壳 React 层挂载时把闭包注册进来。
 *
 * ⚠️ 为什么不是「core 自己算一份」：那就是 fork 第二把尺——通知文案/分组/未读、标签 title/icon 全在
 * 序列化器里（i18n `t()` 现场解析），core 重算必然与屏幕不一致。**读到的必须就是画出来的。**
 *
 * 🔴 **未注册时 `read()` 大声抛**——不返回 null / 空数组静默兜底：池侧发起读取却拿到「空世界」，
 * 会被误读成「确实没有通知 / 一个标签都没开」，而真相是壳还没挂载。抛错经
 * `bridge.respond(requestId, undefined, errMsg)` 回到调用方 = **可诊断的失败**
 * （M1 判据要求「答得上」，答不上必须看得见，不能假装答了）。
 *
 * 依赖方向：readSnapshots → api/linkdesk-api（契约类型）+ types/pool（DTO）——纯类型，无运行时依赖。
 */

import type { NotifLayout } from "../../types/pool/poolLayout";
import type { TabsSnapshot } from "../../api/linkdesk-api/tabs";

/** 单个读面槽——`register` 的返回值即注销（引用级守卫：后注册者不被前者的 dispose 抹掉） */
export interface SnapshotSlot<T> {
  register(provider: () => T): () => void;
  read(): T;
}

function createSnapshotSlot<T>(name: string): SnapshotSlot<T> {
  let provider: (() => T) | null = null;
  return {
    register(next: () => T): () => void {
      provider = next;
      return () => { if (provider === next) provider = null; };
    },
    read(): T {
      if (!provider) {
        throw new Error(
          `[readSnapshots] ${name} 提供者未注册——壳侧 usePoolSync 尚未挂载（或壳渲染进程异常）？`,
        );
      }
      return provider();
    },
  };
}

/**
 * 通知面板快照槽——`notifications.list()` / `subscribe` 的答案。
 * 值 = `buildNotif(t)` 的返回（与 `PoolLayout.statusBar.notif` **同一个函数、同一帧尺**）。
 */
export const notifSnapshot = createSnapshotSlot<NotifLayout>("notifSnapshot");

/**
 * 标签清单快照槽——`tabs.list()` 的答案。
 * 值 = 壳窗口注册表逐窗 `serializeGroups(...)`（与推给池的布局树**同一函数** ⇒ 两读数天然对得上，`AI#3` 判据）。
 */
export const tabsSnapshot = createSnapshotSlot<TabsSnapshot>("tabsSnapshot");
