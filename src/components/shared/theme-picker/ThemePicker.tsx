/**
 * ThemePicker——主题配方卡片选择器（E5.8#50.22）。
 * 卡片网格：配方名称 + 配色徽标（单配色 = 预览条 / 多配色 = 配色圆点 + 计数）+ 选中态 + 键盘可达。
 * 数据源 = window.linkdesk.theme.listRecipes()（06 §2 RecipeMeta——id/名称/明暗/配色预览色）。
 * 视觉对标 mockup 01-设置页-主题区（.theme-picker 四列网格 + .theme-card 边框/悬停上浮/选中 accent 描边）。
 * 受控组件：value = 当前 app.theme 值；点卡片 → onChange(recipeId)（上层写配置 → onApply 应用配方）。
 * 键盘：方向键在卡片间移动焦点（roving tabindex）+ Enter/Space 激活（原生 button）。
 * 预览区/圆点色 = 配方数据（inline style）——非样式硬编码（同 renderControl 色块先例）；
 * 结构样式全走 CSS 变量（硬约束 1）。
 */

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { RecipeMeta } from "@src/core/api/linkdesk-api/types";
import "./ThemePicker.css";

interface ThemePickerProps {
  /** 当前选中配方 id（app.theme 配置值） */
  value: string;
  onChange: (v: string) => void;
}

/** 多配色圆点渲染上限——超出仅靠「N 配色」徽标计数，预览区不堆叠 */
const MAX_PREVIEW_DOTS = 6;

/** 单配色配方无 accent 预览色时的中性条兜底——数据兜底非样式硬编码（rgba 非 hex，同色块先例） */
const NEUTRAL_BAR = "rgba(128,128,128,0.45)";

function ThemePicker({ value, onChange }: ThemePickerProps) {
  const { t } = useTranslation();
  const [recipes, setRecipes] = useState<RecipeMeta[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // 拉取配方列表——一次（配方集在会话内静态；value 变化由受控 value 驱动选中态）
  useEffect(() => {
    let cancelled = false;
    // 可选链只短路后续可选链，不短路 .then——先取函数再调用
    const list = window.linkdesk?.theme?.listRecipes;
    if (!list) return;
    list().then((result) => {
      if (!cancelled) setRecipes(result ?? []);
    }).catch(() => { /* API 不可用——保持空列表 */ });
    return () => { cancelled = true; };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const n = recipes.length;
    if (n === 0) return;
    let next = focusIndex;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown": next = Math.min(focusIndex + 1, n - 1); break;
      case "ArrowLeft":
      case "ArrowUp": next = Math.max(focusIndex - 1, 0); break;
      case "Home": next = 0; break;
      case "End": next = n - 1; break;
      default: return;
    }
    e.preventDefault();
    setFocusIndex(next);
    cardRefs.current[next]?.focus();
  };

  if (recipes.length === 0) {
    return <span className="theme-picker-empty">{t("无可用主题配方")}</span>;
  }

  return (
    <div
      className="theme-picker"
      role="group"
      aria-label={t("主题配方")}
      onKeyDown={handleKeyDown}
    >
      {recipes.map((recipe, i) => {
        const single = recipe.colorways.length <= 1;
        const preview = recipe.colorways[0]?.preview;
        const accent = preview?.accent || NEUTRAL_BAR;
        const active = recipe.id === value;
        return (
          <button
            key={recipe.id}
            ref={(el) => { cardRefs.current[i] = el; }}
            type="button"
            className={`theme-card${active ? " active" : ""}`}
            tabIndex={focusIndex === i ? 0 : -1}
            aria-label={recipe.name}
            aria-pressed={active}
            onClick={() => onChange(recipe.id)}
            onFocus={() => setFocusIndex(i)}
          >
            <div className="theme-preview" style={preview?.bgWindow ? { background: preview.bgWindow } : undefined}>
              {single ? (
                // 单配色配方——3 条强调色预览条（mockup .pv-bar）
                <>
                  <span className="pv-bar" style={{ background: accent }} />
                  <span className="pv-bar" style={{ background: accent }} />
                  <span className="pv-bar" style={{ background: accent }} />
                </>
              ) : (
                // 多配色配方——配色圆点色板（mockup .pv-dot）
                <span className="pv-dots">
                  {recipe.colorways.slice(0, MAX_PREVIEW_DOTS).map((cw) => (
                    <span
                      key={cw.id}
                      className="pv-dot"
                      style={cw.preview?.accent ? { background: cw.preview.accent } : undefined}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="tname">
              <span className="tname-name">{recipe.name}</span>
              <span className="badge">
                {single
                  ? (recipe.colorways[0]?.name ?? "")
                  : t("{{count}} 配色", { count: recipe.colorways.length })}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default ThemePicker;
