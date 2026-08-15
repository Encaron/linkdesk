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
