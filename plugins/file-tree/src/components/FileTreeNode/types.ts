/**
 * FileTreeNode 的类型契约（E6#87a 从 FileTreeNode.tsx 拆出）。
 */
import type React from "react";
import type { ExplorerItem, FileDecoration } from "../../services/FileTreeModel";

export interface FileTreeNodeProps {
  item: ExplorerItem;
  /** E5.7#60：装饰单独走 prop——item 是引用传递，装饰变更后 memo 浅比较全等会跳过重渲染（徽标永不出现）。
   *  装饰对象每次重查都是新引用 → 有装饰的行随重查重渲染，无装饰的行保持 memo 跳过。 */
  decoration?: FileDecoration;
  depth: number;
  isSelected: boolean;
  /** E4b #97: 键盘焦点——与选中分离，聚焦时有 outline */
  isFocused: boolean;
  expanded: boolean;
  indent: number;
  /** E4a #95c: 紧凑文件夹——压缩路径段 */
  compactedSegments?: string[];
  /** E4V#16: CSS 引导线——本层还有后续兄弟 */
  guide?: boolean;
  /** E4b #99: 拖放——dragStart / dragOver 指示线 */
  isDragSource?: boolean;
  isDragHover?: boolean;
  /** E4b #99k + E4V#16: excluded 文件灰显 */
  isDimmed?: boolean;
  /** 🔥 Ctrl+X 剪切后灰显——对标 VS Code cut 标记 */
  isCut?: boolean;
  /** E4V#35e: 活跃工作区根节点——accent 色加粗 */
  isActiveRoot?: boolean;
  /** E5.8#133.3: 图标主题版本——切换时变化 → React.memo 浅比较不同 → 重渲染走新 resolver。
   *  仅作 memo 触发器（图标在组件体内调 getIconResolver() 现取），不在渲染中读值。 */
  iconThemeId?: string;
  /** E4V#27: 行内重命名——true 时显示 input 替代文件名 */
  isRenaming?: boolean;
  onRenameConfirm?: (uri: string, newName: string) => void;
  onRenameCancel?: () => void;
  onDragStart?: (item: ExplorerItem, e: React.DragEvent) => void;
  /** E4a #95e: 回调传参数（非闭包）→引用稳定→React.memo 生效。
   *  E4V#21: 第二个参数 event——Ctrl+Click 多选 toggle */
  onSelect: (uri: string, event: React.MouseEvent) => void;
  onOpen: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onTwistieClick: (item: ExplorerItem) => void;
  onContextMenu?: (item: ExplorerItem, e: React.MouseEvent) => void;
  /** E5: 开启后点击目录行=toggle 展开/折叠。关闭后只有 twistie 管展开折叠。 */
  expandOnClick?: boolean;
}
