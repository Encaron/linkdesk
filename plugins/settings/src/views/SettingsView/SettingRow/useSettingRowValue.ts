/**
 * SettingRow 的值读写——当前值 / 显隐依赖值 / 动作按钮禁用条件 / 写回。
 * E6#87d 自 SettingRow.tsx 逐字搬出（只搬家，零逻辑变更）。
 */

import { useCallback } from "react";
import { useConfigurationValueIpc, useConfigurationValuesIpc } from "../../hooks/useConfigurationValueIpc";
import { lk } from "../helpers";
import type { ConfigProperty } from "../types";

export function useSettingRowValue(
  configKey: string,
  prop: ConfigProperty | undefined,
  onChange: () => void,
) {
  // IPC 版 hook——替代 useConfigurationValue
  const currentValue = useConfigurationValueIpc(configKey);
  const depValue = useConfigurationValueIpc(prop?.dependsOn?.key ?? "");
  // E5.8#50.26：actionDisabledAll——动作按钮禁用条件（混搭复位「6 来源全跟随主题 → 置灰」）：
  // 全部 {key,value} 匹配当前配置值时禁用（mockup 01 updateMixReset 同款 `!anyCustom`）
  const actionKeys = prop?.actionDisabledAll?.map((c) => c.key) ?? [];
  const actionValues = useConfigurationValuesIpc(actionKeys);
  const actionDisabled = (prop?.actionDisabledAll ?? []).every((c) => actionValues[c.key] === c.value);

  const handleChange = useCallback(
    async (value: unknown) => {
      try {
        await lk().set(configKey, value);
        onChange();
      } catch (e) {
        console.error("[SettingsView] 设置失败:", configKey, e);
      }
    },
    [configKey, onChange],
  );

  return { currentValue, depValue, actionDisabled, handleChange };
}
