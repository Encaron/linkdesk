/**
 * 壳标签页命令——Ctrl+W / Ctrl+Tab / Ctrl+Shift+T 等。
 * E5#44-2：从 coreCommands.ts 提取。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import type { SplitSizesResult } from "../../../hooks/useTabManager"; // AI#53：设比例的回执形状（⛔ 只借型，不引运行时——core 不反向依赖 hooks）

/**
 * `AI#53`：设比例命令的**调用面**失败（缺定位 / 坏 branchIndex / 没宿主）——与「跑了但没改」分开报。
 * 树/载荷侧的判定在 reducer（`attemptUpdateSplitSizes`），命令层只原样透出，⛔ 不预校验 sizes。
 */
function sizesBadCall(reason: "no-anchor-id" | "bad-branch-index" | "no-callbacks"): SplitSizesResult {
  return { ok: false, noop: true, reason };
}

export function registerTabCommands(): void {
  // 🔴 显式标注 `Command[]`——同 settingsCommands 的同款理由：不标则 `type: "object"` 放宽成 `string`。
  const commands: Command[] = [
    {
      id: "workbench.action.closeActiveTab",
      title: "关闭标签页",
      category: "标签页",
      description: "关闭当前窗口的活动标签页",
      // ctx 可省——无参调用 = 关当前聚焦窗口的活动标签页（快捷键路径壳侧自动注入 sourceWindowId）
      params: [{ name: "ctx", type: "object", required: false, description: "{ sourceWindowId: string }——发起操作的窗口 id（多窗键盘路由用，省略 = 主窗口）" }],
      // E5.8#46.8：快捷键转发带 sourceWindowId（键盘路由按聚焦窗裁决）——从命令 args 末尾取并透传给 callbacks
      handler: async (...args: unknown[]) => {
        getCallbacks()?.closeActiveTab((args[args.length - 1] as { sourceWindowId?: string } | undefined)?.sourceWindowId);
      },
    },
    {
      id: "workbench.action.reopenClosedEditor",
      title: "重新打开已关闭的编辑器",
      category: "标签页",
      description: "撤销关闭：重新打开最近关闭的标签页",
      handler: async () => { getCallbacks()?.reopenClosedTab(); },
    },
    {
      id: "workbench.action.nextTab",
      title: "下一个标签页",
      category: "标签页",
      description: "聚焦同分组中的下一个标签页",
      params: [{ name: "ctx", type: "object", required: false, description: "{ shift: boolean }——true 则聚焦上一个，省略/false 聚焦下一个" }],
      handler: async (...args: unknown[]) => {
        getCallbacks()?.focusNextTab(!!(args[0] as { shift?: boolean } | undefined)?.shift);
      },
    },
    {
      id: "workbench.action.toggleSplit",
      title: "切换分屏",
      category: "标签页",
      description: "在当前分组上切换分屏（分屏 ↔ 合并）",
      handler: async () => { getCallbacks()?.toggleSplit(); },
    },
    // M2 `AI#21`：`updateSplitSizes` 通道的非鼠标路径——池侧双击分隔条复位只治被点的那一条分支
    // （`useDividerDrag`），本命令治整棵树（所有分支回 50/50），AI 不必知道 branchIndex。
    {
      id: "workbench.action.resetSplitSizes",
      title: "重置分屏比例",
      category: "标签页",
      description: "把所有分屏分支的比例恢复成均分（50/50）；未分屏时无效果",
      handler: async () => { getCallbacks()?.resetSplitSizes?.(); },
    },
    // M2 生长格 `AI#53`：`updateSplitSizes` 通道的**精确**非鼠标路径——`resetSplitSizes`（AI#21）只能整树回均分，
    // 本命令能把**某一条分支**设成 70/30。定位两条路：`anchorGroupId`（该组所在的那条分支——AI 从 `tabs` 读数的
    // `root` 里挑叶子组即可命名）／`branchIndex`（1 起先序，鼠标拖拽那套，同给则它优先）。
    // 回执三态同 `core.splitDown`（`AI#55` 口径：`ok:true` ＝ 真改了；`noop` ＋ `reason` ＝ 没改，为什么）。
    {
      id: "workbench.action.setSplitSizes",
      title: "设置分屏比例",
      category: "标签页",
      description: "把某条分屏分支的比例设成指定值（如 [70, 30]）；未分屏或分支找不到时回 noop 与 reason",
      params: [
        { name: "anchorGroupId", type: "string", description: "定位分支：该分支下任一叶子组 id（与 branchIndex 二选一；同给则 branchIndex 优先）" },
        { name: "sizes", type: "object", required: true, description: "[number, number]——两侧比例，两个正数（如 [70, 30]）；是二元数组，不是对象" },
        { name: "branchIndex", type: "number", description: "精确定位分支：1 起、先序计数（鼠标拖拽同款；一般用 anchorGroupId 即可）" },
      ],
      handler: async (...args: unknown[]) => {
        const [anchorRaw, sizesRaw, branchIndexRaw] = args;
        const anchorGroupId = typeof anchorRaw === "string" ? anchorRaw : "";
        const branchIndex = typeof branchIndexRaw === "number" ? branchIndexRaw : undefined;
        // 给了 `branchIndex` 却不是数字 ⇒ 如实报它（⛔ 不说成「没给」）；`null`/缺省 = 没给
        if (branchIndex === undefined && branchIndexRaw != null) return sizesBadCall("bad-branch-index");
        if (!anchorGroupId && branchIndex === undefined) return sizesBadCall("no-anchor-id");
        const setSplitSizes = getCallbacks()?.setSplitSizes;
        if (!setSplitSizes) return sizesBadCall("no-callbacks");
        // `sizes` 的形状由 reducer 裁决（判定单点）——命令层原样透传
        return setSplitSizes(anchorGroupId, sizesRaw as [number, number], branchIndex);
      },
    },
    {
      id: "core.closeAllEditors",
      title: "关闭所有编辑器",
      category: "标签页",
      description: "关闭全部分组里的所有编辑器标签页",
      handler: async () => { getCallbacks()?.closeAllEditors(); },
    },
    {
      id: "workbench.action.focusNthTab",
      title: "跳转到标签页",
      category: "标签页",
      description: "聚焦同分组中的第 n 个标签页",
      params: [{ name: "ctx", type: "object", required: true, description: "{ n: number }——目标标签页序号（从 1 起）" }],
      handler: async (...args: unknown[]) => {
        const n = (args[0] as { n: number } | undefined)?.n;
        if (n) getCallbacks()?.focusNthTab(n);
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }
}
