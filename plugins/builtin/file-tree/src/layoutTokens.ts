/**
 * 布局 Token——CSS/JS 单一真相来源。
 * E4 品质加固：消除 JS 硬编码 22/16 与 CSS var(--tree-*) 之间的隐性耦合。
 *
 * 🔥 修改规则：改值改此文件→CSS 变量同步改（file-tree.css .file-tree-root）。
 */

/** 树节点行高——同步 CSS: --tree-item-height */
export const TREE_ITEM_HEIGHT = 22;

/** 每层缩进——同步 CSS: --tree-indent */
export const TREE_INDENT = 16;

/** 虚拟滚动预渲染行数 */
export const OVERSCAN = 10;
