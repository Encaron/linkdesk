/**
 * FileTreeKeyboard——键盘导航 + type-ahead 字母跳转（门面）。
 * E4b #97：对标 VS Code List Widget（listWidget.ts）的 onKeyDown + typeController。
 *
 * 关键行为：
 *   ArrowUp/Down → 移动焦点（不改选中）
 *   ArrowLeft → 折叠已展开目录，否则跳转到父节点
 *   ArrowRight → 展开已折叠目录，否则跳转到首个子节点
 *   Home/End → 首/尾
 *   Enter → 选中并打开聚焦项
 *   Space → 展开/折叠目录
 *   type-ahead → 1s 窗口内累积字符 → 跳到匹配文件名（大小写不敏感）
 *
 * 原 268 行单文件按件拆出（E6#87a）：`types.ts` / `scrollToItem.ts` / `typeAhead.ts` / `navigation.ts`。
 * ⚠️ 拆的是归属不是时序——type-ahead 的 1s 窗口与累积 buffer 语义逐字搬运。
 */

import { useCallback } from "react";
import { useClipboardKeys } from "@linkdesk/ui"; // E6#15h：useClipboardKeys 收 @linkdesk/ui 零件（08-共享hook归位.md）
import { useTypeAhead } from "./typeAhead";
import { handleNavKey } from "./navigation";
import type { KeyboardCallbacks, KeyboardState } from "./types";

export type { FlatItem } from "../../utils/pathUtils";
export { scrollToItem } from "./scrollToItem";
export type { KeyboardState, KeyboardCallbacks } from "./types";

export function useFileTreeKeyboard(
  state: KeyboardState,
  callbacks: KeyboardCallbacks,
): (e: React.KeyboardEvent) => void {
  /* ── E5.8#24.8.3：Ctrl+C/V/X——文件树剪贴板（机制归一共享 hook）──
   * 壳级剪贴板键已删（E5.8#24.8.1，主进程无条件 preventDefault 吞键修因）——
   * 文件树按「插件自己的键」自监听（对标 VS Code explorer 键盘复制/粘贴）。
   * 焦点感知天然成立：本 hook 挂在容器 onKeyDown + tabIndex=0——只有文件树
   * 容器聚焦才收到事件；Monaco/其他池内控件聚焦时本组件不接收，原生键不受影响。
   * 重命名输入框 InlineInput 已 stopPropagation——打字时 Ctrl+C/V/X 不冒泡到容器。
   * 语义回调复用右键命令（explorer.copy/cut/paste）——无参时自动回退 selection/focused，
   * 内置系统剪贴板写入（writeFileList CF_HDROP + 纯文本 fallback）+ cut 灰显标记。 */
  const handleClipboard = useClipboardKeys({
    onCopy: () => window.linkdesk?.commands?.executeCommand?.("explorer.copy"),
    onCut: () => window.linkdesk?.commands?.executeCommand?.("explorer.cut"),
    onPaste: () => window.linkdesk?.commands?.executeCommand?.("explorer.paste"),
  });

  const handleTypeAhead = useTypeAhead(state, callbacks);

  /** 主键盘处理器 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { flatItems, focusedUri } = state;
      if (flatItems.length === 0) return;

      const currentIdx = flatItems.findIndex((f) => f.item.uri === focusedUri);
      const idx = currentIdx === -1 ? 0 : currentIdx;
      const fi = flatItems[idx].item;

      // E5.8#24.8.3：剪贴板键——机制归一在 useClipboardKeys（命中 → 已消费，不继续走导航）
      if (handleClipboard(e)) return;

      handleNavKey(e, idx, fi, state, callbacks, handleTypeAhead);
    },
    [state, callbacks, handleTypeAhead, handleClipboard],
  );

  return handleKeyDown;
}
