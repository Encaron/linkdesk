/**
 * PoolZoneShell——E5.7#3。Pool 唯一根组件。
 *
 * 替代 E5.6 pool-main.tsx 的 RENDERERS zone 分发——单入口，无 ?zone= 路由。
 * flex column 全窗口布局（设计 §6.1）：
 *   Row 1: TitleBarZone
 *   Row 2: IconBarZone + SidebarZone(+ResizeHandle) + Main 列(MainZone + PanelZone) + RightSidebarZone
 *   Row 3: StatusBarZone
 *   FloatingLayerHost（#25，Phase 4 接入——portal root 就绪前不 import）
 *
 * 🔴 占位策略（E5.7#3）：Phase 1 所有 zone 用占位 div——
 *   Phase 2 替换 TitleBar(#5 ✅)/IconBar(#6 ✅)/StatusBar(#8 ✅)，
 *   Phase 3 替换 SidebarZone(#10 ✅) + 侧栏分隔线(#13 ✅——4px handle 收在 SidebarZone 内，
 *   非 PoolZoneShell 独立兄弟组件——可见性不变量：visible=false 随 zone 整体 display:none)，
 *   Phase 4 接入 FloatingLayerHost(#25 ✅——#14 前置 portal root 就绪)，
 *   Phase 5 替换 MainZone(#20 ✅)/PanelZone(#21 ✅)/RightSidebarZone(#22 ✅)。
 *   占位时代终结——Phase 5 收官后所有 zone 均为真实组件（占位 CSS 随 index.css 删除）。
 *   不允许 import 尚不存在的 Zone 组件（每 Phase 结束必须 tsc 零错误 + 应用可启动）。
 *
 * 🔴 Path B：池 = 哑渲染器。不 import 任何 @src/core/* 运行时模块（import type 除外）。
 */

import type { PoolLayout } from "../core/types/pool/poolLayout";
import TitleBarZone from "./zones/title-bar/TitleBarZone"; // E5.7#5：Phase 2 替换占位
import IconBarZone from "./zones/icon-bar/IconBarZone"; // E5.7#6：Phase 2 替换占位
import StatusBarZone from "./zones/status-bar/StatusBarZone"; // E5.7#8：Phase 2 替换占位
import SidebarZone from "./zones/sidebar/SidebarZone"; // E5.7#10：Phase 3 替换占位
import FloatingLayerHost from "./zones/floating-layer/FloatingLayerHost"; // E5.7#25：Phase 4 浮层 portal 容器（#14 前置）
import MainZone from "./zones/main/MainZone"; // E5.7#20：Phase 5 替换主区占位（MainRenderer 693 行行为零丢失提取）
import PanelZone from "./zones/panel/PanelZone"; // E5.7#21 骨架 + #63.7 数据生产者（贡献路由/动态加载/高度持久化已落地）
import RightSidebarZone from "./zones/right-sidebar/RightSidebarZone"; // E5.7#22：Phase 5 右侧栏骨架（数据生产者归 Phase 12）

function PoolZoneShell({ layout }: { layout: PoolLayout }) {
  return (
    <div className="pool-root">
      {/* Row 1: TitleBar——E5.7#5（Phase 2） */}
      <TitleBarZone titleBar={layout.titleBar} />

      {/* Row 2: IconBar + Sidebar + Main 列 + RightSidebar */}
      <div className="pool-body">
        {/* IconBar——E5.7#6（Phase 2）：42px 图标列 + 激活高亮 + ☰ 汉堡 */}
        <IconBarZone iconBar={layout.iconBar} />

        {/* Sidebar——E5.7#10（Phase 3）：全量哑渲染 zone。
            visible=false → zone 内 display:none（保持挂载，视图状态不丢）。
            #13 分隔线已接入——zone 内 4px handle（乐观本地 + mouseup commit，真相源在壳） */}
        <SidebarZone sidebar={layout.sidebar} />

        {/* 主区列：MainZone + PanelZone */}
        <div className="pool-main-column">
          {/* MainZone——E5.7#20（Phase 5）：MainRenderer 693 行行为零丢失提取（13 项验收）。
              tab bar 收在 panel 内 per-panel GroupTabBar——TabBarZone（#7）已取消。
              数据 = PoolLayout v2 的 groups / root / creatableViews 切片。 */}
          <MainZone groups={layout.groups} root={layout.root} creatableViews={layout.creatableViews} activeGroupId={layout.activeGroupId} />

          {/* PanelZone——E5.7#21 骨架 + #63.7 数据生产者：无面板贡献的插件时 layout.panel 缺省
              → 条件渲染永假 = 零 DOM（生产者建好前与建好后行为一致） */}
          {layout.panel?.visible && <PanelZone panel={layout.panel} />}
        </div>

        {/* RightSidebarZone——E5.7#22（Phase 5）：右侧栏骨架（greenfield——数据生产者归 Phase 12） */}
        {layout.rightSidebar?.visible && <RightSidebarZone rightSidebar={layout.rightSidebar} />}
      </div>

      {/* Row 3: StatusBar——E5.7#8（Phase 2）：条目 + Chord + 通知中心 */}
      <StatusBarZone statusBar={layout.statusBar} />

      {/* FloatingLayerHost——#25（Phase 4）：浮层统一容器——始终挂载 + pointer-events: none 默认穿透 */}
      <FloatingLayerHost />
    </div>
  );
}

export default PoolZoneShell;
