# LinkDesk

> **Electron + React 18 + TypeScript 通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
> **历程**：V2（「名字写死 = 功能写死」之祸）→ V3 定圆形大厅 → Tauri P1-P6 ✅（2026-08-03）→ E1-E4 迁 Electron＋文件树/Monaco 插件 ✅ → E5–E5.6 归一化（封站）→ E5.7 极简 Pool（O(1)）✅ → E5.8 归一化基建 ✅ → E6。**废案**：Per-Tab WebView / 多 WebView / 双 Pool（O(N) 进程，被 E5.7 取代，结论见 memory `e5.7-extreme-simple-pool`）。
> **当前进度（2026-09-29）**：🚀 **E6 收官中**——**已封站 = L4 · L5 · L7 · L8 · L9 · L10 · L11**（L0–L3 含 L3.5–L3.7 更早已闭）。🔴 **未完成只剩两处**：**① L6「安全加固与出厂判定」整层**——七格 `#48a`/`#48b`/`#49a`/`#50a`/`#51a`/`#52a`/`#52b` ＋ `#30.8e` 随 `#49` 走，**全部未开工、等开工令**；**② 三条零散**——`#53a-b`（装配清单 profile）· `#56a-b`（自指插件工具集），两条产出都是「设计文档 → 你拍板」；`#141`–`#143`（L10 待拍板三格）。**逐格状态与派单门槛**：[E6-执行清单.md](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md)（**唯一真相源**）＋ [E6-剩余任务分档-派单序.md](docs/02-Electron架构/E6_插件生态与发布/E6-剩余任务分档-派单序.md)（⚠️ 该档「未勾账」表停在 2026-09-19/25，`#110`/`#113`/`#15o`/`#37f`/`#64e` 等早已勾掉——**状态一律以执行清单为准**）。**E6 层序**：L1 独立构建 → L2 工具链 → L3–L3.7 市场与整理 → L4 端到端 → L5 文档发布 → L7 源码外移（18 仓）→ L8 兼容机械化 → L9 UI 集中供给 → L10 第三方作者反馈 → L11 测试覆盖——**每层的任务账 · 实测读数 · 残余边界一律住在各层 `00-整理档案.md`**（下表有逐层入口）。🟢 **E6 后迭代期 = `docs/04-软件更新/` 攒批发版**（v0.2.17–v0.2.21 已归档、**v0.2.22–v0.2.27 已发（Release 已公开）**，台账 = [已落地/00-README.md](docs/04-软件更新/已落地/00-README.md)）。🔴 **两轴归一化全部收官**（样式四条轴 1.20 · 非样式 1.50，报告 = [24-系列收口报告.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/24-系列收口报告.md)）。**版本读数**（唯一真相源 = 各 `package.json`；每次改版同笔校准本行）：软件 **0.2.27** · `plugin-sdk` **0.1.55** · `@linkdesk/ui` **0.2.27** · `@linkdesk/contracts` **0.1.25** · `plugin-docs` **0.1.41** · `create-linkdesk-plugin` **0.1.16**。🔥 **当前活动轨 = AI 友好化-全自动操作**（见下表该行；✅ **六轮 62 / 62 格全收口（2026-09-29 · 会话 13 —— 系列完）**：M1 9/9 · M3 7/7 · M5 3/3 · M4 27/27 · M2 11/11 ＋ 验收与收口 5/5（`AI#45` §七 七条真跑 = ✅6/◐1（安装版那半归发版批）· `AI#46` 12 例＋3 场景 = 34 条读数 ✔28/✗0/○6 ＋ 三处文档订正 · `AI#47` 非坐标自检 ＋ `forcePseudoState` 口径订正 · `AI#48` = [06-系列收口报告](docs/04-软件更新/待抉择池/AI友好化-全自动操作/06-系列收口报告.md) · `AI#49` = 硬约束 26）；生长格 `AI#50`/`AI#51` 结清、`AI#57`/`AI#58`/`AI#59` 已修出厂、**`AI#52` ✅（`26d127d9f` 壳侧宽进——命令桥按 `params` 声明展开单个具名对象）· `AI#54` ✅（`3b36e2c84` 壳侧兜底——`describe.commandsPending` 声明面 ＋ `open-tab` 等命令面落定并回 `added`；会话 18 补真机读数：②「挂载后不留空窗」成立 · ①「未挂载即可发现」在真机不成立（该插件命令早已全在声明面 ⇒ `commandsPending` 恒空，判据前半另由既有两半架构满足），见该格）· `AI#61` ✅（`8f66b4721` 入口面四处对账 ＋ `c53cab158` 尺子第二条规则）· `AI#63` ✅（`8f66b4721` 读者面去工单编号）**、**`AI#60` ✅（`64d13859e` 2026-09-29 会话 17——超时三码：`EPENDING` 还在跑 ／ `EASKPENDING` 正等人点头 ／ `TIMEOUT` 真没应答 ＋ 客户端 2 秒探活；真机五腿）· `AI#55` ✅（`69a5527fc` 同会话——分屏回执**三态** `{ok:true}` ／ `{ok:true,noop:true,reason}` ／ `{ok:false,noop:true,reason}`，判定单点 = `attemptSplitTab`；真机四读数；⚠️ 与设计块 ⑧ 有一处偏差 = 保留拒绝而非「原地建 branch」——原地建会留空面板 = 视觉新面 ⇒ **2026-09-29 会话 21 用户拍板：维持拒绝、⛔ 不建空面板**，判据收敛为「响亮化」＝已满足，偏差销账）**、**`AI#53` ✅（`1ffe85aaf` 2026-09-29 会话 18——分屏比例精确设 `workbench.action.setSplitSizes`；真机两形 ＋ 六种回执）· `AI#56` ✅（插件 `74cb49d` ＋ 种子 `a2b645015` ＋ 销账 `be88ef229`——marketplace 1.1.1「添加市场源」命令化）· `AI#62` ✅（`350b9d61f` 同会话——四条读数命令：配置读／布局读／容器与视图读；真机三问）· `AI#64` ✅（插件 `0ac087e` 1.0.26 同会话——串口接收面 `readSince`/`receiveStatus` 拉取式；真机九读数，物理回声腿本机无 COM 口记 ○）· `AI#65` ✅（同会话——CLI/MCP 运行期提示 ＋ 作者面文档去仓内编号：运行期 3 处 · 两树 10 处 · 尺子并入 `AI#NN` 族）· `AI#66` ✅（`238a8b53a` 2026-09-29 会话 19——门外**配置写** `workbench.action.setConfiguration`：四道拒写门有序（未声明／`ai.*` 禁写／显示槽／值形状）＋ **写后复读** ＋ 回执带 `previousUserValue`/`userValue`/`effectiveValue`；真机七读）· `AI#67` ✅（插件 `serial-monitor` `0e5f902` / 1.0.27 同会话——**会话寻址**：`listSessions` ＋ 六条开关收 `sessionId`（点名找不到如实拒并列出可用的）＋ `listPorts`，声明面 19 → 24，真机四读；壳侧零代码）· `AI#68` ✅（`a0378977c` 2026-09-29 会话 20——门外**删配置覆盖** `workbench.action.clearConfiguration`（三道门与写命令一字不差 · `userValue` 回 `null` ＝ **无覆盖** vs 本就没覆盖 ⇒ `no-override`）＋ **两道写命令都带 `alsoChanged`**（级联副作用如实报）；真机清覆盖往返 ＋ 级联报出；⚠️ 段尾留案一条：合法却有副作用的写「要不要拦/先确认」＝用户拍板级 ⇒ **2026-09-29 会话 21 用户拍板：维持「如实报、不拦、不先确认」**（`alsoChanged` 带的是上一个值 ⇒ 可复原；副作用是运行期属性 ⇒ 静态名单必腐烂；拦与「全自动」总目标相悖））· `AI#69` ✅（插件 `serial-monitor` `efa518e` / 1.0.28 同会话——端口面**两个谎**：`openPort` 多会话只说口名**直接拒**（不猜靶子）／ `closePort` 回执改报**口的属主**（另带 `requestedSessionId`）／ 七条标题固定成与状态无关的动作名；真机三读全落）**（`AI#65` 的面是会话 16 做 `AI#63` 时发现的；`AI#64` = 串口接收面，**用户已拍板走「插件侧拉取式命令」**）：`AI#61` 手册**入口面陈旧**（✅ 已收口）——`01` 章门表曾写「M4 未发货」＋ `00-README` 两处；`AI#62` 命令面**缺读数命令**——报告头号建议「`exec` 丢返回值」经只读实测**推翻**；**`AI#63`** 手册与**已发布契约**里满是**仓内工作序号**（`AI#NN`/`E5.7#63`/`M4`）——仓外人读不懂；同批 `AI#54`/`AI#55` **量级上调**；**串口「接收面」已拍板（2026-09-29 用户）＝ 插件侧拉取式命令 ⇒ 立项 `AI#64`**；同批另三件拍板 = `AI#52` 壳侧宽进 · `AI#54` 壳侧兜底 · `AI#63` 删内部编号留版本/日期））**。**发版批已收口**（2026-09-29 会话 14：软件 `0.2.22` **已发**（Release 已公开）＋ 补丁 `v0.2.23`（垫片 `AI#57` 的修）同日发出并真机复核（安装根垫片与仓内逐字节相同 · 冷启动 `linkdeskctl status` 读到在跑实例）＋ 补丁 `v0.2.24`（`AI#58`：POSIX 壳垫片，两种终端同一个名字；同版并入 `AI#59`：`status` 分诊不再吞真实错误/不再跳过认人）同日发出＋ 作者轴三包上架 ＋ **真机三件全 ✅**（含 **首次真整跳** `0.2.23 → 0.2.24`——**由含修版本执行的那一跳**：调试口由装前记录携带（`:9559` 应答而命令行无开关）· 设置键那条路（9333）已排除 · 再正常重启**负控不粘**；出货件两份垫片逐字节相同 · `AI#59` 三症状在出货 CLI 上活的），读数 = [AI-执行清单](docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md) 文末「发版批待验清单」的逐件结论；同批真机逼出 **生长格 `AI#57`**（垫片 `linkdeskctl.cmd` 中文注释撞 cmd 的 OEM 码页 ⇒ 启动的是整个 App 而非 CLI，**修已入库、已随补丁版 `v0.2.23` 出厂**）与 **`AI#60`**（真整跳逼出：`exec` 的壳侧答复预算 **8 秒** ⇒ `update.openUpdateFlow` 这类**合法长命令**必回 `[ESHELLTIMEOUT] 壳无应答`、与「没执行」不可分辨——**✅ 2026-09-29 会话 17 收口 `64d13859e`**：相位登记表 ＋ 客户端 2 秒探活分三码 `EPENDING`/`EASKPENDING`/`TIMEOUT`，真机五腿））。🔁 **2026-09-29 会话 18：软件 `v0.2.25` 已发**（发版 commit `014f22fec`——四条读数命令（`workbench.action.getConfiguration`/`listConfigurations`/`getLayout`/`listViews`；⚠️ 该节文字曾把前缀写成 `app.*`，软件本体从发布起就是对的、CHANGELOG 该节已就地订正）＋ 分屏比例精确设 `workbench.action.setSplitSizes` ＋ CLI/MCP 运行期提示去仓内编号；同批作者轴三包 `contracts` 0.1.25 ／ `plugin-sdk` 0.1.54 ／ `plugin-docs` 0.1.40 上架 · 插件 `serial-monitor` 1.0.26 已上架并收录官方目录；⚠️ **本机安装版真机 nsis 复验留下一棒**——装新版会关掉在跑实例）。🔁 **2026-09-29 会话 19：软件 `v0.2.26` 已发**（发版 commit `15f23dff0`——门外**配置写** `workbench.action.setConfiguration`（四道门 ＋ 写后复读）＋ 串口**会话寻址**（插件 `serial-monitor` 1.0.27：`listSessions`／六条开关收 `sessionId`／`listPorts`，壳侧零代码）；作者轴 `lang-defaults` 1.0.33 ／ `plugin-docs` 0.1.41 ／ `@linkdesk/ui` 0.2.26）。🔁 **2026-09-29 会话 20：软件 `v0.2.27` 已发**（发版 commit `524d7114b` · 代码笔 `a0378977c`——门外**删配置覆盖** `workbench.action.clearConfiguration` ＋ 两道写命令的 `alsoChanged`（级联副作用如实报）＋ 串口**端口面两处订正**（插件 `serial-monitor` 1.0.28：不猜靶子／回执认属主／标题不再兼职读数）；`@linkdesk/ui` **0.2.27 同号锁步**（⚠️ 货架上 `0.3.x` 旧线在新线之上 ⇒ **当时必须显式 `--tag latest`**；该旧线**已弃用**（`npm deprecate`，仅告示、可撤）⇒ 据 npm 源码 `publish.js#registryVersions()` 跳过 deprecated，隐式 latest 拒**不再出现**，`--tag latest` 已降为**可选**）· `lang-defaults` 1.0.34；⚠️ **真机 nsis 复验**：`v0.2.27` **装机读数已到手**（会话 20 续：手册**内容** ✅ ／ 门③ **能力面** ✅ 157 条命令 ／ 装→更新整跳 **○ 本版无读数**），只剩**手册 GUI 入口一次人工点击**；`v0.2.25`/`v0.2.26` 两版**未装机**（可跳过）。AI 接力 = 一个会话只做一个轮次。🔁 **2026-09-29 会话 21：四条拍板一次性落定（零代码改动）**——① `AI#55` 维持拒绝、⛔ 不建空面板（判据收敛为「响亮化」＝已满足，设计块 ⑧ 偏差**销账＝不采**）· ② `AI#68` 段尾留案 = 维持「如实报、不拦、不先确认」· ③ `AI#70` **修法已定 = 两者都做**（`listConfigurations` 每条加 `userValue`/`overridden` ＝ fail-safe ＋ 新命令 `workbench.action.listOverrides`；**格仍为「未做」**，动手前走 `design-flow` 八维）· ④ **归档 = 先清残余、清完再归档**——本系列自定归档判据（「五模块全部验收通过后整夹 `git mv` 进 `已落地/`」）**已满足**（62 / 62 ＋ 生长格 `AI#50`–`AI#69` 全销 ＋ 已发版 `v0.2.27`），⚠️ 归档那一笔须**同笔**改 [docs/04-软件更新/00-README.md](docs/04-软件更新/00-README.md) §二/§五 ⇒ **动手前须先取用户一句放行**（该文件在用户手上）；逐格裁决行 = 台账 `#### AI#55`／`#### AI#68`／`#### AI#70` ＋ [交接.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/交接.md) 顶部「会话 21」条。
> **仓库结构**：git / npm / VS Code 根合一于 `E:/linkdesk`（2026-09-04 filter-repo 重整，3119 commits，hash 全变内容全保）。出厂插件源码在仓外、随包构建期拉取；E6 完成即出厂 → 持续迭代走 `docs/04-软件更新/`（软件本体）＋ `docs/05-插件更新/`（插件档案，独立版本）。

