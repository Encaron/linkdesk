/**
 * PoolZoneShell——E5.7#3。Pool 唯一根组件。
 *
 * 替代 E5.6 pool-main.tsx 的 RENDERERS zone 分发——单入口，无 ?zone= 路由。
 * flex column 全窗口布局（设计 §6.1）：
 *   Row 1: TitleBarZone
 *   Row 2: pool-body（E5.8#37.5 grid 化——MainZone 直接成 grid cell，PanelZone 独立 cell）
 *   Row 3: StatusBarZone
 *   FloatingLayerHost（#25，Phase 4 接入——portal root 就绪前不 import）
 *
 * 🔴 E5.8#37.5 池布局 grid 化（决策 2/3，布局树数据化 01 设计）：
 *   壳推「树结构」不推「绝对坐标」——本组件从 layout DTO 归一化出输入，调 computePoolGrid
 *   （src/pool/gridLayout.ts，覆盖推导单一来源 S10）得 grid-template + 各 zone grid 放置。
 *   列宽/行高全 auto（内容驱动——zone 组件根尺寸决定）+ main 1fr 吸剩余。
 *   → 换边/换位/对齐切换纯 CSS 几何零 React 重挂（S1 换位丢视图状态消灭）。
 *   → 隐藏面板不渲染 PanelZone + 推导无面板行/列（保「无面板贡献 = 零 DOM」验收）。
 *   每个 zone 包 .pool-grid-cell（grid 放置容器）——SidebarZone 恒挂载（visible=false 内部
 *   display:none，视图状态不丢），rightSidebar 按 visible 条件渲染（无数据零 DOM）。
 *
 * 🔴 Path B：池 = 哑渲染器。不 import 任何 @src/core/* 运行时模块（import type 除外）。
 */

import type { PoolLayout } from "../core/types/pool/poolLayout";
import { computePoolGrid } from "./hooks/gridLayout"; // E5.8#37.5：池 grid 唯一推导点（S10）
import TitleBarZone from "./zones/title-bar/TitleBarZone"; // E5.7#5：Phase 2 替换占位
import IconBarZone from "./zones/icon-bar/IconBarZone"; // E5.7#6：Phase 2 替换占位
import StatusBarZone from "./zones/status-bar/StatusBarZone"; // E5.7#8：Phase 2 替换占位
import SidebarZone from "./zones/sidebar/SidebarZone"; // E5.7#10：Phase 3 替换占位
import FloatingLayerHost from "./zones/floating-layer/FloatingLayerHost"; // E5.7#25：Phase 4 浮层 portal 容器（#14 前置）
import MainZone from "./zones/main/MainZone"; // E5.7#20：Phase 5 替换主区占位（MainRenderer 693 行行为零丢失提取）
import PanelZone from "./zones/panel/PanelZone"; // E5.7#21 骨架 + #63.7 数据生产者（贡献路由/动态加载/高度持久化已落地）
import RightSidebarZone from "./zones/right-sidebar/RightSidebarZone"; // E5.7#22：Phase 5 右侧栏骨架（数据生产者归 Phase 12）

