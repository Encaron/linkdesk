/**
 * MainZone——E5.7#20。主区渲染。
 *
 * 从 src/pool/main/MainRenderer.tsx 693 行行为零丢失提取（吸收 E5.7#7 TabBarZone——
 * tab bar 不独立成 zone，收在 panel 内 per-panel GroupTabBar）。
 * 接收 PoolLayout v2 的 groups / root / creatableViews 切片。
 * 提取原则：内联逻辑原样提取——useDragReorder（275 行 15+ 轮 bug 验证）不重写；
 * useSplitResize / useTabDropPreview 拆分是可选重构，非本任务。
 * 验收 13 项见 E5.7-执行清单 #20。🔴 源文件 MainRenderer.tsx 由 #24 删除（本任务只提取+挂载）。
 *
 * E5.6#16.7：从平铺 groups.map → SplitNode 树驱动的绝对定位平铺渲染。
 *   🔴 B22 防护：所有面板绝对定位平级渲染（key=groupId 永远同级），
 *   树只用来算 x/y/w/h 百分比。分屏/合屏时面板 DOM 深度不变 → React 不 unmount。
 *   不要改回递归 flex 嵌套——DOM 深度变化会丢 Monaco/CM6 状态（B22 教训）。
 *
 * E5.6#16.5：TabBar 迁入——每个 group 自包含。
 * 壳不再渲染 TabBar/SplitPane/TabPanePositioner。
 *
 * 全局拖拽协调者——同 group 重排 + 跨 group 移动 + 拖到编辑区分屏。
 * 拖出窗口检测（useDragDetach）：~~Phase 8 #33~~ 已推迟 v1.3（脱出窗口设计.md）——接入点注记保留（原 #7 TabBarZone 占位迁此）。
 *
 * 🔴 Path B：不 import @src/core/* 运行时模块（import type 除外）——
 *   动作回传走 window.linkdesk.pool.tabAction（聪慧→哑：壳是唯一真相源）。
 *
 * E5.8#0d.10-6d：feature-folder 聚合器——MainZone/ 5 子模块整迁：
 *   layout（几何纯函数：computeLayout/buildBranchMaps）· useDividerDrag（分隔线拖拽状态机）·
 *   useTabDrag（标签拖拽协调者）· GroupPane（单组内容）· DragOverlays（拖拽视觉浮层）。
 *   本文件仅剩：hook 编排 + groupMap + 面板/分割条画布 JSX + 空态 + renderGroupPane 接线。
 */

import { useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PoolGroup } from "../../../core/types/pool/poolLayout";
import type { SplitNode } from "../../../core/utils/splitTree";
import { getAllLeafGroupIds } from "../../../core/utils/splitTree";
import type { PoolTabAction } from "../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { TabBarViewportRect, TabDragPositionPayload, AdsorbHintPayload } from "../../../core/types/ipc/poolActions"; // E5.8#44-B/#44-C：TabBar rect + 拖拽位置上报 + 吸附提示契约
import type { LinkDeskAPI } from "../../../core/api/linkdesk-api"; // E5.7#98：pool 命名空间契约类型
import { Z_INDEX } from "../../../constants"; // E5.7#26：浮层层级常量表（替代 9999/99999 裸数字）
import { computeLayout, buildBranchMaps, type PanelRect } from "./MainZone/layout";
import { useDividerDrag } from "./MainZone/useDividerDrag";
import { useTabDrag } from "./MainZone/useTabDrag";
import GroupPane from "./MainZone/GroupPane";
import TabContentLayer, { type TabContentItem } from "./MainZone/TabContentLayer";
import DragOverlays from "./MainZone/DragOverlays";

// ═══════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════

