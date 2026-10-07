# 兜底打开链与二进制文本选项（立案）

> **状态**：✅ **已实现 · 待 dev 实机验收**（2026-10-07 当天拍板 D1–D6 ＋ 全量实施 ＋ 两插件已发版；壳走 `0.2.53` 攒批未发——A 半/T11 要随壳发版后才在安装版见效）。实施记录见 §七。
> **归属**：**04-软件更新**（用户拍板：**涉及壳＋插件多面 ⇒ 归 04**；只有完全不动壳的插件更新才归 `05-插件更新`）。
> **两半一案**：① **兜底打开链**——无后缀 / 点开头文件点开落进欢迎页或干脆没反应；② **二进制文本选项**——编辑器「此文件无法作为文本显示」页加第三颗钮 `仍旧以该编辑器插件打开`。

---

## 〇、用户原话（立案依据）

> 「我在文件树新建一个文档，直接新建，没有任何后缀，然后直接点击，弹出编辑器的标签页，但是页面内容却是欢迎标签页的内容。**vscode 也不是这么干的呀**，在 vscode，我建一个没有后缀的文档，照样可以编辑。你去看看这是什么原因？是哪条路断了？」

> 「其实我还想的是，**我不应该把 png、pdf 等文件通过编辑器这个插件打开给强行全部抹除**……在这个『在市场搜索阅读器』旁边加一个按钮，显示『**仍旧以该编辑器插件打开**』。」

**两句话是一条链的两半**（用户同日点明要合起来看）：编辑器是「没人认领的文件」的**兜底者**（它自己声明 `role:"text-fallback"`）——
· 前半：兜底链**没接上**（文件没到编辑器手里就被短路成欢迎页）；
· 后半：编辑器**接到了**，但 T1 守卫把「拿文本打开」这条路整条抹掉了（提示页成了死胡同）。

⇒ 本件要的是：**兜底位真兜住，且兜底者手里留一条「我就是要用文本打开」的出口。**

---

## 一、现状 · 前半（无后缀 / 点开头文件）——**一处真相源已经是对的，是接线把它掐了**

**服务层本就照「空扩展名 → 角色兜底」设计**：`../../../../src/core/services/files/FileAssociationService.ts`（`resolveOpenTarget`）对空扩展名跳过覆盖表与声明表、直落 `resolveFallbackTabType()`；**这一语义已有测试钉着**——
`FileAssociationService.test.ts` 用例 ⑥「空扩展名（无扩展名文件 / 点开头文件，E8/E33）⇒ 不查声明表、直落角色兜底」，断言 `resolveOpenTarget("")` ＝ 挂牌者。

所以不是设计没想，是**四处闸门**把它掐断了：

| # | 闸门 | 形态 | 后果 |
|:--:|---|---|---|
| ① | `../../../../electron/ipc/handlers/registry-handlers.ts`（`fileAssociation.getPluginFor` 处理器） | `if (!extension) return undefined;` | **主进程总闸**：即便调用点照发 `""`，也回 `undefined`（原注释自称「空扩展名返回 undefined」） |
| ② | `E:\linkdesk-plugins\official\file-tree\src\views\FoldersView.tsx`（`doOpenFile`） | `const pluginId = ext ? await lk.fileAssociation.getPluginFor(ext) : "";` | 文件树单击 / 双击 → 空 type |
| ③ | `../../../../src/hooks/useOpenPathIntake.ts`（`openOne`） | `const ext = dot > 0 ? … : "";` ＋ `const pluginId = ext ? … : "";` | 命令行 / 系统「打开方式」→ 空 type |
| ④ | `E:\linkdesk-plugins\official\file-tree\src\views\SearchView\openMatch.ts` | `if (!ext) return;` | 搜索结果双击无后缀文件 → **什么都不发生**（连欢迎页都没有，是个死点） |