## 架构——圆形大厅模型

> 🔥 **2026-07-25 Encaron 发现。** LinkDesk = Link（连接）+ Desk（桌子）。

```
   ┌─────────┐   ┌───────────────────────────────┐   ┌─────────┐
   │ 文件树   │   │      圆 形 大 厅 (src/core/)   │   │ Git     │
   │ 编辑器   │──▶│  核心 = 桌子集合                │◀──│ 终端    │
   │ 房间们   │   │  命令本/装饰本/配置本/快捷键/    │   │ 房间们   │
   └─────────┘   │  文件读写/文件关联 …（桌子）     │   └─────────┘
                 │  核心不知道名片上写了什么        │
                 └───────────────────────────────┘
插件 = 周边小房间（同一 Pool 渲染进程内，preload 沙箱隔离）
```

**大厅通信（Registry/Command）**：松耦合——发布/订阅、发现服务、跨插件命令，互不知道对方。**后门直连（IPC 数据管道）**：紧耦合——串口数据等高频推流，知道对方是谁。

**核心准入标准（三条同时满足才放 `src/core/`）**：① 多提供方 ② 多消费方 ③ 桌子不知道内容。有一条不满足 → 放插件里。详见 memory `core-admission-criteria`。**核心无知原则**（硬约束 9）：核心不知道软件是干什么的。标签页系统永不持有卡片注册表——卡片工作台是插件，不是架构第二层。

