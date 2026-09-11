/**
 * FileTreeContextMenu——门面（聚合器入口）。
 *
 * 原 536 行单文件按职责拆三件（E6#87a）：
 *   - `host-bridge.ts`  宿主桥接（`_handleRef` / `_openFileFn` 模块级 mutable 单一属主）
 *   - `commands.ts`     命令 + 菜单项注册（`_registered` / `_selectedForCompare` 单一属主）
 *   - `Menu.tsx`        菜单组件本体
 *
 * 消费方（FoldersView）import 路径零变更——`"../components/FileTreeContextMenu"` 命中本文件。
 */
export { default } from "./Menu";
export { activateFileTreeContextMenu } from "./commands";
export { setFileTreeHandleRef, clearFileTreeHandle, setOpenFileFn } from "./host-bridge";
export type { OpenFileFn } from "./host-bridge";
