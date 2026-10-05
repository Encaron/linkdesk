/**
 * OpenWithPicker 类型面——共享件（`@linkdesk/ui` 单实例供给，硬约束 16）。
 *
 * 户口 = **共享件**（案 10/01 §三）：本件消费的全是**宿主声明**（插件清单 / 文件关联声明 /
 * 覆盖表），按判据 A「一个控件的用途若是消费宿主声明，必须住在声明方与渲染方都够得着的地方」
 * 它属于壳 + 共享层，⛔ 不得住在任何可被用户卸载的插件里（原住 file-tree ⇒ 卸载 file-tree 后
 * 设置页入口与编辑器按钮一并消失——本纠正案的命门 C1.5）。
 *
 * 🔴 数据形状的**唯一真相源在 `@linkdesk/contracts`**（`OpenWithRequest`/`OpenWithHandler`
 * 同时是壳命令 `SHELL_COMMANDS.openWith` 的公开入参/出参面，见案 04 §二）——此处只再导出，
 * ⛔ 不在共享件里另立一份（防漂移重演）。
 */
import type { OpenWithHandler, OpenWithRequest } from "@linkdesk/contracts";

export type { OpenWithHandler, OpenWithRequest };

/**
 * 面板 props——**纯 props in / events out**（照 `PluginCard`：零 `@/core` import、零数据知识）。
 * 数据由调用方（壳命令 `workbench.action.openWith`）组装后喂入；面板 ⛔ 不查 registry、
 * ⛔ 不取插件表、⛔ 不解析 uri（`ext` 由壳侧 `normalizeExt` 单一真相源算好）。
 */
export interface OpenWithPickerProps {
  /** 文件身份：`uri`（右键/编辑器入口）与 `ext`（设置页「按类型打开」）至少给一个 */
  request: OpenWithRequest;
  /** 处理器行——壳侧装配产出（含 `title` 处理器名 / `typeLabel` 类型名 / `manifest` 身份图） */
  handlers: OpenWithHandler[];
  /** 「打开（仅此一次）」 */
  onOpenOnce: (pluginId: string) => void;
  /** 「设为默认」/「恢复自动」——`null` = 恢复自动（删覆盖表该键） */
  onSetDefault: (pluginId: string | null) => void;
  /** 空态那颗「在市场搜索阅读器」 */
  onSearchMarket: () => void;
  onClose: () => void;
}
