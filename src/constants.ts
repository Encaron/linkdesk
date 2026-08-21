/**
 * 全局浮层 z-index 层级表——E5.7#26（浮层归一化设计.md §3）。
 * E5.8#2：TITLE_BAR_HEIGHT/HANDLE_WIDTH 已删——E5.7 后 titlebar 是池内 zone，
 * 壳无需高度/分隔线偏移（SplitHandles 随 E5.7#31 整删，仅剩注释残留）。
 * 全部代码用 Z_INDEX.xxx 常量引用，禁止裸数字。
 * 层级：拖拽 UI（100-1000）< 浮层（2000-6000）——浮层永远盖住池内容。
 */
export const Z_INDEX = {
  splitHandle: 100,          // 分屏分隔线拖拽手柄
  panelResizeHandle: 200,    // 面板拖拽尺寸手柄
  dragPreview: 500,          // 标签页拖拽预览
  dropZone: 1000,            // 分屏拖拽预览（Glassmorphism 内发光）
  // E5.8#37（Phase 8 类型 B）：壳内悬浮面板——右键 3000/QuickPick 4000/Dialog 5000/Toast 2000 全盖面板；
  // 面板盖池内容 + 拖拽预览（dropZone 1000）。I8-12。
  floatingPanel: 1500,
  toast: 2000,               // Toast 通知
  contextMenu: 3000,         // 右键菜单
  quickPick: 4000,           // 命令面板 / QuickPick
  dialog: 5000,              // 对话框 / Modal
  tooltip: 6000,             // 工具提示
} as const;
