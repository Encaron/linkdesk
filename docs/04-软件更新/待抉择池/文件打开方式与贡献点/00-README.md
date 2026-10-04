# 04-软件更新 · 待抉择池（文件打开方式与贡献点：阅读器类插件「声明即接管」）

> 立案：2026-10-04（用户）。**状态：📋 待拍板**（T1–T7 规划到落点，**D1–D10 十项待裁**；2026-10-04 第二轮追问后全案重写——警告形态、挂牌冲突、小本本具体化、OS 开关归属、设置页形态五处从「一句话」升级为「成文规格」，见 [02-边缘情况清单](02-边缘情况清单.md) 与 [04-任务清单](04-任务清单.md)）。
> 一句话：把「**装一个阅读器插件，对应文件就归它打开；卸载就退回**」做成壳侧一条通用能力——三路源码取证证明**基础设施已有四分之三**（`contributes.fileAssociations` 注册表在跑、菜单贡献槽已声明式、OS「打开方式」链路三环全通），本件只补缺的四小块＋把规矩立全。
> 文件分工：[00](00-README.md) 总览与拍板项 · [01](01-方案与落点契约.md) 逐格规格（现状→改法→判据） · [02](02-边缘情况清单.md) 边缘 28 条 · [04](04-任务清单.md) 分阶段清单（含文档与手册连锁）；**设计图三张**（html-blueprint 规范，已按 /impeccable＋/ui-ux-pro-max 标准自检）：[05 整页拟真·可交互](mockups/05-设计图-打开方式与贡献点-整页拟真.html)（六场景：PDF 三家／图片两家／MD 次要方式／双编辑器挂牌冲突／未装阅读器提示页／设置页系统集成块——右键文件出菜单、选择器可点、toast、覆盖表可视化）· [06 思路总览](mockups/06-设计图-思路总览.html)（四铁律＋解析旅行步进器＋去硬编码 before/after＋主权三层）· [07 交互细节与边缘时序](mockups/07-设计图-交互细节与边缘时序.html)（选择器状态机＋E1/E3/E6/E24/E16 五张时序卡＋三入口归一）。

## 一、缘起（用户问题清单，2026-10-04 两轮原话摘录）

**第一轮**（四只阅读器插件可行性引发的系列问题）：
1. 单击任何文件都进编辑器，exe/pdf/jpg 不管能不能用都是如此——为什么？
2. 做了 pdf 阅读器后，怎么让单击默认归它？卸载退回编辑器？VS Code 还会 toast 提示装 pdf 插件。
3. html/md 不该抢单击——该像 Live Server／MPE 那样右键多出打开方式，可分屏、热加载、同屏滚动；「打印为 HTML」走保存地址。
4. 不想壳与辅助插件耦合——要可装可卸可替换；别人也会做 pdf 阅读器（可能带笔记）。
5. 右键菜单怎么「加入而不替换」？
6. Windows「打开方式→LinkDesk」应以已装阅读器直接打开。

**第二轮**（对第一版规划的追问，已全部沉入规格）：
7. 警告页是什么？是新造组件吗？不该是右下角 toast 说一句「编辑器打开是乱码」吗？弹窗和 toast 我们都有了——@linkdesk/ui 里那个新东西到底是什么？
8. 方案会新增 API／面 ⇒ AI 手册、作者手册等文档要同步改并推送——必须进任务。
9. 挂牌冲突：极客作者做了自己的编辑器挂了牌，小白用户**没卸官方编辑器**就装了它（极易发生）⇒ 两个挂了牌的兜底怎么办？万物皆插件的软件里这概率非常大。
10. md：单击永远归编辑器，右键注册几都无所谓、显示一列用户挑——同意；但 pdf 单击才有意义 ⇒ 装了多只 pdf 阅读器时单击开哪只必须想清；「总是用它记小本本」到底是什么（设置项？点击计数？哪里设默认？「右键改」又是什么）——**任务里必须写清，看不懂 = 任务不合格**。
11. 安装器开关：管控放哪？叫什么？归壳还是归插件？是 pdf 插件进来自动在通用组生成、卸载就消失吗？还是 pdf 插件自己声明的默认开的开关？——含糊即不合格。
12. 打开方式在设置页是什么形态？要壳预想世界上所有可能类型吗（编辑器/pdf/office/STM32 调试器都可能有 N 家）？没有相应插件时显示不显示？插件命名不规范（官方 `editor` vs 第三方 `MyEEEEEditorrrrrr pro plus max ultra`）怎么互相识别？
13. 任务布置要照 [已落地/滑杆件-Slider能力扩展](../../已落地/滑杆件-Slider能力扩展/00-README.md) 的规格（逐格衔接＋边缘清单＋设计图），「光说一嘴」不合格。

