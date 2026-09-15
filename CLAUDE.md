# LinkDesk

> **Tauri v2 + React 18 + TypeScript → 🔥 迁移到 Electron。通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
>
> **Tauri 时代 P1-P6 🎉。E3 🎉。E4 🎉（2026-08-03）。E5 🎉（2026-08-04）。** 壳通信骨架 + 三通信机制 + linkdesk.* 20 命名空间 API + ESLint 防线。Per-Tab WebView 已废弃（E5.5#9，O(N) 进程→E5.7 极简Pool O(1) 取代）。
> **当前进度：** 🚀 E6 插件生态与发布（E4✅→E5✅→E5.6 封存→E5.7 极简Pool✅→**E5.8 归一化基建收官**→**E6：L4/L5 封站（2026-09-14）→ L7 插件源码外移进行中（7.0 判据先立 ✅、7.1 出口打通 ✅——六只插件自足构建 + 身份显式化 + SDK `pack` 通道，**仓外构建 7/7 实证**；**7.2 逐个迁移 ✅——18 只发货插件源码外移各自独立仓（`Encaron/linkdesk-plugin-<id>`，保历史）并已推送、壳仓 `plugins/` 只剩两只夹具、12 类绑定逐条给结论（软件 0.1.61→0.1.62 PATCH）；7.3 上架两步 ✅ 2026-09-14 收官——18/18 publish 到各自仓（三产物核验）+ 官方目录工具 + 装机验收两阶全绿 + 卸载安全三连与更新通道实证真跑通 + 🔴 18 只已收录进官方目录（用户点头当天落地，提交 `66e8a974`）；7.4 出厂种子保鲜 ✅ 2026-09-14 收官——三件套一起上（机制 `sync:bundled` 三档 / 账 `bundled-plugins.lock.json` / 门禁 `check-bundled-freshness` 挂进 `npm run check`）+ 🔴 **出厂随包收敛为 6 只基础插件**（设置·插件市场·语言·基础主题·文件树·编辑器；其余走市场，18 只仍在官方目录）+ **端到端本命真跑通**（settings 1.0.6→1.0.7 → 收录 → `sync --latest` → 打包 → 干净 profile 读数 = 1.0.7）+ `pack-bundled-plugins.mjs` 退休（软件 0.1.62→0.1.63 PATCH）；7.5 门禁与 CI ✅ 2026-09-14 收官（**本地全绿、外发一件没做，等用户点头**）——**18 仓各自自带 CI ＋ 严格门禁**（`.github/workflows/ci.yml` + `scripts/ci-verify.mjs`：SDK lint 全腿判红 / 跨插件互引 / 字典完整性 / 声明自洽）＋ **测试基建随插件走**（5 仓 **25 文件 / 370 例全绿**，file-tree 69/69 与 7.1 记录逐字相同）＋ 🔴 **核出 SDK preset 两条真缺口**（`no-cross-plugin-import` 根本不在 preset 里 / 12 条注册规则全 WARN ⇒ 「lint 会红」必须自带严格腿）＋ 7 处负控全红、修回全绿 ＋ 脚手架模板同四件（**新插件一建出来就自带检查**）＋ 发布清单跨仓四步回填 ＋ 🔴 **18 仓 CI 真跑过一次（18/18 `success`，24–40 秒/仓）**（用户 2026-09-14 点头后推的 18 仓与壳仓 `e6`，7.5 主体 = `00ffce391`；npm 侧一件没发——模板改动与 7.6 的脚手架改动合并成一笔版本）；**7.6 脚手架 git init 与本地工作区 ✅（2026-09-14）**——脚手架**代建 git 仓**（照 `cargo new` 三语义 ＋ `--no-git` 逃生口）＋ 门禁断言 9 ＋ **`npm run pull:plugins`（只拉不推）** ＋ **`create-linkdesk-plugin` 0.1.3 真发**；**7.8 作者面文档收口与发布 ✅（2026-09-14，#105a-m 全过）**——`docs/03-插件制造` 从「文档集合」变「**教学动线**」（新篇 `17-区域地图` / `18-区域间互动` / `19-组件速查` / `20-我的插件加一条配置项` ＋ `主题/` 两篇 ＋ `00-README` 改导览 ＋ `13` 三档入口；**口号 = AI 10 分钟做出最小插件 / 30 分钟视图插件 / 1 天高难度插件**）＋ **155 处内部任务号清零**（含 `E5.7#`）、出界链接 57→48 **全部白名单化**（内部档案指针清零）＋ 顺手订正三处与实现相反（`04` 的「18 个 zip」→ 实际 **6 只出厂种子**、`15`/`16` 的「不许改目录名」）＋ **两条门禁**（`check-author-docs-symbols` 无内部任务号 / `check-author-docs-links` 出界链接白名单，**各带 `--self-test`**）接进 `npm run check` ＋ 脚手架模板新增 **`AGENTS.md`**（给作者的 AI 看的四件事；**0.1.3→0.1.4 已备未发**）＋ **第五根作者轴 `@linkdesk/plugin-docs`**（生成器 ＋ `--check` ＋ 24 文件产物，**首次发布待点头**）；**7.8 增补：作者面英文化 ✅（2026-09-14，E6#105n）**——**英文树 `docs/03-plugin-authoring/`（23 篇）是作者面主显**、中文树 `docs/03-插件制造/` 留作维护者面（既有引用零改动），两棵树由**双语对齐门禁** `check-author-docs-bilingual` 盯着（篇目对齐 + 入口互指；另两条作者面门禁的扫描域一并扩到两棵树）＋ **四条 schema 的 description 全部英文化并清掉内部任务号**（三份 `plugin.schema.json` 拷贝仍字节相等）＋ 三个 npm README 与速查表生成器英文化 ＋ 脚手架 `template/AGENTS.md`（英文，末尾一句指中文版）/`template/README.md`/CLI README 英文 ＋ 文档包**英文在包根、中文收 `zh/`**；🔴 **五根作者轴全量重新分发**（`@linkdesk/contracts@0.1.14` · `@linkdesk/plugin-sdk@0.1.15` · `create-linkdesk-plugin@0.1.4` · `@linkdesk/ui@0.1.5` · **`@linkdesk/plugin-docs@0.1.0` 首发**，均过货架核对 + `release:mark`）；🔴 **7.7 全层验收 ✅ 2026-09-14 收官 ⇒ L7 封层**（#104a-e 全过）——七条判据逐条跑出读数、四本账对平、回归对照闭合：**18 只插件在壳仓外全新 clone 逐只 `npm ci && npm run build && npm run validate` → 18/18 绿**（临时目录 `E:\ldk-l7-scratch\verify\<id>`，一次都没在壳仓里跑）· **官方目录 20 条**（18 只全在，版本与账逐条相等）· **出厂种子 6 只新鲜**（`check:bundled-freshness` 6/6 ＋ `sync --offline` 6/6）· **壳侧绑定归零**（9 处命中全在注释里、1 处是有意的候选位数组）· **装机实测三条腿全绿**（干净 profile 首启正好装 6 只且版本与账全对 · `lsp:smoke` 全链路绿 · CDP 实读市场「探索插件」段拉到 **20/20** 条）· **`npm run check` EXIT=0 且更短**（**178 文件/2,433 例 → 153/2,063 例**；端到端 **53.4 s → 46.5 s**——「L7 前」那格档案里一直写「记录」的耗时，本轮在 `7a28c463c` worktree 上受控复测补齐；**25 个消失测试文件 25/25 按原路径在插件仓找到、370 例一例不差**）；🔴 **作者面终局三档计时真跑**（模拟「陌生作者的 AI」：只给脚手架产物 ＋ 文档包、禁止读源码、不许问人，计时含找文档——**10 分钟档 2 分 07 秒 / 30 分钟档 2 分 16 秒**都远超达标，**1 天档探针** 4/6 触点行为验过 ⇒ 跑出 **7 条缺篇**）；**抓修 1 条真 bug**（`@linkdesk/plugin-docs` 产物在 Windows 上被大小写卡红——`core.ignorecase` 让纯大小写改名不进 git 索引，**提交自身不自洽**，本机还看不出来；同笔全仓审计 1,679 文件 problems=0）＋ **挂账 5 条**（`pack` 通道把 `marketplace.json`/`ci-verify.mjs` 打进了 12 只纯 JSON 插件的出厂件 · N6 第 ④ 处锚与 `check-theme-audit` 的主题色规则**两侧都裸着**（负控实证「由各插件仓 CI 守」不成立）· npm 缓存陈旧会让 `npm create linkdesk-plugin` 静默降级 · `@linkdesk/ui` 其实**不是** external）＋ **作者面缺篇 7 条**——读数与全部发现住 [08-全层验收 §五](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)。**E6 仅剩 L4 与 L6，去向由用户拍板。**；**E6#106 身份图上架链路 ✅ 2026-09-14（用户实机立案，L3.5 第 3.5.17 轮）**——用户实机发现「市场『探索插件』里 file-tree / serial-monitor / settings 显的是图标栏那张白线剪影，装到本地才显彩色身份图」= **同一插件两张脸**：**#69 的 Type-2 身份图只做通了「已装读包内」那一半，`marketIcon` 从没进过发布链路**（SDK `publish` 只搬 `icon`），而图标栏插件的 `icon` 按设计就是 Type-1 剪影；并发的第二条 = 目录条目里存的是**包内相对路径**，`linkdesk://` 只在本地已装时可达 ⇒ **未装态恒 404**（用户「卸掉之后图标就没了」即此）。修法 = ① SDK publish 新增 `withCatalogIdentity`：`icon`/`marketIcon` 一律转绝对 URL（与既有 `readmeUrl` 同一拼法同一 tag，**URL 规则只此一处**）② 市场侧契约补两字段 + 行裁决归一为「已装 → 目录 → 默认块」（与详情页同序，**防「已装行转拉远程图」的回归**）③ 禁用子集补图标通道（照 #65a 先例）④ **18 只插件仓目录条目回填**（只改元数据、零版本 bump；工具 `scripts/backfill-catalog-identity.mjs` 可复跑 + `--check` + `--self-test` 8 例）⑤ 插件仓 CI 新增第 ⑤ 段（目录条目图标必须绝对 URL + 来源 `"url"`，纯字段断言、零插件 ID 知识，负控两条实测红）⑥ 文档四处订正（含 `CatalogRow` 那句与设计相反的错注释）。**读数**：`npm run check` EXIT=0（153 文件 / **2,070 例**）；18 仓回填后逐仓 `verify` 五段全绿。**软件 0.1.63→0.1.64 PATCH**；🔴 **作者轴两包升版真发**（`@linkdesk/contracts@0.1.15` / `@linkdesk/plugin-sdk@0.1.16`）+ **marketplace 1.0.29→1.0.30 重发**。AI 接力 = 一个会话只做一个轮次）**；**E6 L7 封层后补丁第 7.9 轮 ✅ 2026-09-14（E6#108，用户实机立案）——F5 销账 + 作者轴五包重发 + npm 发版 runbook**：用户在 `E:\BaiduNetdiskDownload` 跑 `npm create linkdesk-plugin my-cool-plugin`，**产出与 npm 介绍页那张文件树不一致**，追问「我本地再跑**为什么出来的是旧版的**」「这些 npm 包我该怎么更新、packages 下那个 README **不全**」。🔴 **病根不在发布件、在 npx 缓存**——`<npm cache>/_npx` 里躺着 0.1.0（7 文件老模板）＋两份 0.1.4，而货架 `latest` 已 0.1.5；**npx 按"不带版本号的规格"算缓存键、命中即不问货架**，且**CLI 不打印自身版本 ⇒ 症状只有"少文件"、完全静默**（三组实测：裸命令 7 文件 / `@latest` 16 文件 / 删缓存后裸命令 16 文件）。第二个原因：**脚手架 README 那张树本身也旧**（只列 14 项，实测模板 16 件——缺 `vitest.config.ts`/`vitest.setup.ts`）。修法四件：① 五轴 README ＋ 作者面**两棵树**命令一律加 `@latest` 版本锚；② **订正两棵树里一句与实测相反的话**（原写「`npm create linkdesk-plugin` 默认取最新版」——**假**）；③ 脚手架 README 树补到 16 项；④ 新建维护者 runbook **[docs/06-发布管理/作者轴npm发版.md](docs/06-发布管理/作者轴npm发版.md)**（五轴表 ＋ 发版五步 ＋ 三个实测坑 ＋ npx 缓存专章）。🔴 **五轴真发**（`@linkdesk/contracts` 0.1.17 · `@linkdesk/plugin-sdk` 0.1.18 · `create-linkdesk-plugin` 0.1.8 · `@linkdesk/ui` 0.1.6 · `@linkdesk/plugin-docs` 0.1.2，均 PATCH）＋ `release:mark` 记五条基线、`check:npm-release` 黄灯灭 ＋ **货架保真**（`npm pack` 解包核 16 件模板/README `@latest` ×3；**从真货架再真跑一次生成** ⇒ 16 文件 + `main` 分支 git 仓）；`npm run check` **EXIT=0（153 文件 / 2,070 例）**。🔴 **同轮追加（用户点头「包括版本上新」）：脚手架生成物清内部坐标 ＋ 立断言 10**——实测模板里 **15 处内部任务号 ＋ 6 处同类坐标**（`index.js` / `ci.yml` / `ci-verify.mjs` / `vitest.config.ts` / `vitest.setup.ts` / **`src/index.tsx`（作者打开的第一个文件，原来指向的还是中文维护者树）**），共 **21 处**改净；`check-scaffold.mjs` 新增**断言 10「生成物零内部任务号」**，**尺子与 `check-author-docs-symbols.mjs` 同一份**（抽出 `scripts/lib/author-symbols.mjs`——那个脚本 `main()` 顶层无条件执行，不能直接 import），负控两条（`--self-test` 增一例 ＋ **真变异实测：塞 `E6#102` ⇒ 红、还原 ⇒ 绿**）；`create-linkdesk-plugin` 0.1.7→**0.1.8** 真发并核（线上 tarball 残留任务号 **0** · 从货架真跑生成的工程任务号 **0**）。🔴 **顺带抓到一个新真坑**：`npm publish contracts`（裸名字）**被当成"包规格"**去解析货架上**别人**的 `contracts@0.4.0`（日志 `contracts-0.4.0.tgz`），**只因重复版本护栏才没发出去** ⇒ 正确形状 = `cd contracts && npm publish`；⚠️ 7.8 档案 §11.8.4 坑② 写的 `npm publish <folder>` **在本机实测会走偏，已订正**。⚠️ **两条自踩的顺序错（已固化成 runbook 坑④）**：`contracts` 发完才改 README ⇒ 重发；`create`/`sdk` 发完后被 pre-commit 的 `blank-at-eof` 抓到尾空行、trim 后又漂 ⇒ 各重发一位（**五包共发 7 次**）⇒ **规矩 = `git add` 后、`npm publish` 前先真跑一次 pre-commit，钩子先绿再发**。**软件版本不 bump（恒 0.1.64——零 `src/`/`electron/` 改动）**；档案 [08 §5.5b](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)。进度唯一真相源：`docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md`。**工作分支 = 主线 `electron`**——`e6` 已于 2026-09-14 **并回主线**（合并提交 `613b75919`，`--no-ff` 保留合并记录；此后**只在主线发展**，不再往 `e6` 提交；e5.8 当年同样是并回主线的）。E5.7/E5.8 执行清单已封存。
> **仓库结构（2026-09-04 第 0.15/0.16 轮完成）：** git 根 / npm 根 / VS Code 打开根已**合一于 `E:/linkdesk` 单根**（`src/` `electron/` `docs/` `package.json` 直接可见，无 `linkdesk/` 套娃）；`Serial_C_Language/` 已永久删除；历史经 filter-repo 抽子树（3119 commits，hash 全变、内容全保）；远端 `origin` 已 6 分支强推对齐（2026-09-04 用户拍板）。

