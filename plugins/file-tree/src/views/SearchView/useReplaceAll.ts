/**
 * useReplaceAll——「全部替换」状态与执行（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import { useState, useCallback } from "react";
// E6#73m K3：失败走本插件唯一出口（同 FileTreeDnD / FileTreeContextMenu）——不再只写 console
import { notifyFailure, errText, nameOf, type FailureItem } from "../../services/FileTreeNotify";
import type { SearchWireResult } from "@linkdesk/contracts";

const lk = window.linkdesk;

export interface ReplaceAllDeps {
  results: SearchWireResult;
  totalMatches: number;
  query: string;
  doSearch: (q: string) => void;
  t: (key: string) => string;
}

export function useReplaceAll({ results, totalMatches, query, doSearch, t }: ReplaceAllDeps) {
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  /** E6#73m K3:「全部替换」进行中——非 null = 正在跑，含进度实数（禁点依据 + 进度来源同一处） */
  const [replacing, setReplacing] = useState<{ done: number; total: number } | null>(null);

  const handleReplaceAll = useCallback(async () => {
    if (!replaceText || results.length === 0 || replacing) return;
    const ok = await window.linkdesk?.dialog?.confirm?.(t(`确定替换所有 ${totalMatches} 处？此操作不可撤销。`));
    if (!ok) return;

    // E6#73m K3：逐文件 read→decode→改→写是一次磁盘往返，几十个文件就是几秒钟——期间
    // 按钮照旧可点，再点一次就**并发跑第二遍**（同一批文件交错读写 = 内容互相覆盖）。
    // `replacing` 同时干两件事：禁点 + 给用户一个「到第几个了」的实数（不编百分比）。
    setReplacing({ done: 0, total: results.length });
    const failures: FailureItem[] = [];
    try {
      for (let i = 0; i < results.length; i++) {
        const file = results[i];
        try {
          const buffer = await lk.filesystem.readBinaryFile(file.filePath);
          const encoding = await lk.encoding.detect(buffer);
          let content = await lk.encoding.decode(buffer, encoding);
          for (const m of [...file.matches].reverse()) {
            const lineStart = content.split("\n").slice(0, m.lineNumber - 1).join("\n").length;
            const absStart = lineStart + (m.lineNumber === 1 ? 0 : 1) + m.matchStart;
            content = content.slice(0, absStart) + replaceText + content.slice(absStart + (m.matchEnd - m.matchStart));
          }
          await lk.filesystem.writeTextFile(file.filePath, content);
        } catch (err) {
          // 单个文件失败（权限 / 占用 / 编码）不该拖垮整批——收进汇总，继续下一个
          failures.push({ name: nameOf(file.filePath), detail: errText(err) });
        }
        setReplacing({ done: i + 1, total: results.length });
      }
    } finally {
      setReplacing(null);
    }

    // 失败一次报清（含文件名），常驻到用户关掉——老写法只有 console.warn，用户永远看不到
    notifyFailure(t("替换"), failures);

    // 重新搜索
    doSearch(query);
  }, [replaceText, results, totalMatches, query, doSearch, t, replacing]);

  return { replaceText, setReplaceText, showReplace, setShowReplace, replacing, handleReplaceAll };
}