## 历史脉络

> Tauri 时代存档 `docs/01-Tauri_P1至P5.5/` · Electron 各期存档 `docs/02-Electron架构/` · 完整脉络 memory `evolution-chronicle`。**E5–E5.6 弯路只记结论**：多 WebView / Per-Tab / 双 Pool 全废弃。**旧账已清别再当待办**：卸载相关六项结构性改进 2026-07-24 起陆续做完（memory `bug-atlas` §A1 §A3）。**活到今天的成果**：`linkdesk.*` 命名空间 API（`electron/preload-pool/namespaces-*.ts`）、ESLint 自定义防线（硬约束 13/14 的机械兜底）。

## Phase 路线

> **Phase 5 = 最后一个改框架的 Phase。** 此后所有新功能全写在 `plugins/` 里，`App.tsx` 和 `core/` 不再膨胀。

| Phase | 内容 | 状态 |
|:--:|------|:--:|
| P1-P6 / E1-E4 | Tauri 全部基础设施 → Electron 迁移 → 多 WebView → 文件树+Monaco | ✅ |
| E5–E5.8 | 核心归一化与壳重构 → 极简 Pool → 归一化基建 | ✅ 封站 |
| **E6** | 插件生态与发布（L4/L5/L7 ✅ 封站 2026-09-14；剩 L6 安全加固与出厂判定，去向用户拍板） | 🚀 收官中 |
| 之后 | E6 完成即出厂 → 04-软件更新 + 05-插件更新持续迭代 | 📋 |

## 提交前自检

**🔥 机械操作，不是建议。** 每步必须执行，少一步不提交。

1. `npm run check` 全绿——双工程 tsc 零错误 + ESLint `--max-warnings 0` + vitest 全绿 + 各专项门禁。**无「基线接受」——红灯必须修到绿灯才提交。**
2. `git diff --stat` 确认无调试日志残留（`console.log` / `debugger` / 临时注释）
3. `git diff --staged | grep -E 'pluginId === "[a-z]|case "[a-z].*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` 返回空（无新增插件 ID 硬编码）
4. 🔥 Vite deps 缓存自动清——`postinstall` 每次 `npm install` 后自动删 `node_modules/.vite`；异常时手动删再重启（memory `toolbox-sop` §6.2）

详见 memory `ai-pre-commit-checklist.md`——完整性 / 归一化 / 边界 / 注册注销 / 机械操作五组。

