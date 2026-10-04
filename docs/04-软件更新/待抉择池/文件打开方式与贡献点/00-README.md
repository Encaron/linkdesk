# 04-软件更新 · 待抉择池（文件打开方式与贡献点：阅读器类插件「声明即接管」）

> 立案：2026-10-04（用户）。**状态：📋 待拍板**（任务 T1–T6 已规划到落点，**D1–D8 八项待裁**，见 §五）。
> 一句话：把「**装一个阅读器插件，对应文件就归它打开；卸载就退回**」做成壳侧一条通用能力——三路源码取证证明**基础设施已有四分之三**（`contributes.fileAssociations` 注册表在跑、菜单贡献槽已声明式、OS「打开方式」链路三环全通），本件只补缺的四小块＋把规矩立全。
> 详细落点/改法/判据逐格 = [01-方案与落点契约.md](01-方案与落点契约.md)。

## 一、缘起（用户问题清单，2026-10-04 原话摘录）

用户在评估四只阅读器插件（PDF／图片／以 VS Code 打开／MD 预览）可行性时提出的系列问题，本件为其**壳侧答案**：

1. 「文件树的所有东西我直接单击，就会以编辑器插件的形式打开，**无论是 exe、pdf、jpg、svg 等等都是如此，不管能不能用**」——为什么？是早期只有文件树＋编辑器的历史结果吗？
2. 「如果我们制作了 pdf 阅读器插件，如何让文件树的 pdf 文件**被单击时默认打开方式是它**？退回路径则是卸载或没装时继续默认编辑器打开，**类似 VS Code，它甚至会在 toast 提示我应该装一个 vscode-pdf 插件**」
3. 「html/md 这类比较特殊：直接取代单击进预览模式是**极其愚蠢的**——应该是单击进编辑器，**右键多出『打开方式』菜单项**（对标 VS Code 的 Live Server／MPE『打开侧边预览』），可以开两个界面分屏，左代码右效果、热加载，甚至**同屏滚动**；『打印为 HTML』则命令面板提示选择保存地址」
4. 「我不想让软件本体和这类辅助插件**耦合**——要可下载使用、卸载丢弃；**别人也可能做自己的 pdf 阅读器**，甚至带笔记等更多功能；打开方式也可能不一样」
5. 「右键菜单怎么注册进去？文件树已有菜单是文件树自己注册的，别的插件怎么**加入而不替换**？」
6. 「Windows 资源管理器右键 → 打开方式 → LinkDesk，就应该**以我装的那个 pdf 阅读器插件的形式直接打开**」

## 二、归属判据：为什么在 04 不在 05

解析器、选择器、公共 context key、openExternal 通道、安装器关联清单**全部住壳**；四只阅读器插件本体已在 05 起头（见 [05 索引](../../../05-插件更新/00-README.md)，四夹＋文件树/编辑器两适配夹）。按**核心准入三问**（硬约束 9）：扩展名→插件的解析是多提供方（任何插件可声明）✓、多消费方（文件树单击／OS 打开方式／openWith 选择器／SearchView）✓、桌子不知道 pdf 是什么（壳只存「扩展名→插件 id」映射）✓ ⇒ 解析面住 `src/core`，声明面进 schema，渲染归各插件——**归属三层框架：声明＝宿主 schema／解析＝壳服务／呈现＝插件**。

## 三、现状取证（三路源码结论，2026-10-04，file:line 均已核）

