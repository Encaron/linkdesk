/**
 * useSettingsEvents——SettingsView 订阅/跳转 effect 组（自壳迁入，E5.8#41.14）。
 * 配置变更版本号递增 + 插件生命周期刷新 + M1 双通道（齿轮"设置"跳分组）+ scrollTo 双通道
 * + 契约双通道（打开快捷键 tab——替代错配 window 事件死路由）。
 * 状态 setter + groupsRaw 走入参；deps 补稳定 setter 恒稳定消 exhaustive-deps（零语义变化）。
 * 依赖方向：useSettingsEvents → helpers（lk）+ types（GroupInfo）；被聚合器 SettingsView 消费。
 */

import { useEffect } from "react";
import { lk } from "./helpers";
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

  // ── E5.8#41.14 🔴 修复：打开快捷键 tab——契约双通道（替代错配 window 事件死路由）。
  //    原 window.addEventListener(CUSTOM_EVENT_OPEN_KEYBINDINGS) 与壳 dispatch 字面量
  //    （kebab vs camel）永不命中 → tab 从不跳转。改 consumeOpenKeybindings/onRequestOpenKeybindings。 ──
  // 双通道 A：mount 时消费 pending——设置未打开时"打开快捷键设置"命令的请求
  useEffect(() => {
    lk().consumeOpenKeybindings().then((pending: { query?: string } | null) => {
      if (pending) {
        setActiveTab("keybindings");
        if (pending.query) setKeybindingQuery(pending.query);
      }
    }).catch(() => {});
  }, [setActiveTab, setKeybindingQuery]);

  // 双通道 B：实时订阅——设置已打开时"打开快捷键设置"命令即时切 tab
  useEffect(() => {
    try {
      const unsub = lk().onRequestOpenKeybindings((payload: { query?: string }) => {
        setActiveTab("keybindings");
        if (payload?.query) setKeybindingQuery(payload.query);
      });
      return unsub;
    } catch { return; }
  }, [setActiveTab, setKeybindingQuery]);
}

export default useSettingsEvents;
