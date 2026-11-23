# 主题极性归一化：`light/dark` 从“声明真相”降级为“作者提示”

> 2026-11-24 用户立案：接受**大改**，要求从根上做对，不做“先小改再补”。
> 状态：**🟡 设计稿待看**（本夹 = 设计 ＋ 可交互稿，未动产品代码）。
> 可交互稿：[polarity-preview.html](polarity-preview.html)（选主题 / 切对比度 / 看派生极性 / 看编辑器跟随）。

## 一、根因：一个二元枚举承担了三种职责

当前 `type: "light" | "dark"` 同时是：

1. **渲染真相**——`data-theme`、图标墨色/光晕、滚动条、快照首帧；
2. **UI 标签**——主题选择器的「亮色主题 / 暗色主题」、跨明暗配色警告；
3. **外部契约**——编辑器插件直接读 `data-theme` 决定 Monaco `vs` / `vs-dark`。

但主题已经演化出玻璃、tint、整窗图片、遮罩：**同一份 `type: light` 完全可能渲染出偏暗表面**；暗配方配亮色 colorway 也会“标签说暗、实际很亮”。实测证据：

- 壳内 `type/themeType/data-theme` 相关点 **58 处**；
- 契约 `LinkDeskThemeContribution.uiTheme` 已有 `"highContrast"` 第三值，但引擎只认 light/dark——枚举早被现实撑破；
- 编辑器 `theme-sync.ts` 与 `buildMonacoOptions.ts` 直接读 `data-theme === "dark"`，只能二选一；
- 2026-11-23 的「暗色主题 + 亮色配色」不协调，本质是 `type` 在替 token 说谎。

## 二、市场对照（2026-11）

| 系统 | 明暗模型 | 高对比 / 色觉 | 结论 |
|:--|:--|:--|:--|
| **VS Code** | `uiTheme: vs / vs-dark / hc-black / hc-light` | 高对比是**枚举值**，亮/暗各一 | 枚举扩张；编辑器契约需要它，但把“对比度”折进类型 |
| **GitHub** | Light / Dark / Dark dimmed | 2025-06 起**对比度与主题解耦**：任意主题可单独开“增加对比度”；另有 Light/Dark High Contrast、Colorblind 主题 | 明确走向正交：主题 × 对比度 |
| **Material 3** | Light / Dark scheme | 对比度是**用户可调的连续/三档**（standard / medium / high，-1…1），角色配对保证对比 | 对比度正交于明暗 |
| **Apple (iOS/macOS)** | Light / Dark | **Increase Contrast** 是独立辅助设置，亮/暗都可开；另有 Reduce Transparency | 正交，且明确要测四种组合 |
| **Windows** | 浅色 / 深色（Personalization） | **Contrast themes** 是另一套（Accessibility，约 7:1，强制颜色），激活时明暗模式不可用 | 对比度覆盖明暗，不是第三“明暗” |
| **Radix Colors** | Light / Dark 两套 ramp | `highContrast` 是组件/尺度选项（step 11 vs 12），两套 ramp 共用 step 语义 | 对比度是尺度属性，不是主题类型 |

**结论**：主流方向不是继续加 `type` 枚举，而是把三件事拆开——**外观（明暗极性）× 对比度 × 色觉**。VS Code 的 `uiTheme` 四值是历史包袱＋编辑器契约，不宜照抄为内部模型。

## 三、提案：三层模型

| 层 | 字段 | 角色 |
|:--|:--|:--|
| 作者声明 | `type: "light" \| "dark"`（可选） | **hint / 兜底**：token 解析不出时使用；不再决定渲染 |
| 引擎真相 | `polarity: "light" \| "dark"`（派生） | 由**生效 token** 的墨色 vs 表面亮度算出；`data-theme`、图标晕、快照、广播都用它 |
| 可访问性 | `traits: { contrast?: "standard" \| "high"; colorVision?: ... }` | 正交维度；高对比有亮/暗两版，色觉友好同理 |

**极性判据**（复用 `synthesizeIconGlow` 已有的墨色亮度逻辑，不写第二套）：
> `text-primary` 比 `bg-window-solid`（或 `bg-card-solid`）亮 ⇒ `dark`；反之 ⇒ `light`。

`bg-window-solid` 是去 alpha 后的合成基色，已经吸收了玻璃/tint 的影响；图片主题的极端亮部仍可能有偏差，但那是作者把墨色写反，属于数据审计问题，不让引擎猜图。