## 架构——圆形大厅模型

> 🔥 **2026-07-25 Encaron 发现。** LinkDesk = Link（连接）+ Desk（桌子）。名字不是巧合。

```
                     ┌─────────────────────────────────┐
                     │       圆 形 大 厅 (src/core/)     │
                     │  核心 = 桌子集合                   │
                     │                                  │
   ┌─────────┐       │  ┌──────┐ ┌──────┐ ┌──────┐    │       ┌─────────┐
   │ 文件树   │       │  │命令本│ │装饰本│ │配置本│    │       │  Git    │
   │ 房间    │───────│→ │(Cmd) │ │(Deco)│ │(Cfg) │←───│───────│ 房间    │
   └─────────┘       │  └──────┘ └──────┘ └──────┘    │       └─────────┘
                     │                                  │
   ┌─────────┐       │  ┌──────┐ ┌──────┐ ┌──────┐    │       ┌─────────┐
   │ 编辑器   │       │  │快捷键│ │文件  │ │文件关│    │       │ 终端    │
   │ 房间    │───────│→ │本    │ │读写桌│ │联本  │←───│───────│ 房间    │
   └─────────┘       │  └──────┘ └──────┘ └──────┘    │       └─────────┘
                     │                                  │
                     │   核心不知道名片上写了什么          │
                     │   只提供桌子 + 电话本              │
                     └─────────────────────────────────┘

插件 = 周边小房间（同一 Pool 渲染进程内，preload 沙箱隔离）
交流 = 走大厅的桌子（Registry/Service）——插件互不知道对方存在
后门 = IPC 数据管道（高频推流：串口数据等）——紧耦合，知道对方是谁
```

