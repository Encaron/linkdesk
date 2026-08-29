/**
 * TabContentLayer——E5.8#141：tab 视图保活层。
 * 所有标签页内容提升到 .main-zone 根级平级渲染（key=tab.id 永远同级），跨 group 移动
 * 只改「定位 rect + 显隐判定」，不改 DOM 位置 → 任何分屏/合屏/拖拽移动零 remount。
 * 对标 B22 面板平级思想推广到 tab 层：Monaco/CM6/Settings 内部状态跨组移动全保留
 * （根因：#141 用户实机——右键设置 tab 分屏，设置 tab 物理移新面板 → SettingsView 重挂载 → selectedGroup 归零跳「通用」）。
 * 单面板 fallback 同样走本层（rect = 0,0,100,100）→ 单↔多面板切换 tab 内容零迁移。
 * 依赖方向：TabContentLayer → shared + core types；无反向。
 */

import ErrorBoundary from "../../../shared/error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import ShellViewRenderer from "../../../views/shell-renderer/ShellViewRenderer";
import PluginComponent from "../../../shared/plugin-component/PluginComponent";
import type { PoolTab } from "../../../../core/types/pool/poolLayout";
import type { PanelRect } from "./layout";
import { TAB_BAR_HEIGHT } from "./layout";

export interface TabContentItem {
  tab: PoolTab;
  /** 所属 group（focusGroup 目标——tab 内容区是面板 div 的兄弟，不再冒泡到面板 onMouseDown） */
  groupId: string;
  /** 所属面板 rect（百分比坐标系，含标签栏区域）——跨组移动只改此项 */
  rect: PanelRect;
  /** 是否所属 group 的 activeTab——display 显隐（keep-alive：非活跃 tab 仍在 DOM） */
  visible: boolean;
  /** 所属 group 聚焦 && 本 tab 活跃——E5.8#30.15（P5）isActive 单聚焦判定 */
  focused: boolean;
}

interface TabContentLayerProps {
  items: TabContentItem[];
  creatableViews?: { pluginId: string; label: string }[];
  onPaneMouseDown: (groupId: string) => void;
}

export default function TabContentLayer({ items, creatableViews, onPaneMouseDown }: TabContentLayerProps) {
  return (
    <>
      {items.map(({ tab, groupId, rect, visible, focused }) => (
        <div
          key={tab.id}
          data-tab-content-id={tab.id}
          style={{
            position: "absolute",
            left: `${rect.x}%`,
            top: `${rect.y}%`,
            width: `${rect.w}%`,
            height: `${rect.h}%`,
            display: visible ? "block" : "none",
            // 🔴 外层仅定位——pointer-events:none 穿透，否则盖住面板 div 的 tab bar（兄弟且 DOM 在后 → 挡住标签栏鼠标事件）
            pointerEvents: "none",
          }}
        >
          {/* 内容区从标签栏下方开始（tab bar 由面板层 GroupPane 渲染）——absolute + TAB_BAR_HEIGHT 精确对齐 */}
          <div
            onMouseDown={() => onPaneMouseDown(groupId)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: TAB_BAR_HEIGHT,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              pointerEvents: "auto",
            }}
          >
            {tab.shellRendered ? (
              <ErrorBoundary pluginId={tab.pluginId}>
                <ShellViewRenderer
                  tab={tab}
                  // E5.8#30.15（P5）：isActive 单聚焦——仅聚焦面板的活跃标签（对标 VS Code）
                  isActive={focused}
                  creatableViews={creatableViews}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary pluginId={tab.pluginId}>
                <PluginComponent
                  pluginId={tab.pluginId}
                  tabId={tab.id}
                  sourceId={tab.sourceId}
                  isActive={focused}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
