/**
 * DynamicSelect——动态选项下拉（E5.8#50.23）。
 * uiHint "select" + optionsFrom：选项不在配置注册表静态 enum，渲染时调 window.linkdesk.theme.listRecipes() 动态取。
 *  - optionsFrom "theme.colorways"：活动配方（app.theme）的配色变体，选项带预览色块（ColorwayMeta.preview.accent）；
 *    随 app.theme 变化重取（configuration.onChange 订阅）+ 下拉打开时刷新（SelectBox onOpen）。
 *  - optionsFrom "theme.sources"：混搭来源——「跟随主题」置顶 + 按 optionsFromDomain 过滤 RecipeMeta.domains 的配方。
 * 视觉沿用 SelectBox（含色块 swatch）；零 @src/core import（共享控件白名单）——数据全走 window.linkdesk.*。
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SelectBox from "./SelectBox";
import type { RecipeMeta } from "@src/core/api/linkdesk-api/types";

interface DynamicSelectProps {
  /** 当前配置值（受控） */
  value: string;
  onChange: (v: string) => void;
  /** 动态数据源："theme.colorways" | "theme.sources" */
  optionsFrom: string;
  /** 混搭来源域过滤——optionsFrom "theme.sources" 时按此域过滤（colors/font/radius/glass/background/surface） */
  domain?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
}

interface DynamicOption {
  value: string;
  label: string;
  preview?: string;
}

/** 混搭来源「跟随主题」值——与 app.mix* 默认值对齐 */
const FOLLOW_THEME = "followTheme";

/** listRecipes 不可用/空时兜底——空下拉（SelectBox 显示「无匹配项」） */
const EMPTY_OPTIONS: DynamicOption[] = [];

function DynamicSelect({ value, onChange, optionsFrom, domain, disabled, placeholder, title }: DynamicSelectProps) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<DynamicOption[]>(EMPTY_OPTIONS);

  /** 动态取选项——colorways 读 app.theme 找活动配方；sources 按域过滤 */
  const refresh = useCallback(async () => {
    const list = window.linkdesk?.theme?.listRecipes;
    if (!list) return;
    try {
      const recipes = (await list()) ?? [];
      if (optionsFrom === "theme.sources") {
        if (domain === "colors") {
          // 颜色域 = 配方+配色粒度（决策 B）——每配色一个选项（value = 配色 id 全局唯一，theme.ts L88 契约），
          // label = 「配方名·配色名」（mockup 01「清凉薄荷包·薄荷苏打」同款），带配色预览色块。
          setOptions([
            { value: FOLLOW_THEME, label: t("跟随主题") },
            ...recipes.flatMap((r) =>
              r.colorways.map((cw) => ({
                value: cw.id,
                label: `${r.name}·${cw.name}`,
                preview: cw.preview?.accent || undefined,
              }))
            ),
          ]);
          return;
        }
        const filtered = domain
          ? recipes.filter((r) => r.domains.includes(domain as RecipeMeta["domains"][number]))
          : recipes;
        setOptions([
          { value: FOLLOW_THEME, label: t("跟随主题") },
          ...filtered.map((r) => ({ value: r.id, label: r.name })),
        ]);
        return;
      }
      // theme.colorways——活动配方 = app.theme 配置值；配方切换由 onChange 订阅触发重取
      const getCfg = window.linkdesk?.configuration?.get;
      const recipeId = getCfg ? await getCfg<string>("app.theme") : "";
      const recipe = recipes.find((r) => r.id === recipeId);
      setOptions(
        recipe
          ? recipe.colorways.map((cw) => ({ value: cw.id, label: cw.name, preview: cw.preview?.accent || undefined }))
          : EMPTY_OPTIONS,
      );
    } catch {
      setOptions(EMPTY_OPTIONS);
    }
  }, [optionsFrom, domain, t]);

  // 挂载取一次；colorways 额外订阅 app.theme——活动配方切换即重取（配色列表跟着换，mockup 01 动态 enum 演示）。
  // E5.8#60 F1.3：订阅插件生命周期——热装/卸载主题插件 → 配方集变化 → sources/colorways 列表刷新。
  //   走 configuration.onPluginLifecycleChange（设置页专用通道，池侧桥自 IpcBridgeHandler/data.ts 泛化 nudge）。
  //   E5.8#60 F2.1 防回归：订阅回调必须引用稳定——refresh 为 useCallback（依赖 optionsFrom/domain/t 恒定），
  //   内联箭头只包一层转发；严禁把非稳定闭包直接传入订阅（回放缓冲变死循环引擎，E5.8 铁律）。 */
  useEffect(() => {
    void refresh();
    const offLifecycle = window.linkdesk?.configuration?.onPluginLifecycleChange?.(() => { void refresh(); });
    const offTheme = optionsFrom === "theme.colorways"
      ? window.linkdesk?.configuration?.onChange?.("app.theme", () => { void refresh(); })
      : undefined;
    return () => {
      offLifecycle?.();
      offTheme?.();
    };
  }, [refresh, optionsFrom]);

  return (
    <SelectBox
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      onOpen={() => { void refresh(); }}
    />
  );
}

export default DynamicSelect;
