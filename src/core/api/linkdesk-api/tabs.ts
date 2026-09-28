/**
 * linkdesk-api 标签页域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * tabs 命名空间面 verbatim；M1 `AI#3` 加读取面 `list()`（类型依赖 = types/pool 的标签/布局 DTO，
 * 保证标签清单与布局树**同一把尺**）。被聚合器交叉组装。
 */

import type { PoolGroup, PoolLayout } from "../../types/pool/poolLayout";
import type { WindowMode } from "../../types/windows";

/**
 * M1 `AI#3`：单窗标签清单——`groups` 与推给池的布局树**同一个序列化器**（`serializeGroups`）产出，
 * 故「清单里的 label/icon/title」与「屏幕上画的那一条」必然一致。
 */
export interface TabsSnapshotWindow {
  /** 壳生成（主池 = `"main"`，脱出窗壳自生成 id） */
  windowId: string;
  mode: WindowMode;
  /** 池 React 是否已挂载就绪（未就绪的窗壳仍会推布局——preload 缓冲回放，故清单照样有内容） */
  ready: boolean;
  /** 该窗当前聚焦组（壳 `tabState.activeGroupId` 直通——不是池侧推导） */
  activeGroupId: string;
  /** 该窗分屏根树（与 `PoolLayout["root"]` 同类型；单组无嵌套时缺省） */
  root?: PoolLayout["root"];
  /** 每组标签清单（含每组的 `activeTabId` = 该组活跃标签） */
  groups: PoolGroup[];
}

/**
 * M1 `AI#3`：`tabs.list()` 的返回——**全部窗口一次给全**（含活跃位）。
 *
 * 🔴 为什么是全窗而不是「当前窗」：壳侧**没有**「当前窗」这个真相源（全仓 grep `activeWindowId` 零命中，
 * 窗口注册表里只有逐窗 mode/ready/tabState）——凭空造一个"当前窗"就是编数据。
 * 调用方（插件/AI）要哪一窗，自己按 `windowId` 筛。
 */
export interface TabsSnapshot {
  windows: TabsSnapshotWindow[];
}

/** 标签页命名空间面——对标 VS Code vscode.window.createTerminal() */
export interface TabsAPI {
  tabs: {
    create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    focus(tabId: string): Promise<void>;
    close(tabId: string): Promise<void>;
    focusBySourceId(sourceId: string): Promise<void>;
    updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
    closeBySourceId(sourceId: string): Promise<void>;
    /** E5.6#11.5g3：标签页激活订阅——文件树 autoReveal 消费（preload-pool 实有面，#98 补录契约） */
    onDidChangeActiveTab(cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void): () => void;
    /**
     * M1 `AI#3`：**只读列举**——开了哪几个标签、各属哪个插件、哪个是活跃的（每组 `activeTabId`）。
     *
     * 🔴 为什么必须有它：布局真相源是壳的 `useTabManager`（React state），**壳侧无任何 getter**
     * （池侧只能被动等下一帧 `pool.onLayout`，而「现在有什么」不该靠等）。本方法 = 壳侧权威按需自曝。
     * 🔴 **池侧独有**：壳自己是标签权威、手上就是这份 state，不需要绕 IPC 问自己 ⇒ `preload-shell` 不实现
     * （`surfaces.ts` 的 `ShellExposed.tabs` Omit 已剔除 `list`——同 `onDidChangeActiveTab` 的理由）。
     *
     * @returns 全部窗口的清单（见 `TabsSnapshot`；与 `AI#4` 的布局树**同源**——同一 `serializeGroups`）
     */
    list(): Promise<TabsSnapshot>;
  };
}
