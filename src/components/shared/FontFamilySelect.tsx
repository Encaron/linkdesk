/**
 * FontFamilySelect——系统等宽字体选择器。
 * E5#57c: document.fonts → Canvas 测等宽("i" vs "W") → SelectBox 下拉。
 *
 * 壳侧实现——uiHint: "fontFamily" 配置项自动走此控件。
 * 不认识的字体 fallback 回文本输入——不抛错。
 */

import { useState, useEffect, useMemo } from "react";
import SelectBox from "./SelectBox";

interface FontFamilySelectProps {
  value: string;
  onChange: (v: string) => void;
}

/** Canvas 测等宽——"i" 和 "W" 宽度差值 < 0.5px 判定为等宽 */
function isMonospace(fontName: string): boolean {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.font = `16px "${fontName}"`;
    const w1 = ctx.measureText("i").width;
    const w2 = ctx.measureText("W").width;
    return Math.abs(w1 - w2) < 0.5;
  } catch {
    return false;
  }
}

/** 读取系统可用等宽字体列表 */
function useSystemMonospaceFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    // document.fonts.ready 确保字体已加载
    document.fonts.ready.then(() => {
      const available = Array.from(document.fonts.values())
        .map((f) => f.family)
        .filter((name, i, arr) => arr.indexOf(name) === i); // 去重（不同 weight/style 同 family）

      // Canvas 测等宽——只保留等宽字体
      const mono = available.filter((name) => isMonospace(name));
      setFonts(mono.sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  return fonts;
}

export default function FontFamilySelect({ value, onChange }: FontFamilySelectProps) {
  const monoFonts = useSystemMonospaceFonts();

  const options = useMemo(() => {
    // 当前值不在列表中时追加为自定义选项
    const hasCurrent = monoFonts.some((f) => f === value);
    const list = monoFonts.map((f) => ({ value: f, label: f }));
    if (value && !hasCurrent) {
      list.unshift({ value, label: value });
    }
    return list;
  }, [monoFonts, value]);

  return (
    <SelectBox
      value={value}
      options={options}
      onChange={onChange}
      placeholder="选择等宽字体…"
    />
  );
}
