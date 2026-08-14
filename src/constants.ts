/**
 * 壳布局常量——App.tsx + SplitHandles 共用。
 * E5.6#22——消除 TITLE_BAR_HEIGHT/HANDLE_WIDTH 重复定义。
 */

/** Electron 窗口标题栏高度——所有 Pool WebContentsView + fixed 定位元素需偏移此值 */
export const TITLE_BAR_HEIGHT = 30;

/** Pool 之间分隔线宽度——WebContentsView 留缝 = 壳 DOM handle 宽度 */
export const HANDLE_WIDTH = 4;

/**
 * 全局浮层 z-index 层级表——E5.7#26（浮层归一化设计.md §3）。
 * 全部代码用 Z_INDEX.xxx 常量引用，禁止裸数字。
 * 层级：拖拽 UI（100-1000）< 浮层（2000-6000）——浮层永远盖住池内容。
 */
export const Z_INDEX = {
  splitHandle: 100,          // 分屏分隔线拖拽手柄
  panelResizeHandle: 200,    // 面板拖拽尺寸手柄
  dragPreview: 500,          // 标签页拖拽预览
  dropZone: 1000,            // 分屏拖拽预览（Glassmorphism 内发光）
  toast: 2000,               // Toast 通知
  contextMenu: 3000,         // 右键菜单
  quickPick: 4000,           // 命令面板 / QuickPick
  dialog: 5000,              // 对话框 / Modal
  tooltip: 6000,             // 工具提示
} as const;