**大厅通信（Registry/Command）**：松耦合——发布/订阅、发现服务、跨插件命令。不知道对方是谁。
**后门直连（IPC 数据管道）**：紧耦合——串口数据推流、高频实时通信。知道对方是谁。

**核心准入标准（三条同时满足才放 `src/core/`）：**
1. 多提供方——多个插件可能登记到这张桌子上
2. 多消费方——多个插件可能翻这张桌子
3. 桌子不知道内容——桌子本身不知道登记的信息是什么意思

三条有一条不满足 → 不放核心，放插件里。详见 memory `core-admission-criteria`。

标签页系统永不持有卡片注册表。卡片工作台是插件，不是架构第二层。

## 历史脉络（Tauri 时代 → E5.6 已封站）

> **来历一句话**：V2 留下「名字写死 = 功能写死」的血教训 → **V3** 定下「圆形大厅」模型（核心只是桌子集合）→ **Tauri 时代 P1-P6** 跑通全部基础设施（**终端插件是第一个验证载体，不是软件的定义**）→ **迁 Electron（E1）** → **E2** 底层加固 → **E3** 多 WebView 与壳收尾 → **E4** 做出文件树与 Monaco 编辑器两个插件 → **E5–E5.6** 核心归一化与壳重构。

> 🔴 **E5–E5.6 走的弯路（历史废案，只记结论）**：**多 WebView / Per-Tab WebView / 双 Pool —— 全部废弃**。Per-Tab 因 O(N) 个进程被否（E5.5#9）；**E5.7 用「极简 Pool」（O(1)）取代**，这才是今天的地基（memory `e5.7-extreme-simple-pool`）。E5.6 的「侧栏移入 Pool」只移了一半（#11），是日后 side panel 反复出问题的旧账。

