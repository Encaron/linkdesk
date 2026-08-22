/**
 * 池→壳侧栏动作 wire 契约——E5.7#97。
 *
 * 原定义在 PoolSectionStack.tsx（池组件内部类型），但走 IPC pool.sidebarAction 到壳
 * （preload-shell → usePoolSync → ViewContainerService）——跨堆协议，归口本目录。
 */

export interface SidebarAction {
  action: "reorder" | "setCollapsed" | "setVisible" | "toggleSidebarCollapse" | "setSidebarWidth";
  containerId?: string;
  viewId?: string;
  /** E5.8#41.9.2：setCollapsed 复合键持久化——池侧 view 自带 pluginId（SidebarViewMeta），壳侧精确寻址同名视图 */
  pluginId?: string;
  newIndex?: number;
  collapsed?: boolean;
  visible?: boolean;
  /** E5.7#13：分隔线拖拽 commit——resizeZone("sidebar", width)。E5.7#97 补入（原契约漏此变体） */
  width?: number;
}
