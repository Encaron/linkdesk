/**
 * useSettingsEvents——SettingsView 订阅/跳转 effect 组（7 块整迁）。
 * E5.8#0d.10-7d：自 SettingsView.tsx 拆出——全部一次性/常驻订阅：
 *   配置变更版本号递增 + 插件生命周期刷新 + M1 双通道（齿轮"设置"跳分组）+ scrollTo 双通道 + 外部"打开快捷键"事件。
 * 状态 setter + groupsRaw 走入参；deps 补稳定 setter 恒稳定消 exhaustive-deps（零语义变化）。
 * 依赖方向：useSettingsEvents → helpers（lk/常量）+ types（GroupInfo）；被聚合器 SettingsView 消费。
 */

import { useEffect } from "react";
import { lk, CUSTOM_EVENT_OPEN_KEYBINDINGS } from "./helpers";
import type { GroupInfo } from "./types";

function useSettingsEvents({
  setVersion,
  setSearch,
  setSelectedGroup,
  setActiveTab,
  setKeybindingQuery,
  groupsRaw,
}: {
  setVersion: React.Dispatch<React.SetStateAction<number>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setSelectedGroup: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<"settings" | "keybindings">>;
  setKeybindingQuery: React.Dispatch<React.SetStateAction<string | undefined>>;
  groupsRaw: GroupInfo[];
}) {
  // ── 订阅配置变更 → 版本号递增触发刷新 ──
  useEffect(() => {
    try {
      const unsub = lk().onDidChangeConfiguration(() => setVersion((v) => v + 1));
      return unsub;
    } catch { return; }
  }, [setVersion]);

  // ── 订阅插件生命周期 → 刷新分组列表（插件安装/卸载）──
  useEffect(() => {
    try {
      const unsub = lk().onPluginLifecycleChange(() => setVersion((v) => v + 1));
      return unsub;
    } catch { return; }
  }, [setVersion]);

  // ── M1 双通道 A：mount 时消费 pending——设置未打开时齿轮"设置"跳转到指定分组 ──
  useEffect(() => {
    lk().consumeSettingsGroup().then((target: string | null) => {
      if (target) {
        setSearch("");
        setSelectedGroup(target);
      }
    }).catch(() => {});
  }, [setSearch, setSelectedGroup]);

  // ── M1 双通道 B：实时订阅——设置已打开时齿轮"设置"跳转 ──
  useEffect(() => {
    try {
      const unsub = lk().onRequestSettingsGroup((pluginId: string) => {
        setSearch("");
        setSelectedGroup(pluginId);
      });
      return unsub;
    } catch { return; }
  }, [setSearch, setSelectedGroup]);

  // ── scrollTo 双通道 A：mount 时消费 pending ──
  useEffect(() => {
    lk().consumeScrollToSetting().then((pendingKey: string | null) => {
      if (pendingKey) {
        setSearch("");
        for (const g of groupsRaw) {
          if (g.keys.includes(pendingKey)) {
            setSelectedGroup(g.pluginId);
            break;
          }
        }
        setTimeout(() => {
          document.getElementById(`setting-row-${pendingKey}`)?.scrollIntoView({ block: "center" });
        }, 200);
      }
    }).catch(() => {});
  }, [groupsRaw, setSearch, setSelectedGroup]);

  // ── scrollTo 双通道 B：实时订阅 ──
  useEffect(() => {
    try {
      const unsub = lk().onRequestScrollToSetting((key: string) => {
        setSearch("");
        for (const g of groupsRaw) {
          if (g.keys.includes(key)) {
            setSelectedGroup(g.pluginId);
            break;
          }
        }
        setTimeout(() => {
          document.getElementById(`setting-row-${key}`)?.scrollIntoView({ block: "center" });
        }, 200);
      });
      return unsub;
    } catch { return; }
  }, [groupsRaw, setSearch, setSelectedGroup]);

  // ── 监听外部"打开快捷键设置"请求 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      setActiveTab("keybindings");
      if (detail?.query) setKeybindingQuery(detail.query);
    };
    window.addEventListener(CUSTOM_EVENT_OPEN_KEYBINDINGS, handler);
    return () => window.removeEventListener(CUSTOM_EVENT_OPEN_KEYBINDINGS, handler);
  }, [setActiveTab, setKeybindingQuery]);
}

export default useSettingsEvents;