> ✅ **这段时期做完、活到今天还在用的成果**（2026-09-13 已 grep 核实，不是印象）：**`linkdesk.*` 命名空间 API**（`electron/preload-pool/namespaces-*.ts`）· **ESLint 自定义防线**（`eslint.config.js` 的 `linkdesk/no-module-level-ipc-listener` 等，即硬约束 13/14 的机械兜底）。

> ⚠️ **旧账已清，别再当待办**：卸载相关的六项结构性改进（invoke 统一带日志 / 卸载单入口 `performUninstall()` / Rust error→前端 toast / invoke 顺序 Rust 先于前端 / ContextMenu 冒泡 / `window.confirm`→`showConfirm`）**2026-07-24 起陆续做完**。完整史见 memory `bug-atlas` §A1 §A3。

> 📚 **要查细节去这些地方**：Tauri 时代存档 `docs/01-Tauri_P1至P5.5/`（P1-P6 六期；三批 bug 修复的逐笔记录在 [P6-Bug修复完整记录.md](docs/01-Tauri_P1至P5.5/P6-交互对标/P6-Bug修复完整记录.md)）· Electron 各期存档 `docs/02-Electron架构/`（E3 / E3.5 / E3.6 / E5.5 / E5.6 / E5.7 / E5.8）· 完整脉络 memory `evolution-chronicle`。

## Phase 路线

> **Phase 5 = 最后一个改框架的 Phase。** 此后所有新功能——文件树、编辑器、卡片、逻辑分析仪、OLED——全写在 `plugins/` 里。`App.tsx` 和 `core/` 不再膨胀。

| Phase | 内容 | 改框架？ | 状态 |
|:--:|------|:--:|:--:|
| **P1-P6** | **Tauri 时代——全部基础设施 + 48/48 bug** | ✅ | ✅ |
| **E1** | **Electron 迁移——换地基（7 步，~1,190 行）** | ✅ | ✅ |
| **E2** | **底层加固 + 侧栏扩展位（36/40 任务，~1,310 行）** | ✅ | ✅ E2a+E2b+E2c ✅，E2d 4 任务取消 |
| **E3** | **多 WebView + 壳收尾（103 任务，~3,602 行）🏁 架构最后一站** | ❌ | 🎉 E3a-j 全部完成 |
| **E4** | **文件树 + Monaco 编辑器（67 任务，~2,500 行）🏁 最后 E 编号** | ❌ | 🎉 全部完成（2026-08-03） |
| **E5** | **核心归一化与壳重构——铁轨** | ❌ | 🎉 E5–E5.6 完成（已封站）· **E5.7 极简 Pool ✅** · **E5.8 归一化基建 ✅** |
| **E6** | **插件生态与发布（L4 端到端验证 + L5 文档与发布 ✅ 封站 2026-09-14；🔴 **L7 插件源码外移与上架 ✅ 全层封层 2026-09-14**（7.0–7.8 九轮全闭，#104 七条判据 ＋ 四本账 ＋ 回归对照 ＋ 三档计时全跑完）；剩 L6 安全加固 #48-52 与出厂判定（**L4 已于 2026-09-14 封站「全勾」，剩 L6；L4/L6 去向由用户拍板**）** | ❌ | 🚀 收官中——真相源 `docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md` |
| 之后 | E6 完成即出厂 → 持续迭代：04-软件更新（软件本体）+ 05-插件更新（各插件独立版本）。**出厂插件源码在仓外（各自 GitHub 仓，一插件一仓），随包靠构建期拉取最新已发布版，不靠源码住在壳里** | ❌ | 📋 |

> Phase 5 拆分为 5a-5h 八批次——每批交一个可用软件。详情存档在 [docs/01-Tauri_P1至P5.5/](docs/01-Tauri_P1至P5.5/)。

## 提交前自检

**🔥 机械操作，不是建议。** 每步必须执行，少一步不提交。

1. `npm run check` 全绿——一条命令 = 双工程 tsc 零错误（壳 + electron/）+ ESLint `--max-warnings 0`（硬约束 13/14 全绿，零警告才过）+ vitest 全绿 + 间距网格 + pool-css。**无"基线接受"——红灯必须修到绿灯才提交。**
2. `git diff --stat` 确认无调试日志残留（`console.log` / `debugger` / 临时注释）
3. `git diff --staged | grep -E 'pluginId === "[a-z]|case "[a-z].*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` 返回空（无新增插件 ID 硬编码）
4. **🔥 Vite deps 缓存自动清——`postinstall` 脚本会在每次 `npm install` 后自动 `rmSync node_modules/.vite`。** 极端情况（postinstall 被跳过、缓存仍有问题）→ 手动 `rm -rf node_modules/.vite` 再重启。（memory `toolbox-sop` §6.2）

详见 memory `ai-pre-commit-checklist.md`——五条：完整性（改 N 个漏 M 个？）/ 归一化（同一个逻辑只一处写？）/ 边界（空/null/竞态测了吗？）/ 注册注销（mount-unmount-remount 对吗？）/ 提交前机械操作。