## 四、连带改造（同一批做，不拆碎）

### 4.1 官方主题 / 内嵌兜底

- **内嵌兜底**（`public/themes/light|dark.json`）：只做与官方 normal 同步的舒适度校准，不引入高对比（它必须最小、永远能启动）。
- **官方主题**：保留中性基线，做一次舒适度校准（secondary/muted/border 的对比度），并新增**亮/暗两条高对比 colorway**（`traits.contrast = "high"`）。高对比不是第三只主题插件，而是同一主题的两条 colorway。

### 4.2 极光玻璃

- 先定**可读性下限**：文字密集面用显式 `surface-reading` / `surface-reading-strong`（建议 0.66 / 0.78 起步），在极光最亮区域实测正文对比。
- 再用 `tintOpacity` 把玻璃厚度与表面 alpha 解耦：表面保持 0.55，tint 提到 0.25–0.3。
- 最后才做第二套配色（冷青或暖霞），两套共用同一可读性策略。

### 4.3 整窗主视觉

- `mask` 0.2–0.25 ＋ `maskColor` 深海军蓝（不要纯黑），先解决“字压照片亮部”。
- 显式 `surface-reading` / `surface-reading-strong`（0.55–0.62 / 0.68–0.75），压图墨色保持亮墨。
- 第二套配色「冷月银」；照片不动，只改强调色与文字冷暖。

## 五、实施顺序（大改，但分阶段可验收）

1. **引擎**：`resolvePolarity(tokens)` 纯函数；`commitTokens` / 快照 / `data-theme` 改用派生值；`theme:changed` 带 `polarity`。
2. **广播与快照**：`preload-pool` 从 `polarity` 写 `data-theme`；快照升版本，首帧不闪。
3. **UI**：主题选择器分组/标签、跨明暗警告、`DynamicSelect` 括号标签，全部改读派生 polarity。
4. **契约**：`type` 可选 + deprecated hint；`uiTheme: "highContrast"` 弃用；`traits` 加进 theme schema（可选、只加不删）。
5. **编辑器**：先切到 `polarity`（壳广播正确后它自动正确）；再做完整版——用 `theme:changed` 的 tokens 生成 Monaco 主题（背景/前景/行高亮/选区/token 色），内容区保持不透明近似，不承诺真透明。
6. **主题数据**：官方/内嵌/极光/整窗按 §四升级，与引擎同一批发。

## 六、验收

- 矩阵：普通亮/暗、玻璃、整窗、跨明暗 colorway、自定义 tint、高对比亮/暗——`data-theme` 与派生 polarity 一致。
- 图标晕、滚动条、选择器标签、编辑器主题四处跟随同一 polarity。
- 旧主题零改动可加载；旧快照丢弃重算。
- `traits` 未声明时行为与今天一致；声明 `contrast: high` 只影响选择器标签与主题数据，不改引擎算法。
- 作者文档（中英）写清：`type` 是 hint，不要拿它当渲染保证；高对比/色觉用 traits。

## 七、开放问题

1. `polarity` 是否进 `theme:changed` 正式契约（建议进；`themeType` 同值保留兼容）。
2. 主题选择器是否按 polarity 分组，还是平铺 + 徽标（建议平铺 + 徽标，避免“暗配方亮配色”被分到亮组仍显突兀）。
3. 编辑器完整版是否允许“半透明编辑器”（建议不允许正文透明，只允许外框/行号区；可读性优先）。
4. 色觉友好是否本期只留 traits + 徽标，不做自动色觉模拟（建议本期只留数据位）。

## 八、参考

- VS Code Color Themes（`uiTheme`: vs / vs-dark / hc-black / hc-light）: <https://code.visualstudio.com/docs/customization/themes>
- GitHub theme settings（Light / Dark / Dimmed / High Contrast / Colorblind）: <https://docs.github.com/get-started/accessibility/managing-your-theme-settings>
- GitHub 2025-06「Control contrast for all GitHub themes」: <https://github.blog/changelog/2025-06-05-control-contrast-for-all-github-themes/>
- Material 3 color system（对比度三档）: <https://m3.material.io/styles/color/system/overview>
- Apple HIG Dark Mode（Increase Contrast / Reduce Transparency 正交）: <https://developer.apple.com/design/human-interface-guidelines/dark-mode>
- Windows contrast themes vs light/dark: <https://learn.microsoft.com/windows/accessibility/contrast-themes>
- Radix Colors（12-step scale，step 11/12 对比度）: <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>
