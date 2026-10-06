/**
 * ThemePicker——主题配方卡片选择器（E5.8#50.22）。
 * 卡片网格：配方名称 + 配色徽标（单配色 = 预览条 / 多配色 = 配色圆点 + 计数）+ 选中态 + 键盘可达。
 * 数据源 = window.linkdesk.theme.listRecipes()（06 §2 RecipeMeta——id/名称/明暗/配色预览色）。
 * 视觉对标 mockup 01-设置页-主题区（.ldk-theme-picker 四列网格 + .ldk-theme-picker-card 边框/悬停上浮/选中 accent 描边）。
 * 受控组件：value = 当前 app.theme 值；点卡片 → onChange(recipeId)（上层写配置 → onApply 应用配方）。
 * 键盘：方向键在卡片间移动焦点（roving tabindex）+ Enter/Space 激活（原生 button）。
 * 预览区/圆点色 = 配方数据（inline style）——非样式硬编码（同 renderControl 色块先例）；
 * 结构样式全走 CSS 变量（硬约束 1）。
 *
 * 🔴 2026-09-30「指认不明」：壳的内置兜底卡与插件卡**靠名字分开**——壳那张叫「内置」、官方插件那只叫
 *   「官方主题」（用户拍板口径）。曾试过在卡片上加「壳自带／来自 X」来源行，**用户明确否掉**（「我不需要」）
 *   ⇒ 本组件只渲染配方名，⛔ 不加来源行、契约也不带来源字段。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { RecipeMeta } from "@linkdesk/contracts"; // E6#54a：出包类型重定向（@src 别名包内不可解析）
import "./ThemePicker.css";

interface ThemePickerProps {
  /** 当前选中配方 id（app.theme 配置值） */
  value: string;
  onChange: (v: string) => void;
}

/** 多配色圆点渲染上限——超出仅靠「N 配色」徽标计数，预览区不堆叠 */
const MAX_PREVIEW_DOTS = 6;

/** 单配色配方无 accent 预览色时的中性条兜底——数据兜底（E5.8#128.7：硬编码 rgba → --text-secondary 45% 合成，主题感知） */
const NEUTRAL_BAR = "color-mix(in srgb, var(--text-secondary) 45%, transparent)";

function ThemePicker({ value, onChange }: ThemePickerProps) {
  // i18n 实例取自 useTranslation（= 壳 src/i18n 经 initReactI18next 注册的同一单例）——
  // ⛔ 不可 import 壳 "../../../i18n"：本目录是 @linkdesk/ui 声明发射的 rootDir，跨出去即 TS6059 构建红。
  const { t, i18n } = useTranslation();
  const [recipes, setRecipes] = useState<RecipeMeta[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // 拉取配方列表——挂载取一次（value 变化由受控 value 驱动选中态）。
  // E5.8#60 F1.3：订阅插件生命周期——热装/卸载主题插件 → 配方集变化 → 卡片列表刷新。
  //   走 configuration.onPluginLifecycleChange（设置页专用通道，池侧桥自 IpcBridgeHandler/data.ts 泛化 nudge）。
  //   E5.8#60 F2.1 防回归：订阅回调必须引用稳定——refresh 为 useCallback（闭包仅捕获 listRecipes/setRecipes 稳定引用，
  //   内联箭头只包一层转发；严禁把非稳定闭包直接传入订阅（回放缓冲变死循环引擎，E5.8 铁律）。
  const refresh = useCallback((isActive?: () => boolean) => {
    // 可选链只短路后续可选链，不短路 .then——先取函数再调用
    const list = window.linkdesk?.theme?.listRecipes;
    if (!list) return;
    list().then((result) => {
      if (isActive && !isActive()) return; // 卸载竞态守卫——Promise 晚到不 setState
      setRecipes(result ?? []);
    }).catch(() => { /* API 不可用——保持空列表 */ });
  }, []);

  // 语言切换 → 重取（E6#165）：卡片名是**壳侧解析后的显示文本**（RecipeMeta.name 走 ThemeEngine/naming
  //   的 t()），语言一变旧载荷里的名字就过期；⛔ 不在渲染期现算 t()——数据源是 IPC 载荷，池原样渲染。
  const onLangChanged = useCallback(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const isActive = () => !cancelled;
    void refresh(isActive);
    const offLifecycle = window.linkdesk?.configuration?.onPluginLifecycleChange?.(() => { void refresh(); });
    i18n.on("languageChanged", onLangChanged);
    return () => {
      cancelled = true;
      offLifecycle?.();
      i18n.off("languageChanged", onLangChanged);
    };
  }, [refresh, onLangChanged, i18n]); // i18n = useTranslation 返回的单例，引用终生不变（进 deps 只为满足 exhaustive-deps）

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
    return <span className="ldk-theme-picker-empty">{t("暂无主题配方")}</span>;
  }

  return (
    <div
      className="ldk-theme-picker"
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
            className={`ldk-theme-picker-card${active ? " active" : ""}`}
            tabIndex={focusIndex === i ? 0 : -1}
            aria-label={recipe.name}
            aria-pressed={active}
            onClick={() => onChange(recipe.id)}
            onFocus={() => setFocusIndex(i)}
          >
            <div className="ldk-theme-picker-preview" style={preview?.bgWindow ? { background: preview.bgWindow } : undefined}>
              {single ? (
                // 单配色配方——3 条强调色预览条（mockup .ldk-theme-picker-preview-bar）
                <>
                  <span className="ldk-theme-picker-preview-bar" style={{ background: accent }} />
                  <span className="ldk-theme-picker-preview-bar" style={{ background: accent }} />
                  <span className="ldk-theme-picker-preview-bar" style={{ background: accent }} />
                </>
              ) : (
                // 多配色配方——配色圆点色板（mockup .ldk-theme-picker-preview-dot）
                <span className="ldk-theme-picker-preview-dots">
                  {recipe.colorways.slice(0, MAX_PREVIEW_DOTS).map((cw) => (
                    <span
                      key={cw.id}
                      className="ldk-theme-picker-preview-dot"
                      style={cw.preview?.accent ? { background: cw.preview.accent } : undefined}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="ldk-theme-picker-name">
              <span className="ldk-theme-picker-name-text">{recipe.name}</span>
              <span className="ldk-theme-picker-badge">
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
