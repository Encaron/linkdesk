/**
 * Pool QuickPick 哑渲染数据——E5.7#15（浮层归一化设计.md §5）。
 *
 * 聪慧→哑数据流：壳 QuickPickService 序列化（显示文本铁律——全部壳侧 t() 解析后推送），
 * 池 QuickPickHost 纯渲染 + 本地模糊过滤——不 import @src/core（Path B）。
 * 动作（select/highlight/close/itemAction）按 key 回传，壳侧重解析原始 item 执行回调。
 */

/** 行内操作按钮——池哑渲染，点击回传 actionId */
export interface PoolQuickPickButton {
  /** 动作 ID——壳 onItemAction(item, actionId) 执行 */
  actionId: string;
  /** codicon 图标名（不含 "codicon-" 前缀） */
  icon: string;
  tooltip?: string;
}

export interface PoolQuickPickItem {
  /** getKey(item)——壳侧动作重解析的唯一键 */
  key: string;
  /** getSearchText(item)——池本地模糊匹配 */
  searchText: string;
  /** 第一行左——已 t() 解析 */
  label: string;
  /** 第一行右——已 t() 解析 */
  category?: string;
  /** 第二行左——已 t() 解析 */
  detail?: string;
  /** 快捷键 "ctrl+shift+p" 形式——池渲染 keycap pill（哑） */
  keybinding?: string;
  /** 行内操作按钮 */
  buttons?: PoolQuickPickButton[];
}

export interface PoolQuickPickData {
  open: boolean;
  placeholder: string;
  prefix?: string;
  items: PoolQuickPickItem[];
}
