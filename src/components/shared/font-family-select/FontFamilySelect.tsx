/**
 * FontFamilySelect——系统等宽字体选择器。
 * E5#57c: queryLocalFonts() → Canvas 测等宽("i" vs "W") → SelectBox 下拉。
 *
 * 壳侧实现——uiHint: "fontFamily" 配置项自动走此控件。
 * queryLocalFonts 不可用时降级到常见等宽字体列表——不抛错。
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SelectBox from "../select-box/SelectBox";

interface FontFamilySelectProps {
  value: string;
  onChange: (v: string) => void;
}

/** 常见等宽字体——queryLocalFonts 不可用时的兜底 */
const FALLBACK_MONO_FONTS = [
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Courier",
  "Courier New",
  "DejaVu Sans Mono",
  "Droid Sans Mono",
  "Fira Code",
  "Fira Mono",
  "Hack",
  "Inconsolata",
  "JetBrains Mono",
  "Liberation Mono",
  "Lucida Console",
  "Menlo",
  "Monaco",
  "Noto Sans Mono",
  "Source Code Pro",
  "Ubuntu Mono",
];

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
    let cancelled = false;

    async function load() {
      let familyNames: string[] = [];

      // queryLocalFonts——Chromium 103+ / Electron 28+ 原生 Local Font Access API，返回所有本地字体。
      // E5.7#98：Chromium 专有 API——窄声明替代 as any（顺带删掉下游冗余 cast）
      if ("queryLocalFonts" in window) {
        try {
          const localFonts = await (window as Window & { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts?.();
          if (!cancelled) {
            familyNames = (localFonts ?? [])
              .map((f) => f.family)
              .filter((name, i, arr) => arr.indexOf(name) === i); // 去重
          }
        } catch {
          // 用户拒绝权限或 API 不可用 → fallback
        }
      }

      // 兜底：常见等宽字体
      if (familyNames.length === 0) {
        familyNames = FALLBACK_MONO_FONTS;
      }

      // Canvas 测等宽——只保留等宽字体
      const mono = familyNames.filter((name) => isMonospace(name));
      if (!cancelled) {
        setFonts(mono.sort((a, b) => a.localeCompare(b)));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return fonts;
}

export default function FontFamilySelect({ value, onChange }: FontFamilySelectProps) {
  const { t } = useTranslation();
  const monoFonts = useSystemMonospaceFonts();

  const options = useMemo(() => {
    const hasCurrent = monoFonts.some((f) => f.toLowerCase() === value.toLowerCase());
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
      placeholder={t("选择等宽字体…")}
    />
  );
}
