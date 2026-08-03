/**
 * StatusBar — 底部状态栏（22px）。
 * Phase 4.4：对标 VS Code——插件通过 statusBarComponent 自己渲染状态项，
 * 核心不认 pluginId。通知铃铛 + 语言/主题切换是核心固定项。
 *
 * 设计依据：VS Code extensionsActions.ts（插件提供 statusBar 组件）
 */

import { Fragment, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getStatusBarContributions } from "../pluginLoader/viewRegistry";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { getDynamicStatusBarItems, onDidChangeStatusBar } from "../core/StatusBarService";
import { getConfigurationValue } from "../core/ConfigurationService";
import { executeCommand } from "../core/CommandRegistry";
import { CUSTOM_EVENTS } from "../core/CoreEvents";
// E5#6a：响应式读配置——替代 App.tsx 传来的 theme/lang props
import { useConfigurationValue } from "../core/useConfiguration";
// E5#6b：壳内通信——订阅 tab:focused，标签页切换时刷新状态栏
import { shellEvents } from "../core/ShellEvents";
import NotificationCenter from "./NotificationCenter";
import "./StatusBar.css";

interface StatusBarProps {
  // E5#7f：回调改走命令系统——不再从 App 传 props
}

function StatusBar(_props: StatusBarProps) {
  // E5#6a：替代 props.theme / props.lang——直接从 ConfigurationService 读，响应式
  const theme = useConfigurationValue<string>("app.theme");
  const lang = useConfigurationValue<"zh" | "en">("app.language");
  const { t } = useTranslation();

  // 动态状态栏项变更 → 重渲染
  const [, setStatusBarTick] = useState(0);
  useEffect(() => {
    return onDidChangeStatusBar.event(() => setStatusBarTick((n) => n + 1));
  }, []);

  // E5#6b：标签页切换时刷新状态栏——插件可据此更新自己的条目
  useEffect(() => {
    const unsub = shellEvents.on("tab:focused", () => {
      setStatusBarTick((n) => n + 1);
    });
    return unsub;
  }, []);

  // E5#6c：接收 ShellEvents 推送的动态状态栏条目
  const [eventEntries, setEventEntries] = useState<import("../core/ShellEvents").StatusBarEntry[]>([]);
  useEffect(() => {
    const unsub = shellEvents.on("statusbar:update", (entries) => {
      setEventEntries(entries);
    });
    return unsub;
  }, []);

  // 合并静态（plugin.json）+ 动态（StatusBarService）两源
  const allItems = [...getStatusBarContributions(), ...getDynamicStatusBarItems()];

  // 去重插件 ID（保持顺序）
  const orderedPluginIds = (() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of allItems) {
      if (!seen.has(item.pluginId)) {
        seen.add(item.pluginId);
        ids.push(item.pluginId);
      }
    }
    return ids;
  })();

  const leftPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && i.align !== "right")
  );
  const rightPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && i.align === "right")
  );

  // E3b #36d：Chord 状态栏提示——归一化，所有 chord（Ctrl+K Ctrl+T 等）共用
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const { isPending, firstKey, failedKey } = (e as CustomEvent).detail as {
        isPending: boolean; firstKey?: string; failedKey?: string;
      };
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (isPending && firstKey) {
        const display = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`(${display}) 已按下，正在等待第二键…`);
      } else if (failedKey && firstKey) {
        // 对标 VS Code："(Ctrl+K, unknown) is not a command"
        const f1 = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        const f2 = failedKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`组合键 (${f1}, ${f2}) 不是命令`);
        chordTimerRef.current = setTimeout(() => setChordLabel(null), 3000);
      } else {
        setChordLabel(null);
      }
    };
    window.addEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, []);

  /** 渲染某个插件的状态栏贡献——优先用插件自己的 statusBarComponent */
  function renderPluginStatusBar(pluginId: string) {
    const plugin = getViewPlugin(pluginId);
    if (plugin?.statusBarComponent) {
      const Comp = plugin.statusBarComponent;
      return <Comp key={pluginId} />;
    }
    // 静态渲染：label + 可选 icon
    const items = allItems.filter((i) => i.pluginId === pluginId);
    // E2c #19g：configurable 条目按配置值过滤显隐
    const visibleItems = items.filter((item) => {
      if (!item.configurable) return true;
      const configKey = `${pluginId}.statusBar.${item.id}`;
      // eslint-disable-next-line linkdesk/no-raw-configuration-read -- filter 闭包非组件
      return getConfigurationValue<boolean>(configKey) ?? true;
    });
    if (visibleItems.length === 0) return null;
    return (
      <Fragment key={pluginId}>
        {visibleItems.map((item, i) => {
          const content = (
            <>
              {item.icon && <span className={`codicon codicon-${item.icon}`} />}
              {item.label || item.id}
            </>
          );
          // E2c #19i：onClick 声明 → 渲染为可点击按钮
          const el = item.onClick ? (
            <button
              className="status-bar-btn"
              onClick={() => executeCommand(item.onClick!)}
            >
              {content}
            </button>
          ) : (
            <span className="status-text">{content}</span>
          );
          return (
            <Fragment key={item.id}>
              {i > 0 && <span className="status-divider">│</span>}
              {el}
            </Fragment>
          );
        })}
      </Fragment>
    );
  }

  return (
    <div className="status-bar">
      {/* 左区：插件贡献项 + 错误信息 + Chord 提示 */}
      <div className="status-bar-left">
        {leftPluginIds.map((pid, i) => (
          <Fragment key={pid}>
            {i > 0 && <span className="status-divider">│</span>}
            {renderPluginStatusBar(pid)}
          </Fragment>
        ))}
        {/* E5#6e：left-aligned eventEntries——与插件条目统一的样式 */}
        {eventEntries.filter((e) => e.alignment !== "right").map((e) => (
          <Fragment key={e.id}>
            <span className="status-divider">│</span>
            <span className="status-text" title={e.tooltip}>{e.text}</span>
          </Fragment>
        ))}
        {/* Chord 提示——插件图标后面，对标 VS Code */}
        {chordLabel && (
          <>
            <span className="status-divider">│</span>
            <span className="status-text status-chord">{chordLabel}</span>
          </>
        )}
      </div>

      {/* 右区：插件贡献项 + eventEntries + 核心固定项——统一 │ + status-bar-btn 样式 */}
      <div className="status-bar-right">
        {rightPluginIds.map((pid) => renderPluginStatusBar(pid))}
        {/* E5#6e：eventEntries + 壳固定项预计算，统一渲染 */}
        {rightPluginIds.length > 0 && <span className="status-divider">│</span>}
        {[
          ...eventEntries.map((e) => ({ key: e.id, label: e.text, tooltip: e.tooltip })),
          { key: "lang", label: lang === "zh" ? "中" : "EN", tooltip: t("切换语言"), onClick: "workbench.action.selectLanguage" as const },
          { key: "theme", label: theme === "Dark" ? "☀" : "☾", tooltip: t("切换主题"), onClick: "workbench.action.selectTheme" as const },
        ].map((e, i) => (
          <Fragment key={e.key}>
            {i > 0 && <span className="status-divider">│</span>}
            {"onClick" in e && e.onClick ? (
              <button className="status-bar-btn" onClick={() => executeCommand(e.onClick)} title={e.tooltip}>{e.label}</button>
            ) : (
              <span className="status-text" title={e.tooltip}>{e.label}</span>
            )}
          </Fragment>
        ))}
        <NotificationCenter />
      </div>
    </div>
  );
}

export default StatusBar;
