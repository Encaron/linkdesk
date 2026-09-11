/**
 * FoldersView 的类型契约（E6#87a 从 FoldersView.tsx 拆出）。
 */

// E5.7#55：WorkspaceFolder 类型 import 已摘——插件不 import @src/core（构建边界，preload 同款原则）。
// DTO 形状与 src/core/services/layout/WorkspaceService.ts:23 对齐（{ uri, name, index }）——
// #97 wire DTO 契约类型落地后此本地接口换 ambient 全局类型。
export interface WorkspaceFolderDto {
  uri: string;
  name: string;
  index: number;
}
