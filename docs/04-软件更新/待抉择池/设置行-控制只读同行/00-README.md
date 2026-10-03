# 设置行 · 控制与只读同行（组合行声明）

> **状态：📋 待拍板（2026-10-03 立案）——⛔ 本夹零代码改动（主仓与设置仓一个字没动）。**
> 一句话：主题组能「一行三合一」**不是特例、更不是耦合**，是声明式机制的既有能力；真正缺的只有一块——`renderHint` **单选互斥**。补上它，「控制＋只读同行」就是**任何插件的任何键**都能声明的能力。

## 一、你令的原话（2026-10-03）

> 「如果使用壳的 ui 组件，那么是无法完成一行情况下显示只读和控制的，所以 app.storage.openCacheDir 和 app.storage.cacheDir 在设计 html 中是单独放的。」
> 「但是唯独主题组这个例外，它的很多东西是一起放的……app.surfaceRadius 它的控制组件是 slider，但是我相信我们已有的 slider 不出意外是没有后面 25px 这个提示语的吧？……不然就是写入设置单独这个插件的，这不符合我们万物皆可插件的理念。」
> 「主题组内的配置项怎么实现这样做的，我的猜想是和 E:\linkdesk-plugins\official\settings 这个插件有耦合了之类的。你要帮我想办法。」

## 二、取证：主题组那些行到底是谁拼的（2026-10-03 只读审计：设置仓 + 壳源）

