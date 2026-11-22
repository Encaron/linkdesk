# ColorPicker 升级：RGBA / 透明度

> 2026-11-23 用户点出「调色器能力不足，玻璃色调不了」。**状态：🟢 设计稿已出，待用户看稿**（Q1–Q5 按建议收口）——本夹只做设计与契约，未动代码。
> **可交互预览**：[color-picker-preview.html](color-picker-preview.html)（点色块/拖 SV/拖 alpha/输入/预设，右下角实时命令日志）。
> **设计正文**：[01-设计-交互与AI操作面.md](01-设计-交互与AI操作面.md)。
> 档案归属 = 04（共享控件 ＋ 设置消费 ＋ UI 包发版，多面交织）。拍板后转 §三 已立项并补任务清单。

## 一、现状与证据

- `src/components/shared/color-picker/ColorPicker.tsx` 是 **hex-only**：
  - 内部只有 `hexToRgb` / `rgbToHex` / `hexToHsv` / `hsvToHex`；
  - 对外 `onChange: (hex: string) => void`，没有 alpha 通道。
- `src/components/shared/color-field/ColorField.tsx` 原样显示字符串；点色块打开的 `ColorPicker` 会把当前值当 hex 解析。
- 玻璃叠加色（`app.glassTint` / 主题 `glass.tint`）是 `rgba(...)`（例：`rgba(255,247,230,.62)`）。在设置里打开调色器时，`hexToRgb("rgba(…)")` 取不到 hex 段 ⇒ RGB/HSV 全 NaN——**不是「不能调 alpha」，而是 rgba 值根本进不去**。
- 受影响面：
  - `uiHint:"color"` / `renderHint:"color"` 的所有行（强调色、玻璃叠加色、插件颜色配置）；
  - 需要半透明的 token：`--glass-tint`、`--surface-media-scrim`、`--scrim-*`、`--bg-*` 的 rgba 值；
  - 主题作者在配方里写了 rgba，但用户在设置里无法微调（只能改配方或整串手打）。

## 二、提案（待拍板）

1. **RGBA 四轴**：色相 / 饱和度 / 明度 / alpha；alpha 用 0–100% 滑杆；棋盘格底显示透明。
2. **输入解析**：接受 `#RRGGBB`、`#RRGGBBAA`、`rgb()`、`rgba()`、`hsl()`、`hsla()`。
3. **输出格式**：alpha = 1 ⇒ 写 hex（旧值零变化）；alpha < 1 ⇒ 写 `rgba(r,g,b,a)`（保留 2–3 位小数）。
4. **逐键 alpha 权限**：新增 `allowAlpha?: boolean`（默认 **false**）——强调色等保持不透明（参与对比度），`app.glassTint` 等显式开 `true`。⛔ 不做「全局默认允许 alpha」，避免作者/用户手滑把强调色调成半透明。
5. **ColorField 联动**：色块棋盘格底；文本输入保留原样；RGBA 回显不再被当 hex。
6. **预设**：允许带 alpha 的预设色（玻璃主题的 tint 预设）。
7. **测试与文档**：ColorPicker 解析/输出/边界单测；`@linkdesk/ui` 作者面文档；UI 包升版发版（作者轴）。
8. **无障碍**：全键盘可操作、焦点环、读屏标签；alpha 滑杆带 `aria-valuetext`。

## 三、开放问题（拍板项）

| # | 问题 | 建议 |
|:--|:--|:--|
| Q1 | alpha 是否连续？ | 连续 0–1 + 数值输入；不设档位 |
| Q2 | 强调色允许 alpha 吗？ | **否**——`allowAlpha` 默认 false；强调色参与对比度 |
| Q3 | 颜色空间继续 HSV 还是改 HSL？ | 继续 HSV（现值），避免重写二维面板 |
| Q4 | 接受 `var(--x)` / `color-mix()` 吗？ | 只读展示，不进调色器（解析不了就不改） |
| Q5 | 屏幕吸管（EyeDropper）？ | 本期不做；需要时另立 |

## 四、影响面

- 共享件：`ColorPicker` / `ColorField`（`@linkdesk/ui`）。
- 消费方：设置插件（`app.glassTint` / `app.accentColor` / 插件颜色行）、第三方 `uiHint:"color"`。
- 主题侧：`capTintAlpha` 仍把玻璃 tint 封顶 0.5（防不透明死盖片）；alpha 调色不越这条线。
- 无新 token、无壳核心改动；旧 hex 配置向后兼容。

## 五、验收

- 玻璃叠加色可在设置里调 alpha 并即时看到玻璃变化；
- 强调色仍不透明（`allowAlpha` 默认关）；
- 旧 hex 值打开/保存后零变化；
- 单测 + 作者文档 + UI 包发版齐全。
