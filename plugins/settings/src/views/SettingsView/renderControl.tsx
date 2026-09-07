/**
 * renderControl——根据 property type/uiHint 渲染对应控件。
 * 自壳迁入（E5.8#41.14）；E6#54c：控件 import 全走 @linkdesk/ui（零 @src/core）。
 * 依赖方向：renderControl → @linkdesk/ui 控件（Toggle/SelectBox/FontFamilySelect/FilePathInput/NumberInput）
 *   + ObjectEditor + types；被 SettingRow 消费。
 */

import { useState } from "react"; // E5.8#50.11：背景图导入 busy 态
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
} from "@linkdesk/ui";
import { formatSliderValue } from "./sliderValueLabel"; // E5.8#77：滑杆值标签格式化（unit 声明 → ×倍数/px）
import ObjectEditor from "./ObjectEditor";
import { mapSegmentedOptions } from "./mapSegmentedOptions"; // E5.8#99：分段单选选项映射（通用 segmented + fontTone/accentSource 预览覆盖共用）
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
      // E6#30c（03-添加市场源-mockup.html ① 行内形态——设计唯一源）：字符串数组（URL 源列表）编辑器。
      // default 数组 = locked 固定行（官方源「内置」徽标 + 锁——不可删、不入 onChange 值、永不落盘，
      // 读时由 getSourceUrls 恒前置去重）；effective 值（含 default）减 locked 后 = 作者源（可删）。
      // 存盘只写作者源数组（onChange 收 StringListEditor 的 value = 已滤 locked 的剩余）。UI 文案走 t()。
      // 🔒 边界（E6#30c）：locked/editable 按 default 精确串相减——官方源「其他形态」（仓库主页/HEAD 直链）
      //   的排除是 marketplace 域规则（sourceKeyOfUrl owner/repo 身份、分支无关），收口在 marketplace 读边界
      //   （readConfiguredAuthorSources/getSourceUrls）——本通用渲染器不 import 插件域（设置/市场独立插件）。
      //   官方凭受支持入口（弹窗加源）永落不了盘；历史污染残留此处显示为可删作者行 = 手动清理通道。
      const locked = Array.isArray(prop.default)
        ? prop.default.filter((s): s is string => typeof s === "string")
        : [];
      const base = Array.isArray(value)
        ? (value as unknown[])
        : Array.isArray(prop.default)
          ? (prop.default as unknown[])
          : [];
      const editable = base.filter((s): s is string => typeof s === "string" && !locked.includes(s));
      return (
        <StringListEditor
          value={editable}
          onChange={(next) => onChange(next)}
          locked={locked}
          lockedBadge={t("内置")}
          addLabel={t("添加")}
          removeTitle={t("删除")}
          urlOnly
          placeholder={t("粘贴作者仓库 URL（例：https://github.com/用户名/仓库名）")}
          emptyMessage={t("请输入仓库 URL。")}
          badUrlMessage={t("URL 格式不对——以 http(s):// 开头。示例：https://github.com/用户名/仓库名")}
          duplicateMessage={t("这个源已经在列表里了（官方源内置，无需重复添加）。")}
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
      <Button onClick={handlePick} disabled={busy}>
        {t("选择图片…")}
      </Button>
      {value !== CONFIG_NONE_SENTINEL && (
        <Button onClick={() => onChange(CONFIG_NONE_SENTINEL)}>
          {t("无背景")}
        </Button>
      )}
      {value !== "" && (
        <Button onClick={() => onChange("")}>
          {t("清除图片")}
        </Button>
      )}
      <span className="settings-image-path" title={display}>
        {display}
      </span>
    </div>
  );
}

/** E5.8#91 文字极性预览半区映射——每态 = 系统双字系标尺两极性取样（深/浅），
 *  CSS 类消费 shell --tone-* 标尺 token（SettingsView.css，色值定义在 index.css :root）——TS 零 hex 零破例。 */
const FONT_TONE_POLARITY_HALVES: Record<string, readonly string[]> = {
  followTheme: ["deep", "light"], // 分半深/浅——主题明暗决定极性（深半亮字 + 浅半暗字并置）
  light: ["deep"], // 亮字（深底用）——深底白字
  dark: ["light"], // 暗字（浅底用）——浅底深字
};

/** 分段控件段内预览 swatch——单一几何（52×30 + var(--radius-sm)，SettingsView.css .settings-segmented-swatch），
 *  fontTone（Aa 分半）+ accentSource（色块）共用（#3 归一化——不再各自造 swatch 变体）。 */
function FontTonePreview({ value }: { value: string }): React.ReactNode {
  const halves = FONT_TONE_POLARITY_HALVES[value];
  if (!halves) return null;
  return (
    <span className="settings-segmented-swatch" aria-hidden="true">
      {halves.map((polarity, j) => (
        <span key={j} className={`settings-font-tone-half settings-font-tone-half--${polarity}`}>
          Aa
        </span>
      ))}
    </span>
  );
}

/**
 * E5.8#98+#99：强调色来源分段控件——两态（跟随主题配方/自定义）+ 段内预览（#3 归一化，对标 #91 每态预览）。
 * 跟随主题配方段 = 中性分半示意「主题决定强调色」（themeable 变量，非运行值——真实主题强调色遍布壳 UI）；
 * 自定义段 = 实时生效强调色——applyAccentColor 恒把 effective accent 写 --accent（自定义色 / 清除回主题 /
 *   跟随主题 三态全对），声明式读 CSS 变量（.settings-segmented-swatch--accent），零 IPC 零 DOM 读。
 * 选项映射（短标签/tooltip）走 mapSegmentedOptions 通用函数（#99 三消费方共用）。无线电语义 + roving tabindex 在壳 SegmentedRadio。
 * （#98 曾用段外生效 swatch——第三 swatch 变体，本号按归一化改为段内预览；E5.8 Phase 11.13 去命令式读数。）
 */
function AccentSourceControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string; title: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  return (
    <SegmentedRadio
      value={value}
      ariaLabel={t("强调色来源")}
      options={options.map((opt) => ({
        ...opt,
        preview: opt.value === "custom" ? (
          <span className="settings-segmented-swatch settings-segmented-swatch--accent" aria-hidden="true" />
        ) : (
          <span className="settings-segmented-swatch settings-segmented-swatch--split" aria-hidden="true" />
        ),
      }))}
      onChange={(v) => onChange(v)}
    />
  );
}

/**
 * E5.8#91+#99：文字极性分段控件——三态（跟随主题/亮字/暗字）+ 每态预览方块。
 * 选项映射（短标签/tooltip）走 mapSegmentedOptions 通用函数（#99 三消费方共用）。
 * 预览块取样系统双字系标尺；跟随主题 = 分半深/浅示意「主题明暗决定极性」。
 */
function FontToneControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string; title: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  return (
    <SegmentedRadio
      value={value}
      ariaLabel={t("文字极性")}
      options={options.map((opt) => ({ ...opt, preview: <FontTonePreview value={opt.value} /> }))}
      onChange={(v) => onChange(v)}
    />
  );
}

export default renderControl;
