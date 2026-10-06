/**
 * ColorField——「颜色」控件的渲染体（色块 ＋ 即时写文本输入）。
 *
 * 2026-10-06《分段预览色块边缘串色》案 · 尾巴 T1：原住官方设置插件 `SettingsView/renderControl.tsx`
 * （`uiHint:"color"` 与 `renderHint:"color"` 两处**逐字节重复**的自画几何 ＋ 私有 CSS
 * `.settings-color-control` / `.settings-color-swatch`）。判据 A：`color` 是**宿主声明的** hint 值，
 * 它的渲染体必须住共享层——否则换一个渲染方就得照着重画一遍，而「两处拷贝同源同病」正是本案串色的活证据。
 *
 * 契约：纯 props in / events out——⛔ 本件不弹调色层、⛔ 不认识任何配置键。
 * 调色弹层是**调用方**的事（共享 `ColorPicker` ＋ 调用方自持开合与锚点状态，先例 `SettingRow.tsx`）；
 * 点击回调只把事件交出去，锚点怎么算、弹层开不开，共享层零知识。
 *
 * 几何与外观：20×20 ＋ `var(--radius-sm)` ＋ `1px var(--separator)`（hover 转 `--accent`）；
 * 文本框吃宿主类 `ldk-input`（外观归壳，本件不重定义）。颜色全走 CSS 变量（硬约束 1），零 hex。
 */

import "./ColorField.css";

function ColorField({
  value,
  onChange,
  onSwatchClick,
}: {
  value: string;
  /** 即时写：每次输入即回调（与迁移前逐字一致的「边打边写」语义，⛔ 不是失焦提交） */
  onChange: (v: string) => void;
  /** 点色块——事件原样交出去，调用方据此开自己的调色弹层（锚点由调用方从事件里取） */
  onSwatchClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="ldk-color-field">
      <div
        className="ldk-color-field__swatch"
        style={{ background: value }}
        data-hint={value}
        data-hint-delay="0"
        onClick={onSwatchClick}
      />
      <input
        className="ldk-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default ColorField;
