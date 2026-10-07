/**
 * Pool→shell sidebar action wire contract—E5.7#97.
 *
 * Originally defined in PoolSectionStack.tsx (an internal pool component type), but travels over IPC pool.sidebarAction to the shell
 * (preload-shell → usePoolSync → ViewContainerService)—a cross-stack protocol, consolidated into this directory.
 */

export interface SidebarAction {
  action: "reorder" | "setCollapsed" | "setVisible" | "toggleSidebarCollapse" | "setSidebarWidth";
  containerId?: string;
  viewId?: string;
  /** E5.8#41.9.2: setCollapsed composite-key persistence—the pool-side view carries its own pluginId (SidebarViewMeta), so the shell addresses the same-named view precisely */
  pluginId?: string;
  newIndex?: number;
  collapsed?: boolean;
  visible?: boolean;
  /** E5.7#13: divider drag commit—resizeZone("sidebar", width). Added in E5.7#97 (the original contract missed this variant) */
  width?: number;
}
