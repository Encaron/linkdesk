/**
 * SettingRow 的齿轮菜单开合——E6#87d 自 SettingRow.tsx 逐字搬出（只搬家，零逻辑变更）。
 *
 * 菜单槽 id 是壳稳定契约面（壳 coreCommands 已注册该槽菜单项）；
 * 打开前把「这一行是谁」写进 context key，供壳侧菜单项 when 条件消费。
 */

import { useCallback, useState } from "react";
import { lk } from "../helpers";
import type { ConfigProperty } from "../types";

/** 设置项齿轮菜单槽——壳 MenuRegistry.MENU_SLOTS.SettingItemGear 稳定槽 id（菜单项由壳 coreCommands 注册） */
export const SETTING_ITEM_GEAR_MENU = "settingItemGear";

export function useSettingRowGear(
  gearRef: { current: HTMLButtonElement | null },
  configKey: string,
  prop: ConfigProperty | undefined,
) {
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);

  // 齿轮打开前设 context key
  const handleGearClick = useCallback(async () => {
    try {
      window.linkdesk?.contextKey?.set("settingKey", configKey);
      // E5.8 用户审计 #3：跟随主题门控——键声明 resetsToTheme 才显示齿轮「跟随主题」项
      // （coreCommands when="settingModified && settingFollowTheme"——通用设置插件零外观知识）
      window.linkdesk?.contextKey?.set("settingFollowTheme", !!prop?.resetsToTheme);
      // E5.8#158：默认项语义——resetsToDefault 键齿轮「重置此设置」改写 __none__（真默认），
      // when=settingResetsToDefault || (settingModified && !settingFollowTheme)（coreCommands）
      window.linkdesk?.contextKey?.set("settingResetsToDefault", !!prop?.resetsToDefault);
      // inspectConfiguration 异步获取修改状态——wire 面 unknown，IPC 边界收窄（主进程组装 { userValue, ... }）
      const insp = await lk().inspectConfiguration(configKey) as { userValue?: unknown } | undefined;
      window.linkdesk?.contextKey?.set("settingModified", insp?.userValue !== undefined);
    } catch { /* 静默 */ }
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) {
      setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [configKey, prop, gearRef]);

  // 齿轮关闭——清理 context key
  const handleGearClose = useCallback(() => {
    setGearAnchor(null);
    window.linkdesk?.contextKey?.set("settingKey", undefined);
    window.linkdesk?.contextKey?.set("settingModified", false);
    window.linkdesk?.contextKey?.set("settingFollowTheme", false);
    window.linkdesk?.contextKey?.set("settingResetsToDefault", false);
  }, []);

  return { gearAnchor, handleGearClick, handleGearClose };
}
