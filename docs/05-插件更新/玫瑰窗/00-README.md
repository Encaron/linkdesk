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
| 风格 | 亮色玻璃：`type: glass`，`blur 28` / `saturate 1.45` / 暖白 tint / `opacity 0.38` / 金色受光边 `0.90` `#FFF0C4` | `appearance.glass` |
| 背景 | 巴黎圣母院北玫瑰窗（公有领域，Wikimedia Commons）；2560×1200 取景 + 日光提亮 + 暖光/光柱合成；`mask 0.12` 暖黑 | `appearance.background` + `resources/cathedral-bg.jpg` |
| 配色 | 三组共用同一亮色玻璃基座与暖墨文字，只换强调色族：**午后圣光** 金箔 `#A6771B` · **青金石** `#2F5D9E` · **晚祷紫** `#6B3F8E` | `colorways[]` |

**为什么玻璃 `opacity` 只有 0.38**：亮色玻璃要「亮」得靠后面的彩窗透上来。表面合成不透明度越低，彩窗颜色越足；0.38 是在「彩窗看得见」与「暖墨文字仍清楚」之间取的平衡。文字承载面另走 `surface-reading*`（0.90 / 0.96），所以正文不会跟着玻璃一起透没。

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
| Release | <https://github.com/Encaron/linkdesk-plugin-theme-rose-window/releases/tag/v1.0.0> |
| 官方目录 | `Encaron/linkdesk-marketplace`：`plugins[]` 新增 1 条 + `official-themes` 合集收录 |
| 本预览稿 | `rose-window-preview.html` + `preview-bg.jpg` |

## 五、同批下架的三只测试主题

用户点名的三只「测试轴」主题——**本地仓 + GitHub 仓 + 官方目录条目 + 市场媒体图**四处一并删除：

| 主题 | 原来测什么 | 处置 |
|---|---|---|
| 宋体印刷体 `theme-songti` | 字族轴（宋体） | 已下架（GitHub 仓删除） |
| 全胶囊 `theme-pill` | 圆角轴（999px） | 已下架（GitHub 仓删除） |
| 终端机 `theme-terminal` | 字族轴（等宽族） | 已下架（GitHub 仓删除） |

保留：官方主题 `theme-defaults` · 极光玻璃 `theme-aurora-glass` · 整窗主视觉 `theme-panorama` · 薄荷苏打 `theme-mint-soda` · 暮色森林 `theme-twilight-forest` · 粉彩图标集 `theme-iconset-pastel`（后三只是真实设计合集，不是测试轴，故保留）。

> ⚠️ `dev-fixtures/theme-recipes/` 下的同名夹具**未删**——它们是壳仓主题引擎测试的输入，不是插件仓本体。
