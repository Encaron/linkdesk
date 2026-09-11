/**
 * commands——文件树命令 + 菜单项注册（门面，独立于 UI）。
 *
 * 对标 VS Code explorerViewer.ts 的 explorerContextMenu。
 * 设计文档：docs/02-Electron架构/E4_文件树与编辑器_暂定/02-E4b-文件树交互.md §二 #96
 *
 * 原 438 行单文件按命令组分件（E6#87a 二次拆分——`components/**` 档 150，不分扩展名）：
 *   - `shared.ts`     共用件（FileMenuContext / placeholder / refreshDirSafe）
 *   - `navigation.ts` 打开 / 定位 / 搜索 / 工作区
 *   - `clipboard.ts`  剪切 / 复制 / 粘贴 / 复制路径
 *   - `files.ts`      新建 / 刷新 / 重命名 / 删除
 *   - `compare.ts`    Diff 比较（🔴 `_selectedForCompare` 单一属主）
 *   - `menuItems.ts`  菜单项注册（FileContext + MenuBar）
 *
 * 🔴 **模块级 mutable 单一属主**：`_registered` 全仓仅在本文件声明。
 */
import { registerClipboardCommands } from "./clipboard";
import { registerNavigationCommands } from "./navigation";
import { registerFileCommands } from "./files";
import { registerCompareCommands } from "./compare";
import { registerFileTreeMenuItems } from "./menuItems";

let _registered = false;

/** 注册 explorer 命令到 CommandRegistry + 右键菜单项到 "FileContext"。幂等。 */
export function activateFileTreeContextMenu(): void {
  if (_registered) return;
  _registered = true;

  // ── 注册命令（占位 handler——后续任务逐步替换） ──
  // 新增命令（不在 plugin.json contributes.commands 中——此处是唯一注册点）
  registerClipboardCommands();
  registerNavigationCommands();
  registerFileCommands();
  registerCompareCommands();

  // ── 注册菜单项 ──
  registerFileTreeMenuItems();
}