## 硬约束（绝对不能违反）

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）——⚠️ **一处声明数据例外（设计裁决 2026-09-28，M1 `AI#8` 同笔）**：命令/参数元数据的 `description` 是**声明数据、不是 UI 文字**（消费方 = 契约 → AI，今天零渲染消费方；壳侧译名住在已外移的 lang-defaults 插件仓，仓内没有可加译名的落点）⇒ `scripts/audit-i18n.mjs` **按属性名排除** `description:` 的值（面板八条命令的查找表按行排除）。🔴 **撤销条件：命令说明一旦进 UI，两条排除同笔撤销并补译**
3. **标签页系统不持有卡片注册表**——卡片状态归插件自持（原 CardRegistry 骨架已随 E5.7#45.7 整删，未来重建亦不得进标签页系统）
4. **workspace.json 禁止嵌套**，必须一层平铺数组
5. **IPC 事件订阅必须用 generation counter 模式**（B11 教训，`useIpcEvent` 已内置）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 独立可替换，RingBuffer 接口 `{ cardId, value }` 是硬边界**——任何代码不得写死「只有这一种协议」
9. **核心无知原则**：往核心加东西前先问——加了之后核心更「知道自己是干什么的」了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 写死插件 ID**（`if (pluginId === "terminal")` / `PLUGIN_ICON_PATH` / `BOTTOM_ICONS` 等一切形式）。所有差异性行为走 plugin.json 声明 → Registry 消费。Phase 5g 把 `TabType` 改成 `string` 就是为消灭此模式——不要写回来。🔴 **同一条道理管到全仓**（2026-09-29 用户拍板）：**第三方插件的 id 不许出现在壳内任何文件**——代码、脚本、门禁/跳过名单、注释、文档、技能、清单全算；工具要跳过第三方仓一律**按现场目录/数据认**（⛔ 不写名单），叙述外部作者的实测来历一律写成「**2026-09 首次由外部独立 AI 作者用 npm 包（脚手架 ＋ SDK ＋ UI 包）制作插件时…**」——⛔ 不点名某只插件、不写「壳外作者做了某插件遇到某麻烦」
11. **插件身份唯一来源是 plugin.json 声明字段**。🔴 「插件身份 id」= 顶层 `pluginId`（发布后永不可变；`derivePluginId` 目录名兜底只为兼容存量）。`core: true` 仅 = 卸载按钮隐藏（纯 UI 防误删旗标）。代码注释禁止发明 schema 里没有的分类名词（「工厂插件」「内置插件」）——用字段名
12. **🔥 禁止硬编码路径——资产路径一律 `getAssetPath()`**（`src/core/utils/assetPath.ts`）。dev 下 `http://localhost:1420` 能工作只是巧合，打包后 `file://` 全炸。插件作者自定义图标同走 `resolvePluginIcon`
13. **🔥 async 初始化必须防 StrictMode 双重 effect 竞态**——第二次调必须返回第一次的进行中 Promise（`_loadingPromise`），不能 return undefined（memory `invisible-bugs-lesson-59c` Bug 1）
14. **🔥 useEffect 有回调 prop 做非 DOM 副作用时必须加活跃守卫**（`if (!open) return;` 且纳入依赖数组）；写完 grep 同组件其他 effect——漏守卫的就是 bug（同上 Bug 2）
15. **🔥🔥🔥 出了隐形 bug 不要猜——`git checkout` 逐 commit 二分定位**。找到最后正常与首个异常之间的 diff，bug 就在那个 commit 里
16. **🔥🔥🔥🔥 任何 CSS/样式/配色/字体/间距/布局改动前，必须先经 `Skill` 调设计 skill 拿设计系统**（默认 `ui-ux-pro-max`；可竞标 taste 系/impeccable，见 memory `design-skills-inventory`）。不调 skill = 违反硬约束；落地走 CSS 变量，禁硬编码 hex/px
17. **🔥 `useRef` 不得用于影响渲染输出的状态**——渲染决策走 `useState`；ref 仅用于 DOM 引用、前值对比、generation counter（#58e 教训：全插件标签页空白）
18. **🔥 Electron 窗口顶部 30px 是 `-webkit-app-region: drag` 拖拽区**——所有 fixed 叠加层必须 `top: 30px` 起步（OS 级截事件，`z-index` 无效）
19. **🔥 禁止模块级 `_initialized` guard + IPC 监听器注册**——导入即执行 = 永不清理 = 僵尸回调。IPC 监听走 `useEffect` + 引用计数；ESLint `linkdesk/no-module-level-ipc-listener` 机械拦截
20. **🔥 preload 的 IPC 监听器必须在模块顶层注册**（`contextBridge.exposeInMainWorld` 之前），用缓冲+回放模式——mount 前到达的事件不能丢（E5#11l Bug 4）
21. **🔥 测试 fixture 禁真实插件名 + 真实 UI 文案**——一律虚构值（`demo-plugin`/`Demo View`）。边界：断言被测代码产出的真实文案不算违规；loader 等验证真实接线必须用真 id 的除外
22. **🔥 软件侧用户可见变更提交前必须调 version-bump skill 判类别并报告版本判定**；改 `src/`/`electron/` 的 commit message 必须带 `feat:`/`fix:`/`breaking:` 前缀。三层机械兜底：`check-version-bump` 挂 lefthook `commit-msg`（不带前缀 = 提交被拒）＋ `check-changelog-section` 挂 check（bump 必同笔写 CHANGELOG 段）＋ 发版门禁再拦一次。逃生口 `--no-verify`（git 机制，如实记着）
23. **🔥 CSS 类名是全局的——共享组件一律 `ldk-` 前缀，插件不得借宿主保留名**（一张样式表装着宿主+共享+所有插件 CSS，裸类名 = 全局标识符，`.badge` 案即此）。四条纪律：① 插件自有类名与 `@keyframes` 名一律 `<pluginId>-` 开头（缩写废弃）；② `ldk-` 整个命名空间属宿主侧，不许借——🔴 `pluginId` 自身不得以 `ldk-` 开头（schema `pattern` 已收窄）；③ 状态类一律复合（`.你的类.active`）；④ 🔴 token 定义作用域受结构约束——文档级只有宿主契约块能写，其余挂自有命名空间类之下，任何方禁定义 `ldk-*` 自定义属性；⑤ 🔴 选择器形态轴：类名/id 是「名字锚」，无锚选择器宿主只许在基线文件（`scripts/css-selector-baseline.json`，今天 = `src/index.css` 17 处）、插件禁无锚、跨方命中必须自带自有锚。机械兜底 = 宿主 `scripts/check-css-namespace.mjs`（判据①③④⑤⑥⑦⑧⑨⑩⑪）＋ SDK `check-css-namespace` 腿（0.1.25 起随包，插件仓 CI 判红；**新判据先发 SDK 再铺插件仓**）——SDK 腿今天内部**七条判据**（前缀/类名/关键帧名 · token 作用域 · 选择器形态 S2S3 · **关键帧引用悬空**（`E6#112` · 2026-09-18 · SDK **0.1.37 起**（本格发到 **0.1.38**）：`animation` 引用的名字必须在本仓 `@keyframes` 或宿主保留账里；抽取口径与壳侧 `animationRefs()` 由门禁 `锚⑨` 钉住）· **悬空名**（`E6#119` · 2026-09-19 · SDK **0.1.40 起**：源码喊的 `ldk-*` 名与关键帧在「自身 ∪ 随包下发的宿主定义集 `schemas/host-css-names.json`」里都没有 ⇒ 红——格 1 尺子的作者侧移植，口径由 `锚⑩` 钉住、宿主定义集与壳运行时清单同一生成器；**退役名提示**同笔落地——`retired[]` 只提示、⛔ 永不拒绝）· **自有类名引用悬空**（`E6#136` · 2026-09-20 · SDK **0.1.46 起**：TSX `className` 字面量引用的本插件前缀类名必须在自有 CSS 提及集里——孤儿闭合符段剔除抓「CSS 注释被提前闭合吞规则」根因案，动态拼接一律跳过并计数）。规则正文见 [11-样式命名空间审计.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md)、[31 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)、[32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)、作者面 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)。**🔴 机制层不隔离**（`@layer`/Shadow DOM/CSS Modules/动态注入四路皆不采用，决策见 [docs/decisions/rejected/plugin-view-style-isolation.md](docs/decisions/rejected/plugin-view-style-isolation.md)，含 **5 条可判定触发条件**）——收口现状 = 「事实上不会发生」，**不是**「构造上不可能发生」，由约定＋静态门禁＋运行时探针三层覆盖。**🔴 十件套终态（E6#109 系列 2026-09-16 收官）**：四条轴结构性收口（宿主 **258** ＋ 共享组件 **89** 个独立定义**全部 `ldk-`**；插件侧 **18/18 仓零不合规**）· 静态门禁 **`35 道 —— 有自测＋已接线 34 ／ 豁免 1`** · 运行时探针**真跑零 red 跨方碰撞**（轴 ④ **静态 17 ＝ 运行时 17**、域边界不一致 **0**）；逐件读数 ＋ 四轴「改前 → 改后」对账 ＋ **残余边界六条**见 [35-系列收口报告](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/35-系列收口报告.md)。⚠️ **本条只管样式侧**——非样式面的同形问题（命令 id／设置键／外观族 id／上下文键／i18n 等）另立 **E6#111「非样式命名空间归一化」**专项（[00-整理档案](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/00-整理档案.md)）

