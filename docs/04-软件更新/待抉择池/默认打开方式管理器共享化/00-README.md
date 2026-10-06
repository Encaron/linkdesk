# 默认打开方式管理器共享化（`fileAssociationsManager` 渲染体住错层纠正）

> **状态：🔵 待拍板**——判据已走完并定案（判据 A 定层＝共享层；**粒度定案＝拆件套件＋共享聚合**，输入＝用户「必然论」拍板：第二台设置插件不是假设是必然，推导见 [04 决策点 C1](04-任务清单.md)；**文案与形态改判 C3 四件已拍**（区标题/OS 子节/副标题，全采推荐）；机械层判据出处＝[新能力设计流程 §十](../../../开发管理/新能力设计流程.md)＋CLAUDE.md 硬约束 28）。差一小板：**C2b**（挂载键降级形态）＋可选 0.4（台账补记）；C4（卡体行齿轮）已定案——加，实现走统一行齿轮机制；**C5（卡内检索框＋排序）已定案——做**：插件卡加通用 `toolbar` 槽，槽内复用**已有共享件**（`InlineInput` 过滤 ＋ `SelectBox` 排序，**零新造控件**），行序＝字母序默认／「按默认排序」＝插件**声明原始次序**（见 [04 决策点](04-任务清单.md)）。**本夹零代码改动。**

## 一、案由（2026-10-06，用户两层论）

用户在核对「默认打开方式」设置页归属时点破（要点，非逐字）：

> 壳声明数据（配置项来源＝壳），**UI 系统是自愿供给的第二层**——`@linkdesk/ui` 以包发出、从不强制使用，作者可以整套用、挑着用、或只拿数据自己画。⇒ 壳要保证的**最低线**：最简单的设置插件，凭契约＋共享包就能把壳声明的每条配置**显示出来且可从 GUI 操作**，不必自己再画胶囊、滑杆、开关、下拉。

按这条最低线检查，`fileAssociationsManager` 是**违反项**：它是 `SettingsUiHint` 十四枚正典词表里**唯一一枚「渲染体住在一台可替换插件里」的 hint**——渲染体（管理器整组视图＋OS 折叠块＋专属 CSS）全部住在官方 `settings` 插件的私有目录里。换一台设置插件，该组退化成**三行只读值**，连 `app.osAssociations.followPlugins`（`type: boolean`）的开关都点不动（它也带着管理器 hint，未知渲染器按降级契约只读）。这正违反词表正典案立下的判词「**换一套设置插件不再丢控件**」（[母案 09 台账 §一](../../已落地/文件打开方式与贡献点/09-待纠正-能力托管与共享件缺口台账.md)）。

**立案同时记一笔教训**：定性时 AI 一度以「现在只有官方一台设置插件渲染 ⇒ 先接受降级不入共享包（D10）」收尾——那是 2026-10-05 已明文废止的 **D10 反向用法**句式，被用户当场点破纠正。判据出处与惩戒记录见 memory `ownership-layer-criterion-a`。

## 二、今天是什么样（2026-10-06 只读审计，逐条有据）

| 事实 | 证据 |
|:--|:--|
| 挂载位在**壳**：伪 pluginId `file-associations` 的配置组，挂载键＋OS 两键都带 `uiHint: "fileAssociationsManager"` | 壳 `src/App/config/fileAssociations.ts:35-77`；注册点 `src/App/startup.ts:221` |
| 渲染体在**设置插件私有目录**（8 件＋私有 CSS，族段 `settings-assoc-*`） | `E:/linkdesk-plugins/official/settings/src/views/file-associations-manager/`（FileAssociationsManagerView / osFollowBlock / model / useFileAssociationsModel 等） |
| 设置插件见 hint **整组换视图**、导航计数换 `navCount`、搜索**恒保留**豁免 | settings `SettingsView.tsx`（管理器分支）＋ `managerHint.ts:38-43` ＋ `filterGroups.ts:31-41`——**这三层都是插件代码**，换渲染方即全部消失 |
| 未知 hint 的降级契约＝**只读展示**、不落可编辑兜底 | settings `renderControl/sharedAdapters.tsx:70-96`（`UnknownHintControl`）＋ 契约 `contracts/linkdesk.d.ts`（`SettingsUiHint` 注释） |
| OS 跟随键本可通用渲染（boolean），却因带 hint 在未知渲染器里**点不动** | 壳 `fileAssociations.ts:57-59`（`app.osAssociations.followPlugins` 带 `uiHint`） |
| 词表承诺的出处 | 母案 09 台账 §一 判例表：「设置控件-词表正典与共享化——『换一套设置插件不再丢控件』」 |
| 整页级共享件**已有先例**：ThemePicker（渲染方可用它，也可只拿数据自画） | `@linkdesk/ui` 导出件；R6 五条例外之一 |
| 卡片已转正、选择器已转正——**整组视图这一级没跟上** | `PluginCard`（母案第 4 波 4A）；`OpenWithPicker`（母案纠正案 01） |
| 母案 09 台账 P1–P8 **未含本条**（当时漏抓） | 同台账 §二 逐条核对 |
| 母案 03 §1「行清单不进共享包」是**旧 D10 读法下**的决定 | 母案 `03-组件规格-按插件浏览-插件卡.md` §1（需随 C1 重审） |
| 顺手账：`FileAssociationService.ts:63` 注释指旧家（startup.ts「系统集成」节）——OS 两键实际住 `config/fileAssociations.ts` | 壳 `src/core/services/files/FileAssociationService.ts:63` vs `src/App/config/fileAssociations.ts:50-56` |

## 三、判据走查结论（一句判据）