interface MainZoneProps {
  groups: PoolGroup[];
  root?: SplitNode;
  /** E5.6#16.7k-3：可创建为标签页的视图——GroupTabBar [+] 按钮动态菜单 */
  creatableViews?: { pluginId: string; label: string }[];
  /** E5.8#30.15（P5）：聚焦面板 id——壳 reduceFocusGroup/FocusTab 维护，accent 环 + isActive 单聚焦判定 */
  activeGroupId?: string;
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export default function MainZone({ groups, root, creatableViews, activeGroupId }: MainZoneProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pool API（E5.7#98：LinkDeskAPI["pool"] 契约类型替代 any）──
  const poolApiRef = useRef<NonNullable<LinkDeskAPI["pool"]> | null>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = window.linkdesk?.pool ?? null;
  }
  const tabAction = useCallback((action: PoolTabAction) => {
    poolApiRef.current?.tabAction?.(action);
  }, []);
  // E5.8#44-B：TabBar viewport rects 上报（吸附/释放并窗命中检测数据源）——经 preload 直发主进程附 windowId 转壳
  const tabBarRects = useCallback((rects: TabBarViewportRect[]) => {
    poolApiRef.current?.tabBarRects?.(rects);
  }, []);
  // E5.8#44-C：拖拽位置上报（拎起后 mousemove 全程——壳排除源窗吸附命中）——经 preload 直发主进程附 sourceWindowId 转壳
  const dragPosition = useCallback((pos: TabDragPositionPayload) => {
    poolApiRef.current?.dragPosition?.(pos);
  }, []);
  // E5.8#44-C：吸附提示订阅（壳→池——跨窗拖拽命中本窗 TabBar 下发目标组插入指示）——onAdsorbHint 是订阅函数（返回退订），
  // 池 API 缺失 → 返回 no-op 退订（useTabDrag effect 直接调用退订函数）
  const onAdsorbHint = useCallback(
    (cb: (hint: AdsorbHintPayload) => void) => poolApiRef.current?.onAdsorbHint?.(cb) ?? (() => {}),
    [],
  );
  // E5.8#46.10：吸附插入缝隙上报（池→壳——目标池算竖线落点后上报，壳存注册表供释放并窗精确落位）
  const adsorbIndex = useCallback(
    (payload: { groupId: string; insertIndex: number }) => {
      poolApiRef.current?.adsorbIndex?.(payload);
    },
    [],
  );

  // ── Group map ──
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // ── Branch indices (pre-order, matches updateBranchSizesByIndex) ──
  // E5.7#86：同时建 index→branch 反查表——回执对齐 effect 用（读推送分支的当前 sizes）
  const { branchIndices, branchNodesByIndex } = useMemo(() => buildBranchMaps(root), [root]);

  // ── 分隔线拖拽状态机（per-branch local sizes + 回执对齐）──
  const { localSizesRef, onDividerMouseDown } = useDividerDrag({
    tabAction,
    root,
    branchNodesByIndex,
  });

  // ── 全局标签拖拽协调者（useDragReorder 接线 + 回执对齐 + tabBarRefs）──
  const {
    draggingId,
    dragInsertIndex,
    dragInsertGroupId,
    dropZoneState,
    previewPos,
    registerTabBar,
    getEffectiveTabs,
    handleTabDragStart,
    adsorbInsert,
  } = useTabDrag({ containerRef, tabAction, groups, tabBarRects, dragPosition, onAdsorbHint, adsorbIndex });

  // ── renderGroupPane——单个 group 的内容（GroupPane 接线：tabs/dragInsertIndex 由本层解析）──
  function renderGroupPane(group: PoolGroup): React.ReactNode {
    return (
      <GroupPane
        group={group}
        tabs={getEffectiveTabs(group.id, group)}
        draggingId={draggingId ?? undefined}
        dragInsertIndex={dragInsertGroupId === group.id ? dragInsertIndex : null}
        onTabDragStart={handleTabDragStart}
        onTabBarMount={registerTabBar}
        creatableViews={creatableViews}
        // E5.8#46.10：吸附竖线缝隙按组解析——仅目标组有值（替代原整条高亮 adsorbGroupId）
        adsorbInsertIndex={adsorbInsert?.groupId === group.id ? adsorbInsert.index : null}
      />
    );
  }

  // ═════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════

