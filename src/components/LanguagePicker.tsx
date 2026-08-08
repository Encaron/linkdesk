/**
 * 语言选择器——QuickPick 浮动面板，选择即切换。
 * E3c #41：基于 QuickPick 归一化组件——对标 ThemeBrowser。
 *
 * 对标 VS Code `Configure Display Language`。
 * 交互：打开→搜索→选中即切换（无预览——语言切换是即时的）。
 *
 * 设计依据：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/03-E3c-语言引擎跨进程.md §四
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageRegistry } from "../core/registry/LanguageRegistry";
import { setConfigurationValue, getConfigurationValue } from "../core/services/ConfigurationService";
import { useConfigurationValue } from "../core/react/useConfiguration"; // 保留——LanguagePicker 组件仍可独立渲染
import { onPluginLifecycleChange } from "../pluginLoader/lifecycle";
import { QuickPickService } from "../core/registry/QuickPickService"; // E5.5#7-p15
import QuickPick from "./shared/QuickPick";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LanguagePicker({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [langs, setLangs] = useState<Array<{ id: string; label: string }>>([]);
  const currentLang = useConfigurationValue<string>("app.language") ?? "zh";

  // #41a：打开时填充列表 + 订阅插件生命周期——安装/卸载语言插件时列表即时刷新
  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      const all = LanguageRegistry.getAll();
      setLangs(all.map(l => ({ id: l.id, label: l.label })));
    };
    refresh();
    const unsub = onPluginLifecycleChange.event(refresh);
    return unsub;
  }, [open]);

  /** 选中即切换——setConfigurationValue → onApply → i18n.changeLanguage + IPC 广播 */
  const handleSelect = (langCode: string) => {
    setConfigurationValue("app.language", langCode, "user").catch((e) => { console.error("[LanguagePicker] 切换语言失败:", e); });
    onClose();
  };

  return (
    <QuickPick
      open={open}
      onClose={onClose}
      items={langs.map(l => l.id)}
      placeholder={t("选择语言…")}
      getSearchText={(code) => {
        const entry = langs.find(l => l.id === code);
        return entry ? `${entry.label} ${code}` : code;
      }}
      getKey={(code) => code}
      onSelect={handleSelect}
      // E3.5 #CP20: 切 slot props——语言代码从第一行移到第二行 detail
      renderLabel={(code) => {
        const entry = langs.find(l => l.id === code);
        return entry?.label ?? code;
      }}
      renderCategory={(code) => code === currentLang ? t("当前") : undefined}
      renderDetail={(code) => code}
    />
  );
}

/**
 * E5.5#7-p15：命令式调起语言选择器——不再走 CustomEvent → App.tsx useState。
 */
export function showLanguagePicker(): void {
  const all = LanguageRegistry.getAll();
  const langs = all.map(l => ({ id: l.id, label: l.label }));
  const currentLang = (getConfigurationValue<string>("app.language") as string) ?? "zh";

  QuickPickService.show<{ id: string; label: string }>({
    mode: "language",
    items: langs,
    placeholder: "选择语言…",
    getSearchText: (l) => `${l.label} ${l.id}`,
    getKey: (l) => l.id,
    onSelect: (l) => {
      setConfigurationValue("app.language", l.id, "user").catch(() => {});
      QuickPickService.hide();
    },
    renderLabel: (l) => l.label,
    renderCategory: (l) => l.id === currentLang ? "当前" : undefined,
    renderDetail: (l) => l.id,
    onClose: () => QuickPickService.hide(),
  });
}
