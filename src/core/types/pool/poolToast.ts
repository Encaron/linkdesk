/**
 * Pool Toast 哑渲染数据——E5.7#16（浮层归一化设计.md §6）。
 *
 * 聪慧→哑数据流：壳 toast 服务序列化（显示文本铁律——message/source 已由壳侧 t() 解析，
 * icon 已解析成 codicon 类名），池 ToastHost 纯渲染。
 * 动作（dismiss/action）按 id + actionId 回传，壳侧重解析原始 Toast 执行 onClick 回调。
 */

/** 行内操作按钮——onClick 闭包留在壳，池只回传 actionId（位置序号）。
 *  E5.8#20-c：改名 PoolToastButton——与 poolActions.ts PoolToastAction（IPC 回传动作）同名，
 *  契约平铺进单文件会声明合并成幽灵复合型；按钮描述型用 Button 后缀消歧。 */
interface PoolToastButton {
  /** 位置序号字符串——壳按 actions[Number(actionId)] 重解析 onClick */
  actionId: string;
  label: string;
  isPrimary?: boolean;
}

export interface PoolToastItem {
  id: string;
  message: string;
  /** 壳侧已解析的图标类（codicon + severity 类）——池原样渲染 */
  iconClass: string;
  /** 壳侧已 t() 解析的 "来源: xxx"——池原样渲染 */
  sourceText?: string;
  actions?: PoolToastButton[];
}

export interface PoolToastData {
  toasts: PoolToastItem[];
  /** NotificationCenter 打开时壳推 true——池整体隐藏（对标壳 ToastContainer） */
  suppressed: boolean;
}
