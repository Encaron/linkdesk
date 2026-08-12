/**
 * 壳布局常量——App.tsx + SplitHandles 共用。
 * E5.6#22——消除 TITLE_BAR_HEIGHT/HANDLE_WIDTH 重复定义。
 */

/** Electron 窗口标题栏高度——所有 Pool WebContentsView + fixed 定位元素需偏移此值 */
export const TITLE_BAR_HEIGHT = 30;

/** Pool 之间分隔线宽度——WebContentsView 留缝 = 壳 DOM handle 宽度 */
export const HANDLE_WIDTH = 4;
