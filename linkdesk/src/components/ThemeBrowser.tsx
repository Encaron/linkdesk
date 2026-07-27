/**
 * 主题浏览器——QuickPick 浮动面板，↑↓ 预览 / Enter 切换 / Esc 回退。
 * E3b #36c：基于 QuickPick 归一化组件——~50 行。
 *
 * 对标 VS Code `Preferences: Color Theme`（Ctrl+K Ctrl+T）。
 * 交互：打开→↑↓即时预览→Enter提交→Esc回退原始主题。
 *
 * 设计依据：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/08-执行清单.md #36c
 * VS Code 对标：src/vs/workbench/contrib/themes/browser/themes.contribution.ts
 */

import { useState, useEffect, useRef } from "react";
import {
  getAvailableThemes,
  getThemesByPlugin,
  loadTheme,
  applyTheme,
  applyAccentColor,
  getCurrentTheme,
  getEffectiveAccentColor,
} from "../core/ThemeEngine";
import { setConfigurationValue } from "../core/ConfigurationService";
import { onPluginLifecycleChange } from "../pluginLoader/lifecycle";
import QuickPick from "./shared/QuickPick";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 插件卡片齿轮传入——只显示该插件的主题，否则全部 */
  pluginId?: string;
}

export default function ThemeBrowser({ open, onClose, pluginId }: Props) {
  const originalTheme = useRef<string | null>(null);
  const committed = useRef(false);

  // 打开时记录当前主题——用于 Esc 回退
  useEffect(() => {
    if (open) {
      originalTheme.current = getCurrentTheme()?.name ?? null;
      committed.current = false;
    }
  }, [open]);

  /** Enter / 点击：提交主题（写配置 → onApply 自动 load+apply） */
  const handleSelect = (themeName: string) => {
    committed.current = true;
    setConfigurationValue("app.theme", themeName, "user").catch(() => {});
  };

  /** ↑↓ / hover：预览主题（即时 apply，不写配置）。
   *  主题自带 accent → 预览后必须恢复用户自定义强调色，否则用户看到的是主题硬编码的 accent。 */
  const handleHighlight = async (themeName: string) => {
    try {
      const theme = await loadTheme(themeName);
      applyTheme(theme);
      // E3f #59d2：强调色走归一化函数——followTheme 模式走主题色，custom 模式走自定义
      applyAccentColor(getEffectiveAccentColor());
    } catch {
      // 加载失败——静默，keep current
    }
  };

  /** Esc / 点遮罩 / 失焦：回退到打开前的主题 */
  const handleClose = () => {
    if (!committed.current && originalTheme.current) {
      loadTheme(originalTheme.current)
        .then(applyTheme)
        .catch(() => {});
    }
    onClose();
  };

  /** 齿轮=只该插件，全局=全部——对标 VS Code getQuickPickEntries(this.extension) */
  const [themes, setThemes] = useState<string[]>([]);

  // #36f12：打开时填充列表 + 订阅插件生命周期——卸载/安装主题插件时列表即时刷新
  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      const list = pluginId ? getThemesByPlugin(pluginId) : getAvailableThemes();
      setThemes(list);
    };
    refresh();
    const unsub = onPluginLifecycleChange.event(refresh);
    return unsub;
  }, [open, pluginId]);

  return (
    <QuickPick
      open={open}
      onClose={handleClose}
      items={themes}
      placeholder="选择颜色主题…"
      getSearchText={(name) => name}
      getKey={(name) => name}
      onSelect={handleSelect}
      onHighlight={handleHighlight}
      renderItem={(name, _isSelected) => {
        const isCurrent = name === originalTheme.current;
        return (
          <>
            <span className="palette-item-label">{name}</span>
            {isCurrent && (
              <span className="palette-item-category">当前</span>
            )}
          </>
        );
      }}
    />
  );
}