24. **🔥 「发版」= 用户能在软件里点更新，不是「GitHub 上有个 Release」**——发完必须能回答一句：**用户现在打开软件，点得到这个更新吗？**（用户 2026-09-27 原话：「让你发版的意思就是让我直接能在软件里点更新，以后记住」）。**壳轴** = bump ＋ CHANGELOG 段 ＋ tag → CI 出安装包 → Release 资产齐 → 旧版实机「检查更新」真装上；**插件轴还多一步、且是决定性的那一步：官方目录收录**（`Encaron/linkdesk-marketplace`）——插件仓根那份 `marketplace.json` 只是**它自己的**市场源，**不收录，用户在软件里永远点不到**；顺序 `build`（⚠️ `publish` **不重建**，只上传仓内现成产物）→ `publish` → **收录** → `sync:bundled --latest`。⚠️ 两轴都有一段**不可见窗口**（插件侧 = 官方源走 raw CDN `max-age=300` ＋ 客户端 5 分钟目录 TTL）。🟢 **用户已两次预授权发版**：**2026-09-28** —— 插件与 npm 包（作者轴四包）随时可发、不必逐次问用户；**2026-09-29** —— 「我同意你对任何的发版：软件的发版，插件的发版，npm 包的发版，我全部授权你了」⇒ **软件本体（壳 / 安装版）同授权**。🔴 两边同一条硬要求：**发就走到端**（壳轴 = bump ＋ CHANGELOG 段 ＋ tag → CI 出安装包 → Release 资产齐 → 老版实机「检查更新」真装上；插件轴 = build → publish → 官方目录收录 → `sync:bundled`）；🟢 **`git push` 已常态化授权（2026-09-29 用户拍板，推必带代理 127.0.0.1:7890）**；⛔ 撤版与改写已发布 tag 仍归用户。细则 [docs/06-发布管理/发布清单.md](docs/06-发布管理/发布清单.md)，记忆 `release-means-in-app-updatable` ＋ `release-discipline-three-axes`
25. **🔥 面板层（Pool 渲染进程）禁用 `input.click()` 弹文件选择框——一律走主进程 `dialog` 通道**（E5.7 极简 Pool 的结构性坑：面板层没有原生窗口上下文，跨窗文件手势会失效或挂起；2026-09-26 立规矩，落点 = dialog 通道注释 ＋ 命名空间矩阵）
26. **🔥 AI 可操作面是常驻纪律**（AI 友好化系列 `AI#49` 立，2026-09-29——**不是一次性交付，此后每个新功能/新插件都适用**）：① **每个用户动作至少一条非鼠标路径**（命令 / API / CLI）——鼠标手势可以是给人用的手感，⛔ 不得是唯一路径；OS 层够不着的如实列册；② **业务动作注册为命令**，且注册 meta **必带 `description` ＋ `params`**（缺了 AI 读得到命令、却得猜参数——实测踩过）；③ 达标 = **结构化操作**（读结构化状态 → 调命令带参数 → 读结构化结果），⛔ 不是「截图 → 视觉理解 → 猜坐标点击」的视觉循环；④ **验收同样与物理指针无关**（命令/API/CLI 驱动；hover 面口径见 [设计 §三 验收面](docs/04-软件更新/待抉择池/AI友好化-全自动操作/01-设计.md)）。机械自查 = `npm run audit:plugin-commands`（**只报不拦**，⛔ 不进 check）＋ `npm run manual:build`（手册漂移门禁）；作者面 = [21-插件命令化规范.md](docs/03-插件制造/21-插件命令化规范.md)；系列账 = [AI-执行清单.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md) ／收口 [06-系列收口报告.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/06-系列收口报告.md)。理由：破洞会随迭代重生（**本系列缘起正是如此**——一个老功能里的隐藏门控卡住了 AI）

## 部件命名速查

固定名称，不用「三栏中间那个」。详见 `docs/总体设计/V3-部件命名规范.md`。图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）；主区顶部标签栏，最上顶栏，最下状态栏。

## 关键设计与反模式——不要改

- **keep-alive**：所有面板绝对定位平级渲染，CSS display 切换（条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）**：面板 key=groupId 永远不变（递归嵌套会 unmount 面板）；递归分屏 SplitNode 树，MAX_TREE_DEPTH=4
- **独立 RingBuffer 多消费者**（串口数据是流不是事件）；drop zone 照抄 VS Code（SPLIT_THRESHOLD=0.25，不自创算法）
- **插件 = 独立构建产物**（Vite 逐插件打包）；核心不认 pluginId，行为全走声明；欢迎页是壳兜底（`tabBehavior.isFallback`）
- **不要把壳级功能放在插件里**——自检：「卸载所有插件后还能用吗？」（B79：CommandPalette 寄生 terminal → 无终端时 Ctrl+Shift+P 无效）
- **不要说「插件做不了」——插件没有 API 白名单**；核心能用的 JS 库和 Web API 插件全能用
- **不要把终端当软件的定义**——终端是第一个视图插件，串口是第一个数据源
- 完整决策集：memory `design-decisions.md`

