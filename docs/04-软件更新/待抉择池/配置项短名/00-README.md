# 04-软件更新 · 待抉择池（配置项短名：设置页／市场详情页「人话行名」落地）

> 立案：2026-10-04（用户）。**状态：📋 方向已拍板 · 任务书已布置，待用户检查后派工**（T1–T7 七格到落点；D1–D7 七项带建议值待复核，见 §五）。
> 一句话：设置页与市场详情页的配置项行名今天直接渲染英文键（`editor.autoSave` 这种），根因 = **schema 没给配置项「短名」留落点**——组名（「编辑器」）、节名（「文件」）、长描述（`description`）都有，唯独行名没有，渲染侧只能拿 key 顶。本件 = 补 per-property `title` 字段（optional）→ 两台消费插件改渲染 → 89 条声明补名 → en 译名 → 齿轮「复制设置名称」→ 市场跳设置复测。
> **归属拍板（2026-10-04 用户）**：**凡涉多仓＋软件主体的任务一律进 04 本池**（不拆 05）——本件横跨 SDK／两台消费插件／五台声明插件／壳声明与齿轮，故立于此；此规则已记入 [池表头注](../../00-README.md)。

## 一、缘起（用户问题原话摘录，2026-10-04）

1. 为什么设置页显示的都是 `editor.autoSave`、`serial-monitor.statusBar.connection` 这种，而不是人眼能看的？
2. 这属于 04-软件更新还是 05-插件更新？——拍板见档头。
3. 是不是所有声明在设置内的都要更新？怎么做？
4. 「通用/主题/AI接入」是壳的声明；编辑器/资源管理器/插件市场/串口监视器/设置 各是各插件——**归属理解正确**（精确落点见 [03 普查表](03-配置项普查与短名底稿.md)）。
5. 是不是全部都要更新，每个配置项加一个标注的人眼可看的？——是，89 条全补（见 §三）。
6. 中英翻译怎么办（尤其插件侧没有红灯警告的仓）？——机制现成，缺的是供给与防漏（[01 §八](01-方案与落点契约.md)）。
7. 市场详情页「功能」页上面是详情介绍、下面是英文字母——设置页做好后市场是不是也要更新一次？——是，**同一个字段同笔消费**，不是重做一遍（T3）。
8. 市场「功能」页配置项点击**不跳**对应类别（如点文件树的配置项不跳「资源管理器」）——是 bug 吗？没命令还是忘了？——**不是没命令也不是忘了**：链路六环全在且逐环核过 file:line（[01 §六](01-方案与落点契约.md)），静态看应当能跳；实机不跳 = 运行时 bug，T6 实机复测＋二分。
9. 齿轮只有「复制 ID／复制为 JSON」——加「复制名字」？——加；**命名定为「复制设置名称」**（2026-10-04 用户：「复制名字太糙，换掉」），落壳齿轮槽（T5）。

## 二、根因取证（2026-10-04，file:line 均已核）