## 硬约束（绝对不能违反）

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **标签页系统不持有卡片注册表**（Phase 3→4 硬边界——卡片工作台是插件，卡片状态归插件自持；原 CardRegistry 骨架已随 E5.7#45.7 整删，未来重建亦不得进标签页系统）
4. **workspace.json 禁止嵌套**，必须是一层平铺数组
5. **IPC 事件订阅必须用 generation counter 模式**（B11 教训，`useIpcEvent` 已内置）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 是独立可替换模块，RingBuffer 接口 `{ cardId, value }` 是硬边界**——开发阶段只用方括号协议，但任何代码不得写死"只有这一种协议"。Phase 4 协议插件系统通车时，只换解析器不改下游。
9. **核心无知原则**（memory `core-ignorance-principle.md`）：核心不知道软件是干什么的。只定义"怎么接"，不定义"接什么"。往核心加东西前先问：加了之后核心变得更"知道自己是干什么的"了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 中写死插件 ID。** 禁止 `if (pluginId === "terminal")` / `switch (pluginId) { case "terminal": ... }` / `PLUGIN_ICON_PATH["terminal"]` / `BOTTOM_ICONS = ["settings"]` 等任何形式的插件 ID 字面量硬编码。所有插件差异性行为走 plugin.json 声明（`viewRole` / `tabBehavior` / `iconLocation` / `keepSidebarOnFocus` 等字段）→ Registry 模式消费。**Phase 5g 把 `TabType` 从 8 个联合类型改成 `string` 就是为了消灭这个模式——不要再写回来。**
11. **插件身份唯一来源是 plugin.json 声明字段。** 禁止用文件位置、目录名、是否在 Vite glob 中、是否在源码树里来推断插件属性。**🔴 其中「插件身份 id」= 顶层 `pluginId` 字段（E6#98g 起进 schema 并要求显式声明）——发布后永不可变；`derivePluginId` 的目录名/zip 基名兜底只为兼容存量第三方插件，`validate` 会对缺声明打黄灯，官方插件 20 只已全部显式声明。** `core: true` 定义卸载按钮隐藏（纯 UI 防误删旗标——无行为特权，API/命令层可卸可禁，卸载走 removed 墓碑，见 E6#18），`tabBehavior` 定义标签页行为，`entry` 定义入口文件——所有属性都在 `PluginManifest` 类型和 JSON Schema 中有对应字段。代码注释中禁止发明 schema 里没有的分类名词（如"工厂插件""内置插件"）——用字段名：`core: true 的插件`、`glob 中的插件`。
12. **🔥 禁止硬编码路径——所有资产路径走 `getAssetPath()`（`src/core/utils/assetPath.ts`）。** 禁止手写 `/assets/...`、`/icons/...`、`/plugins/...` 等绝对路径字面量。打包后 Electron 走 `file://` 协议，绝对路径全部炸裂。dev 模式 `http://localhost:1420` 能工作只是巧合。插件作者的自定义图标也必须走这条路——`resolvePluginIcon` 已内置。
13. **🔥 async 初始化函数必须防 StrictMode 双重 effect 竞态。** `init*()` 有 `_initialized` guard 不够——第一次调用是 async，第二次可能在第一次完成前到达。第二次调必须返回第一次的进行中 Promise（`_loadingPromise`），不能直接 return undefined。详见 memory `invisible-bugs-lesson-59c.md` Bug 1。
14. **🔥 useEffect 有回调 prop（onChange/onHighlight/onSelect 等）做非 DOM 副作用时，必须加活跃守卫。** 组件 `return null` 不代表 effect 不跑——React effect 只看挂载不看 DOM。守卫模式：`if (!open) return;` / `if (!isActive) return;`，且 `open`/`isActive` 必须纳入依赖数组。**写完后 grep 同组件的其他 effect——所有 effect 应有同样的守卫，漏掉的就是 bug。** 详见 memory `invisible-bugs-lesson-59c.md` Bug 2。
15. **🔥🔥🔥 出了隐形 bug 不要猜——`git checkout` 逐 commit 二分定位。** 静态分析死胡同就立刻跳版本，`git checkout -f <commit>` 测完一个再跳。找到最后一个正常版本和第一个异常版本之间的 diff，bug 就在那个 commit 里。不要墨迹。
16. **🔥🔥🔥🔥 任何 CSS / 样式 / 配色 / 字体 / 间距 / 布局 / UI 外观改动前，必须先通过 `Skill` 工具调用合适的设计 skill 拿设计系统（默认 `ui-ux-pro-max`；风格方向可竞标引入 taste 系/impeccable，见 memory `design-skills-inventory`），禁止凭感觉手写。** 不调用 skill = 违反硬约束。调完后落地设计 token 到 CSS 变量，不要硬编码 hex/px。
17. **🔥 `useRef` 不得用于影响渲染输出的状态。** ref 更新不触发重渲染——React 输出和实际状态脱节。异步拿到数据 → ref 更新 → 组件不知道 → 下次任何事件触发重渲染时突然切到"新状态"→ UI 跳变/空白。渲染决策（显隐、内容切换、列表过滤）走 `useState`。ref 仅用于：DOM 引用、前值对比（不渲染）、generation counter。**教训：** #58e 用 ref 存 WebView ID → 切标签页时第二帧跳空 div → 全插件标签页空白。
18. **🔥 Electron 窗口顶部 30px 是 `-webkit-app-region: drag` 拖拽区。** `position: fixed` 叠加层（弹窗/下拉/tooltip）放在 `top: 0` 范围内→OS 截鼠标事件做窗口拖拽。`z-index` 无效——这是 OS 级别的。所有 fixed 叠加层必须 `top: 30px`（或更高）避开 TitleBar 拖拽区。**教训：** ☰ 子面板 `top: 0` →上半部分被 TitleBar drag region 截事件 → 子面板消失 (9e6f936→8ff7a68)。
19. **🔥 禁止模块级 `_initialized` guard + IPC 监听器注册。** 模块级函数 = 导入就执行 = 永不清理。壳 fallback 的 IPC 监听器在 WebView 就绪后成为僵尸回调（E3j #81 教训）。正确做法：一次性数据拉取（`_initOnce`）走模块级，IPC 监听器走 React `useEffect` + 引用计数（mount 注册 / unmount 清理）。ESLint `linkdesk/no-module-level-ipc-listener` 机械拦截。
20. **🔥 preload 脚本的 IPC 监听器必须在模块顶层注册（`ipcRenderer.on` 在 `contextBridge.exposeInMainWorld` 之前），用缓冲+回放模式。** React `useEffect` 内注册太晚——IPC 事件可能在 mount 前到达。模式：模块级常驻 `ipcRenderer.on(channel, handler)` → push 到 `_buffer` → `onReady(cb)` 调用时回放 `_buffer` + 设置 `_active=true` 停止缓冲。**教训：** E5#11l Bug 4——`notifyReady` 在 `onReady` useEffect 之前到达，事件静默丢失，多 WebView 间歇性失效。详见 memory `multi-webview-bug-atlas` §A Bug 4。
21. **🔥 测试 fixture 禁止真实插件名 + 真实 UI 文案（含英文，如 `"Settings"` 就是 settings 插件的英文标题）。** 测试桩数据（`viewId`/`pluginId`/`renderPath`/`title`/动作 `label`）一律用明显虚构值（`demo-plugin`/`demo-view`、`Demo View`/`Démo Vue`、`Alpha`/`Beta`/`Gamma`）——测试替身不指向真实插件，避免读者/AI 误以为存在运行时引用（硬约束 10 生产代码禁令向测试豁免区的延伸；2026-08-22 用户拍板）。**边界：** 断言被测代码产出的真实行为文案（如 i18n 输出"已隐藏"）不算违规；loader/FactorySlots 等验证真实接线而必须用真 id 的测试除外。不做 ESLint 机械规则——非时序 bug，且真 id 合法出现场景多，机械拦截必然误伤。
22. **🔥 软件侧用户可见变更提交前，必须调用 version-bump skill 判定变更类别（feat/fix/breaking）并报告版本号判定。** 改动 `src/` 或 `electron/` 代码的 commit，message 必须带类别前缀（`feat:`/`fix:`/`breaking:`，可含 E6#编号，如 `feat:E6#xxx …`）。**三层机械兜底（E6#57.15e 立，2026-09-13 用户拍板升级为硬拦）**：① `scripts/check-version-bump.mjs` 挂在 lefthook 的 **`commit-msg`** 钩子上——**不带前缀 ⇒ 提交被 git 拒绝**，覆盖所有提交者与所有提交方式（`-m` / `-F` / 编辑器 / heredoc；唯一豁免 = `Merge …` 合并提交，且不静默）；② `scripts/check-changelog-section.mjs` 在**每次 `npm run check`** 上验「`package.json` 的版本号在 `CHANGELOG.md` 里有非空段」——**bump 版本号必须同笔写 `## v<新版本>` 段**；③ 发布门禁脚本（E6#57.15d）在发版那一下再拦一次。**违反=红灯——禁止「代码更新上去了版本号没更」**（2026-08-31 用户拍板；判据见 [.claude/skills/version-bump/SKILL.md](.claude/skills/version-bump/SKILL.md)）。逃生口 `git commit --no-verify` 跳过全部 git 钩子（git 机制，如实记着）。

