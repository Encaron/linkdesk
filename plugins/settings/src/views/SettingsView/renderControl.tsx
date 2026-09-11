/**
 * renderControl——根据 property type/uiHint 渲染对应控件（分发器门面）。
 * 自壳迁入（E5.8#41.14）；E6#54c：控件 import 全走 @linkdesk/ui（零 @src/core）。
 * 依赖方向：renderControl → @linkdesk/ui 控件（Toggle/SelectBox/FontFamilySelect/FilePathInput/NumberInput）
 *   + ObjectEditor + types + 同名夹子件；被 SettingRow 消费。
 * E6#87d：四个自定义控件移入同名夹（`renderControl/imagePicker.tsx` / `renderControl/toneControls.tsx`），
 *   stringList 的 locked/editable 前置计算移入 `renderControl/stringList.ts`（纯函数）。
 */

// E6#54c：共享控件走 @linkdesk/ui（@src/components/shared 双入口已禁——见 eslint 插件块）
import {
  Button, // E5.8#99：实心动作按钮（双轨制实心轨——原 settings-action-btn 收编壳共享）
  DynamicSelect, // E5.8#50.23：动态下拉（optionsFrom 渲染时调 listRecipes）
  FilePathInput,
  FontFamilySelect,
  NumberInput,
  SegmentedRadio, // E5.8#99：分段单选（ghost 双轨制——#91 fontTone/#98 accentSource 收敛共用）
  SelectBox,
  Slider, // E5.8#50.9：滑杆控件
  StringListEditor, // E6#30c：字符串数组编辑器（uiHint "stringList"——marketplaceSources 源列表）
  ThemePicker, // E5.8#50.22：主题配方卡片（数据走 window.linkdesk.theme）
  Toggle,
  inferSliderStep, // E5.8#65：滑杆 step 推导（浮点区间连续可调）
  urlSourceKey, // E6#30c：URL 源身份（owner/repo、分支无关）——stringList 的 itemKey（判重规则见 renderControl/stringList.ts）
} from "@linkdesk/ui";
import { formatSliderValue } from "./sliderValueLabel"; // E5.8#77：滑杆值标签格式化（unit 声明 → ×倍数/px）
import ObjectEditor from "./ObjectEditor";
import { mapSegmentedOptions } from "./mapSegmentedOptions"; // E5.8#99：分段单选选项映射（通用 segmented + fontTone/accentSource 预览覆盖共用）
import type { ConfigProperty } from "./types";
import { BackgroundImagePicker } from "./renderControl/imagePicker";
import { AccentSourceControl, FontToneControl } from "./renderControl/toneControls";
import { splitStringList } from "./renderControl/stringList";

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
    case "fontSize": // E5.8 Phase 12 #161：min/max/step/unit 从 schema 读——editor.fontSize 不声明 → 8/72/1/无单位（零回归）；app.uiFontScale 声明 85/150/5/％
      return (
        <NumberInput
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={prop.minimum ?? 8}
          max={prop.maximum ?? 72}
          step={prop.step ?? 1}
          unit={prop.unit}
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
    case "segmented": // E5.8#99 通用化：第三方声明 uiHint:"segmented" + enum + enumDescriptions 即得分段单选（ghost 轨，零预览）
      return (
        <SegmentedRadio
          value={String(val)}
          ariaLabel={prop.description ? t(prop.description) : undefined}
          options={mapSegmentedOptions(prop, t)}
          onChange={(v) => onChange(v)}
        />
      );
    case "fontTone": // E5.8#91+#99：文字极性三态分段（跟随主题/亮字/暗字）——Aa 每态预览（预览覆盖，选项映射走 mapSegmentedOptions）
      return (
        <FontToneControl
          value={String(val)}
          options={mapSegmentedOptions(prop, t)}
          onChange={(v) => onChange(v)}
          t={t}
        />
      );
    case "accentSource": // E5.8#98+#99：强调色来源分段（跟随主题配方/自定义）——色块段内预览（预览覆盖，选项映射走 mapSegmentedOptions）
      return (
        <AccentSourceControl
          value={String(val)}
          options={mapSegmentedOptions(prop, t)}
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
    case "stringList": {
      // E6#30c：锁定行/作者行的切分（身份规则见 renderControl/stringList.ts 头注）。存盘只写作者源数组
      //（onChange 收 StringListEditor 的 value = 已滤 locked 的剩余）。文案走 t()，对任何该 uiHint 配置通用。
      const { locked, editable } = splitStringList(prop, value);
      return (
        <StringListEditor
          value={editable}
          onChange={(next) => onChange(next)}
          locked={locked}
          lockedBadge={t("内置")}
          addLabel={t("添加")}
          removeTitle={t("删除")}
          urlOnly
          itemKey={urlSourceKey}
          placeholder={t("粘贴 URL…")}
          emptyMessage={t("请输入 URL。")}
          badUrlMessage={t("URL 格式不对——以 http(s):// 开头。")}
          duplicateMessage={t("这个 URL 已经在列表里了。")}
        />
      );
    }
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
          <Button
            disabled={actionDisabled}
            onClick={() => { void window.linkdesk?.commands?.executeCommand?.(prop.actionCommand ?? ""); }}
          >
            {t(prop.description ?? "")}
          </Button>
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

export default renderControl;
