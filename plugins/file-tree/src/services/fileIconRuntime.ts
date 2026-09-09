/**
 * file-tree 文件图标运行时——插件本地状态（单一副本）。E6#69g 归一化铁律。
 *
 * 解析器 + 默认映射表已上移共享（@linkdesk/ui = 壳 src/components/shared/file-icon 单一源码）——
 * file-tree / 壳 windowLayout 文件标签 / 未来编辑类第三方插件同消费同一份。本文件只持本插件的
 * 当前实例态（随 iconTheme:changed 重建），零数据/解析逻辑副本（禁双源）。
 */

import { FileIconResolver } from "@linkdesk/ui";
import type { IconThemeMappings } from "@linkdesk/contracts";

/** 全局默认实例（default 主题 = 壳 codicon 保底） */
let _resolver = new FileIconResolver();

/** 更新图标解析器——图标主题切换时调用（订阅 iconTheme:changed 接线）；undefined → codicon 保底 */
export function updateIconResolver(mappings?: IconThemeMappings): void {
  _resolver = new FileIconResolver(mappings);
}

/** 获取当前生效的图标解析器 */
export function getIconResolver(): FileIconResolver {
  return _resolver;
}
