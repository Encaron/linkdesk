# 玫瑰窗（theme-rose-window）——教堂彩窗主题

> 2026-11-23 立案并当日落地。源码真源 = `E:\linkdesk-plugins\official\theme-rose-window`（GitHub `Encaron/linkdesk-plugin-theme-rose-window`）。
> 预览稿：[rose-window-preview.html](rose-window-preview.html)（浏览器直接打开，背景图同目录 `preview-bg.jpg`）。

## 一、用户要的是什么

- **前四面带玻璃**：壳的玻璃表面全部打开（标题栏 / 工具栏 / 图标栏 / 侧栏 / 主区 / 面板区 / 状态栏）。
- **亮色玻璃**：玻璃是发亮的暖白磨砂，不是深色玻璃；文字走暖调深墨。
- **欧洲教堂 / 巴黎圣母院**：中世纪哥特、彩色玻璃被午后的光打透。
- **中午到下午的光**：暖金受光边 + 全窗彩窗背景 + 日光提亮与光柱。
- **字体**：用户明确「正常字体」，所以**不写 `font` 域**，继承壳默认。
- **背景图只用在最后面**：`background.mode = panorama`，整窗一张，不切片到各面板。

## 二、设计定案（三轴）

| 轴 | 定案 | 落点 |
|---|---|---|
| 风格 | 亮色玻璃：`type: glass`，`blur 36` / `saturate 1.35` / 暖白 tint `rgba(255,247,230,.62)` / `opacity 0.46` / 金色受光边 `0.92` `#FFEFC0` | `appearance.glass` |
| 背景 | 巴黎圣母院北玫瑰窗（公有领域，Wikimedia Commons）；2560×1200 取景 + 日光提亮 + 暖光/光柱合成；`mask 0.12` 暖黑 | `appearance.background` + `resources/cathedral-bg.jpg` |
| 配色 | 三组共用同一亮色玻璃基座与暖墨文字，只换强调色族：**午后圣光** 金箔 `#A6771B` · **青金石** `#2F5D9E` · **晚祷紫** `#6B3F8E` | `colorways[]` |
| 字体 | 贵重衬线栈：Constantia / Palatino + Noto Serif SC（思源宋体）；主题 font 域只有 ui / mono，做不了逐组件字体 | `appearance.font.ui` |

**为什么玻璃 `opacity` 是 0.46**：亮色玻璃要「亮」得靠后面的彩窗透上来。表面合成不透明度越低，彩窗颜色越足；0.46 是最终取值——彩窗仍透过约 38% 的光（46% 表面 + 28.5% 暖白叠加之后）。文字承载面另走 `surface-reading*`（0.94 / 0.97），正文不会跟着玻璃一起透没。

🔴 **根因（2026-11-23 实机反馈修）**：外观模式 = **跟随主题** 时，壳的玻璃表面合成**不激活**——`getGlassSurfaceSpec().active` 看的是用户配置键（`app.glassBlur/Opacity/Tint/Saturate`），跟随主题会把这些键清空，于是 `synthesizeGlassSurfaces` 不跑，表面色写什么就渲染什么。此前表面写成不透明 hex ⇒ 跟随主题下前面板全实、右键菜单/下拉没有磨砂；只有切到「自定义」播种后才激活合成、透出背景。**修法 = 表面色一律写 `rgba(...,0.46)`**（官方极光玻璃也是 rgba 写法）：跟随主题直接透；自定义模式再做一次 0.46 × 玻璃不透明度（默认 46% ⇒ 约 21%，更透；拉到 100% 回到 46%）。已用真壳引擎验证：跟随主题 `--bg-window: rgba(251,245,233,0.46)`；自定义 `color-mix(...)` + `--glass-surface-alpha: 0.46`。

**文字对比实测**（从渲染图取样）：玻璃面上主文字 10.2–12.4:1、次级 6.4–7.7:1、弱文字 ≥4.5:1；内容面 17.1:1 / 10.7:1 / 6.6:1。

**文字对比实测**（从渲染图取样）：玻璃面上主文字 10.2–12.4:1、次级 6.4–7.7:1、弱文字 ≥4.5:1；内容面 17.1:1 / 10.7:1 / 6.6:1。

## 三、配色要点

- 文字：`#2B2015` / `#57432E` / `#7E684E`（暖墨，非纯黑）。
- 表面：`#FDF8EE` / `#FBF5E9` / `#FAF3E5` / `#F7EFDF`（暖白，玻璃合成后见彩窗）。
- 彩窗语义色：鸽血红 `#B23A48`（脏点/危险）、祖母绿 `#2E7D53`（成功）、金箔 `#A6771B`（强调）。
- 阴影：暖褐底 `rgba(52,32,12,*)`，不用冷黑。

## 四、交付物

| 物 | 位置 |
|---|---|
| 插件仓（真源） | `E:\linkdesk-plugins\official\theme-rose-window` |
| GitHub 仓 | <https://github.com/Encaron/linkdesk-plugin-theme-rose-window> |
| Release | <https://github.com/Encaron/linkdesk-plugin-theme-rose-window/releases/tag/v1.0.2> |
| 官方目录 | `Encaron/linkdesk-marketplace`：`plugins[]` 新增 1 条 + `official-themes` 合集收录 |
| 本预览稿 | `rose-window-preview.html`（含底部宣传图）+ `promo-shots.html` + `preview-bg.jpg` |
| 宣传图 | `cover.jpg`（README/目录封面）＋ `shot-1..3.jpg`（官方目录 `media/theme-rose-window/`） |

## 五、同批下架的三只测试主题

用户点名的三只「测试轴」主题——**本地仓 + GitHub 仓 + 官方目录条目 + 市场媒体图**四处一并删除：

| 主题 | 原来测什么 | 处置 |
|---|---|---|
| 宋体印刷体 `theme-songti` | 字族轴（宋体） | 已下架（GitHub 仓删除） |
| 全胶囊 `theme-pill` | 圆角轴（999px） | 已下架（GitHub 仓删除） |
| 终端机 `theme-terminal` | 字族轴（等宽族） | 已下架（GitHub 仓删除） |

保留：官方主题 `theme-defaults` · 极光玻璃 `theme-aurora-glass` · 整窗主视觉 `theme-panorama` · 薄荷苏打 `theme-mint-soda` · 暮色森林 `theme-twilight-forest` · 粉彩图标集 `theme-iconset-pastel`（后三只是真实设计合集，不是测试轴，故保留）。

> ⚠️ `dev-fixtures/theme-recipes/` 下的同名夹具**未删**——它们是壳仓主题引擎测试的输入，不是插件仓本体。