| # | 事实 | 证据 |
|:--:|:--|:--|
| ① | **文件关联注册面已存在且在跑**：manifest `contributes.fileAssociations`（扩展名→插件＋可选 command＋displayName）→ 主进程三表 → IPC `fileAssociation.getPluginFor(ext)` | schema `packages/plugin-sdk/schemas/plugin.schema.json:477-489`；`electron/plugins/plugin-manifest-loader.ts:89-95`；服务 `src/core/services/files/FileAssociationService.ts`；IPC `electron/ipc/handlers/registry-handlers.ts:55-56` |
| ② | **单击全进 editor 的真因＝兜底**：file-tree `doOpenFile` 先查 `getPluginFor`，查到就开那个插件；查不到传空串 → 壳 tabs handler 兜底 `DEFAULT_TAB_TYPE="editor"`。editor 已声明 45 个文本扩展名（**不含 pdf/jpg/exe**）⇒ pdf 类全是「没人认领→落兜底」 | `E:\linkdesk-plugins\official\file-tree\src\views\FoldersView.tsx:122-131`；`src/core/services/plugins/IpcBridgeHandler/tabs.ts:14,24-28`；editor `plugin.json` fileAssociations 段 |
| ③ | **editor 无二进制守卫**：`EditorModel.load` 读二进制 → 编码探测（无二进制检测）→ 强解文本 → 语言兜底 plaintext ⇒ pdf/exe 开成**不报错的乱码标签页** | `E:\linkdesk-plugins\official\editor\src\services\EditorModel.ts:100-106`；壳 `src/core/services/files/EncodingService.ts:132-148` |
| ④ | **菜单贡献已声明式**：file-tree 的右键菜单项写在它自己 plugin.json 的 `contributes.menus.fileContext`（2026-09-29 起），渲染组件只认 `menuId="fileContext"` 槽；`MenuId` 是开放字符串，壳侧 MenuRegistry 合并＋`when` 过滤 ⇒ **第三方插件声明即加入、不替换** | `E:\linkdesk-plugins\official\file-tree\src\components\FileTreeContextMenu\Menu.tsx:11,53-58`；`src/core/registry/commands/MenuRegistry.ts:18-53,111`；槽位真源 `packages/plugin-sdk/schemas/host-menu-slots.json` |
| ⑤ | **「打开方式」选择器只有占位**：`file-tree.openWith` 是 placeholder 命令，UI 与用户覆盖表未做；多插件抢同一扩展名的仲裁规则未定 | `E:\linkdesk-plugins\official\file-tree\src\components\FileTreeContextMenu\commands\navigation.ts:63`；`FileAssociationService.ts` 头注释已预留该设想 |
| ⑥ | **OS「打开方式」链路三环全通**：自绘安装器已写 ProgId `LinkDesk.Document`＋13 扩展＋全文件右键项 → argv 裸路径 → `parseLaunchPaths` → `routeLaunchItems` → `workspace:openPath` → `useOpenPathIntake` 查**同一张** fileAssociations 表 → 开标签。**缺口＝.pdf 不在 13 扩展清单里** | `build/installer/bootstrapper/syswrite.cpp:60-64,163-203`；`electron/windows/launch-args.ts:24-47`；`electron/main.ts:673,731-748`；`src/hooks/useOpenPathIntake.ts:66-71` |
| ⑦ | **`shell.openExternal` 未暴露给插件面**（仅主进程内部外链路由用）⇒「以 VS Code 打开」插件的 `vscode://` 协议需要 T4 开受控通道 | `electron/windows/external-links.ts:29`；preload 池无此方法 |
| ⑧ | **兜底本身是硬编码**：`DEFAULT_TAB_TYPE="editor"` 写死在壳 tabs handler——**壳认识一个具体插件 id**（视图加载失败兜底 `FALLBACK_PLUGIN_ID="welcome"` 同病）。卸载/替换 editor 后兜底指向不存在的插件再落 welcome。file-tree 自己**没有**写死 editor（`FoldersView` 传空串让壳填）⇒ 写死的那个是壳 | `src/core/services/plugins/IpcBridgeHandler/tabs.ts:14`；`src/core/utils/plugin/fallbackPluginId.ts:8`；`E:\linkdesk-plugins\official\file-tree\src\views\FoldersView.tsx:122-131` |

## 四、任务分解（T1–T6；逐格落点/改法/判据在 [01](01-方案与落点契约.md)）