23. **🔥 CSS 类名是全局的——共享组件类名一律 `ldk-` 前缀，插件不得借宿主保留名。** 插件视图里**一张样式表同时装着宿主 CSS + 共享组件 CSS + 所有已加载插件的 CSS**（实机读数：池文档 8 张样式表），所以裸类名（`.badge`/`.toggle`/`.input`…）等于全局标识符：一方「定义」、他方「渲染」，两边样式就落到同一个元素上，**不报错、只是长得不对**（`.badge` 案：主题卡片徽标文字被自己的背景吞掉，看着是一块纯色——**这就是本条纪律的由来，也是共享组件那 8 个裸名后来全部收进 `ldk-` 前缀的原因**）。三条纪律：① 自己的元素用**自有前缀**（`settings-*`/`ms-*`/`mpd-*` 先例）；② **整个 `ldk-` 命名空间属于宿主侧**（共享组件八族 `ldk-badge`/`ldk-button`/`ldk-combobox`/`ldk-mdv`/`ldk-selectbox`/`ldk-sle`/`ldk-slider`/`ldk-toggle` ＋ 宿主自己的容器类——`ldk-titlebar` 等 5 个内部工具类同批收进前缀，E6#109j-a）＋ 宿主全局工具类（`.input` 等，以登记表为准）**不要借来给自有元素用**——要那个样子就用那个组件；③ 状态类一律**复合**（`.你的类.active`），不裸写 `.active {}`。机械兜底 = `scripts/check-css-namespace.mjs`（4 判据 + 登记表，挂 `npm run check`；判据① 拦的是**不含连字符的裸名**，故新共享组件类名一律 `ldk-` 起头这个形状靠本条纪律守）；作者面见 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)（含 0.2.0 升级迁移说明）；判据与处置见 [11-样式命名空间审计.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md)。**违反=红灯，逃生口 = 登记表里写明理由**（E6#109，2026-09-15）。

固定名称，不用"三栏中间那个"。详见 `docs/总体设计/V3-部件命名规范.md`

速查：图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）。主区顶部是标签栏。最上面是顶栏。最下面是状态栏。

## 关键设计——不要改

- **keep-alive：所有面板绝对定位平级渲染，CSS display 切换**（不是 `{isActive && <View />}`——改成条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）：面板 key=groupId 永远不变**（不是递归 flex 嵌套——改回嵌套 → 分屏/合屏 unmount 面板）
- **独立 RingBuffer 多消费者**（不是 Pub/Sub——串口数据是流不是事件，每个消费者需要完整历史）
- **drop zone 照抄 VS Code**：SPLIT_THRESHOLD=0.25 + 左右优先（不自创算法）
- **递归分屏 SplitNode 树**：`leaf | branch(direction, [child, child], sizes)`，MAX_TREE_DEPTH=4

## Phase 4 架构决策（详见 memory `design-decisions.md`）

- **插件 = 独立构建产物。** Vite 将 `plugins/` 下每个插件独立打包为 `dist/plugins/<pluginId>.js`。`.tsx` 插件重启生效，`.json` 插件即时生效（对标 VS Code）
- **核心不认 pluginId。** 标签页行为（保底/单例/关闭确认）由 `plugin.json` 的 `tabBehavior` 声明，核心读 registry 不 switch on type
- **`useSendData` 在 Phase 4 提取到 core。** 发送管道（编码→invoke→回显→历史）独立于 TerminalView，Phase 5 卡片直接复用
- **欢迎页是壳的兜底，不是插件。** 对标浏览器新标签页，通过 `tabBehavior.isFallback` 声明
- **插件详情页只读 `plugin.json`。** 不引入 README 等第二种格式
- **命名不绑版本号。** 不用 "V3" 当品牌名，插件 ID 不带版本号前缀

## 反模式——不要做

- 不要自创算法，照抄 VS Code
- 不要改 flex 元素拖拽时的 width（用 opacity 留占位）
- 不要嵌套卡片（card in card）
- 不要手写 Tauri listen()——用 `useTauriEvent` hook
- 不要说"架构不支持"——检查六类插件接口。视图/卡片/协议/主题/语言/资源，新功能落在哪一类？每类都是窄接口，不碰架构
- **不要把壳级功能放在插件里。** 自检："卸载所有插件后，这个功能还能用吗？" 不能 → listener/渲染必须放在 App.tsx 或 core/，绝不在 plugins/ 里。B79 教训：CommandPalette 寄生在 terminal 插件 → 没终端时 Ctrl+Shift+P 无效。
- **不要说"这个功能插件做不了"——插件没有 API 白名单。** 插件代码和核心代码在同一个 WebView 里跑，React 组件就是 React 组件。`import Leaflet`、`import THREE.js`、`<iframe>`、`<video>`——核心代码能用的 JS 库和 Web API，插件全能用。视图插件的契约只有 `{ isActive: boolean }`，之外全是标准 React 自由发挥
- **不要把终端当成软件的定义。** 终端是第一个视图插件，串口是第一个数据源。LinkDesk 不是"串口调试器"——跟 VS Code 不是"代码编辑器"一样。核心只有标签页+分屏+数据管道+注册表——不知道终端是什么、不知道串口是什么

## 常发已知问题（老毛病——改到相关处先看这个）

> 完整表在 memory `ui-debug-checklist` / `bug-atlas`；这里只记**反复回来的**。

