/**
 * useDebouncedInput — 防抖输入归一化 hook。
 * E3.6 E36#7.3c 提取：本地 state 即时响应 + 模块级/外部 state 防抖同步。
 *
 * 使用场景：输入框值需要即时反馈（不卡打字），但下游过滤/搜索走防抖（不每键重渲染）。
 * 命令面板流畅就是因为输入是本地 state——这个 hook 把同样的模式归一化。
 *
 * @param setExternal 防抖后同步到的外部 setter（如模块级 setSearch）
 * @param debounceMs  防抖毫秒数，默认 150
 * @returns { value, onChange, onClear }——直接展开到 <input> 上
 */

import { useState, useCallback, useEffect, useRef } from "react";

export function useDebouncedInput(
  setExternal: (value: string) => void,
  debounceMs = 150,
) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setExternal(next);
      }, debounceMs);
    },
    [setExternal, debounceMs],
  );

  const onClear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValue("");
    setExternal("");
  }, [setExternal]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { value, onChange, onClear };
}
