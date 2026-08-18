/**
 * useDividerDrag——MainZone 分隔线拖拽状态机（per-branch local sizes + 回执对齐）。
 * E5.8#0d.10-6a：自 MainZone.tsx 拆出——localSizesRef / dividerDragRef / pendingSplitsRef +
 * onDividerMouseDown + 松手回执 effect + forceUpdate。只处理分隔线，标签排序回执在 useTabDrag。
 * 依赖方向：useDividerDrag → core/utils/splitTree（type）；无反向。
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PoolTabAction } from "../../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { SplitNode } from "../../../../core/utils/splitTree";

interface UseDividerDragInput {
  tabAction: (action: PoolTabAction) => void;
  root?: SplitNode;
  branchNodesByIndex: Map<number, SplitNode & { type: "branch" }>;
}

export function useDividerDrag({ tabAction, root, branchNodesByIndex }: UseDividerDragInput) {
  const localSizesRef = useRef<Map<number, [number, number]>>(new Map());
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const dividerDragRef = useRef<{
    branchIndex: number;
    direction: "horizontal" | "vertical";
    startPos: number;
    startSizes: [number, number];
    containerSize: number;
  } | null>(null);
  // E5.7#86：松手后待回执的分支——本地覆盖保留到壳 pushLayout 回执携带已提交尺寸为止。
  // SidebarZone E5.7#13 同款回执对齐：过早释放 = 下一帧渲染壳侧旧尺寸 → 分隔线回闪
  //（实机验证发现：拖完松手瞬间闪回拖前位置再跳回）。
  const pendingSplitsRef = useRef<Map<number, { preDrag: [number, number]; committed: [number, number] }>>(new Map());

  const onDividerMouseDown = useCallback(
    (
      branchIdx: number,
      direction: "horizontal" | "vertical",
      e: ReactMouseEvent,
      sizes: [number, number],
      containerSize: number,
    ) => {
      // 仅左键拖拽——右键/中键不触发 resize（SidebarZone handleResizeStart 同款守卫）
      if (e.button !== 0) return;
      e.preventDefault();
      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      dividerDragRef.current = {
        branchIndex: branchIdx,
        direction,
        startPos,
        startSizes: sizes,
        containerSize,
      };

      const onMouseMove = (ev: MouseEvent) => {
        const ds = dividerDragRef.current;
        if (!ds || ds.containerSize <= 0) return;
        const currentPos = ds.direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = currentPos - ds.startPos;
        const deltaPct = (delta / ds.containerSize) * 100;
        const combined = ds.startSizes[0] + ds.startSizes[1];
        const newLeft = Math.max(5, Math.min(combined - 5, ds.startSizes[0] + deltaPct));
        const newRight = combined - newLeft;
        localSizesRef.current.set(ds.branchIndex, [newLeft, newRight]);
        forceUpdate();
      };

      const onMouseUp = () => {
        const ds = dividerDragRef.current;
        dividerDragRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (!ds) return;

        const local = localSizesRef.current.get(ds.branchIndex);
        if (!local) return;
        const combined = local[0] + local[1];
        if (combined <= 0) return;
        const leftPct = Math.round((local[0] / combined) * 100);
        const rightPct = 100 - leftPct;

        // E5.7#86：保留本地覆盖直到回执（不立刻删）——立刻删会让下一帧回退渲染壳侧
        // 旧尺寸（松手回闪）。壳提交 → pushLayout 回执到达后由回执对齐 effect 释放。
        pendingSplitsRef.current.set(ds.branchIndex, {
          preDrag: ds.startSizes,
          committed: [leftPct, rightPct],
        });

        tabAction({
          action: "updateSplitSizes",
          anchorGroupId: "",
          sizes: [leftPct, rightPct] as [number, number],
          branchIndex: ds.branchIndex,
        });
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [tabAction],
  );

  // E5.7#86：回执对齐——壳 pushLayout 到达后，对每个待回执分支：
  //   推送尺寸 ≠ 拖前尺寸（壳已采纳新值）或 == 提交值（壳原样回存）→ 释放本地覆盖。
  // 仍带拖前尺寸的推送 = 迟到的旧推送（拖拽期间无关 tabState 变化触发）→ 保留覆盖。
  useEffect(() => {
    if (pendingSplitsRef.current.size === 0 || !root) return;
    for (const [branchIdx, pending] of pendingSplitsRef.current) {
      const branch = branchNodesByIndex.get(branchIdx);
      // 分支已从树中消失（等待期间被合屏）→ 覆盖无意义，直接释放
      if (!branch) {
        localSizesRef.current.delete(branchIdx);
        pendingSplitsRef.current.delete(branchIdx);
        forceUpdate();
        continue;
      }
      const pushed = branch.sizes;
      const released =
        pushed[0] !== pending.preDrag[0] || pushed[1] !== pending.preDrag[1] ||
        (pushed[0] === pending.committed[0] && pushed[1] === pending.committed[1]);
      if (released) {
        localSizesRef.current.delete(branchIdx);
        pendingSplitsRef.current.delete(branchIdx);
        forceUpdate();
      }
    }
  }, [root, branchNodesByIndex]);

  return { dividerDragRef, localSizesRef, onDividerMouseDown };
}