- **文件树 / 侧栏 sticky**：双层滚动架构（`.file-tree-scroll` + `.side-panel-content`）与 CSS `position: sticky` **不兼容**——sticky 的祖先链上都不是真正的滚动容器。E4V#57 曾因此放弃重做，动它之前先读 memory `evolution-chronicle` 的「`e4-sticky` 重做前提」。
- **编辑器 / Monaco 颜色不跟、token 错乱**：两条已知根因——① **异步竞态**（`StandaloneWorkbenchThemeService` 抢在初始化前设主题，见 memory `bug-atlas` **B4**）；② **全局污染**（Pool 下 `window.monaco` 是共享单例，任何插件 `defineTheme`/`setTheme` 都会污染全局，见 memory `multi-webview-bug-atlas`）。**插件首选 CM6；必须用 Monaco 也绝不调 `defineTheme`/`setTheme`。**

## 开发命令

```bash
# 🔥 提交前必跑——一条命令 = 双工程 tsc + ESLint --max-warnings 0 + vitest + 网格/pool-css
npm run check
#   ⚠️ 其中 `check-bundled-freshness`（E6#101）**默认联网**比对官方目录；无网络时它会红——离线用 `--offline` 明示降级
#   ⚠️ 其中 `check-scaffold`（E6#103）**需要 git 在 PATH**（断言要真建仓、真问 rev-parse）；缺 git 会明确报出来
#   ⚠️ 其中 `check-css-namespace`（E6#109）离线秒级。共享组件侧已清账（登记表 `classes.shared` 现为空数组）
#     ⇒ 共享组件里**再出现裸类名必红、无豁免可用**；宿主新增全局工具类 / 关键帧跨方重名同样红
#     ——**逃生口 = 改登记表并写明理由**（硬约束 23）
#   ⚠️ 其中 `check-reserved-names-doc-sync`（E6#109i）离线秒级：把登记表 ↔ 作者面 §12 的「保留名」表
#     **双向**钉住——登记表里的名字必须出现在表里；表里的裸名必须已登记、`ldk-` 名必须在宿主源码里
#     真实存在；中英两棵树的表名字集合必须相等 ⇒ **改保留名要同笔改三处**（登记表 ＋ 两棵树 §12）

npm run sync:bundled # 出厂种子保鲜（E6#101）：按账拉齐箱内种子 + 修剪到随包集
                     #   `-- --latest` 读官方目录刷新账与种子（显式追新）｜`-- --offline` 断网只校验指纹
npm run sync:plugin-ci # 插件仓门禁铺装（E6#102）：把脚手架模板里的 ci.yml / ci-verify.mjs
                     #   （+有源码的加 tsconfig、有测试的加 vitest 两件）铺到 18 只插件仓的本地容器
                     #   ⚠️ 只写本地、不碰 git 不推送；改完各仓要 `npm install --registry=https://registry.npmjs.org` 更 lock
                     #   ⚠️ 插件仓的门禁在**插件仓自己**里跑：`.github/workflows/ci.yml` + `npm run verify`
                     #     （严格腿 = SDK lint 全腿 + 跨插件 import + 字典完整性 + 声明自洽；壳仓的 check 够不着插件源码）
npm run pull:plugins # 把本地容器（linkdesk-plugins\{official,third-party}）里的插件仓拉到最新（E6#103）
                     #   ⚠️ **只拉不推**：只有 `git pull --ff-only`，没有 commit / push 任何路径（推送等用户点头 + 带代理）
                     #   `-- --dry-run` 只列会动谁；本机出网要代理时 `HTTPS_PROXY=http://127.0.0.1:7890 npm run pull:plugins`
                     #   🔴 顺手当红线哨兵：容器 / official / third-party 哪一级被 git init 了就红着喊出来
npm run sync:plugin-agents # 18 只插件仓的 AGENTS.md ＋ .vscode/settings.json（E6#108g）
                     #   给「在那个仓里单开 AI 干活」用的：每仓一份「这只插件是什么 / 规矩在哪 / 命令怎么敲」
                     #   模板 ＋ 每只一段事实（脚本里 FACTS 表）；版本/命令/seed 全部**现场从该仓读**，不手抄
                     #   `-- --check` 只校验不改（漂移 / 缺文件 / 出现内部坐标 ⇒ exit 1）｜`-- --dry-run` 只报
                     #   ⚠️ **只写本地容器，不碰 git 不推送**；与 sync:plugin-ci 同一套思路
npm run docs:build   # 作者面文档包产物（E6#105l）：真源 docs/03-插件制造/** → packages/plugin-docs/docs/**
                     #   `npm run docs:check` 与真源逐字节比对（挂 check）；出界链接会被绝对化成 GitHub URL
npm run catalog:official          # 官方目录候选生成（E6#100c）：各插件仓 marketplace.json → scratch/ 候选
npm run backfill:catalog-identity # 目录条目身份图回填（E6#106）：18 只插件仓的 icon/marketIcon 转绝对 URL
                     #   `-- --check` 空跑核验（有漂移 exit 1）｜`--self-test` 纯函数负控 8 例
                     #   ⚠️ 依赖 SDK dist（先 `npm run --prefix packages/plugin-sdk build`）；只写本地、不推
npm run check:plugin-prefix       # 插件 CSS 前缀**只读审计**（E6#109h-b①）：列某仓「裸定义类名 / 关键帧
                     #   → 应改成的名字」（改名轮 ③–⑦ 的映射表、⑧ 的全量复核都复用它）
                     #   `-- <仓目录>` 单仓｜`-- --all [<容器>]` 多仓（默认 E:\linkdesk-plugins\official）｜`-- --json`
                     #   ⚠️ 判据不在脚本里：它 import 的正是 `check-css-namespace` 腿的同一个函数（同源）
                     #   ⚠️ 依赖 SDK dist（先 build）；**只读不写**；渲染点/`animation:` 引用不在射程（见 17 号档 §四）
npm run check:plugin-prefix:selftest # 上者的正控/负控 7 例（含一条「腿与工具同源」的静态断言）
npm run sync:plugin-ci            # 插件仓门禁铺装（E6#102）：把脚手架模板的四件铺到 18 只插件仓（只写本地）
npm run check:lockfile-sync # lockfile 与各 manifest 同源门禁（E6#107）：挂 check，离线秒级
                     #   负控 = 「workspace 升版没刷 lock」那一类（实证：CI 自 7.6 起必红而本地全绿）
                     #   ⚠️ **升 packages/* 版本号后必须重跑 npm install 并同笔提交 lock**