**空 type 之后**：壳侧 `../../../../src/core/services/plugins/IpcBridgeHandler/tabs.ts` 的 `type || resolveFallbackTabType()`（intake 侧同款在 `useOpenPathIntake.ts`）。而**壳渲染进程那份 `FileAssociationService` 的表永远是空的**——`registerFileAssociation` 全仓唯一非测试调用点在**主进程**（`../../../../electron/plugins/plugin-manifest-loader.ts`，激活插件时带 `role` 注册）⇒ 渲染进程 `resolveFallbackTabType()` 恒返回 `FALLBACK_PLUGIN_ID = "welcome"`（`../../../../src/core/utils/plugin/fallbackPluginId.ts`）⇒ **欢迎页**。

> **同一根因解释「既没 Monaco 也没提示块」**：那句 `"「{{name}}」无法作为文本显示 —— 可用「打开方式」…"` 住 **editor 插件**（`editor/i18n/en.json`，键 `「{{name}}」无法作为文本显示 —— …`），文件根本没到 editor ⇒ 两条路都走不到。

---

## 二、现状 · 后半（二进制）——提示页是**死胡同**

| 环节 | 落点 | 事实 |
|---|---|---|
| 判定 | `editor/src/services/EditorModel.ts`（`load`）＋ 壳 `EncodingService.isBinary` | 判定**归壳**（一处真相源），命中 ⇒ 编辑器**不解码**、`_value` 留空、`isBinary=true` |
| 呈现 | `editor/src/components/EditorTab.tsx` | `state.model.isBinary` ⇒ 面包屑 ＋ `BinaryNotice`，**不挂 Monaco**（构造上就是「没内容可画」） |
| 出路 | `editor/src/components/BinaryNotice.tsx` | 两颗钮：`打开方式…`（探 `SHELL_COMMANDS.openWith` 在册才渲染）／`在市场搜索阅读器`（探 `marketplace` 插件在册才渲染）**——⛔ 没有「就当文本打开」** |
| 保存 | `editor/src/services/EditorModel.ts`（`save`） | `isBinary` ⇒ **直接 throw**（立论：内容没解码，写回去就是把原文件抹平） |

⇒ T1 当初把「编辑器拿文本打开一切」的能力**整条去掉**了（那是有意的防乱码设计）。本件要它**以显式选择的形式回来**——第三颗钮，点了才解码。

---

## 三、范围（两半 · 两仓）

| 半 | 面 | 落点 |
|:--:|---|---|
| **A 兜底打开链** | 主进程总闸 ＋ 壳 intake ＋ file-tree 两处入口 | `electron/ipc/handlers/registry-handlers.ts` · `src/hooks/useOpenPathIntake.ts` · `file-tree`（`FoldersView.tsx` / `SearchView/openMatch.ts`，v1.0.30） |
| **B 二进制文本选项** | editor 提示页第三颗钮 ＋ 强制文本加载 ＋ 只读/可编辑策略 ＋ i18n ＋ 命令面 | `editor`（`EditorModel.ts` / `EditorTab.tsx` / `BinaryNotice.tsx` / `i18n/en.json`，v1.0.24） |

**明确不动的**：
- 壳的「谁打开」裁决本身（`resolveOpenTarget` 的覆盖 → 声明 → 角色三层，一行不改）；
- `isBinary` 判定口径（`EncodingService` 的 NUL/BOM 判据）；
- `welcome` 插件的既有渲染（见决策 **D4**）。

---

## 四、验收口径（用户可见 · 逐条可复现）

1. 文件树**新建无后缀文档** → 单击：**editor 正常 Monaco、可编辑**（⛔ 不是欢迎页）。
2. `.gitignore` / `.env` 这类**点开头**文件 → 同上。
3. **搜索结果**里双击无后缀文件 → 同上（原本是死点）。
4. 命令行 `linkdesk <无后缀路径>` / 系统「打开方式」→ 同上。
5. `.pdf` 且**未装**阅读器：editor 提示页（现状不变）＋ **第三颗钮可点** → 进「强制文本」态（只读或可编辑，见 **D1**）。
6. 装了阅读器：`.pdf` 走阅读器（现状不变）——⚠️ 用户是否仍该有「强制用编辑器看」的路 = 决策 **D2**。

---

## 五、档案索引

