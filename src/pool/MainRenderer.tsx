/**
 * MainRenderer——E5.6#7c。
 *
 * MainPool 的 React 渲染器。接收壳推送的 PoolGroup[]，
 * 每个 group = flex div，每个 tab = keep-alive（display: none/block）。
 * 所有插件组件用 ErrorBoundary 包裹——一个插件崩溃不影响其他标签页。
 *
 * E5.6#16：添加拖拽分隔线——两个 group 之间 4px col-resize 分隔线，
 * 拖拽时本地更新 flex 比例（即时视觉反馈），松手后 IPC 回传壳更新 SplitNode 树。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import ErrorBoundary from "../components/shared/ErrorBoundary";
import PluginComponent from "./PluginComponent";
import type { PoolGroup } from "../core/types/poolLayout";

/** 分隔线宽度（px） */
const DIVIDER_WIDTH = 4;

interface MainRendererProps {
  groups: PoolGroup[];
}

export default function MainRenderer({ groups }: MainRendererProps) {
  // ── E5.6#16：本地 flex 状态——拖拽时即时更新，松手后同步到壳 ──
  const [localFlexes, setLocalFlexes] = useState<number[]>(() => groups.map((g) => g.flex));
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    dividerIndex: number;
    startX: number;
    startLeftFlex: number;
    startRightFlex: number;
  } | null>(null);

  // 外部 pushLayout 更新 flex 时同步到本地状态（非拖拽期间）
  useEffect(() => {
    if (!dragState.current) {
      setLocalFlexes(groups.map((g) => g.flex));
    }
  }, [groups]);

  // ── 分隔线拖拽 ──
  const onDividerMouseDown = useCallback((dividerIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const leftFlex = localFlexes[dividerIndex];
    const rightFlex = localFlexes[dividerIndex + 1];
    dragState.current = {
      dividerIndex,
      startX: e.clientX,
      startLeftFlex: leftFlex,
      startRightFlex: rightFlex,
    };

    const onMouseMove = (ev: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      if (containerWidth <= 0) return;
      const delta = ev.clientX - ds.startX;
      const deltaFlex = delta / containerWidth;
      const combined = ds.startLeftFlex + ds.startRightFlex;
      const newLeft = Math.max(0.05, Math.min(combined - 0.05, ds.startLeftFlex + deltaFlex));
      const newRight = combined - newLeft;
      setLocalFlexes((prev) => {
        const next = [...prev];
        next[ds.dividerIndex] = newLeft;
        next[ds.dividerIndex + 1] = newRight;
        return next;
      });
    };

    const onMouseUp = () => {
      const ds = dragState.current;
      dragState.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (!ds) return;

      // 发送新比例到壳——百分比格式（sizes: [60, 40] = 60%/40%）
      const combined = ds.startLeftFlex + ds.startRightFlex;
      if (combined <= 0) return;
      const leftPct = Math.round((localFlexes[ds.dividerIndex] / combined) * 100);
      const rightPct = 100 - leftPct;
      const anchorGroupId = groups[ds.dividerIndex]?.id;
      if (!anchorGroupId) return;

      const poolApi = (window as any).linkdesk?.pool;
      poolApi?.sidebarAction?.({
        action: "updateSplitSizes",
        anchorGroupId,
        sizes: [leftPct, rightPct] as [number, number],
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [localFlexes, groups]);

  // 无标签页——主区空白
  if (groups.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted, #888)",
          fontSize: 13,
          userSelect: "none",
        }}
      >
        没有打开的标签页
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>
      {groups.map((group, idx) => (
        <div key={group.id} style={{ display: "flex", flex: localFlexes[idx] ?? group.flex, height: "100%", minWidth: 0 }}>
          {/* E5.6#16：分隔线——两个 group 之间 4px col-resize 可拖拽区域 */}
          {idx > 0 && (
            <div
              style={{
                width: DIVIDER_WIDTH,
                minWidth: DIVIDER_WIDTH,
                height: "100%",
                cursor: "col-resize",
                background: "transparent",
                transition: dragState.current ? "none" : "background 0.15s",
                zIndex: 10,
              }}
              onMouseDown={(e) => onDividerMouseDown(idx - 1, e)}
              onMouseEnter={(e) => {
                if (!dragState.current) {
                  (e.target as HTMLElement).style.background = "var(--border-normal, #474747)";
                }
              }}
              onMouseLeave={(e) => {
                if (!dragState.current) {
                  (e.target as HTMLElement).style.background = "transparent";
                }
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              height: "100%",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {group.tabs.map((tab) => (
              <div
                key={tab.id}
                style={{
                  // E5.6#14-fix：flex column——子组件（serial-monitor-view 等）用 flex:1 撑高，
                  // 需要父容器为 flex 容器。display:block 下 flex:1 被忽略→CM6 高度塌成 1 行。
                  display: tab.id === group.activeTabId ? "flex" : "none",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <ErrorBoundary pluginId={tab.pluginId}>
                  <PluginComponent
                    pluginId={tab.pluginId}
                    tabId={tab.id}
                    sourceId={tab.sourceId}
                    isActive={tab.id === group.activeTabId}
                  />
                </ErrorBoundary>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