行骨架 = 设置仓自己的 [`SettingRow`](https://e:/linkdesk-plugins/official/settings/src/views/SettingsView/SettingRow.tsx)（自壳迁入 E5.8#41.14，注释自证「@src/core 三依赖全消除」）：**label ＋ 来源徽标 ＋ uiHint 分发控件 ＋ 行尾生效值徽标 ＋ 齿轮 ＋ 色块**。逐键拆：

| 键 | 控件 | 一行上还有什么 | 机制出处（全部声明式） |
|:--|:--|:--|:--|
| `app.surfaceRadius` | `@linkdesk/ui` **Slider**（壳共享件） | 右侧「当前值＋**px**」 | uiHint `"slider"`（E5.8#50.9）＋ 宿主 schema 声明 **`unit`**（E5.8#77：「无 unit = 裸数值，第三方零侵入」）——**不是共享 Slider 自带**，是设置仓 `settings-slider-control` 包裹层渲染的声明值 |
| `app.glassTint` | 色块＋输入（uiHint `"color"`） | 来源徽标 ＋ 行尾**生效值徽标**（rgba 带色块） | 宿主 schema 声明 **`effectiveToken: "glass-tint"`**（`src/App/config/appearance.ts:293`，E5.8#155） |
| `app.backgroundImage` | **BackgroundImagePicker**（设置仓本地件：选图入库/清除） | **「来源：用户覆盖」徽标** ＋ 生效徽标 | uiHint `"image"`（E5.8#50.11）＋ 来源徽标（E5.8#87，**全键自动**，非主题组特权） |
| `app.fontFamily` | `@linkdesk/ui` **FontFamilySelect**（壳共享件） | 来源徽标 ＋ 生效徽标（字体栈截首族） | uiHint `"fontFamily"` ＋ `effectiveToken: "font-ui"`（`appearance.ts:430`） |
| `app.fontTone` | **FontToneControl**（设置仓本地件：三态＋Aa 预览） | — | uiHint `"fontTone"`（E5.8#91+#99） |

**「插件独立铁律」就写在设置仓代码注释里**（不是我们补充的）：
- `effectiveBadge.ts`：「**设置插件对 token 语义零知识**（插件独立铁律）……第三方键声明 effectiveToken 即得同能力，零壳改动」；
- `readonlyStatus.tsx`：「**通用能力：任何插件声明 `renderHint:'readonly'` + `statusCommand` 即得同款（无 AI 特权）**」。

## 三、七问七答

| # | 你的问 | 答 |
|:--:|:--|:--|
| **Q1** | 缓存目录那案画成两行，对吗？ | **对**。声明层 `renderHint` 单选互斥 ⇒ 一键只能一个控件（详见 §四）。且那案早已预埋「将来可并成一行」（其 [00 §一·📌](../设置页-打开缓存目录/00-README.md) 与坑 2）——本案就是那个「将来」。 |
| **Q2.1** | slider 后面的「25px」哪来的？ | **不是共享 Slider 自带**（壳 Slider 只有轨道＋填充＋圆点）。是设置仓包裹层按宿主 schema 声明的 `unit` 渲染的值标签（E5.8#77）——声明式，零耦合，任何键声明 `uiHint:"slider"+unit` 即得。 |
| **Q2.2–2.4** | glassTint / backgroundImage / fontFamily 同款？ | 同款（见 §二表）：`uiHint` 选控件 ＋ `effectiveToken` 声明生效徽标 ＋ 来源徽标全键自动。**没有一个键名出现在设置仓代码里**。 |
| **Q3** | 主题组组件都是壳共享件吗？ | **一半一半**：Slider / SegmentedRadio / FontFamilySelect / ColorPicker / ContextMenu / ReadOnlyText 是 `@linkdesk/ui` 壳共享件；BackgroundImagePicker / FontToneControl / AccentSourceControl / ReadOnlyStatus 是**设置仓本地件**（`renderControl/` 夹）。设置页本身是可替换插件——用共享件或自造件**都合规**，万物皆可插件自洽。 |
| **Q4** | ai.mcp.enabled 和 ai.mcp.status 怎么「连在一起」的？ | **没有配对机制**——`ai.mcp.status` 是一条通用只读行（`renderHint:"readonly"` + `statusCommand`，M4 AI#38.12），与 enabled 是**相邻两行**，看起来连着而已。它用的组件（ReadOnlyStatus）确实是新造的，但造出来就是通用能力，「无 AI 特权」。 |
| **Q5** | 控制项＋只读项一行，怎么搞定？ | **§四 方案 A**：把伴生声明正交化——不是给某个键开小灶，是把「一行多元素」变成**任何键的声明权**。 |
| **Q6** | 是不是和 settings 仓耦合了？ | **没有**。设置仓与主题仓零耦合、与宿主键名零耦合（键名一个字面量都不在设置仓出现，这是它的既有铁律）。你看到「唯独主题组特殊」，真实原因是**只有主题组把这些声明用满了**——能力是大家的，用不用在声明。 |
| **Q7** | 帮我想办法 | 就是本案：方案 A 一处声明层改动 ＋ 设置仓一处渲染改动（[01-方案与落点契约](01-方案与落点契约.md)）。 |

## 四、真缺口（全案只剩这一处）

- `ConfigurationRegistry.ts:40`：`renderHint?: string` **单值**；`renderControl.tsx` 的 readonly 分支放最前直接 return（「状态行不参与编辑任何形态」）⇒ **一键一控件**。
- 于是：「按钮＋只读」要两个键两行（缓存目录案）；「开关＋状态」要两行（ai.mcp 组）。
- **而控件层本来就放得下**——背景图行已经证明（按钮组＋徽标＋值同排）。缺的只是**声明层允许一键带伴生件**。

## 五、方向（详见 [01](01-方案与落点契约.md)）

| 案 | 一句话 | 取舍 |
|:--:|:--|:--|
| **A 正交声明**（推荐） | `statusCommand`/`actionCommand` 升为**可与任何控件共存**的伴生声明；`renderHint:"readonly"/"action"` 退化为「主控件就是它」的简写 | 一处类型语义 ＋ 一处渲染布局；完全向后兼容；第三方声明即得 |
| B composite uiHint | 新 uiHint 让一键声明一组子控件 | 表达力强但破坏「一键一值」存储模型，缓存目录案「三概念分界」会乱 |
| C 维持两行 | 现状 | 零成本，但每遇「控制＋状态」都要两行，ai.mcp 组、缓存组继续特判排版 |

## 六、边界

- ⛔ **不新增配置键**（`openCacheDir`/`cacheDir` 已在缓存目录案声明）。
- ⛔ **设置仓不得出现任何具体键名字面量**（它的既有铁律，本案必须保持）。
- ⛔ **不动「一键一值」存储模型**——本案只动声明元数据与渲染层。
- ⛔ 本轮纯文档（布置任务）。

## 七、本夹文件

| 文件 | 回答什么 |
|:--|:--|
| [01-方案与落点契约.md](01-方案与落点契约.md) | 方案 A 契约 · B/C 不推荐理由 · 逐文件落点（壳＋设置仓）· 验收判据 |
| [04-任务清单.md](04-任务清单.md) | 决策点 D1–D4（📋 待拍板）＋ 三阶段 |
| 02 / 03 / 05 | 拍板后补齐（照本池既有节奏） |

## 八、拍板记录

**⛔ 尚未拍板**。D1–D4 见 [04 §一](04-任务清单.md)；你定完我回填本表。