## 二、归属判据：为什么在 04 不在 05

解析器、选择器、公共 context key、openExternal 通道、OS 登记同步**全部住壳**；四只阅读器插件本体已在 05 起头（[PDF](../../../05-插件更新/PDF阅读器插件/00-README.md)／[图片](../../../05-插件更新/图片阅读器插件/00-README.md)／[以VSCode打开](../../../05-插件更新/以VSCode打开插件/00-README.md)／[MD](../../../05-插件更新/MD文档阅读器插件/00-README.md)＋文件树/编辑器两适配夹）。按**核心准入三问**（硬约束 9）：扩展名→插件解析是多提供方 ✓ 多消费方（文件树/搜索/OS intake/选择器）✓ 桌子不知道 pdf 是什么 ✓ ⇒ 解析面住 `src/core`，声明面进 schema，呈现归各插件。**归属三层框架：声明＝宿主 schema／判定＝壳服务／呈现＝插件**。

## 三、现状取证（三路源码结论，2026-10-04，file:line 均已核）

| # | 事实 | 证据 |
|:--:|:--|:--|
| ① | **文件关联注册面已存在且在跑**：manifest `contributes.fileAssociations`（扩展名→插件＋可选 command＋displayName）→ 主进程三表 → IPC `fileAssociation.getPluginFor(ext)` | schema `packages/plugin-sdk/schemas/plugin.schema.json:477-489`；`electron/plugins/plugin-manifest-loader.ts:89-95`；`src/core/services/files/FileAssociationService.ts`；`electron/ipc/handlers/registry-handlers.ts:55-56` |
| ② | **单击全进 editor 的真因＝兜底**：file-tree 查 `getPluginFor`，查到开对应插件；查不到传空串 → 壳兜底 `DEFAULT_TAB_TYPE="editor"`。editor 已声明 45 个文本扩展名（**不含 pdf/jpg/exe**） | `E:\linkdesk-plugins\official\file-tree\src\views\FoldersView.tsx:122-131`；`src/core/services/plugins/IpcBridgeHandler/tabs.ts:14,24-28` |
| ③ | **editor 无二进制守卫**：读二进制强解文本、语言兜底 plaintext ⇒ pdf/exe 开成**不报错的乱码标签页** | `E:\linkdesk-plugins\official\editor\src\services\EditorModel.ts:100-106`；壳 `src/core/services/files/EncodingService.ts:132-148` |
| ④ | **菜单贡献已声明式**：file-tree 菜单项写在自家 plugin.json 的 `contributes.menus.fileContext`，渲染只认 `menuId="fileContext"` 槽；`MenuId` 开放字符串、MenuRegistry 合并＋when 过滤 ⇒ **第三方声明即加入、不替换** | `E:\linkdesk-plugins\official\file-tree\src\components\FileTreeContextMenu\Menu.tsx:11,53-58`；`src/core/registry/commands/MenuRegistry.ts:18-53,111` |
| ⑤ | **「打开方式」选择器只有占位**：`file-tree.openWith` 是 placeholder；多插件抢同一扩展名的仲裁规则未定 | `E:\linkdesk-plugins\official\file-tree\src\components\FileTreeContextMenu\commands\navigation.ts:63` |
| ⑥ | **OS「打开方式」链路三环全通**：安装器已写 ProgId＋13 扩展＋全文件右键项 → argv 裸路径 → `routeLaunchItems` → `workspace:openPath` → `useOpenPathIntake` 查**同一张**表 → 开标签。缺口＝pdf 不在 13 清单 | `build/installer/bootstrapper/syswrite.cpp:60-64,163-203`；`electron/windows/launch-args.ts:24-47`；`electron/main.ts:673,731-748`；`src/hooks/useOpenPathIntake.ts:66-71` |
| ⑦ | **`shell.openExternal` 未暴露给插件面** ⇒「以 VS Code 打开」需 T4 开受控通道 | `electron/windows/external-links.ts:29` |
| ⑧ | **兜底本身是硬编码**：`DEFAULT_TAB_TYPE="editor"` 写死在壳（`FALLBACK_PLUGIN_ID="welcome"` 同病、本件不动）；file-tree 反而没写死（传空串） | `tabs.ts:14`；`src/core/utils/plugin/fallbackPluginId.ts:8` |