  if (groups.length === 0) {
    return (
      <div
        className="ldk-main-zone" // E5.8#50.7：主区玻璃表面（index.css 消费 --surface-*/--glass-*；默认零值零变化）
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)", /* E5.8#128.3：去掉 hex fallback */
          fontSize: "var(--font-size-md)", /* E5.8 Phase 12 #171：13→md */
          userSelect: "none",
        }}
      >
        {t("没有打开的标签页")}
      </div>
    );
  }

  // 🔴 B22 防护：多面板 → 绝对定位平级渲染。单面板 → flex fallback。
  const useAbsolute = root && getAllLeafGroupIds(root).length > 1;

  // computeLayout 在 render 期间调用（非 memo——O(n) 极轻，始终读最新 localSizesRef）
  const layout = useAbsolute
    ? computeLayout(root!, 0, 0, 100, 100, branchIndices, localSizesRef.current)
    : null;

  // E5.8#141：tab 视图保活——所有标签页内容平级渲染于 .main-zone 根级（key=tab.id 永远同级），
  // 跨 group 移动只改 rect/显隐不改 DOM 位置（对标 B22 面板平级推广到 tab 层）。
  // rect 来源：多面板 = layout.panels；单面板 = 全屏 (0,0,100,100)。
  const tabLayerItems: TabContentItem[] = [];
  for (const group of groups) {
    const pane = layout?.panels.find((p) => p.groupId === group.id);
    const rect: PanelRect = pane
      ? { groupId: pane.groupId, x: pane.x, y: pane.y, w: pane.w, h: pane.h }
      : { groupId: group.id, x: 0, y: 0, w: 100, h: 100 };
    const groupFocused = group.id === activeGroupId;
    for (const tab of group.tabs) {
      tabLayerItems.push({
        tab,
        groupId: group.id,
        rect,
        visible: tab.id === group.activeTabId,
        focused: groupFocused && tab.id === group.activeTabId,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="ldk-main-zone" // E5.8#50.7：主区玻璃表面（index.css 消费 --surface-*/--glass-*；默认零值零变化）
      style={{
        display: "flex",
        flex: 1,
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {useAbsolute && layout ? (
        // ── 绝对定位模式：所有面板平级兄弟（key=groupId 永远同级）──
        // E5.8#141：数组展开替代 Fragment——两分支 `.main-zone` 子位 0 同为 div[key=groupId]，
        //   React 跨 1↔2 按 key 复用 pane 子树零 remount（Fragment 会变子位 0 元素类型 → 整树 unmount 丢 Monaco/CM6 状态）
        [
          ...layout.panels.map((p) => {
            const group = groupMap.get(p.groupId);
            if (!group) return null;
            return (
              <div
                key={p.groupId}
                data-group-id={p.groupId}
                // E5.8#30.15（P5）：聚焦面板 accent 环——inset 阴影零布局位移
                className={p.groupId === activeGroupId ? "ldk-group-pane-focused" : undefined}
                // E5.8#30.15（P5）：点面板空白聚焦该面板——同组 no-op（省一次 IPC 回环）
                onMouseDown={() => {
                  if (activeGroupId !== p.groupId) {
                    tabAction({ action: "focusGroup", groupId: p.groupId });
                  }
                }}
                style={{
                  position: "absolute",
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.w}%`,
                  height: `${p.h}%`,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {renderGroupPane(group)}
              </div>
            );
          }),
          ...layout.handles.map((h) => {
            const isH = h.direction === "horizontal";
            return (
              <div
                key={`handle-${h.branchIndex}`}
                // E5.8#143：split-handle = 与 .zone-resize-handle 共享的点/线视觉（index.css 全局层）——
                //   常态三点 / hover 成线 + 线端镜像 zone 圆角；行为（拖拽/双击复位）零改动
                className={isH ? "ldk-split-handle" : "ldk-split-handle row"}
                style={{
                  position: "absolute",
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: `${h.w}%`,
                  height: `${h.h}%`,
                  cursor: isH ? "col-resize" : "row-resize",
                  zIndex: Z_INDEX.splitHandle,
                }}
                onMouseDown={(e) => {
                  const cr = containerRef.current?.getBoundingClientRect();
                  const containerSize = cr ? (isH ? cr.width : cr.height) : 0;
                  onDividerMouseDown(h.branchIndex, h.direction, e, h.sizes, containerSize);
                }}
                onDoubleClick={() => {
                  // 双击重置为 50/50
                  tabAction({
                    action: "updateSplitSizes",
                    anchorGroupId: "",
                    sizes: [50, 50] as [number, number],
                    branchIndex: h.branchIndex,
                  });
                }}
              />
            );
          }),
        ]
      ) : (
        // ── 单面板 fallback：flex 填充 ──
        groups.map((group) => (
          <div
            key={group.id}
            data-group-id={group.id}
            // E5.8#30.15（P5）：单面板也带聚焦环（聚焦行为与多面板一致）
            className={group.id === activeGroupId ? "ldk-group-pane-focused" : undefined}
            onMouseDown={() => {
              if (activeGroupId !== group.id) {
                tabAction({ action: "focusGroup", groupId: group.id });
              }
            }}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {renderGroupPane(group)}
          </div>
        ))
      )}

      {/* E5.8#141：tab 视图保活层——根级 key=tab.id 平级渲染，跨组移动零 remount（内容区从标签栏下方开始） */}
      <TabContentLayer
        items={tabLayerItems}
        creatableViews={creatableViews}
        onPaneMouseDown={(groupId) => {
          if (activeGroupId !== groupId) {
            tabAction({ action: "focusGroup", groupId });
          }
        }}
      />

      {/* 拖拽视觉浮层——drop zone 毛玻璃 + 拖拽预览 portal（MainZone/DragOverlays） */}
      <DragOverlays
        dropZoneState={dropZoneState}
        useAbsolute={Boolean(useAbsolute)}
        layout={layout}
        draggingId={draggingId}
        previewPos={previewPos}
        groups={groups}
      />
    </div>
  );
}
