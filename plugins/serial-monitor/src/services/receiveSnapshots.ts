/**
 * 合屏迁移快照——E5.8#30.14（P4），E6#87b 从 src/index.tsx 搬出（只搬不改）。
 *
 * 方向 c（P4 拍板）：不走会话级持久化（太重）也不走跨组 keep-alive（违背 B22）。
 * 只快照接收区内容（CM6 行 + RingBuffer），连接状态靠 _initOnce 自动恢复。
 * 生命周期：unmount cleanup 写（会话仍在才写，会话已删不写防泄漏）→ 下次 mount 读 + 立即删。
 *
 * 🔴 模块级 mutable 单一属主：`_receiveSnapshots` 只在本文件声明。
 */

import type { EditorView } from "@codemirror/view";
import type { LineType, ReceiveItem } from "../types";
import { lineDecoField } from "../cm6/decorations";

export interface ReceiveSnapshot {
  lines: { text: string; type: LineType }[];
  hexLines: { text: string; type: LineType }[];
  ring: ReceiveItem[];
}

/** key = sourceId（会话 id）。同一会话跨组移动共享——合并写入，mount 即删。 */
export const _receiveSnapshots = new Map<string, ReceiveSnapshot>();

/** 提取 CM6 每行文本 + 行色——lineDecoField 行装饰的 cls（cm-line-<color>）映射回类型。 */
export function snapshotCmLines(view: EditorView): { text: string; type: LineType }[] {
  const doc = view.state.doc;
  const decos = view.state.field(lineDecoField);
  const typeAt = new Map<number, LineType>();
  decos.between(0, doc.length, (from, _to, deco) => {
    const cls = deco.spec?.class as string | undefined;
    if (cls === "cm-line-received") typeAt.set(from, "received");
    else if (cls === "cm-line-sent") typeAt.set(from, "sent");
    else if (cls === "cm-line-system") typeAt.set(from, "system");
  });
  const lines: { text: string; type: LineType }[] = [];
  // CM6 6.7.1 的 Text 无 forEachLine（运行期 + 类型都 MISSING）——用 iterLines() 迭代器。
  // iterLines 产出每行文本字符串（不含换行符），行起始位 from 需手动累加（+1 = 换行；末行无换行越界 1 无害——之后不再查 from）。
  let from = 0;
  for (const text of doc.iterLines()) {
    lines.push({ text, type: typeAt.get(from) ?? "received" });
    from += text.length + 1;
  }
  return lines;
}
