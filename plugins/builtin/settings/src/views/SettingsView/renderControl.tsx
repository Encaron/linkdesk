/**
 * renderControl——根据 property type/uiHint 渲染对应控件。
 * 自壳迁入（E5.8#41.14）：控件 import 全走 @src/components/shared 例外表白名单（零 @src/core）。
 * 依赖方向：renderControl → shared 控件（Toggle/SelectBox/FontFamilySelect/FilePathInput/NumberInput）
 *   + ObjectEditor + types；被 SettingRow 消费。
 */

import { useRef, useState } from "react"; // E5.8#50.11：背景图导入 busy 态；E5.8#91：roving tabindex 方向键导航
import Toggle from "@src/components/shared/toggle/Toggle";
import SelectBox from "@src/components/shared/select-box/SelectBox";
import DynamicSelect from "@src/components/shared/select-box/DynamicSelect"; // E5.8#50.23：动态下拉（optionsFrom 渲染时调 listRecipes）
import FontFamilySelect from "@src/components/shared/font-family-select/FontFamilySelect";
import FilePathInput from "@src/components/shared/file-path-input/FilePathInput";
import NumberInput from "@src/components/shared/number-input/NumberInput";
import Slider from "@src/components/shared/slider/Slider"; // E5.8#50.9：滑杆控件（shared 白名单惯例，非 @src/core 零警告）
import { inferSliderStep } from "@src/components/shared/slider/sliderStep"; // E5.8#65：滑杆 step 推导（浮点区间连续可调）
import ThemePicker from "@src/components/shared/theme-picker/ThemePicker"; // E5.8#50.22：主题配方卡片（数据走 window.linkdesk.theme）
import { formatSliderValue } from "./sliderValueLabel"; // E5.8#77：滑杆值标签格式化（unit 声明 → ×倍数/px）
import ObjectEditor from "./ObjectEditor";
import type { ConfigProperty } from "./types";

