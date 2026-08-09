/**
 * PoolLayout 类型定义——E5.6#8a。
 *
 * 壳与池共享的布局协议。壳推送 PoolLayout JSON 到池，
 * 池解析后渲染 SidebarRenderer / MainRenderer。
 *
 * 兼容性：池忽略不认识的字段，壳加字段不破坏旧池。
 */

/** 侧栏布局——仅 SidebarPool 接收 */
export interface SidebarLayout {
  visible: boolean;
  width: number;
  viewId: string | null;
}

/** 标签页在池中的表示——壳 pushLayout 时序列化 */
export interface PoolTab {
  id: string;
  pluginId: string;
  title: string;
  sourceId?: string;
  dirty?: boolean;
}

/** 分屏组——每个 group 占一个 flex 区域，内含 N 个 keep-alive 标签页 */
export interface PoolGroup {
  id: string;
  flex: number;
  activeTabId: string;
  tabs: PoolTab[];
}

/** PoolLayout——壳推给池的完整布局快照 */
export interface PoolLayout {
  sidebar?: SidebarLayout;
  groups: PoolGroup[];
}