| # | 事实 | 证据 |
|:--:|:--|:--|
| ① | **schema 的配置项属性没有 title/label 字段**——只有 `type/default/description/enum/enumDescriptions/group/uiHint/renderHint/actionCommand…` | `packages/plugin-sdk/schemas/plugin.schema.json:354`（configuration 节，properties.* 逐字段核过） |
| ② | **设置页行名 = 直接渲染 configKey** | settings 仓 `src/views/SettingsView/SettingRow.tsx:76` → `<label className="settings-row-label">{configKey}</label>` |
| ③ | 描述走 `t()`（i18n key = 中文原文，en.json 可译） | 同文件 `:70` → `descText = t(description ?? prop.description)` |
| ④ | **市场详情「功能」页配置行 = 上 description 长句、下英文 key，且没走 `t()`**（英文界面也显示中文） | marketplace 仓 `src/views/detail/DetailView/features-groups.tsx` → `ConfigGroup`：`{desc?.description || key}` ＋ `{key}` |
| ⑤ | 齿轮菜单项注册在**壳**（槽 `MENU_SLOTS.SettingItemGear`） | 壳 `src/core/commands/shell/coreCommands.ts:347`「复制设置 ID」·`:364`「复制为 JSON」；槽常量 = settings 仓 `SettingRow/gearMenu.ts` `SETTING_ITEM_GEAR_MENU` |
| ⑥ | 市场跳设置链路六环齐全（静态） | `FeaturesTab.tsx:57` → 壳 `settingsCommands.ts:204-206` → `ConfigurationRegistry.ts:393-421`（pending＋Emitter）→ `IpcBridgeHandler/ui.ts:41-47`（broadcast）→ preload `configuration.ts:64-76` → settings 仓 `useSettingsEvents.ts` 双通道消费 → `SettingsView.tsx:110`（`g.pluginId === selectedGroup`） |
| ⑦ | 枚举显示名缺 `enumDescriptions` 时回退显示原文（英文值裸奔） | settings 仓 `renderControl.tsx:209`／`mapSegmentedOptions.ts:13` → `enumDescriptions?.[i] ? t(...) : t(v)` |
| ⑧ | 插件译文进**共享** `translation` 命名空间 ⇒ 跨插件 `t()` 可解析（设置页能译出 editor 的描述，市场补 `t()` 同理可译） | `src/pluginLoader/contributions/i18nResources.ts:90-91`；登记本 `src/core/registry/languages/LanguageRegistry.ts:5-8` |
| ⑨ | **普查规模 = 89 条**：壳 41（appearance 主题 24 · aiBridge AI接入 14 · update 2 · storage 1）＋ editor 26 ＋ file-tree 18 ＋ serial-monitor 2 ＋ marketplace 1 ＋ settings 1 | 全表见 [03](03-配置项普查与短名底稿.md)（底稿，执行时重普查） |

## 三、任务分解（T1–T7；逐格规格在 [01](01-方案与落点契约.md)，打勾账在 [04](04-任务清单.md)）

| # | 任务 | 一句话 | 主要落点 | 依赖 |
|:--:|:--|:--|:--|:--|
| T1 | **schema ＋ 契约加 `title` 字段** | configuration.properties.* 加 optional `title`（短名，值域=中文原文）；schema 四份拷贝同笔；契约类型补字段重生 | plugin-sdk schema ＋ `src/core/api/linkdesk-api/types.ts` ＋ contracts 生成链 ＋ plugin-docs schema 拷贝 | — |
| T2 | **设置插件渲染短名** | 行名 `t(prop.title) ?? configKey`；搜索索引加 title 匹配；类型补 `title?` | settings 仓 `SettingRow.tsx`／`filterGroups.ts`／`types.ts` | T1 |
| T3 | **市场插件功能页同笔消费** | 上行 `t(title)` 短名、下行 key 保留（对标 VS Code）；**同笔补 `t()`**（今天描述没走翻译） | marketplace 仓 `features-groups.tsx`／`contribs.ts` | T1 |
| T4 | **五台官方插件仓声明补名＋译名** | 48 条逐条加 `title`＋en 译名＋枚举显示名缺口（≥11 组）；各仓发版＋目录收录 | editor/file-tree/serial-monitor/marketplace/settings 五仓 plugin.json ＋ 各仓 i18n/en.json | T1 |
| T5 | **壳：声明补名 ＋ 齿轮「复制设置名称」** | 壳 41 条补 `title`（**一律 `t()` 包裹**，`audit-i18n --strict` 拦裸中文）；壳新命令＋菜单项（when=`settingHasTitle`，context key 由设置插件开齿轮时设）；`manual:build` | `src/App/config/*.ts` ＋ `coreCommands.ts` ＋ settings 仓 `gearMenu.ts` ＋ host-reserved 账本 | T1/T2 |
| T6 | **市场跳设置复测＋二分** | dev 版三场景（设置未开/已开/首开）实测；不通照硬约束 15 `git checkout` 二分 | 实机验收＋（视结果）市场/壳/设置仓小修 | T2/T3 |
| T7 | **收口**：普查尺＋文档连锁＋保鲜 | `audit:config-titles` 普查尺（只报不拦）；作者面文档两处＋AI 手册＋cheatsheet；`sync:bundled --latest` 拉齐种子（commit 非发版）；JOURNAL 打点 | `scripts/` ＋ `docs/03-plugin-authoring/` ＋ `docs/03-插件制造/` | 全部 |

