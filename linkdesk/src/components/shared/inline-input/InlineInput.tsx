/**
 * InlineInput —— 归一化行内编辑组件。
 * E5#18a：全项目所有行内编辑用一个组件——FileTree rename / 串口会话 / 设置 / 快捷键。
 *
 * 对标 E4V#27 两阶段聚焦模式 + isActive guard 防 Enter/Blur 竞态。
 * 对标 VS Code input — compact 22px / normal 32px 两套尺寸走 CSS 变量。
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import "./InlineInput.css";

/** E5.5#7-p5：零 @src/core import——走 window.linkdesk.* IPC */
function lk() {
  return window.linkdesk;
}

export interface InlineInputProps {
  /** 尺寸——compact=22px 文件树行内 / normal=32px 设置/串口 */
  size: "compact" | "normal";

  /** 当前值 */
  value: string;

  /** 确认回调——Enter 或 blur 时调用 */
  onConfirm: (value: string) => void;

  /** 取消回调——Esc 时调用 */
  onCancel: () => void;

  /** 即时回调——每次按键都通知（搜索框等实时过滤场景） */
  onChange?: (value: string) => void;

  /** 选中模式——all=全选 / nameOnly=只选文件名（去扩展名） */
  selectMode?: "all" | "nameOnly";

  /** 宽度——默认 fill（撑满父容器） */
  width?: number;

  /** 自动 focus + 选文本 */
  autoFocus?: boolean;

  /** placeholder */
  placeholder?: string;

  /** 输入类型 */
  type?: "text" | "number";

  /** 数字类型的 min/max */
  min?: number;
  max?: number;
}

/** 暴露给父组件的 imperative handle——外部按钮读当前值 */
export interface InlineInputHandle {
  getValue(): string;
}

export const InlineInput = forwardRef<InlineInputHandle, InlineInputProps>(function InlineInput({
  size,
  value,
  onConfirm,
  onCancel,
  onChange,
  selectMode = "all",
  width,
  autoFocus,
  placeholder,
  type = "text",
  min,
  max,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isActive, setIsActive] = useState(true);

  // 暴露当前值给外部（如 ✓ 按钮）
  useImperativeHandle(ref, () => ({
    getValue: () => localValue,
  }), [localValue]);

  // 🔥 E5#18d 两阶段聚焦——对标 E4V#27 模式
  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    const input = inputRef.current;
    // 第一阶段：focus
    input.focus();
    // 第二阶段：requestAnimationFrame 后选文本
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      if (selectMode === "nameOnly") {
        const dotIndex = value.lastIndexOf(".");
        if (dotIndex > 0) {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    });
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 E5#18c 退出清理——isActive → false 时恢复全局快捷键 + context key
  useEffect(() => {
    if (!isActive) {
      lk().contextKey?.set?.("inputFocus", false);
      const raf = requestAnimationFrame(() => {
        lk().keybindings?.setKeybindingCaptureActive?.(false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isActive]);

  // 组件卸载安全网——确保状态一定恢复（父组件在 isActive 仍为 true 时移除组件）
  useEffect(() => {
    return () => {
      lk().contextKey?.set?.("inputFocus", false);
      lk().keybindings?.setKeybindingCaptureActive?.(false);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setIsActive(false);
      onConfirm(localValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsActive(false);
      onCancel();
    }
    // 🔥 阻止冒泡——防止按键穿透到父容器（如文件树 type-ahead 搜索拦截数字键）
    e.stopPropagation();
  };

  const handleBlur = () => {
    // 🔥 E5-18a 防线——isActive guard 防 Enter+Blur 两次 onConfirm
    if (isActive) {
      setIsActive(false);
      onConfirm(localValue);
    }
  };

  const handleFocus = () => {
    lk().contextKey?.set?.("inputFocus", true);
    lk().keybindings?.setKeybindingCaptureActive?.(true);
  };

  return (
    <input
      ref={inputRef}
      className={`inline-input inline-input--${size}`}
      type={type}
      value={localValue}
      onChange={(e) => {
        const v = type === "number" ? e.target.value.replace(/\D/g, "") : e.target.value;
        setLocalValue(v);
        onChange?.(v);
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onDragStart={(e) => e.preventDefault()}
      placeholder={placeholder}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      autoComplete="off"
      spellCheck={false}
    />
  );
});
