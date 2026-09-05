/**
 * useClipboardKeys — 池侧 Ctrl/Cmd+C / X / V 剪贴板键归一化 hook。
 * E5.8#24.8.3 定案（用户拍板路径 2）：共享 hook 消除每插件重复的剪贴板键处理。
 * E6#15h 归位：@linkdesk/ui 零件（本文件 = 壳单一源码副本；任何插件含第三方 `import { useClipboardKeys } from "@linkdesk/ui"`）。
 * 详见 08-共享hook归位.md。
 *
 * 背景（教训链——看 memory keyboard-router-before-input-event）：
 *   壳级剪贴板键已删（E5.8#24.8.1）——主进程 keyCache 命中 = 无条件 preventDefault，
 *   在池 WCV 收到键之前吞掉，且不认 when/可编辑状态 → 池内 Monaco 原生复制粘贴全死。
 *   正解 = 池侧自处理：插件在自己 React keydown 里处理文本键。DOM 焦点天然分区——
 *   文件树聚焦才收键，Monaco 聚焦收不到，多插件各干各的 ctrl+c 互不打扰，
 *   不需要 when、不需要冲突检测。
 *
 * 机制与语义分离：
 *   机制（ctrl/meta 检测 + preventDefault + 键映射）归一在此 hook——一处实现一处修。
 *   语义（复制/剪切/粘贴各自做什么）由插件声明式交出——AI 只填回调，零追踪影响面。
 *
 * 焦点守卫天然成立：本 hook 返回的 handler 挂在插件容器 onKeyDown 上——
 *   只有插件聚焦才收到事件；可编辑子元素（如重命名 InlineInput）须自行 stopPropagation，
 *   否则打字时 Ctrl+C/V/X 冒泡到容器（文件树已如此处理）。
 *
 * @param onCopy   复制回调（Ctrl+C / Cmd+C）
 * @param onCut    剪切回调（Ctrl+X / Cmd+X）
 * @param onPaste  粘贴回调（Ctrl+V / Cmd+V）
 * @returns `(e) => boolean`——在消费方 onKeyDown 中组合：返回 true 表示该键已被消费
 *          （调用方应 return，勿继续走其他逻辑）；false 表示未命中剪贴板键。
 */

import { useRef, useCallback } from "react";

export interface UseClipboardKeysCallbacks {
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
}

export function useClipboardKeys(
  callbacks: UseClipboardKeysCallbacks,
): (e: React.KeyboardEvent) => boolean {
  // ref 桥接——回调每次渲染可能变化（对象字面量），handler 恒稳定（空 deps），
  // 消费方把它放进自己的 useCallback 依赖数组不会造成不必要的重建。
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  return useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const key = e.key.toLowerCase();
    if (key !== "c" && key !== "x" && key !== "v") return false;

    e.preventDefault();
    if (key === "c") callbacksRef.current.onCopy?.();
    else if (key === "x") callbacksRef.current.onCut?.();
    else callbacksRef.current.onPaste?.();
    return true;
  }, []);
}