| # | 任务 | 一句话 | 主要落点 | 依赖 |
|:--:|:--|:--|:--|:--|
| T1 | **二进制守卫＋未关联兜底** | **判定归壳**（`EncodingService.isBinary` 一处真相源，经契约面暴露给所有插件）；**呈现归被兜底的那个插件**——editor 只是今天恰好被兜底的「方式之一」，它出参考实现；`@linkdesk/ui` 出**能力注入式共享兜底组件**（兜底页＋两颗钮接宿主命令），第二个作者的自制编辑器几行接线就有同一份 UX，各画各的、配方共享 | 壳 `EncodingService.ts`＋`@linkdesk/ui`＋editor 插件 | D4/D9 |
| T2 | **打开方式选择器＋用户覆盖表** | 实现 `file-tree.openWith` 占位：列该扩展名全部 handler；用户覆盖表（「始终」记住）优先于声明；宿主新增「列出某扩展名全部 handler」只读面 | file-tree 插件（UI）＋壳 `FileAssociationService`（覆盖表＋列表面） | D1/D3/D7 |
| T3 | **公共 context key** | 把文件属性（`resourceExtname`／`itemIsFile` 已有私有版）升为宿主公共旗子，菜单 `when` 才能按扩展名显隐 | 壳 context key 账＋file-tree 注入点 | D2 |
| T4 | **受控 openExternal 通道** | 给插件面开 `shell.openExternal`（scheme 白名单：http/https/已注册协议）；「以 VS Code 打开」的地基 | `electron/preload-pool/namespaces-plugin.ts`＋主进程 handler＋host-reserved 账 | D5 |
| T5 | **菜单贡献点收口**（自[菜单补全](../菜单补全.md)剥入） | `fileContext` 等槽位命名规范拍板（历史文档的斜杠命名 vs 现行小驼峰）＋作者面文档＋SDK 门禁腿（防第三方把成员名当值——`host-menu-slots.json` 已防一种，补文档面） | schema 四份拷贝＋`docs/03-插件制造`＋SDK check | D2/D8 |
| T6 | **OS 关联与插件状态同步（解薛定谔态）** | 13 扩展清单是**安装期静态数据**、插件是**运行期状态**——文本类不薛定谔（随包 editor 真开得了），pdf/jpg 这类才薛定谔。三步解：① 静态清单**构建期从随包插件声明机械收割生成**（消灭第二真相源——editor 声明 45 ↔ 安装器登记 13 **已经漂移**）② 运行期同步：装/卸声明了新扩展名的插件 → 壳按设置页开关增/撤 OS 登记（HKCU per-user）③ **exe 永不登记** | `build/installer/bootstrapper/syswrite.cpp:60-64`＋主进程同步模块＋设置页 | D6 |
| T7 | **DEFAULT_TAB_TYPE 去硬编码** | 壳不再写死 `"editor"`：fileAssociations 声明条目加 **`role`**（如 `"text-fallback"`），壳解析「当前激活的、声明了该角色的插件」当兜底；没人声明 ⇒ 走 T1 的「无法打开」路径，不再塞给一个不存在的插件。**第三方编辑器声明同角色即可整体接管兜底位——零壳改动** | `tabs.ts:14`＋schema＋editor plugin.json | D9 |

## 五、待拍板（D1–D8，均附建议值）