/** 根据 property type 渲染对应控件 */
function renderControl(
  prop: ConfigProperty,
  value: unknown,
  onChange: (v: unknown) => void,
  t: (key: string) => string,
  onColorSwatchClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
  actionDisabled?: boolean,
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
    case "fontTone": // E5.8#91：文字极性三态分段控件（跟随主题/亮字/暗字）——每态预览方块实时取样系统双字系标尺
      return (
        <FontToneControl
          value={String(val)}
          options={(prop.enum ?? []).map((v, i) => ({
            value: v,
            label: prop.enumDescriptions?.[i] ? t(prop.enumDescriptions[i]) : t(v),
          }))}
          onChange={(v) => onChange(v)}
          t={t}
        />
      );
    case "accentSource": // E5.8#98：强调色来源分段控件（跟随主题配方/自定义）——生效强调色 swatch 实时读数
      return (
        <AccentSourceControl
          value={String(val)}
          options={(prop.enum ?? []).map((v, i) => ({
            value: v,
            label: prop.enumDescriptions?.[i] ? t(prop.enumDescriptions[i]) : t(v),
          }))}
          onChange={(v) => onChange(v)}
          t={t}
        />
      );
    case "slider": { // E5.8#50.9：滑杆（#50.10 玻璃五配置消费）——E5.8#65：step 推导（浮点区间 0.01，schema 可显式 step 覆盖）
      const sliderMin = prop.minimum ?? 0;
      const sliderMax = prop.maximum ?? 100;
      // E5.8#77：右侧值标签——当前值 + 单位（schema unit 元数据；无 unit = 裸数值，第三方零侵入）
      return (
        <div className="settings-slider-control">
          <Slider
            value={Number(val)}
            onChange={(v) => onChange(v)}
            min={sliderMin}
            max={sliderMax}
            step={prop.step ?? inferSliderStep(sliderMin, sliderMax)}
          />
          <span className="settings-slider-value">
            {formatSliderValue(Number(val), prop.unit)}
          </span>
        </div>
      );
    }
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
      // renderHint "action"：渲染操作按钮。
      // E5.8#50.26：onApply 是函数——IPC 序列化剥除（configuration.ts 剥离）——插件侧不可达，
      // 点击改走 actionCommand 执行壳命令（混搭复位 → theme.resetMix 单一写入点触发壳侧 onApply 链）；
      // actionDisabled = actionDisabledAll 全命中当前配置值 → 置灰（mockup 01 updateMixReset）。
      if (prop.renderHint === "action") {
        return (
          <button
            className="settings-action-btn"
            disabled={actionDisabled}
            onClick={() => { void window.linkdesk?.commands?.executeCommand?.(prop.actionCommand ?? ""); }}
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
 * （受控来源——用户任选路径不能 file:// 直读）→ 受控路径持久化。
 * E5.8#87 清除语义定案：三态并存——「清除图片」= 回主题（空，presence 门控回落主题图）；
 * 「无背景」= 绝对无图（显式 __none__，盖掉主题/mix 图）。路径区显示友好态文案（跟随主题/无背景）。
 */
// E5.8#87：显式「无」哨兵——字符串契约（__none__ 与壳 ThemeEngine.CONFIG_NONE_SENTINEL 同字面量，
// 插件不能 import @src/core，对标 "followTheme" 哨兵契约）
const CONFIG_NONE_SENTINEL = "__none__";

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
  // E5.8#87：路径区友好态——空 = 跟随主题；__none__ = 无背景；否则显示受控路径
  const display = value === CONFIG_NONE_SENTINEL ? t("无背景") : value === "" ? t("跟随主题") : value;
  return (
    <div className="settings-image-picker">
      <button className="settings-action-btn" onClick={handlePick} disabled={busy}>
        {t("选择图片…")}
      </button>
      {value !== CONFIG_NONE_SENTINEL && (
        <button className="settings-action-btn" onClick={() => onChange(CONFIG_NONE_SENTINEL)}>
          {t("无背景")}
        </button>
      )}
      {value !== "" && (
        <button className="settings-action-btn" onClick={() => onChange("")}>
          {t("清除图片")}
        </button>
      )}
      <span className="settings-image-path" title={display}>
        {display}
      </span>
    </div>
  );
}

/* eslint-disable linkdesk/no-hardcoded-hex -- E5.8#91 系统双字系标尺预览数据（与 ThemeEngine FONT_TONE_LIGHT_TEXT/DARK_TEXT 同值取样——预览非运行时样式） */
const FONT_TONE_PREVIEW: Record<string, { halves: { base: string; ink: string }[] }> = {
  followTheme: {
    // 跟随主题——分半深/浅示意「主题明暗决定极性」：深半亮字 + 浅半暗字并置
    halves: [
      { base: "#1A1A1A", ink: "#FFFFFF" },
      { base: "#F2F2F2", ink: "#1A1A1A" },
    ],
  },
  light: { halves: [{ base: "#1A1A1A", ink: "#FFFFFF" }] }, // 亮字（深底用）——深底白字
  dark: { halves: [{ base: "#F2F2F2", ink: "#1A1A1A" }] }, // 暗字（浅底用）——浅底深字
};
/* eslint-enable linkdesk/no-hardcoded-hex */

/**
 * E5.8#98：强调色来源分段控件——两态（跟随主题配方/自定义）+ 生效强调色 swatch。
 * 短标签 = enumDescription 全句首个 "—" 前段（如「跟随主题配方」）；tooltip = 全句解释。
 * 无线电语义：role radiogroup/radio + aria-checked + 方向键 roving tabindex（←→ 换档，对标 FontToneControl）。
 * 选中态 = accent 描边 + 微着色（与 FontToneControl 同视觉语言）。
 * swatch = 当前生效强调色实时读数（getComputedStyle --accent——壳 applyAccentColor 已广播 accent:changed
 *  → 池侧 --accent 同步；跟随主题 = 主题 accent，自定义 = 自定义色）。重渲染即重读——主题/配置变化即时反映
 * （SettingRow 的 useConfigurationValueIpc 订阅配置变化 → 本行重渲染 → swatch 刷新，display-only 无状态副作用）。
 */
function AccentSourceControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (index + dir + options.length) % options.length;
    optionRefs.current[next]?.focus();
    onChange(options[next].value);
  };
  // 生效强调色——渲染时实时读（display-only swatch，非状态）；--accent 未同步时为空串 → 透明兜底
  const effectiveAccent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return (
    <div className="settings-accent-source">
      <div className="settings-accent-source-options" role="radiogroup" aria-label={t("强调色来源")}>
        {options.map((opt, i) => {
          const short = opt.label.split("—")[0];
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              ref={(el) => { optionRefs.current[i] = el; }}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={`settings-accent-source-option${selected ? " selected" : ""}`}
              title={opt.label}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              {short}
            </button>
          );
        })}
      </div>
      <span
        className="settings-accent-source-swatch"
        style={{ background: effectiveAccent || undefined }}
        title={`${t("当前强调色")} ${effectiveAccent}`}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * E5.8#91：文字极性分段控件——三态（跟随主题/亮字/暗字）+ 每态实时预览方块。
 * 短标签 = enumDescription 全句首个 "—" 前段（如「亮字（深底用）」）；tooltip = 全句解释。
 * 无线电语义：role radiogroup/radio + aria-checked + 方向键 roving tabindex（←→↑↓ 换档）。
 * 选中态 = accent 描边 + 微着色（Navigation/Active State——选中档一目了然）；预览块取样系统双字系标尺。
 */
function FontToneControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (index + dir + options.length) % options.length;
    optionRefs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div className="settings-font-tone" role="radiogroup" aria-label={t("文字极性")}>
      {options.map((opt, i) => {
        const preview = FONT_TONE_PREVIEW[opt.value];
        const short = opt.label.split("—")[0];
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            ref={(el) => { optionRefs.current[i] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`settings-font-tone-option${selected ? " selected" : ""}`}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            <span className="settings-font-tone-swatch" aria-hidden="true">
              {preview?.halves.map((half, j) => (
                <span
                  key={j}
                  className="settings-font-tone-half"
                  style={{ background: half.base, color: half.ink }}
                >
                  Aa
                </span>
              ))}
            </span>
            <span className="settings-font-tone-label">{short}</span>
          </button>
        );
      })}
    </div>
  );
}

export default renderControl;
