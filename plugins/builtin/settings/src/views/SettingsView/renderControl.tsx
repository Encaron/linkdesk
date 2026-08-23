/**
 * renderControl——根据 property type/uiHint 渲染对应控件。
 * 自壳迁入（E5.8#41.14）：控件 import 全走 @src/components/shared 例外表白名单（零 @src/core）。
 * 依赖方向：renderControl → shared 控件（Toggle/SelectBox/FontFamilySelect/FilePathInput/NumberInput）
 *   + ObjectEditor + types；被 SettingRow 消费。
 */

import { useState } from "react"; // E5.8#50.11：背景图导入 busy 态
import Toggle from "@src/components/shared/toggle/Toggle";
import SelectBox from "@src/components/shared/select-box/SelectBox";
import DynamicSelect from "@src/components/shared/select-box/DynamicSelect"; // E5.8#50.23：动态下拉（optionsFrom 渲染时调 listRecipes）
import FontFamilySelect from "@src/components/shared/font-family-select/FontFamilySelect";
import FilePathInput from "@src/components/shared/file-path-input/FilePathInput";
import NumberInput from "@src/components/shared/number-input/NumberInput";
import Slider from "@src/components/shared/slider/Slider"; // E5.8#50.9：滑杆控件（shared 白名单惯例，非 @src/core 零警告）
import ThemePicker from "@src/components/shared/theme-picker/ThemePicker"; // E5.8#50.22：主题配方卡片（数据走 window.linkdesk.theme）
import ObjectEditor from "./ObjectEditor";
import type { ConfigProperty } from "./types";

/** 根据 property type 渲染对应控件 */
function renderControl(
  prop: ConfigProperty,
  value: unknown,
  onChange: (v: unknown) => void,
  t: (key: string) => string,
  onColorSwatchClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
): React.ReactNode {
  const val = value ?? prop.default;

  // uiHint 优先——plugin.json 声明式控件选择
  switch (prop.uiHint) {
    case "fontSize":
      return (
        <NumberInput
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={8}
          max={72}
          step={1}
        />
      );
    case "color":
      return (
        <div className="settings-color-control">
          <div
            className="settings-color-swatch"
            style={{ background: String(val) }}
            title={String(val)}
            onClick={onColorSwatchClick}
          />
          <input
            className="input"
            type="text"
            value={String(val)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "fontFamily":
      // E5.8#50.20：monoOnly 从 property 声明读（缺省 = 等宽编辑器字体；app.fontFamily monoOnly:false = 全字族）
      return <FontFamilySelect value={String(val)} onChange={(v) => onChange(v)} monoOnly={prop.monoOnly} />;
    case "file":
      return <FilePathInput value={String(val)} onChange={(v) => onChange(v)} dialogType="file" />;
    case "directory":
      return <FilePathInput value={String(val)} onChange={(v) => onChange(v)} dialogType="directory" />;
    case "image": // E5.8#50.11：背景图——选图拷贝入库 + 清除（受控来源）
      return <BackgroundImagePicker value={String(val)} onChange={onChange} t={t} />;
    case "slider": // E5.8#50.9：滑杆（#50.10 玻璃五配置消费）——schema 无 step 字段，默认 1
      return (
        <Slider
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={prop.minimum ?? 0}
          max={prop.maximum ?? 100}
        />
      );
    case "themePicker": // E5.8#50.22：主题配方卡片——value=app.theme，点卡片 onChange(recipeId)（onApply 应用配方）
      return <ThemePicker value={String(val)} onChange={(v) => onChange(v)} />;
    case "select": // E5.8#50.23：动态下拉——optionsFrom 渲染时调 listRecipes 动态取（colorways 配色变体 / sources 混搭来源）
      return (
        <DynamicSelect
          value={String(val)}
          onChange={(v) => onChange(v)}
          optionsFrom={prop.optionsFrom ?? ""}
          domain={prop.optionsFromDomain}
        />
      );
    default:
      break;
  }

  switch (prop.type) {
    case "boolean":
      return (
        <Toggle
          checked={!!val}
          onChange={(v) => onChange(v)}
        />
      );

    case "string":
      // renderHint "action"：渲染操作按钮
      if (prop.renderHint === "action") {
        return (
          <button
            className="settings-action-btn"
            onClick={() => { prop.onApply?.(null); }}
          >
            {t(prop.description ?? "")}
          </button>
        );
      }
      if (prop.enum && prop.enum.length > 0) {
        const enumOptions = prop.enum.map((v, i) => ({
          value: v,
          label: prop.enumDescriptions?.[i] ? t(prop.enumDescriptions[i]) : t(v),
        }));
        return (
          <SelectBox
            value={String(val)}
            options={enumOptions}
            onChange={(v) => onChange(v)}
          />
        );
      }
      // renderHint "color" → 色块预览
      if (prop.renderHint === "color") {
        return (
          <div className="settings-color-control">
            <div
              className="settings-color-swatch"
              style={{ background: String(val) }}
              title={String(val)}
              onClick={onColorSwatchClick}
            />
            <input
              className="input"
              type="text"
              value={String(val)}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        );
      }
      return (
        <input
          className="input"
          type="text"
          value={String(val)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <NumberInput
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={prop.minimum}
          max={prop.maximum}
        />
      );

    case "object": {
      const obj = (typeof val === "object" && val !== null && !Array.isArray(val))
        ? (val as Record<string, unknown>)
        : {};
      return <ObjectEditor value={obj} onChange={(newObj) => onChange(newObj)} />;
    }

    case "array": {
      const arr = Array.isArray(val) ? val : [];
      const obj: Record<string, unknown> = {};
      arr.forEach((item, i) => { obj[String(i)] = item; });
      return (
        <ObjectEditor
          value={obj}
          onChange={(newObj) => {
            const newArr = Object.values(newObj);
            onChange(newArr);
          }}
        />
      );
    }

    default:
      return <span className="text-muted">{String(val)}</span>;
  }
}

/**
 * E5.8#50.11：背景图选择——对话框选图（图像扩展名过滤）→ appearance.importImage 拷贝入库
 * （受控来源——用户任选路径不能 file:// 直读）→ 受控路径持久化；「清除图片」还原无图。
 */
function BackgroundImagePicker({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const handlePick = async () => {
    setBusy(true);
    try {
      const picked = await window.linkdesk?.dialog?.open({
        title: t("选择图片…"),
        filters: [{ name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (!picked) return; // 取消——不动值
      const controlled = await window.linkdesk?.appearance?.importImage(picked);
      if (controlled) onChange(controlled);
    } catch (e) {
      console.error("[settings] 导入背景图失败:", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-image-picker">
      <button className="settings-action-btn" onClick={handlePick} disabled={busy}>
        {t("选择图片…")}
      </button>
      {value ? (
        <button className="settings-action-btn" onClick={() => onChange("")}>
          {t("清除图片")}
        </button>
      ) : null}
      <span className="settings-image-path" title={value}>
        {value}
      </span>
    </div>
  );
}

export default renderControl;
