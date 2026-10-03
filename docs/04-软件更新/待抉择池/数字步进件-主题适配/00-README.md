# 数字步进件（NumberInput）主题适配

> **状态：✅ 已拍板待实施（2026-10-03 · D1–D6 全定，均按建议值）——⛔ 尚未动工，本夹至今仍是纯文档／图，产品代码一个字没动。**
> 病灶已定位到可核对的证据（含一条**死代码**实证）；结论摘在本文 §七，逐条备选与理由见 [04-任务清单](04-任务清单.md) 决策点 D1–D6。

## 一、你令的原话（2026-10-03）

> 「接下来：咱们关于壳的 ui 进行一定的调整……关于两边有加减的 ui，那个 ui 叫什么？比如 window.zoomLevel 的。」
> 「它很不适配我们的主题系统，① 首先 app.surfaceRadius 为 0，也就是直角时候，NumberInput 的加减号就和中间的不匹配，像不连着一样；② surfaceRadius 为圆角的时候更是惨不忍睹，加和减就是两个半圆在两边，中间是个胶囊，十分不协调；③ 它不适配很多情况，比如 app.uiFontScale，它所使用的 NumberInput 就很怪，％ 甚至在外面。」
> 「你需要在 04 建立文件夹，并且画 html，这个设计单个组件，你可以画局部图，同时画一下适配圆角的图。然后立案。」

⇒ 拆成三件事：

1. 让这一件控件在**直角档**（`app.surfaceRadius = 0`）读起来是一体，不是三段硬拼；
2. 让它在**圆角档**（滑杆往 32 拉）整组形状单调变化，不出现「两个半圆夹一个胶囊」；
3. 让**单位（`％`）回到控件里**，并且 `app.uiFontScale` 这类带单位的键在任意字号档下都端正好看。

## 二、那件控件叫什么、在哪（2026-10-03 只读审计）

| 项 | 值 |
|:--|:--|
| 名字 | **NumberInput**（数字步进件）——`uiHint: "fontSize"` 与普通 `type: "number"` 配置项共用它 |
| 源码 | [src/components/shared/number-input/NumberInput.tsx](../../../../src/components/shared/number-input/NumberInput.tsx) ＋ [NumberInput.css](../../../../src/components/shared/number-input/NumberInput.css)（同夹两件，**无测试文件**） |
| 分发 | 经 `@linkdesk/ui` 出口（`packages/linkdesk-ui/src/index.ts:36` —— 只 re-export 壳源码，**不拷源码**）⇒ 改壳一处即可 |
| 谁在跑 | 官方各仓里凡声明 `type:"number"` 或 `uiHint:"fontSize"` 的配置项（壳侧今天 2 个键：`window.zoomLevel` / `app.uiFontScale`） |
| 通用叫法 | stepper / spinbox（Ant Design `InputNumber`、Element Plus `el-input-number` 是同一族）；**VS Code 没有对应件**（用的是原生 spinner），[VSCode对照表](../../../02-Electron架构/E5_核心归一化与壳重构_待执行/05-收尾/VSCode对照表.md) 记的是「LinkDesk 独有」 |
| 来历 | E5#57：替掉原生 `<input type="number">` 的 spinner（明暗主题下外观不统一） |

## 三、今天长什么样（三个病灶，逐条有证据）

| 症状 | 根因（不是现象） | 证据 |
|:--|:--|:--|
| **① 直角档三段"不连着"** | 整件是 **3 个各自带边框的盒子**排成一条 flex，**没有共同外框**；直角档没有圆角可"糊"接缝，三段直接读成三块。高度还是**两套来源**：按钮写死 `calc(24px * var(--ui-scale))`，中间字段由 `.ldk-input` 的 `padding: 4px 8px` ＋ `font-size: var(--font-size-sm)` 撑出来（**padding 不随 `--ui-scale` 走**）⇒ 放大字号后两段错位 | [NumberInput.css:12-37](../../../../src/components/shared/number-input/NumberInput.css) · [index.css:252-261](../../../../src/index.css) |
| **② 大圆角档"两个半圆夹一个胶囊"** | 🔴 **中间那句 `border-radius: 0` 是死代码**。`.ldk-number-input-field{border-radius:0}` 与 `.ldk-input{border-radius:var(--radius-sm)}` 都是单类名、同特异性 ⇒ **后加载者胜**；产物里 `@linkdesk/ui.css` 排在 `pool-*.css` **之前**（`dist/pool.html` 第 21 行 vs 第 25 行）⇒ `.ldk-input` 赢，**字段实际带四角 `var(--radius-sm)` 圆角**。按钮那头只圆**外侧两角**（`first-child` / `last-child` 写死）⇒ 字段被钳成胶囊、按钮被钳成半圆 | [NumberInput.css:29-37,53-57](../../../../src/components/shared/number-input/NumberInput.css) · `dist/pool.html:21,25` · [tokens.ts:252-258](../../../../src/core/services/ui/ThemeEngine/tokens.ts)（六档平铺） |
| **③ 单位 `％` 掉在控件外** | `unit` 是**第四个 flex 兄弟**，夹在字段与 `+` 之间；它不属于任何盒子，`+` 还 `border-left: none` ⇒ 那道缝直接在轮廓上开口，`％` 看着像浮在外面 | [NumberInput.tsx:60-68](../../../../src/components/shared/number-input/NumberInput.tsx) · [NumberInput.css:60-66](../../../../src/components/shared/number-input/NumberInput.css) |