| 文件 | 内容 |
|---|---|
| [01-方案与落点契约.md](01-方案与落点契约.md) | 逐格改法（落点 ＋ 前/后代码）、判定口径、落位判据（判据 A / 三问） |
| [02-决策区.md](02-决策区.md) | **D1–D6 已全部拍定**（D1 乙 可编辑可保存 · D2 甲 当批即做 · D3 甲 恒提第三路 · D4 乙 下沉 · D5 甲 · D6 乙 不根治；含实施实测修正） |
| [03-边缘情况清单.md](03-边缘情况清单.md) | E1–E16（点开头 · 空文件 · GBK 误判 · 大文件 · 旧壳/旧插件降级 …） |
| [04-任务清单.md](04-任务清单.md) | T1–T10 ＋ 两仓发版次序 ＋ 门禁 ＋ 回滚 |
| [mockups/01-设计图-编辑器二进制提示页.html](mockups/01-设计图-编辑器二进制提示页.html) | 可交互整页拟真（六帧场景：现状两钮 / 方案三钮 / 强制文本只读态 / 已装阅读器 / 无后缀现状错 / 无后缀修后对） |

---

## 六、与前案的接口（沿革）

本件是 [文件打开方式与贡献点](../文件打开方式与贡献点/00-README.md)（已落地）的**直接续案**，吃它三样东西：

| 前案给的 | 本件怎么用 |
|---|---|
| **D7 主权三层**（覆盖表 → 声明表 → 角色兜底） | 不动，只是把「角色兜底」这一档**真正接上线**（前半） |
| **T1 二进制守卫** | 保留守卫本体（判定归壳、防乱码），补上**显式出口**（后半） |
| **T7 角色挂牌**（`role:"text-fallback"`） | 编辑器今天的兜底身份来源；本件不新增角色、不改仲裁 |

---

## 七、实施记录（2026-10-07 · 当天立案当天落地）

| 项 | 结果 |
|---|---|
| A 半（T1–T4） | 四处接线复原：主进程总闸撤 `if (!extension)` ＋ 壳 intake ＋ file-tree 双击/搜索两入口；判据测试＝壳 `registry-handlers.file-association.test.ts`（J2，3 例）＋ `useOpenPathIntake.test.ts`（J3 翻案）＋ file-tree `openMatch.test.ts`（J3/J4，5 例）；**顺手揪出潜伏 bug**：openMatch 曾把整条路径喂 `extension()`，带点目录名（`/tmp/v1.2/Makefile`）会算出假扩展名 `2/Makefile` —— 已改按 basename |
| B 半（T5–T9，D1=乙） | `EditorModel.load(filePath,{forceText})` ＋ `forcedText` 旗（事实/用户选择分记）；第三颗钮（共享 Button primary）＋ 细警示条 `.editor-forced-text-bar` ＋ 退回提示页（复用已解码 model 不重读盘）；保存闸放行 forcedText ＋ **写前每标签会话确认一次**；`reloadFromDisk` 保持强制态；toast 恒提第三路（D3）；命令 `editor.forceOpenAsText`（经 `forceTextActions` 登记表接进标签，硬约束 26） |
| T11（D2=甲） | `listHandlersFor` 有声明者时补兜底挂牌者候选 ＋ `resolveOpenTarget` 指向者放宽「声明者 或 挂牌者」（welcome 仍不可指派）；写入面实测无闸（立案预估 3 处 → 实改 2 处，见 [02 决策区](02-决策区.md) 修正）；服务层用例 ⑦/③/③b/③c 钉死 |
| 契约 | `@linkdesk/contracts` **0.1.44**（listHandlersFor / getPluginFor 契约文本补兜底链与 D2 语义；`contracts:gen` 再生 d.ts ＋ runtime-shapes ＋ SDK mock） |
| 测试 | 壳 `npm run check` 全绿（3693 例）／file-tree 154 例全绿／editor 92 例全绿 |
| 发版 | 插件轴已发：**file-tree v1.0.31** ＋ **editor v1.0.25**（GitHub Release ＋ marketplace.json）；npm 轴 **@linkdesk/contracts 0.1.44**；**壳 0.2.53 攒批未发**（⛔ 需用户令） |
| 残余 | D4 池档未立（welcome 兜底提示页做真，见 [02 决策区](02-决策区.md)）；D6 不根治（在案）；dev 实机四条路待用户验收 |

> **← 04 索引：** [../00-README.md](../../00-README.md)
