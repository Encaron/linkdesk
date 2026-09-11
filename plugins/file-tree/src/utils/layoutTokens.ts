/**
 * 布局 Token——CSS/JS 单一真相来源。
 * E4 品质加固：消除 JS 硬编码 22/16 与 CSS var(--tree-*) 之间的隐性耦合。
 *
 * 🔥 修改规则：改值改此文件→CSS 变量同步改（styles/file-tree-shell.css `.file-tree-root`）。
 * E5.8 Phase 12 #172：行高基准 22→26（⑥ 拍板）+ 运行时桥（F2）——TS 读 `app.uiFontScale`
 * 算 `26×scale`，与 CSS `calc(26px * var(--ui-scale))` 精确一致。CSS 侧行高/盒全走
 * `calc(Npx * var(--ui-scale))`，JS 侧虚拟滚动/DnD/键盘定位全走 getScaledTreeItemHeight()。
 */

/** 树节点行高（基准 px，⑥ 拍板 22→26：14px name + 16px icon 在 26px 行 5px 上下呼吸）——同步 CSS: --tree-item-height */
export const TREE_ITEM_HEIGHT = 26;

/** 全局字号比例缓存（100 = 1.0×）——FileTree 组件装载 app.uiFontScale 并订阅变更（F2 运行时桥） */
let _uiFontScale = 100;
export function setUiFontScale(v: number): void { _uiFontScale = v; }

/** 运行时行高 = 26 × (uiFontScale/100)——与 CSS `calc(26px * var(--ui-scale))` 精确一致（F2）。
 * 虚拟滚动（startIndex/visibleCount/totalHeight）、DnD 落点、键盘滚动定位三处消费方共用。 */
export function getScaledTreeItemHeight(): number {
  return (TREE_ITEM_HEIGHT * _uiFontScale) / 100;
}

/** 每层缩进——同步 CSS: --tree-indent */
export const TREE_INDENT = 16;

/** 虚拟滚动预渲染行数 */
export const OVERSCAN = 10;