npm run lint         # 单独跑 ESLint（含硬约束 13/14 自定义规则）
npm run dev          # 纯前端预览（Vite）
npm run electron:dev # 完整 Electron 桌面应用（E1 步 1 后可用）
npm run tauri dev    # Tauri 桌面应用（phase6 分支退路）
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 单元测试（会涨：2026-09 时 168 文件 / 2,342 例）
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | **`docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`** — 48 个旧 bug 哪些会回来、哪些新 bug 会出现 |
| 🔥🔥🔥 迁移执行——每步检查项 | **`docs/02-Electron架构/00-元文档/00-迁移执行守则.md`** — 10 个 bug 模式 + 6 个新风险 → 每步/每任务的具体检查项清单 |
| 🔥 E1 执行前必读 | **`docs/02-Electron架构/E1_Electron迁移_暂定/10-迁移方案缺口补丁.md`** — 7 个缺口（Vite/main.ts/测试/dev workflow/entry/RingBuffer/G14/preload防御/plugin-handlers完整性） |
| 🔥 全方案审计 | **`docs/02-Electron架构/00-元文档/00-全方案步进审计.md`** — 29 份文档 + 18 个源文件逐步推演 + 两轮审计 20 项缺失已全部修复 |
| 🔥🔥🔥 加文件前——确认放哪个目录 | **`docs/开发管理/壳目录规范.md`** — core/pool/components/hooks 每个子目录语义和准入标准。E5#42→#36k 的教训——先查此表再加文件 |
| 理解架构 | `docs/开发管理/当前状态.md` |
| 🔥🔥 改壳边界 | **`docs/02-Electron架构/通道范式·设备插件独立.md`** — 改壳=加通用通道≠加设备业务（E5.8 Phase 6.5 用户拍板）。写壳代码/提议改壳前必读 |
| Phase 4 设计 | `docs/phase4_插件系统/` |
| Phase 3.5 任务 | `docs/phase3_标签页分屏/V3-Phase3.5-品质打磨.md` |
| 标签页/分屏设计 | `docs/phase3_标签页分屏/V3-Phase3-标签页分屏设计.md` |
| 部件名称 | `docs/总体设计/V3-部件命名规范.md` |
| 写插件 | **`docs/03-插件制造/`**——00-README 概览 / 01-API契约 / 02-生命周期 / 03-contributes / 04-分发 / 05-UI写法规约 / 06-plugin.json规范 / plugin.schema.json |
| 🔥 插件源码外移与上架（L7） | **`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/00-整理档案.md`**——源码真相源在插件仓、壳仓只留产物；九轮任务 + 交接.md（AI 一会话一轮接力）。🔴 **本层已于 2026-09-14 全层封层**（七条判据 ＋ 四本账 ＋ 回归对照 ＋ 三档计时全跑完，读数与 6 条真发现住 [08-全层验收 §五](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)）。**出厂种子保鲜 = 账 `bundled-plugins.lock.json`（谁随包看 `seed`）＋ 机制 `npm run sync:bundled` ＋ 门禁 `check-bundled-freshness`（挂 `npm run check`，默认联网）**；**插件仓的门禁在插件仓自己里**（`.github/workflows/ci.yml` + `npm run verify`，四段严格腿）——**壳仓的 `npm run check` 够不着插件源码**，两套互不覆盖，且 🔴 **「由各插件仓 CI 守」这句话有两处不成立**（N6 第 ④ 处锚 / 主题色规则，负控实证，见 [06-门禁与CI.md](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/06-门禁与CI.md) 与 memory `plugin-repo-gate-model` §九）。**作者面文档（`docs/03-插件制造/`）= 教学动线**（导览 ＋ 三档入口 ＋ 区域地图/区域间互动/组件速查/配置项/主题）——两条门禁管它：`check-author-docs-symbols`（禁内部任务号）/ `check-author-docs-links`（出界链接必须报备在 `scripts/author-docs-outbound-allowlist.txt`）；**文档 npm 包** = `npm run docs:build` / `docs:check`（产物 `packages/plugin-docs/`，真源是两棵树）。**英文化后：作者面主显 = `docs/03-plugin-authoring/`（英文），中文原文 = `docs/03-插件制造/`；两棵树的篇目对齐由 `check-author-docs-bilingual` 守，跨树映射表写在该门禁的 `FILENAME_MAP`**。⚠️ **L7 之后作者面还欠七篇**（双击文件到渲染的握手 / 工作区文件读写 / 预览宿主能·不能表 / 哪条命令跑 tsc / 多视图数据住哪 / props 表 / `enumDescriptions` 教反了）——清单在 memory `author-face-doc-gaps-l7` |
| 已确认决策 | memory `design-decisions.md` |
| 🔴 **作者轴五个 npm 包怎么发版** | **`docs/06-发布管理/作者轴npm发版.md`**——五轴对照（contracts / plugin-sdk / create-linkdesk-plugin / ui / plugin-docs）＋ 发版五步（改 → bump → publish → `release:mark` → 同笔提交）＋ 三个实测坑（`--registry` 必带 / **contracts 要 `cd contracts && npm publish`** / 货架约 3 分钟复制延迟）＋ **第五节 npx 缓存暗礁**（裸 `npm create linkdesk-plugin` 会静默给旧模板 ⇒ 一律写 `@latest`）。**软件本体的发版另见** `docs/06-发布管理/发布清单.md` |
| 已知坑 | memory `bug-atlas` |
| 🔥 CSS 命名空间（裸类名 / 保留名 / 关键帧） | **`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md`**——审计快照：文档同表读数（池文档 8 张样式表）＋ 全量分类总表（真案 `.badge` / 共享组件裸定义 8 / 宿主工具类 6 / 9 只插件零裸定义）＋ 处置五级。🔴 **那 8 个共享组件裸名已全部改名为 `ldk-` 前缀（今天 `classes.shared` = 空数组）**——处置的执行记录与逐轮交接在同目录 **[样式命名空间归一化/](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/00-整理档案.md)**（总档案 ＋ 13 份轮次详案 ＋ 交接.md）。机械兜底 = **`scripts/check-css-namespace.mjs`**（4 判据 + 两张登记表，挂 `npm run check`；加登记表 = 一次公共面决策）＋ **`scripts/check-reserved-names-doc-sync.mjs`**（登记表 ↔ 作者面 §12「保留名」表**双向对账**，挂 `npm run check`；改保留名要同笔改三处——登记表 ＋ 中英两棵树的 §12）；作者面纪律见 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)（含 `@linkdesk/ui` 0.2.0 升级迁移说明）。**硬约束 23** |
| 主题系统 | memory `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件，指到本文件与记忆索引；**记忆库重组时同笔更新它** |