function PoolZoneShell({ layout }: { layout: PoolLayout }) {
  // E5.8#37.5：归一化 DTO → 池 grid 唯一推导（列/行模板 + 各 zone grid 放置）。
  // width/height 不进推导（auto 内容驱动——PanelZone 自身根尺寸决定面板行/列大小）。
  // E5.8#43-2：iconBar/sidebar/statusBar 可选（脱出窗子集不推）——sidebar 缺省 edge 兜底 left
  const grid = computePoolGrid({
    sidebarEdge: layout.sidebar?.edge ?? "left",
    panelVisible: layout.panel?.visible === true,
    panelEdge: layout.panel?.edge ?? "bottom",
    panelAlign: layout.panel?.align ?? "center",
  });

  // 参数排除 null——grid.cells.panel 隐藏时为 null（调用处已 guard），其余 zone 恒非空
  const cellStyle = (a: Exclude<(typeof grid.cells)[keyof typeof grid.cells], null>) => ({
    gridRow: `${a.rowStart} / ${a.rowEnd}`,
    gridColumn: `${a.colStart} / ${a.colEnd}`,
  });

  return (
    <div className="pool-root">
      {/* Row 1: TitleBar——E5.7#5（Phase 2） */}
      <TitleBarZone titleBar={layout.titleBar} />

      {/* Row 2: pool-body（#37.5 grid）——IconBar + 左槽 + Main + 右槽（+ 面板行/列） */}
      <div
        className="pool-body"
        style={{ gridTemplateColumns: grid.gridTemplateColumns, gridTemplateRows: grid.gridTemplateRows }}
      >
        {/* IconBar——E5.7#6（Phase 2）：42px 图标列 + 激活高亮 + ☰ 汉堡。恒全高（行跨全）。
            E5.8#43-2：layout.iconBar 缺省（脱出窗子集）→ 不渲染该 cell → auto 列 0 宽（无空列） */}
        {layout.iconBar && (
          <div className="pool-grid-cell" style={cellStyle(grid.cells.iconbar)}>
            <IconBarZone iconBar={layout.iconBar} />
          </div>
        )}

        {/* Sidebar——E5.7#10（Phase 3）：全量哑渲染 zone。
            visible=false → zone 内 display:none（保持挂载，视图状态不丢）。
            #13 分隔线已接入——zone 内 4px handle（乐观本地 + mouseup commit，真相源在壳）。
            #37.5：恒挂载 + grid 放置随 sidebar.edge（左/右槽，swap 规则对边）。
            E5.8#43-2：layout.sidebar 缺省（脱出窗子集）→ 不渲染该 cell → auto 列 0 宽 */}
        {layout.sidebar && (
          <div className="pool-grid-cell" style={cellStyle(grid.cells.sidebar)}>
            <SidebarZone sidebar={layout.sidebar} />
          </div>
        )}

        {/* MainZone——E5.7#20（Phase 5）：MainRenderer 693 行行为零丢失提取（13 项验收）。
            tab bar 收在 panel 内 per-panel GroupTabBar——TabBarZone（#7）已取消。
            #37.5：直接成 grid cell（原 pool-main-column 删）；恒只跨内容行。 */}
        <div className="pool-grid-cell" style={cellStyle(grid.cells.main)}>
          <MainZone groups={layout.groups} root={layout.root} creatableViews={layout.creatableViews} activeGroupId={layout.activeGroupId} />
        </div>

        {/* PanelZone——E5.7#21 骨架 + #63.7 数据生产者：无面板贡献的插件时 layout.panel 缺省
            → 条件渲染永假 = 零 DOM（生产者建好前与建好后行为一致）。#37.5：面板行/列随
            edge/align 推导（隐藏 → 推导 panel cell null + 模板无面板行/列，零 DOM 验收）。 */}
        {layout.panel?.visible && grid.cells.panel && (
          <div className="pool-grid-cell" style={cellStyle(grid.cells.panel)}>
            <PanelZone panel={layout.panel} />
          </div>
        )}

        {/* RightSidebarZone——E5.7#22（Phase 5）：右侧栏骨架（greenfield——数据生产者归 Phase 12）。
            #37.5：真渲染能力（宽度/折叠/展开/handle 镜像）+ grid 放置（swap 规则对边槽）。 */}
        {layout.rightSidebar?.visible && (
          <div className="pool-grid-cell" style={cellStyle(grid.cells.rightSidebar)}>
            <RightSidebarZone rightSidebar={layout.rightSidebar} />
          </div>
        )}
      </div>

      {/* Row 3: StatusBar——E5.7#8（Phase 2）：条目 + Chord + 通知中心。
          E5.8#43-2：layout.statusBar 缺省（脱出窗子集）→ 不渲染该行 */}
      {layout.statusBar && <StatusBarZone statusBar={layout.statusBar} />}

      {/* FloatingLayerHost——#25（Phase 4）：浮层统一容器——始终挂载 + pointer-events: none 默认穿透 */}
      <FloatingLayerHost />
    </div>
  );
}

export default PoolZoneShell;