**附带同源缺陷（顺手一并修）**：焦点只落在中间那格——`.ldk-input:focus` 换边框色 ＋ `.ldk-input:focus-visible` 套 2px outline，而两个按钮 `tabIndex={-1}` 永不参与 ⇒ 键盘聚焦时整组形状当场裂开。证据 [NumberInput.tsx:47,64](../../../../src/components/shared/number-input/NumberInput.tsx) ＋ [index.css:262,280-283](../../../../src/index.css)。

> ⚠️ **只此一件**——已扫过 `src/components/shared/**` 全部 CSS，**没有第二件**用「`first-child`/`last-child` 拆圆角」这种拼法（`grep` 判据见 [03-实现交接](03-实现交接.md) §五）。所以本件不做全仓普查，只修这一处。

## 四、这一轮要落的东西

| # | 落点 | 是什么 | 为什么 |
|:--:|:--|:--|:--|
| ① | `NumberInput.tsx` **DOM 收成三段** | 外框 + 两个按钮 + 一个「值单元格」（值 ＋ 单位同格） | 让单位无处可掉；让圆角唯一 |
| ② | `NumberInput.css` **单一容器契约** | 边框／圆角／高度**各只有一处来源**；内部零圆角、零边框 | 滑杆怎么拉，整组都自洽 |
| ③ | 焦点表达 | `:focus-within` 整组一个环 | 键盘聚焦不再裂开 |
| ④ | 尺寸与状态 | 高度统一（乘 `--ui-scale`）＋ hover / 按下 / 禁用 / 不聚焦五态定清 | 「不适配很多情况」的正面回答 |
| ⑤ | **回归面** | 壳侧 2 个键（`window.zoomLevel` / `app.uiFontScale`）＋ 插件侧按声明消费；`npm run ui:build` ＋ `@linkdesk/ui` 版本 | 改共享件必付的账，见 03 |

## 五、边界（本轮明确不做）

- ⛔ **不改设置页那台设置插件的渲染代码**（它只按 `type` / `uiHint` 选控件，控件内部归壳）。
- ⛔ **不新增配置键**、不加 `uiHint` 变体（`fontSize` 这条 hint 的语义不变）。
- ⛔ **不重做滑杆件（Slider）**——它今天另有一套外观，本件不牵动。
- ⛔ **不给 NumberInput 补测试文件**是**默认**（现状即如此，`knip.json:82` 在忽略名单里）——除非你点头，见 04 决策点 D6。
- ⛔ **不动 `--radius-*` 的引擎算法**（六档平铺是既定拍板，本件只做「跟着它走」的消费侧）。

## 六、本夹文件

| 文件 | 回答什么 |
|:--|:--|
| [01-方案与落点契约.md](01-方案与落点契约.md) | DOM 契约 · CSS 契约 · 五态 · 圆角行为 · 尺寸规则 · 单位承载 · a11y |
| [02-边缘情况清单.md](02-边缘情况清单.md) | 14 条边缘（极值、禁用、超长值、无单位、字号极值、RTL、输入法…） |
| [03-实现交接.md](03-实现交接.md) | 逐文件落点表 ＋ 门禁清单 ＋ 回归面 ＋ 待查项 |
| [04-任务清单.md](04-任务清单.md) | 三阶段 ＋ 实机验收 ＋ 决策点 D1–D6 |
| [05-设计图-数字步进件.html](05-设计图-数字步进件.html) | **局部图**：病灶拆解 · 两案结构爆炸图 · 五态 · **圆角适配对照（0/4/8/16/32，可拖滑杆现场比）** · 字号档对照 |

## 七、拍板记录

**2026-10-03 用户逐条点定，D1–D6 全部按建议值走**（一句话结论；备选与理由见 [04 §一](04-任务清单.md)）：

| # | 定了什么 |
|:--:|:--|
| **D1** | 形态走 **A 分段式**——边框／圆角／高度只写外框一处，内部三段被外框圆角裁出，段间一道内缩 1px 竖线。 |
| **D2** | 容器高度 **26px × `--ui-scale`**（取今天按钮 24 与字段 ≈26 的大者，视觉跳变最小）。⚠️ 待 [03 §七·1](03-实现交接.md) 实机量完字段真实高度后终定，量出偏差就回来改这一个数。 |
| **D3** | 有单位时值格给**固定最小宽 `46 × scale`**——同一页两行控件宽度不跳，代价是总宽略增。 |
| **D4** | **保留内缩 1px 竖向分隔线**——直角档靠它撑起「三段可点」的读法，胶囊档它被外轮廓裁着也不切弧。 |
| **D5** | 聚焦改用 **`:focus-within` 整组 accent 环**——替掉今天「只亮中间那格」（那本身就是症状之一）。 |
| **D6** | **① 补 `aria-label`**（加减按钮今天无可读名称，白捡的 a11y）；**② 测试文件仍不补**——会给这一件挂测试债，宁可单独立件。 |

⇒ 下一步 ＝ [04 任务清单](04-任务清单.md) 阶段 1（量三个读数 → 定稿契约数值）。**动工与否等用户发话**；本夹在此之前一格不勾。