| # | 问题 | 建议 |
|:--:|:--|:--|
| D1 | 用户覆盖表存哪 | `settings.json` 新键 `workbench.fileAssociations`（`{".pdf":"my-pdf-reader"}`），壳 `FileAssociationService` 读它做最高优先级 |
| D2 | 公共 context key 谁写 | **file-tree 注入**（它手里有文件信息；官方插件自带＝示范），壳把键名记入 host-reserved 账（写权限=file-tree，读=任何人）——与 `settingsSlotFilled` 由 usePoolSync 推送同构 |
| D3 | openWith 入口形态 | 文件树右键「打开方式…」（主入口）＋命令面板（次）；**设置页不做**（避免第二个真相源） |
| D4 | 未关联二进制的兜底口径 | **呈现归被兜底的插件**（编辑器只是方式之一，第二个作者的自制编辑器同责同权）；壳只供**判定数据＋两条宿主命令**，兜底页配方由 `@linkdesk/ui` 共享组件承载。文案＋两颗钮：「打开方式…」／「去市场找阅读器」（搜索词=扩展名） |
| D5 | openExternal 白名单 | 只放行 `http:` `https:` ＋ **OS 已注册的协议**（`vscode://` 属此类）；`file:`/`javascript:` 等明确拒绝 |
| D6 | OS 关联怎么跟着插件走 | 设置页「系统集成」加**「系统『打开方式』」**块：列随包＋已装插件声明的扩展名、每项开关（默认=随包文本类开、市场阅读器类关）；运行期增撤走同一份账。与[安装器-更多配置](../安装器-更多配置/00-README.md)合并成**一份账**（安装时勾选=静态半，运行期同步=动态半），⛔ 别立两处真相源 |
| D7 | 多只 PDF 阅读器共存（微软/Adobe/第三方都会来的问题） | **主权三层：壳持有主权（用户覆盖表）、插件只有提名权（声明=候选）、文件树只有执行权（查表就开）**——VS Code 同款模式（`workbench.editorAssociations` 是用户设置，插件不能自封默认）。用户没选过时的默认 = **先激活先得**＋稳定 tie-break；**第二只同类型装上不许静默漂移**——toast/市场页提示「当前默认仍是 X，右键→打开方式可换」。⛔ 插件**永不**自封默认、永不改覆盖表 |
| D8 | svg 等双身份类型 | svg 默认仍归 editor（文本可编辑），图片阅读器**不声明** svg，想要的人在打开方式里选——「默认不动、选择器可换」原则 |
| D9 | 兜底角色怎么声明 | `contributes.fileAssociations` 条目加 `"role": "text-fallback"`（进作者面 schema）；壳解析**角色**而非写死插件 id；角色可被第三方编辑器整体接管；editor 现有 45 扩展名单原样保留、同笔补角色标记。`FALLBACK_PLUGIN_ID="welcome"` 是视图加载失败的另一件事，本件不动 |

## 六、验收

1. 装 PDF 阅读器（临时样例仓）→ 文件树单击 pdf 开它的标签；卸载 → 单击退回 editor 且**不再是乱码**（T1 兜底页）＋ toast 可跳选择器。
2. 文件树对 pdf 右键 →「打开方式…」列出所有声明者＋默认标记；选「始终」→ 覆盖表落盘、重启仍生效。
3. 第三方样例插件在 plugin.json 写 `contributes.menus.fileContext`＋`when: "resourceExtname == .md"` → 文件树对 .md 右键多出它的项、对 .txt 不出现；文件树自己的项原样未动。
4. OS：安装器勾选关联 pdf（或全文件右键项）→ 资源管理器双击 pdf → LinkDesk 直接开 PDF 阅读器标签。
5. `npm run check` 全绿（含 `audit-i18n`／`check-plugin-schema-sync`／`check-manual-surface`／SDK 门禁自测）。

## 七、不做（边界）

- 不做四只阅读器插件本体（已在 05 起头：[PDF](../../../05-插件更新/PDF阅读器插件/00-README.md)／[图片](../../../05-插件更新/图片阅读器插件/00-README.md)／[以VSCode打开](../../../05-插件更新/以VSCode打开插件/00-README.md)／[MD](../../../05-插件更新/MD文档阅读器插件/00-README.md)）。
- 不做文件树缩略图/预览面板（另一个能力面）。
- 不做「自动 reload 池」——「插件更新须重启」仍在池里，本件不改缓存机制。
- 不做 md 同屏滚动的壳侧机制——那是 MD 阅读器与编辑器适配夹之间的插件间契约（见[编辑器-打开方式适配](../../../05-插件更新/编辑器-打开方式适配/00-README.md) E2），壳不掺和。
