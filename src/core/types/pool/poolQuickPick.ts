/**
 * Pool QuickPick 哑渲染数据——E5.7#15（浮层归一化设计.md §5）。
 *
 * 聪慧→哑数据流：壳 QuickPickService 序列化（显示文本铁律——全部壳侧 t() 解析后推送），
 * 池 QuickPickHost 纯渲染 + 本地模糊过滤——不 import @src/core（Path B）。
 * 动作（select/highlight/close/itemAction）按 key 回传，壳侧重解析原始 item 执行回调。
 */

/** 行内操作按钮——池哑渲染，点击回传 actionId */
interface PoolQuickPickButton {
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
  /** E5.8#32：已激活项勾选标记——label 左侧 ✓。undefined = 无勾选（通用 QuickPick 不受影响）；true/false = 渲染固定占位保对齐 */
  checked?: boolean;
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

/* ── E5.7#63：插件 quickPick API——linkdesk.quickPick.show(opts) → Promise<item | undefined> ── */

/** 插件侧条目——对标 VS Code QuickPickItem 三字段（label 第一行左 / description 第一行右 / detail 第二行左） */
export interface PluginQuickPickItem {
  label: string;
  /** 第一行右 */
  description?: string;
  /** 第二行左 */
  detail?: string;
}

/** 插件侧 show() 选项——v1 最小面：items + 输入框占位/前缀（buttons/onHighlight 留待消费方出现） */
export interface PluginQuickPickOptions {
  items: PluginQuickPickItem[];
  placeholder?: string;
  prefix?: string;
}

/**
 * 插件 quickPick 请求——preload show() 经 contextBridge 函数代理桥接给池 QuickPickHost 的形状。
 * 池内本地桥（零 IPC）：Promise resolve 的正是 opts.items 里的原对象（身份保持，非序列化副本）。
 */
export interface PluginQuickPickRequest {
  opts: PluginQuickPickOptions;
}