## 四、任务分解（T1–T7；逐格规格在 [01](01-方案与落点契约.md)）

| # | 任务 | 一句话 | 主要落点 | 依赖 |
|:--:|:--|:--|:--|:--|
| T1 | **二进制守卫＋未关联兜底** | 判定归壳（`isBinary` 一处真相源）；**呈现 = 标签页内一段简单提示＋右下角 toast**（**不是弹窗、不是新页面**——标签区必须画点什么，现状画的是乱码）；@linkdesk/ui 组件**不预造**（D10：第二个真实消费者出现才共享） | 壳 `EncodingService.ts`＋editor 插件 | D4/D10 |
| T2 | **打开方式选择器＋用户覆盖表** | 实现 `file-tree.openWith`：**选择器=每次右键时的临时列表**（列该扩展名全部 handler），每行两个动作「打开（仅此一次）」「设为默认（写覆盖表）」；有覆盖时列表顶部显「当前默认」行＋「恢复自动」。**没有点击计数、没有自动学习**——小本本只由用户显式动作写 | file-tree（UI）＋壳 `FileAssociationService`（覆盖表＋`listHandlersFor` 面） | D1/D3/D7 |
| T3 | **公共 context key** | 文件属性升为宿主公共旗子 `resourceExtname`，第三方菜单 `when` 才能按扩展名显隐 | 壳 context key 账＋file-tree 注入点 | D2 |
| T4 | **受控 openExternal 通道** | 插件面开 `shell.openExternal`（scheme 白名单）；「以 VS Code 打开」的地基 | `electron/preload-pool/namespaces-plugin.ts`＋主进程 handler＋host-reserved 账 | D5 |
| T5 | **菜单贡献点收口**（自[菜单补全](../菜单补全.md)剥入） | 槽位命名拍板＋作者面文档「菜单贡献点」新篇＋SDK 门禁腿 | schema 四份拷贝＋`docs/03-插件制造`＋SDK check | D2 |
| T6 | **OS 关联与插件状态同步（解薛定谔态）** | 静态清单**构建期从随包插件声明机械收割**（消灭第二真相源——45↔13 已漂移）＋**运行期同步**：装/卸声明新扩展名的插件 → 壳按**壳自己的**设置开关增/撤 OS 登记（HKCU）；**exe 永不登记** | `syswrite.cpp:60-64`＋主进程同步模块＋设置页「系统集成」组 | D6 |
| T7 | **DEFAULT_TAB_TYPE 去硬编码（角色挂牌）** | 壳不写死 `"editor"`：fileAssociations 条目加 `role:"text-fallback"`，壳解析「当前激活的挂牌者」当兜底；**牌=提名不是夺权**——两只同时挂牌不静默换人（D7 同一套仲裁＋提示）；第三方编辑器挂牌即可参选、用户挑中才接管 | `tabs.ts:14`＋schema＋editor plugin.json | D7/D9 |

## 五、待拍板（D1–D10，均附建议值）

