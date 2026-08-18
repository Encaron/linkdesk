/**
 * SettingRow——单个设置行（IPC 读写 + 声明式显隐 + 齿轮菜单 + 色块取色）。
 * E5.8#0d.10-7c：自 SettingsView.tsx 拆出——行组件：configKey + prop 入参，内部自持 gear/colorPicker 弹层状态。
 * 依赖方向：SettingRow → renderControl + shared（ContextMenu/ColorPicker）+ core（MENU_SLOTS/useConfigurationValueIpc）
 *   + helpers/types；被聚合器 SettingsView 消费。
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import ContextMenu from "../../../shared/context-menu/ContextMenu";
import ColorPicker from "../../../shared/color-picker/ColorPicker";
import { useConfigurationValueIpc } from "../../../../core/react/useConfigurationIpc";
import { MENU_SLOTS } from "../../../../core/registry/commands/MenuRegistry";
import renderControl from "./renderControl";
import { lk } from "./helpers";
import type { ConfigProperty } from "./types";

function SettingRow({
  configKey,
  prop,
  onChange,
}: {
  configKey: string;
  prop: ConfigProperty | undefined;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const gearRef = useRef<HTMLButtonElement>(null);
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  // IPC 版 hook——替代 useConfigurationValue
  const currentValue = useConfigurationValueIpc(configKey);
  const depValue = useConfigurationValueIpc(prop?.dependsOn?.key ?? "");

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

  // 齿轮打开前设 context key
  const handleGearClick = useCallback(async () => {
    try {
      window.linkdesk?.contextKey?.set("settingKey", configKey);
      // inspectConfiguration 异步获取修改状态——wire 面 unknown，IPC 边界收窄（主进程组装 { userValue, ... }）
      const insp = await lk().inspectConfiguration(configKey) as { userValue?: unknown } | undefined;
      window.linkdesk?.contextKey?.set("settingModified", insp?.userValue !== undefined);
    } catch { /* 静默 */ }
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) {
      setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [configKey]);

  // 齿轮关闭——清理 context key
  const handleGearClose = useCallback(() => {
    setGearAnchor(null);
    window.linkdesk?.contextKey?.set("settingKey", undefined);
    window.linkdesk?.contextKey?.set("settingModified", false);
  }, []);

  if (!prop) return null;

  // 声明式条件显隐
  if (prop.dependsOn && depValue !== prop.dependsOn.value) return null;

  return (
    <div className="settings-row" id={`setting-row-${configKey}`}>
      <div className="settings-row-info">
        <label className="settings-row-label">{configKey}</label>
        <span className="settings-row-desc">{t(prop.description ?? "")}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange, t, (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setColorPickerAnchor({ x: rect.right + 4, y: rect.top });
          setColorPickerOpen(true);
        })}
      </div>
      {/* hover 齿轮 */}
      <button
        ref={gearRef}
        className="settings-row-gear"
        title={t("更多操作")}
        onClick={handleGearClick}
      >
        <span className="codicon codicon-gear" />
      </button>
      {gearAnchor && (
        <ContextMenu
          menuId={MENU_SLOTS.SettingItemGear}
          anchor={gearAnchor}
          context={{ settingKey: configKey }}
          onClose={handleGearClose}
        />
      )}
      {/* 色块点击 → ColorPicker */}
      {prop.renderHint === "color" && (
        <ColorPicker
          open={colorPickerOpen}
          value={String(currentValue ?? prop.default ?? "")}
          onChange={(hex) => handleChange(hex)}
          onClose={() => setColorPickerOpen(false)}
          anchor={colorPickerAnchor}
          presets={["#0078d4", "#e81123", "#10893e", "#ff8c00", "#6b69d6", "#0099bc"]}
        />
      )}
    </div>
  );
}

export default SettingRow;