## 四、执行边界与授权（用户 2026-10-04 原话口径）

- **壳（软件本体）：dev 版测即可，不发版**——「发版一次太慢，攒一点再发」；`npm run electron:dev` 秒级热更新，落仓进攒批（软件侧变更提交前照硬约束 22 调 version-bump skill 判类别并同笔 CHANGELOG）。
- **npm 包与插件本仓：同意直接发版**（插件市场可以点升级的那种）——plugin-sdk／@linkdesk/contracts／plugin-docs 与五台插件仓做完即 bump＋CHANGELOG＋发版＋**官方目录收录**＋`git push`（推必带代理 `127.0.0.1:7890`）；⛔ 撤版与改写已发布 tag 仍归用户。
- **git 纪律**：**只 add 本案文件**（⛔ `git add -A`／`git add .`）——同时有另一 AI 在 04 布置另一任务，别人半成品一个不加；commit message 带本案标识 `docs(配置项短名): …`／`feat(设置页): …`。
- **可能不是布置者执行**：本案五份文档自成一体，执行 AI 从 [04](04-任务清单.md) 阶段 0 进场即可，不必回读本会话。

## 五、拍板项（D1–D7，建议值已按既有先例选定，检查时可改）

| # | 题 | 建议值 | 依据 |
|:--:|:--|:--|:--|
| D1 | 字段名 | `title`（与组名 `configuration.title` 同词同义） | schema 内语义一致；`label` 易与表单语义混淆 |
| D2 | 是否 required | **optional**——第三方存量不声明完全不炸，渲染 fallback = configKey | 「导出面只加不删」契约纪律；官方各仓全量补齐 |
| D3 | 市场功能页下行 | **保留英文 key**（上行短名、下行 ID） | 对标 VS Code；ID 本来就该示人，齿轮复制是设置页的事 |
| D4 | 设置页行名形态 | **只显短名**（ID 走齿轮「复制设置 ID／复制为 JSON」，均已存在）；无 title 回退显 key | 对标 VS Code 设置页；不留双行 ID 噪音 |
| D5 | 齿轮新项 | 「**复制设置名称**」，when=`settingHasTitle`（无 title 的行不出现，不留死项），复制**当前语言显示名** | 用户 2026-10-04 命名拍板；context key 面照 `settingKey` 既有模式 |
| D6 | 防漏门禁强度 | **普查尺只报不拦**（`audit:config-titles`，进 audit:* 家族，⛔ 不接 check 链） | `audit:plugin-commands` 同款先例；「判红须论证本仓可答＋有真害」 |
| D7 | 枚举显示名缺口 | **顺带补齐**（editor 8 组/file-tree 2 组/settings 1 组缺 `enumDescriptions`，壳侧阶段 0 普查） | 「人眼可看」的自然组成；机制现成（取证 ⑦） |

## 六、验收（七条全绿才算完）

1. dev 版设置页：**全部行显示人话短名**（壳 41＋随包插件 48），无一行裸 key（第三方未声明者 fallback 显 key 属预期）。
2. 英文界面：短名与描述出英文；缺译项回退中文原文且被普查尺报出。
3. 市场详情「功能」页：上行短名、下行 key；英文界面经 `t()` 正常翻译。
4. 齿轮菜单：有 title 的行出现「复制设置名称」且复制得到当前语言短名；无 title 的行不出现该项。
5. 设置页搜索「自动保存」能命中 `editor.autoSave`（title 进索引域）。
6. T6 三场景（设置未开/已开/首开）跳转全通：市场详情点配置项 → 设置开在对应类别且滚到该行；不通则二分修复后复测通过。
7. `npm run check` 全绿；SDK/npm 包/插件发版链走完（市场里能点到升级为实据）；JOURNAL 打点。
