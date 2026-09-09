/**
 * 对话框 wire 契约——E5.7#97。
 *
 * 曾双份定义：linkdesk-api.ts（E5.7#73 插件侧）与 dialog-handlers.ts 内联结构体
 * 手工对齐——一边改另一边静默失效。本模块一处定义：
 * 插件 API re-export（保持既有 import 路径）+ preload + 主进程三端 import type。
 */

export interface DialogOpenOptions {
  title?: string;
  /** true = 选目录，默认选文件 */
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

/** E6#71c 富内容确认打开参数——池插件 → 壳 DialogService（content 视图声明寻址）。
 *  title/message 兜底——content 视图解析失败时壳回落纯文字确认（弹窗仍出，不静默死）。 */
export interface DialogContentOpenOptions {
  /** 兜底标题——content 解析失败回落用；池侧已 t() 解析 */
  title?: string;
  /** 兜底正文——同上 */
  message?: string;
  /** 内容归属插件（壳经 ViewContainerService.getView 复合寻址） */
  pluginId: string;
  /** 内容视图声明 id（contributes.views 注册） */
  viewId: string;
  /** 不透明载荷——结构克隆过 IPC，壳不解释，内容视图经 dialogHost.current() 读 */
  payload?: unknown;
}
