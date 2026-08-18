/**
 * useClickPreview — 单击预览 / 双击锁定归一化 hook。
 * E4V#28e：从 FileTreeNode 提取——未来 sidebar 任何树/列表组件复用同一交互。
 *
 * 对标 VS Code explorer 的文件点击行为：
 * - 单击（mousedown 启动 250ms 定时器）→ 预览标签页（斜体，可替换）
 * - 双击（e.detail === 2）→ 锁定标签页（正体，不再替换）
 * - disabled = 目录节点——不启动定时器，不响应双击锁定
 *
 * @param onPreview  预览回调——定时器到期后触发
 * @param onPin      锁定回调——双击时触发
 * @param disabled   禁用预览/锁定（如目录节点），默认 false
 * @param delay      双击检测窗口（ms），默认 250
 * @returns { handleMouseDown, handleClick }——展开到行级事件处理器
 */

import { useRef, useEffect, useCallback } from "react";

interface UseClickPreviewOptions {
  onPreview: () => void;
  onPin: () => void;
  disabled?: boolean;
  delay?: number;
}

export function useClickPreview({ onPreview, onPin, disabled, delay = 250 }: UseClickPreviewOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理定时器——防 setState 在 unmounted 组件上报 warning
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleMouseDown = useCallback((e: { button?: number }) => {
    if (disabled) return;
    // 右键/中键不启动预览——打开归左键，菜单归 contextmenu（对标 VS Code）
    if (e.button !== undefined && e.button !== 0) return;
    if (timerRef.current) {
      // 第二次 mousedown（双击的第二击）→ 清定时器，不触发预览
      clearTimeout(timerRef.current);
      timerRef.current = null;
    } else {
      // 第一次 mousedown → 启动预览定时器
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onPreview();
      }, delay);
    }
  }, [disabled, delay, onPreview]);

  const handleClick = useCallback((e: { detail: number; button?: number }) => {
    if (disabled) return;
    // 非左键点击不锁定（右键归 contextmenu）
    if (e.button !== undefined && e.button !== 0) return;
    if (e.detail === 2) {
      // 双击：清掉可能还在的预览定时器 → 锁定
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onPin();
    }
  }, [disabled, onPin]);

  return { handleMouseDown, handleClick };
}