## 常发已知问题（改到相关处先看）

- **文件树/侧栏 sticky 不生效**：双层滚动架构与 sticky 不兼容（E4V#57 曾放弃重做，动前读 memory `evolution-chronicle`）
- **Monaco 颜色不跟/token 错乱**：① 异步竞态（`StandaloneWorkbenchThemeService` 抢跑，bug-atlas B4）② Pool 下 `window.monaco` 是共享单例，插件禁调 `defineTheme`/`setTheme`。**插件首选 CM6**

## 开发命令

```bash
npm run check   # 🔥 提交前必跑：双工程 tsc + ESLint --max-warnings 0 + vitest + 各专项门禁
#   ⚠️ check-bundled-freshness 默认联网比对官方目录，离线用 --offline；check-scaffold 需要 git 在 PATH
#   ⚠️ check-css-namespace 判据①③ 为结构性规则（自己定义的类名一律 ldk- 开头，无白名单），
#      ⑥ ldk- 跨域唯一性、⑨ token 作用域、⑦⑧⑩⑪ 选择器形态——详见 31/32 号档（见硬约束 23）
#   ⚠️ 插件侧的腿在 SDK（插件仓 CI 判红）；壳仓 check 够不着插件源码，两套互不覆盖
npm run sync:bundled        # 出厂种子保鲜（--latest 显式追新 / --offline 只校验指纹）
npm run sync:plugin-ci      # 插件仓门禁铺装（只写本地容器，不碰 git）
npm run sync:plugin-agents  # 18 只插件仓的 AGENTS.md（唯一维护入口，别手改；--check 漂移门禁）
npm run pull:plugins        # 本地容器拉最新——只拉不推；🔴 容器哪级被 git init 就红着喊
npm run docs:build          # 作者面文档包产物（docs:check 与真源逐字节比对，挂 check）
npm run manual:build        # AI 操作手册 02 章「命令与API全索引」刷新（生成区 GENERATED：命令表 + API 表）
                            #   ⛔ 别手改那一章的两段生成区；门禁 = src/core/commands/aiManualIndex.test.ts（挂 check 的 vitest 腿，
                            #   逐字节比对 + 三条负控）；本生成器**故意不接 check-gate-health**（域外：generate-*/audit-* 用 --check）
npm run backfill:catalog-identity  # 目录条目身份图回填（--check / --self-test；依赖 SDK dist）
npm run audit:plugin-prefix # 插件 CSS 前缀只读审计（改名轮映射表；依赖 SDK dist；故意不接 check 链）
npm run audit:plugin-scope  # 插件侧「非样式命名空间」清账面（改名前逐仓清单；只读、不接 check 链；
                            #   ⚠️ 读 scripts/host-reserved.json（生成式）——壳仓命令/设置面改了要 npm run audit:plugin-scope:regen）
                            #   改容器：npm run audit:plugin-scope -- <容器目录>（默认 E:/linkdesk-plugins/official）
npm run audit:plugin-dead-css # 插件 CSS 死类只读审计（E6#113 尺子：定义了、本仓源码无人用的自写前缀类；
                            #   容许动态拼接〔宁可漏报〕；只报不拦、不接 check 链、需插件容器在场）
npm run audit:plugin-tests  # 插件测试覆盖只读审计（E6#153 尺子：19 仓表＋纯逻辑单元零测名单；
                            #   命中 = 同名测试文件 ∨ 测试文件引用〔含目录桶〕；只报不拦、不接 check 链、需插件容器在场）
npm run audit:nonnaming     # 非样式命名空间普查探针（①命令 id ②设置键 ③外观族 ⑤协议 id…＋⑩b 账背对账；
                            #   2026-09-17（1.32）从 gitignore 的 scratch/ 搬进 scripts/，同笔删原件；只读、不接 check 链）
npm run audit:nonnaming:json # 上条的机读输出（--json）
npm run dev:driver          # dev 验收 driver（系列外 D0：硬 reload 前置 ＋ 构建握手 ＋ 语义助手 ＋ hover 样板／判据 3 解耦自检）
                            #   ⚠️ 需一只**隔离实例**：`electron . --remote-debugging-port=9333 --user-data-dir="$TEMP/ld-$$"`
                            #      （Windows 上只有 --user-data-dir 真隔离；APPDATA 无效）＋ `LINKDESK_CDP=http://127.0.0.1:9333`
                            #   ⚠️ 用法/判据/实测读数/入库裁决全在 scripts/dev/README.md；⛔ 故意不接 check 链（要活实例、零产品面）
                            #   ⚠️ `-- selftest` = 纯函数自测（不需实例）；`-- handshake` = 「代码生效了吗」当场可辨（⛔ 别跳过 reload）
npm run check:lockfile-sync # lockfile 同源门禁；升 packages/* 版本后必须重跑 npm install 同笔提交 lock
npm run ui:build            # 🔴 改了壳共享组件（src/components/shared/**）后**必跑**——@linkdesk/ui 的 dist 是构建产物，
                            #   而 dev 轨道解析的就是它（L9 设计原文：包 = **类型契约 + dev 解析体**）⇒ 只改源码不重建，
                            #   dev 里**看不到任何变化**（插件那侧也一样，因为插件 bundle 对 ui 是裸 import、由宿主供给）。
                            #   ⚠️ 打包轨道不用手动跑（build-pool-vendor 有「src 比 dist 新就重建」保鲜）；dev 轨道没有这层
                            #   ——已接进 `npm run dev` 与 `npm run electron:dev` 启动链（2026-09-27，踩过）。