三问 Q1「它消费谁的数据？」——**宿主声明**（`contributes.fileAssociations`／插件清单／配置项／壳命令）⇒ 判据 A 定案：**壳或共享件，与现在有几个消费者无关**。D10 管进池时点、且反向用法已废止；「设置插件这个角色可整套替换」（CLAUDE.md 硬约束 11）⇒ 渲染方换人不是假想场景。**定案：转正共享层，先例＝ThemePicker。** 逐条走查全文见 [01 §一](01-方案与落点契约.md)。

## 四、这一轮要落的东西（概览）

| # | 落点 | 是什么 | 为什么 |
|:--:|:--|:--|:--|
| ① | 壳仓 `src/components/shared/file-associations-manager/` | **共享骨＋开放皮**：聚合纯函数（六态/聚格/失效判定一处实现）＋呈现件套件（竞争行/卡体行；PluginCard 已在）＋**组装视图（默认皮）**＋类型；纯 props in／events out，CSS 改 `ldk-famgr-*`、token 消费（皮随主题换） | 判据 A ＋ 用户「必然论」：第二台设置插件必然进场，聚合口径全仓只许一份 |
| ② | `@linkdesk/ui` 导出 ＋ 池 vendor 收录 | 照 `PluginCard`／`OpenWithPicker` 转正先例 | 进共享件池的既有通道 |
| ③ | settings 插件改薄消费 | **逐 hint 分发**：管理器 hint 键 → 共享组装视图；OS 键走通用行；取数喂聚合；私有件整删 | 渲染方留「组装」职责，能力归共享 |
| ④ | C2 降级语义＋C3 形态改判 | ~~OS 跟随键摘 hint~~（✅ 并入 C3c：摘 hint＋`group` 子节＝通用行，OsFollowBlock 退役）；挂载键降级形态（C2b 待拍）；文案改判四件（C3a–d 已拍） | 兑现「最低保证」的**可操作**半＋去口语化＋壳文案零插件名（硬约束 10 同族修复） |
| ⑤ | **C5 卡内检索框＋排序（形态已拍）** | 插件卡加**通用 `toolbar` 槽**（ReactNode，零业务语义）；槽内复用**已有共享件**——过滤＝`InlineInput`（与左上「搜索设置」同一支）＋排序＝`SelectBox`；卡内行序/过滤＝共享聚合层**纯函数**；声明 ≥8 类的卡才出工具条 | 45 类卡翻找成本高（用户实机痛点——声明序分区但全局无律）；控件消费宿主声明 ⇒ 判据 A 同源住共享层；第三台设置插件拿到**同一支**控件＝未雨绸缪 |
| ⑥ | 顺手账 | `FileAssociationService.ts:63` 过期注释订正；母案 03 §1 口径回写 | 归属记述与事实对齐 |

## 五、边界（本轮明确不做）

- ⛔ **视觉变化仅限拍板范围**：管理器两区照母案 `mockups/08/09` 零变化；改判面＝OS 折叠块升二级子节（C3c）＋文案四件（C3a–d）＋**C5 卡内工具条与行序默认字母序**（工具条：声明 ≥8 类才出；行序：默认字母序、可切回「按默认排序」＝作者声明序）——动工前照硬约束 16 过设计 skill 复核＋**出图基线＝真件实例（2026-10-06 用户判据）**：已有共享件/图标照真件画（先例＝滑杆搬迁）、尺寸字号引真 token 与真规则（`src/index.css:72-77` ＋ `SettingsView.css`/`-rows.css`），⛔ 不许手填近似——机械门 `node mockups/校验-拟真度.cjs`（jsdom，104 断言，**01＋02 两张图**）。
- ⛔ **不动数据面与动作面**——`fileAssociation.*` API、`workbench.action.openWith`、键名、默认值、分组全不变。
- ⛔ **不动 contracts**——模型类型是渲染 props 契约，随件进 `@linkdesk/ui`，不进契约包；`uiHint` 词表仍 14 枚、语义不变。
- ⛔ **不再造控件**（C5）：工具条两件全是**既有共享件**（`InlineInput`／`SelectBox`），⛔ 不新做「检索框组件／排序组件」；主题 token 合规随件自带（共享件全 `var(--*)`）。
- ⛔ **排序选择不持久化**（C5）：视图本地状态、随会话；要变成持久偏好＝新增**壳声明配置项**，另案（⛔ 不塞进 `workbench.fileAssociations`——那是覆盖表）。
- ⛔ **不为假想的「第二个文件关联管理器」预造新抽象**——转正是搬现成件，不是重设计。

## 六、本夹文件

| 文件 | 回答什么 |
|:--|:--|
| [01-方案与落点契约.md](01-方案与落点契约.md) | 落位判据走查（三问）＋ 8 维度设计前置 ＋ 转正方案落点一览 ＋ 连带重审清单 |
| [04-任务清单.md](04-任务清单.md) | 六个阶段任务表 ＋ 决策点（C1/C2a/C3 已定案；🔵 C2b/C4 待拍）＋ 实机验收清单 ＋ 与其他任务的关系 |
| [mockups/01-设计图-共享化落地态-整页拟真.html](mockups/01-设计图-共享化落地态-整页拟真.html) | **落地态主图（可交互）**：逐 hint 分发／4 种 hover 齿轮（含 C4 定案形态 I3②）／下拉写覆盖表／卡展开与六态胶囊／**卡内过滤框＋排序（C5，I11——编辑器 45 类卡上打字即滤、可切回声明序）**／搜索／模拟装卸——底版＝母案 mockups/08 拟真法，硬约束 16 已走 |
| [mockups/02-设计图-未知渲染器降级态.html](mockups/02-设计图-未知渲染器降级态.html) | **降级态实证图（可交互）**：未实现管理器 hint 的最小渲染器视角——OS 行可操作（判据铁证）／挂载键隐藏（C2b 建议）／overrides 只读降级 |
