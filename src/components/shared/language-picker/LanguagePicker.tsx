/**
 * 语言选择器——QuickPick 浮动面板，选择即切换。
 * E3c #41 → E5.5#7-p15 命令式入口 → E5.7#18：组件部分已删（#15 起走池 QuickPickHost），
 * 本文件只剩命令式入口 showLanguagePicker（settingsCommands 动态 import 调用）。
 *
 * 对标 VS Code `Configure Display Language`。
 * 交互：打开→搜索→选中即切换（无预览——语言切换是即时的）。
 */

import i18n from "../../../i18n"; // E5.7#15：serialize 在非 React 上下文解析显示文本（显示文本铁律）
import { LanguageRegistry } from "../../../core/registry/languages/LanguageRegistry";
import { setConfigurationValue, getConfigurationValue } from "../../../core/services/configuration/ConfigurationService";
import { QuickPickService } from "../../../core/services/ui/QuickPickService"; // E5.5#7-p15

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
    placeholder: i18n.t("选择语言…"),
    getSearchText: (l) => `${l.label} ${l.id}`,
    getKey: (l) => l.id,
    onSelect: (l) => {
      setConfigurationValue("app.language", l.id, "user").catch(() => {});
      QuickPickService.hide();
    },
    // E5.7#15：聪慧→哑——池 DTO 序列化（显示文本铁律：壳侧 t() 解析后推送，池原样渲染）
    serialize: (l) => ({
      key: l.id,
      searchText: `${l.label} ${l.id}`,
      label: l.label,
      // 归一化夹 02 案（D1 已拍）：「当前生效项」状态走 checked（对勾，与主题/面板选择器同形），
      // ⛔ 不再借 category（注释字段）写「当前」二字
      checked: l.id === currentLang,
      detail: l.id,
    }),
    onClose: () => QuickPickService.hide(),
  });
}
