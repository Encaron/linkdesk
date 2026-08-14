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
 *   Phase 5 替换 MainZone(#20)/PanelZone(#21)/RightSidebarZone(#22)。
 *   不允许 import 尚不存在的 Zone 组件（每 Phase 结束必须 tsc 零错误 + 应用可启动）。
 *
 * 🔴 Path B：池 = 哑渲染器。不 import 任何 @src/core/* 运行时模块（import type 除外）。
 */

import { useTranslation } from "react-i18next";
import type { PoolLayout } from "../core/types/poolLayout";
import TitleBarZone from "./zones/TitleBarZone"; // E5.7#5：Phase 2 替换占位
import IconBarZone from "./zones/IconBarZone"; // E5.7#6：Phase 2 替换占位
import StatusBarZone from "./zones/StatusBarZone"; // E5.7#8：Phase 2 替换占位
import SidebarZone from "./zones/SidebarZone"; // E5.7#10：Phase 3 替换占位

function PoolZoneShell({ layout }: { layout: PoolLayout }) {
  const { t } = useTranslation();

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
          {/* MainZone——Phase 5 #20 替换（tab bar 在 MainZone 内——TabBarZone 已取消） */}
          <div className="zone-placeholder zone-main">
            {t("主区（占位）")}
          </div>

          {/* PanelZone——Phase 5 #21 替换 */}
          {layout.panel?.visible && (
            <div className="zone-placeholder zone-panel" style={{ height: layout.panel.height }}>
              {t("底部面板（占位）")}
            </div>
          )}
        </div>

        {/* RightSidebar——Phase 5 #22 替换 */}
        {layout.rightSidebar?.visible && (
          <div className="zone-placeholder zone-right-sidebar" style={{ width: layout.rightSidebar.width }}>
            {t("右侧栏（占位）")}
          </div>
        )}
      </div>

      {/* Row 3: StatusBar——E5.7#8（Phase 2）：条目 + Chord + 通知中心 */}
      <StatusBarZone statusBar={layout.statusBar} />

      {/* FloatingLayerHost——#25（Phase 4）接入：始终挂载 + pointer-events: none（设计 §6.5） */}
    </div>
  );
}

export default PoolZoneShell;
