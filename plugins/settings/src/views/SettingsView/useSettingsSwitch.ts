/**
 * 角色套 / 设置套的切换——E6#87d 自 SettingsView.tsx 的两个 useCallback 逐字搬出（只搬家，零逻辑变更）。
 */

import { useCallback } from "react";
import { OWN_FACTORY_ROLE } from "./helpers";
import type { SettingsViewProps } from "./types";

type Candidate = { pluginId: string; title: string; viewId?: string };

export function useSettingsSwitch(
  tabId: SettingsViewProps["tabId"],
  settingsActiveId: string | undefined,
  settingsCandidates: Candidate[],
  setVersion: React.Dispatch<React.SetStateAction<number>>,
) {
  // ── 角色分组切换（#41.14 ⑤）——setActive 落盘后重拉数据，激活套配置随切换换 ──
  const handleRoleSwitch = useCallback(async (role: string, pluginId: string) => {
    try {
      await window.linkdesk.factorySlots.setActive(role, pluginId);
      setVersion((v) => v + 1);
    } catch (e) {
      console.error(`[SettingsView] 切换角色 "${role}" 激活套失败:`, e);
    }
  }, [setVersion]);

  // ── 设置套切换（E5.8#41.13）——全插件侧换套：setActive 落盘 → 关本套标签页 → 开新激活套。
  //    开关不触碰壳：换整套设置 UI = 换当前渲染的插件 tab（close 自身 tabId + create targetId，
  //    singleton 去重已存在则聚焦）。浮动面板（无 tabId）退化为只开新激活套 tab。 ──
  const handleSettingsSwitch = useCallback(async (targetId: string) => {
    if (targetId === settingsActiveId) return; // 点当前激活套 = 无操作（不重开自身 tab）
    try {
      await window.linkdesk.factorySlots.setActive(OWN_FACTORY_ROLE, targetId);
      if (tabId) {
        // 标签页形态：关自身 tab + 开目标 tab（singleton 去重已存在则聚焦）
        await window.linkdesk.tabs.close(tabId).catch(() => {});
        await window.linkdesk.tabs.create(targetId).catch(() => {});
      } else {
        // 悬浮面板形态（E5.8#41.18）：原地换套——revealFloating 复合替换（同 viewId 异插件 → 面板换内容）
        const target = settingsCandidates.find((c) => c.pluginId === targetId);
        if (target?.viewId) {
          await window.linkdesk.panel.revealFloating(target.viewId, target.pluginId).catch(() => {});
        } else {
          // 目标套未声明 floatingPanel → 退回开标签页（无悬浮面板可换）
          await window.linkdesk.tabs.create(targetId).catch(() => {});
        }
      }
    } catch (e) {
      console.error(`[SettingsView] 切换设置套 "${targetId}" 失败:`, e);
    }
  }, [tabId, settingsActiveId, settingsCandidates]);

  return { handleRoleSwitch, handleSettingsSwitch };
}
