/**
 * FontFamilySelect——系统字体选择器（等宽 / 全字族双模式）。
 * E5#57c: queryLocalFonts() → Canvas 测等宽("i" vs "W") → SelectBox 下拉。
 *
 * 壳侧实现——uiHint: "fontFamily" 配置项自动走此控件。
 * E5.8#50.20 全字族化：monoOnly=true（默认，兼容等宽场景——编辑器字体）只列等宽族；
 * monoOnly=false 列全部本地字体（UI 字体——app.fontFamily 用户级覆盖写 --font-ui）。
 * 当前值边界（E5.8#50.20 ③）：非系统值（主题资产 @font-face 族、外部手工值）只显示不提供下拉选项——
 * 下拉选项恒为系统字体；空值 = 跟随主题（全字族模式提供「跟随主题」选项复位）。
 * queryLocalFonts 不可用时降级到常见字体列表——不抛错。
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SelectBox from "../select-box/SelectBox";

interface FontFamilySelectProps {
  value: string;
  onChange: (v: string) => void;
  /** true/缺省 = 只列等宽族（编辑器字体场景）；false = 全字族（UI 字体） */
  monoOnly?: boolean;
}

/** 常见等宽字体——queryLocalFonts 不可用且 monoOnly 时的兜底 */
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

/** 常见全字族字体——queryLocalFonts 不可用且全字族模式时的兜底（等宽 + 常用比例族） */
const FALLBACK_FONTS = [
  ...FALLBACK_MONO_FONTS,
  "Arial",
  "Arial Narrow",
  "Calibri",
  "Cambria",
  "Candara",
  "Constantia",
  "Franklin Gothic Medium",
  "Georgia",
  "Gill Sans",
  "Impact",
  "Microsoft YaHei",
  "Palatino Linotype",
  "Segoe UI",
  "SimHei",
  "SimSun",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
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

/** 读取系统字体列表——monoOnly 时过滤等宽 */
function useSystemFonts(monoOnly: boolean): string[] {
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

      // 兜底：常见字体（按模式）
      if (familyNames.length === 0) {
        familyNames = monoOnly ? FALLBACK_MONO_FONTS : FALLBACK_FONTS;
      }

      // monoOnly 过滤等宽；全字族模式不过滤
      const filtered = monoOnly ? familyNames.filter((name) => isMonospace(name)) : familyNames;
      if (!cancelled) {
        setFonts(filtered.sort((a, b) => a.localeCompare(b)));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [monoOnly]);

  return fonts;
}

export default function FontFamilySelect({ value, onChange, monoOnly = true }: FontFamilySelectProps) {
  const { t } = useTranslation();
  const systemFonts = useSystemFonts(monoOnly);

  const options = useMemo(() => {
    // 跟随主题条目——仅全字族模式（app.fontFamily 空 = 跟随主题，可下拉复位；
    // 等宽编辑器字体恒有具体默认，不提供主题跟随概念）。选项恒为系统字体——
    // 非系统当前值（资产族名等）只显示不列入下拉（E5.8#50.20 ③ 当前值边界）。
    const followTheme = monoOnly ? [] : [{ value: "", label: t("跟随主题") }];
    return [...followTheme, ...systemFonts.map((f) => ({ value: f, label: f }))];
  }, [monoOnly, systemFonts, t]);

  return (
    <SelectBox
      value={value}
      options={options}
      onChange={onChange}
      placeholder={monoOnly ? t("选择等宽字体…") : t("跟随主题")}
    />
  );
}