npm run lint / dev / electron:dev / npx tsc --noEmit / npx vitest run
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | `docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`（48 旧 bug 会怎么回来）＋ `00-迁移执行守则.md` |
| 🔥🔥🔥 加文件前 | `docs/开发管理/壳目录规范.md`——放错 = 返工（E5#42→#36k 教训） |
| 🔥🔥 改壳边界 | `docs/02-Electron架构/通道范式·设备插件独立.md`（改壳=加通用通道≠加设备业务） |
| 写插件 | `docs/03-插件制造/`（中文维护者面）；**作者面主显 = `docs/03-plugin-authoring/`**（英文树，双语对齐门禁守） |
| 🔥 插件源码外移与上架（L7） | `docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/00-整理档案.md`——**已封站**（18 只插件源码各移独立仓）；种子三件套与两套门禁边界见 memory `plugin-source-external-repos`，读数 = 同夹 `08-全层验收.md` |
| 🔥 插件兼容机械化（L8） | `docs/02-Electron架构/E6_插件生态与发布/插件兼容机械化/00-整理档案.md`——`E6#114`-`#120` **已落地**（悬空名核验 / 只加不删门禁 / 退役登记 / 兼容读数 / 市场显示状态 / 判据铺开 / 通用悬停提示卡 `HintCard`）；🔴 **用户面文案只许五个词**（正常 / 兼容 / 部分不适配 / 不适配 / —，词表与禁词见总纲 §〇d）；生命周期三段与四件机械件现状见 memory `plugin-lifecycle-three-tier`；队列真相源 = 同夹 `交接.md` |
| 🔥 UI 集中供给（L9） | `docs/02-Electron架构/E6_插件生态与发布/UI集中供给/00-整理档案.md`——`E6#121`-`#130`（含 `#127a`）**已全层收官 2026-09-19**：`@linkdesk/ui` 从「编译进插件 bundle」翻转为「池 vendor 单实例供给」（react external 机制推广；插件代码 / 契约零改动）；🔴 **契约纪律 = 导出面只加不删＋ 同版本内行为不变**；**版本重锚 = ui 与壳同号锁步**（`E6#124` 定案，ui 0.3.x 线弃用；发布门禁判据⑤ `judgeUiVersionLockstep`）；**皮骨拍板：皮全开放（token 主题域）、骨不开放（壳 chrome 结构永不作为插件能力）**；队列真相源 = 同夹 `交接.md` |
| 🔥 第三方作者实测反馈落地（L10） | `docs/02-Electron架构/E6_插件生态与发布/第三方作者实测反馈落地/00-整理档案.md`——`E6#132`-`#143` 十二格（16 条核对总表：真缺口 8 / 已有 5 / 误判 1 / 设计如此 2）；**`#132`-`#140` 已收官**（**壳不动**，发版全落作者轴四包），**`#141`-`#143` 待拍板** （[04-待拍板方向题.md](docs/02-Electron架构/E6_插件生态与发布/第三方作者实测反馈落地/04-待拍板方向题.md)）；🟢 2026-09-28 用户预授权：作者轴四包任务执行阶段随时可发、不必逐次问；队列真相源 = 同夹 `交接.md` |
| 🔥 插件测试覆盖层（L11） | `docs/02-Electron架构/E6_插件生态与发布/插件测试覆盖层/00-整理档案.md`——`E6#144`-`#157` **已全层收官 2026-09-26**：8 份同体 `vitest.setup.ts` 收进 SDK 一个 subpath 真源 ＋ 脚手架与 18 仓铺开 ＋ 五仓补纯逻辑与替身层测试 ＋ 覆盖尺 `npm run audit:plugin-tests`（**已升「拦」**：模板 `ci-verify.mjs` 第六段判红）；🔴 **官方 5 仓默认不 bump**（例外 = 补测碰出真 bug ⇒ `fix:` ＋ 目录收录，**已三次兑现**：serial-monitor 1.0.23 / file-tree 1.0.16 / marketplace 1.0.44）；⚠️「壳不动」被会话四真 bug 推翻 ⇒ 实发 **0.2.16**；⛔ **第三方作者仓不代改**（现存第 6 份副本转达作者；⛔ 壳内不写它的 id——硬约束 10 同一条道理）；13 只声明式仓有据豁免；队列真相源 = 同夹 `交接.md`；⚠️ 一个会话只做一个轮次 |
| ✅ **AI 友好化-全自动操作（2026-09-28 立项 → 2026-09-29 系列收口；M1 9/9 ✅ · M3 整轮 7/7 ✅ · M5 3/3 ✅ · M4 整轮 27/27 ✅ · **M2 11/11 ✅（2026-09-29 会话 12 总验收 `AI#30`：机械尺实跑＋语义逐条对账清零表＋三条挂账裁决＋手册生成链绿；生长格 `AI#50` 登记未做——会话 10 壳侧 6 格／会话 11 插件侧 4 格细节见台账与交接）** 累计 **62 / 62** 格）** | [docs/04-软件更新/待抉择池/AI友好化-全自动操作/00-README.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/00-README.md)——把「一个能够完全自动化的软件」落成工程件（判据 = **可读 · 可操作 · 可查**）；**5 模块 ＋ 收口 / 62 格**（`AI#1`–`AI#49`；`AI#38` = 14 子格）；✅ **前置门已过**（2026-09-28 用户逐条拍板 A 组 8 条 ＋ P 组 5 条，含 **A-1 改序 = M4 桥先于 M2**）；**配套四件** = 台账 [AI-执行清单.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md)（**进度唯一真相源**）· [04-AI分工与接力方案.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/04-AI分工与接力方案.md) · [03-任务档案/](docs/04-软件更新/待抉择池/AI友好化-全自动操作/03-任务档案/) · [05-启动词.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/05-启动词.md)（**可整段复制的开场词**，换棒只改会话号/格号/详案）；✅ **系列外 `D0`（dev 验收前置 `D0#1`–`D0#3`）2026-09-28 已收口**（落点 = [scripts/dev/](scripts/dev/README.md)）；✅ **第 1 轮 M1（`AI#1`–`AI#9`）2026-09-28 整轮收口 9/9**——四个读取面进契约（真机 15/15 · 零新 IPC 通道）＋ 命令元数据 `description`/`params`（63 条零遗漏）；✅ **第 2 轮 M3 2026-09-28 整轮收口 7/7**——手册落新顶层 `docs/07-AI操作手册/`（见下行）＋ **第二交付（`AI#15` 接入章「形态先写」· `AI#16` 手册随包 ＋ 软件内入口）**：check 全绿 213/2854 · `--dir` 验 `resources/ai-manual/` 8 章落位（⚠️ 真机 nsis 验收归发版批）；✅ **第 3 轮 M5 3/3（会话 4 ＋ 会话 9 补 `AI#19` ①）**——`AI#17` 更新那一跳端口不丢（记录携带＋ready 前复位＋推回 argv）· `AI#18` 二次带参启动并集裁决（🔴 **重启前等请求端口释放**——修掉打包态 5/5 复现竞态）；check 全绿 214/2887 · ⏳ `AI#19` ② 打包态验毕／① **会话 9 复验销账**／真机 nsis 挂发版批；✅ **M4 spike `AI#31`（会话 5）裁决「通」**（读数 = [scripts/dev/m4-spike/README.md](scripts/dev/m4-spike/README.md)）；✅ **M4 整轮 27/27（会话 5–9）**＝ 内核＋CLI＋MCP ＋ 设置页「AI 接入」18 键（`@linkdesk/ui` 两新原语·目标窗＝聚焦壳窗·安全评估/账本在案）＋ **`AI#44` 全链路两腿 CLI 39/39 · MCP 41/41 ＋ 真 MCP 客户端**；✅ **第 5 轮 M2 插件侧 4 格（会话 11 · `AI#23`–`AI#25` 跨仓插件命令化 ＋ `AI#27` 脚手架默认带命令 npm 0.1.16）——真机 CLI 39/39 · MCP 41/41，四仓 publish→官方目录收录→`sync:bundled` 一次走到端**；✅ **总验收 `AI#30`（会话 12）⇒ M2 11/11** ＋ **验收与收口五格 `AI#45`–`AI#49`（会话 13）＝ 六轮 62 / 62 全收口 · 生长格 `AI#50`/`AI#51` 结清、`AI#52`/`AI#54`/`AI#61`/`AI#63` 已收口、**`AI#60`/`AI#55` 已收口（2026-09-29 会话 17：超时三码 ＋ 分屏回执三态）**、`AI#53`/`AI#56`/`AI#62`/`AI#64`/`AI#65` 已收口（会话 18）· **`AI#66`/`AI#67` 已收口（2026-09-29 会话 19：门外**配置写** `workbench.action.setConfiguration`——四道门＋写后复读；串口**会话寻址** serial-monitor 1.0.27——`listSessions`／六条开关收 `sessionId`／`listPorts`，壳侧零代码）· **`AI#68`/`AI#69` 已收口（2026-09-29 会话 20：门外**删配置覆盖** `workbench.action.clearConfiguration` ＋ 两道写命令的 `alsoChanged`（级联副作用如实报；⚠️「合法却有副作用要不要拦」＝**2026-09-29 会话 21 用户拍板：维持「如实报、不拦、不先确认」**）；串口**端口面两处订正** serial-monitor 1.0.28——不猜靶子／回执认属主／标题不再兼职读数）· **`AI#70` 已登记（2026-09-29 会话 20 续 · 装机真机取数时自己踩出：`listConfigurations` 每条**不带 `userValue`／`overridden`** ⇒「**哪些键被改过**」答不出（102 键 ⇒ 102 次 `getConfiguration`）；**后果不是洁癖**——本棒据此把**真有覆盖**的 `app.language`（`zh`）当「没覆盖」删了，已当场写回）**（收口报告 = [06-系列收口报告.md](docs/04-软件更新/待抉择池/AI友好化-全自动操作/06-系列收口报告.md)）；✅ **已在库版本：软件 `0.2.27`（标签 `v0.2.27` · 发版 commit `524d7114b`）· `@linkdesk/ui` `0.2.27`（同号锁步）· `@linkdesk/plugin-docs` `0.1.41` · 官方目录 `serial-monitor` 1.0.28 · 出厂 `lang-defaults` 1.0.34**；**下一棒 = 残余清账 ＋ 归档收尾**（⚠️ 四条拍板已于 2026-09-29 会话 21 落定 ⇒ **`AI#55` 拍板已销**；余下 = 英文树 pool 行漏译 ④ · 真机 nsis 复验随 `v0.2.27` 滚动——⚠️ **`v0.2.27` 装机读数已到手（会话 20 续：手册**内容** ✅ ／ 门③ **能力面** ✅ 157 条命令 ／ 装→更新整跳 **○ 本版无读数**），只剩**手册 GUI 入口一次人工点击**；`v0.2.25`/`v0.2.26` 两版**未装机**（可跳过：`v0.2.27` 已含其全部能力面）** ＋ **清完做「归档」**（判据已满足；⚠️ 归档须同笔改 [docs/04-软件更新/00-README.md](docs/04-软件更新/00-README.md) §二/§五 ⇒ **先取用户一句放行**），见 [台账](docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md) 文末清单）；⚠️ 一棒一会话 2–6 格 |
| 🟡 **AI 操作手册（M3 落点，2026-09-28）** | [docs/07-AI操作手册/](docs/07-AI操作手册/00-README.md)——给**不读源码的 AI**（用户机器零源码）的操作面，判据 = **可读 · 可操作 · 可查**：`00-README`（导航＋三条判据＋12 例任务）· `01-路径总览`（三层门＝命令面／契约 API／CLI+MCP(M4) ＋ 🔴 token 占位铁律 ＋ 读→调→读）· `02-命令与API索引`（**生成式**：宿主命令 76 条／46 命名空间 249 方法；`npm run manual:build` 刷新、门禁逐字节盯漂）· `03-按任务操作` · `04-手势隐藏规则` · `05-够不着清单与安装版路径` · `06-CDP坑表` · `07-如何接入`（**已发货（2026-09-28）**：门锁/钥匙＋三路手把手＋软件自述三件＋设置页真实分节名；§七回填清单四处全销）；🔴 **随安装包发货 ＋ 软件内可打开**（用户点名硬要求）= `AI#16` **已接线（2026-09-28）**：安装版落 `resources/ai-manual/`（`electron-builder.yml` extraResources）＋ 池侧壳视图 `ai-manual` ＋ 命令 `app.openAiManual` ＋ 菜单 帮助 → AI 操作手册（写入面 = 主进程直答 IPC `app:getAiManual`，壳内私有第三例、**不进 `PROXY_CHANNELS`**；池载荷走 `PoolTab.aiManual` ⇒ 生成契约同步重生成，命名空间矩阵 **app 组 4→5 / 通道 171→172**） |
| 🗂 **E6 剩余任务与派单序** | [E6-剩余任务分档-派单序.md](docs/02-Electron架构/E6_插件生态与发布/E6-剩余任务分档-派单序.md)（**2026-09-19 L9 收官后重分档**）——**一档零等待** `#110`/`#113` · **二档等你一句话** `#37f`（放行即结）/`#15o`（做不做）/`#64e`＋`#73o`＋`#129`（一次拍板）· **三档** `#130` · **四档** L6 七格 `#48a`-`#52b`（`#30.8e` 随 `#49`）· **五档** `#53a-b`/`#56a-b`；⚠️ **任务正文与状态一律以 `E6-执行清单.md` 为准**（本档只写顺序与派单门槛，不复制正文） |
| 🔴 作者轴五个 npm 包发版 | `docs/06-发布管理/作者轴npm发版.md`（发版五步＋实测坑）；软件发版另见 `docs/06-发布管理/发布清单.md` |
| 🔥 CSS 命名空间 | `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md` ＋ 同目录 [样式命名空间归一化/](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/)（**轮次进度唯一真相源 = 交接.md 顶部剩余任务队列**） |
| 已确认决策 / 已知坑 / 主题系统 | memory `design-decisions.md` / `bug-atlas` / `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件；**记忆库重组时同笔更新它** |