| # | 问题 | 建议 |
|:--:|:--|:--|
| D1 | 用户覆盖表存哪、谁写 | `settings.json` 壳配置键 `workbench.fileAssociations`（`{".pdf":"pdf-reader-x"}`）；**只由选择器「设为默认」写入**；清空=选择器顶部「恢复自动」；设置页 v1 **不**展示它（唯一编辑入口=选择器，防两处真相源） |
| D2 | 公共 context key 谁写、叫什么 | **file-tree 注入**（它手里有文件信息），键名 `resourceExtname`（带点小写，VS Code 同名口径）；壳记入 host-reserved 账（写权限=file-tree，读=任何插件）；槽位命名保持小驼峰现状（`fileContext`），斜杠命名否决 |
| D3 | openWith 入口形态 | 文件树右键「打开方式…」（主入口）＋命令面板（次）；设置页不做 |
| D4 | 未关联二进制的兜底口径 | **标签页内简单提示＋toast**：编辑器标签区渲染「此文件无法作为文本显示」＋两颗文字钮（「打开方式…」／「在市场搜索阅读器」）；toast 同步一句。**不做弹窗**（无可确认之事）、**不预造共享组件**（见 D10） |
| D5 | openExternal 白名单 | `http:` `https:` `mailto:` ＋ 常量登记的已注册协议（`vscode:` 等）；`file:`/`javascript:`/`data:` 明确拒绝；白名单进 host-reserved 账 |
| D6 | OS 登记的开关归属与形态 | **归壳**（登记这个动作是壳做的，跟哪只插件无关）：壳配置键 `app.osAssociations.followPlugins`（总开关，默认开）＋稀疏覆盖 `app.osAssociations.overrides`（`{".pdf":false}` 逐类关）。设置页「通用 → 系统集成」组内动态列出「随包＋已装插件声明的扩展名」各一行开关；**pdf 插件不声明任何开关**、不因它自动生成设置项；卸载插件 ⇒ 该行消失＋OS 登记撤（除非别家也声明同类） |
| D7 | 多插件共存仲裁（pdf 阅读器 N 家／**挂牌冲突同规**） | **主权三层：壳持主权（覆盖表）、插件只提名（声明=候选）、文件树只执行**。用户没选过时默认=**先激活先得**＋稳定 tie-break（pluginId 字典序）；**第二只装上/挂牌不静默换人**——toast「检测到另一款 PDF 阅读器，当前默认仍是 X，右键→打开方式可换」（会话内一次）；⛔ 插件永不自封默认、永不改覆盖表 |
| D8 | svg 等双身份类型 | svg 默认仍归 editor（文本可编辑），图片阅读器**不声明** svg——「默认不动、选择器可换」 |
| D9 | 兜底角色怎么声明 | `contributes.fileAssociations` 条目加 `"role": "text-fallback"`（进作者面 schema）；editor 现有 45 条**原样保留**、同笔补角色；`FALLBACK_PLUGIN_ID="welcome"` 是另一件事、本件不动 |
| D10 | 警告的共享组件化时机 | **不预造**：v1 由 editor 自绘标签内提示（自有 JSX，约 30 行）；**第二个真实编辑器插件出现时**才把配方抽进 `@linkdesk/ui`（先例：共享件均为「已有真实消费者」后搬移——Slider/ReadOnlyText/BackgroundImagePicker 同律）；在作者文档写明配方让第二作者先照抄 |

## 六、验收

1. 装 PDF 阅读器（临时样例仓）→ 文件树单击 pdf 开它的标签；卸载 → 退回 editor 且**不再是乱码**（T1 提示页＋toast）。
2. 右键 pdf →「打开方式…」列出全部 handler＋当前默认标记；「设为默认」后重启仍生效；「恢复自动」后回声明序；**第二只装上时默认不漂移**＋提示出现（D7）。
3. 两只插件同时挂牌 `role:"text-fallback"`（用户场景 9）：默认**不静默换人**、提示出现、选择器里两家并列可挑（T7＋D7 同规）。
4. 第三方样例插件声明 `contributes.menus.fileContext`＋`when: "resourceExtname == .md"` → 对 .md 出现、对 .txt 不出现；文件树自己的 18 项原样未动。
5. OS：装阅读器后「打开方式」出现 LinkDesk；卸载后撤（D6 开关链）；exe 永不出现在候选；构建期生成的清单与随包件声明逐字节一致（负控=手工塞一个未声明扩展 → 门禁红）。
6. 文档链：AI 手册命令索引、作者面 plugin-docs、命名规范、四份 schema 拷贝全部随码重生（[04-任务清单](04-任务清单.md) §文档连锁逐格对账）。
7. `npm run check` 全绿。

## 七、不做（边界）

- 不做四只阅读器插件本体（05 已起头，见 §二链接）。
- **不做文件树缩略图/预览面板**；**不做「点击计数学习默认」**——默认只来自用户显式动作。
- 不做「自动 reload 池」（「插件更新须重启」仍在池里）。
- 不做 md 同屏滚动的壳侧机制——插件间契约（[编辑器-打开方式适配](../../../05-插件更新/编辑器-打开方式适配/00-README.md) E2），壳不掺和。
- **不在设置页预想/枚举世界上所有文件类型**——不存在「打开方式类别注册表」；列表永远从已装插件的声明**现算**（见 [01 §T2/§T6](01-方案与落点契约.md)）。
