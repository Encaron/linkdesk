# LinkDesk

> **Tauri v2 + React 18 + TypeScript → 🔥 迁移到 Electron。通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
>
> **Tauri 时代 P1-P6 🎉。E3 🎉。E4 🎉（2026-08-03）。E5 🎉（2026-08-04）。** 壳通信骨架 + 三通信机制 + linkdesk.* 20 命名空间 API + ESLint 防线。Per-Tab WebView 已废弃（E5.5#9，O(N) 进程→E5.7 极简Pool O(1) 取代）。
> **当前进度：** 🚀 E6 插件生态与发布（E4✅→E5✅→E5.6 封存→E5.7 极简Pool✅→**E5.8 归一化基建收官**→**E6：L4/L5 封站（2026-09-14）→ L7 插件源码外移进行中（7.0 判据先立 ✅、7.1 出口打通 ✅——六只插件自足构建 + 身份显式化 + SDK `pack` 通道，**仓外构建 7/7 实证**；**7.2 逐个迁移 ✅——18 只发货插件源码外移各自独立仓（`Encaron/linkdesk-plugin-<id>`，保历史）并已推送、壳仓 `plugins/` 只剩两只夹具、12 类绑定逐条给结论（软件 0.1.61→0.1.62 PATCH）；7.3 上架两步 ✅ 2026-09-14 收官——18/18 publish 到各自仓（三产物核验）+ 官方目录工具 + 装机验收两阶全绿 + 卸载安全三连与更新通道实证真跑通 + 🔴 18 只已收录进官方目录（用户点头当天落地，提交 `66e8a974`）；7.4 出厂种子保鲜 ✅ 2026-09-14 收官——三件套一起上（机制 `sync:bundled` 三档 / 账 `bundled-plugins.lock.json` / 门禁 `check-bundled-freshness` 挂进 `npm run check`）+ 🔴 **出厂随包收敛为 6 只基础插件**（设置·插件市场·语言·基础主题·文件树·编辑器；其余走市场，18 只仍在官方目录）+ **端到端本命真跑通**（settings 1.0.6→1.0.7 → 收录 → `sync --latest` → 打包 → 干净 profile 读数 = 1.0.7）+ `pack-bundled-plugins.mjs` 退休（软件 0.1.62→0.1.63 PATCH）；7.5 门禁与 CI ✅ 2026-09-14 收官（**本地全绿、外发一件没做，等用户点头**）——**18 仓各自自带 CI ＋ 严格门禁**（`.github/workflows/ci.yml` + `scripts/ci-verify.mjs`：SDK lint 全腿判红 / 跨插件互引 / 字典完整性 / 声明自洽）＋ **测试基建随插件走**（5 仓 **25 文件 / 370 例全绿**，file-tree 69/69 与 7.1 记录逐字相同）＋ 🔴 **核出 SDK preset 两条真缺口**（`no-cross-plugin-import` 根本不在 preset 里 / 12 条注册规则全 WARN ⇒ 「lint 会红」必须自带严格腿）＋ 7 处负控全红、修回全绿 ＋ 脚手架模板同四件（**新插件一建出来就自带检查**）＋ 发布清单跨仓四步回填 ＋ 🔴 **18 仓 CI 真跑过一次（18/18 `success`，24–40 秒/仓）**（用户 2026-09-14 点头后推的 18 仓与壳仓 `e6`，7.5 主体 = `00ffce391`；npm 侧一件没发——模板改动与 7.6 的脚手架改动合并成一笔版本）；**7.6 脚手架 git init 与本地工作区 ✅（2026-09-14）**——脚手架**代建 git 仓**（照 `cargo new` 三语义 ＋ `--no-git` 逃生口）＋ 门禁断言 9 ＋ **`npm run pull:plugins`（只拉不推）** ＋ **`create-linkdesk-plugin` 0.1.3 真发**；**7.8 作者面文档收口与发布 ✅（2026-09-14，#105a-m 全过）**——`docs/03-插件制造` 从「文档集合」变「**教学动线**」（新篇 `17-区域地图` / `18-区域间互动` / `19-组件速查` / `20-我的插件加一条配置项` ＋ `主题/` 两篇 ＋ `00-README` 改导览 ＋ `13` 三档入口；**口号 = AI 10 分钟做出最小插件 / 30 分钟视图插件 / 1 天高难度插件**）＋ **155 处内部任务号清零**（含 `E5.7#`）、出界链接 57→48 **全部白名单化**（内部档案指针清零）＋ 顺手订正三处与实现相反（`04` 的「18 个 zip」→ 实际 **6 只出厂种子**、`15`/`16` 的「不许改目录名」）＋ **两条门禁**（`check-author-docs-symbols` 无内部任务号 / `check-author-docs-links` 出界链接白名单，**各带 `--self-test`**）接进 `npm run check` ＋ 脚手架模板新增 **`AGENTS.md`**（给作者的 AI 看的四件事；**0.1.3→0.1.4 已备未发**）＋ **第五根作者轴 `@linkdesk/plugin-docs`**（生成器 ＋ `--check` ＋ 24 文件产物，**首次发布待点头**）；**7.8 增补：作者面英文化 ✅（2026-09-14，E6#105n）**——**英文树 `docs/03-plugin-authoring/`（23 篇）是作者面主显**、中文树 `docs/03-插件制造/` 留作维护者面（既有引用零改动），两棵树由**双语对齐门禁** `check-author-docs-bilingual` 盯着（篇目对齐 + 入口互指；另两条作者面门禁的扫描域一并扩到两棵树）＋ **四条 schema 的 description 全部英文化并清掉内部任务号**（三份 `plugin.schema.json` 拷贝仍字节相等）＋ 三个 npm README 与速查表生成器英文化 ＋ 脚手架 `template/AGENTS.md`（英文，末尾一句指中文版）/`template/README.md`/CLI README 英文 ＋ 文档包**英文在包根、中文收 `zh/`**；🔴 **五根作者轴全量重新分发**（`@linkdesk/contracts@0.1.14` · `@linkdesk/plugin-sdk@0.1.15` · `create-linkdesk-plugin@0.1.4` · `@linkdesk/ui@0.1.5` · **`@linkdesk/plugin-docs@0.1.0` 首发**，均过货架核对 + `release:mark`）；🔴 **7.7 全层验收 ✅ 2026-09-14 收官 ⇒ L7 封层**（#104a-e 全过）——七条判据逐条跑出读数、四本账对平、回归对照闭合：**18 只插件在壳仓外全新 clone 逐只 `npm ci && npm run build && npm run validate` → 18/18 绿**（临时目录 `E:\ldk-l7-scratch\verify\<id>`，一次都没在壳仓里跑）· **官方目录 20 条**（18 只全在，版本与账逐条相等）· **出厂种子 6 只新鲜**（`check:bundled-freshness` 6/6 ＋ `sync --offline` 6/6）· **壳侧绑定归零**（9 处命中全在注释里、1 处是有意的候选位数组）· **装机实测三条腿全绿**（干净 profile 首启正好装 6 只且版本与账全对 · `lsp:smoke` 全链路绿 · CDP 实读市场「探索插件」段拉到 **20/20** 条）· **`npm run check` EXIT=0 且更短**（**178 文件/2,433 例 → 153/2,063 例**；端到端 **53.4 s → 46.5 s**——「L7 前」那格档案里一直写「记录」的耗时，本轮在 `7a28c463c` worktree 上受控复测补齐；**25 个消失测试文件 25/25 按原路径在插件仓找到、370 例一例不差**）；🔴 **作者面终局三档计时真跑**（模拟「陌生作者的 AI」：只给脚手架产物 ＋ 文档包、禁止读源码、不许问人，计时含找文档——**10 分钟档 2 分 07 秒 / 30 分钟档 2 分 16 秒**都远超达标，**1 天档探针** 4/6 触点行为验过 ⇒ 跑出 **7 条缺篇**）；**抓修 1 条真 bug**（`@linkdesk/plugin-docs` 产物在 Windows 上被大小写卡红——`core.ignorecase` 让纯大小写改名不进 git 索引，**提交自身不自洽**，本机还看不出来；同笔全仓审计 1,679 文件 problems=0）＋ **挂账 5 条**（`pack` 通道把 `marketplace.json`/`ci-verify.mjs` 打进了 12 只纯 JSON 插件的出厂件 · N6 第 ④ 处锚与 `check-theme-audit` 的主题色规则**两侧都裸着**（负控实证「由各插件仓 CI 守」不成立）· npm 缓存陈旧会让 `npm create linkdesk-plugin` 静默降级 · `@linkdesk/ui` 其实**不是** external）＋ **作者面缺篇 7 条**——读数与全部发现住 [08-全层验收 §五](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)。**E6 仅剩 L4 与 L6，去向由用户拍板。**；**E6#106 身份图上架链路 ✅ 2026-09-14（用户实机立案，L3.5 第 3.5.17 轮）**——用户实机发现「市场『探索插件』里 file-tree / serial-monitor / settings 显的是图标栏那张白线剪影，装到本地才显彩色身份图」= **同一插件两张脸**：**#69 的 Type-2 身份图只做通了「已装读包内」那一半，`marketIcon` 从没进过发布链路**（SDK `publish` 只搬 `icon`），而图标栏插件的 `icon` 按设计就是 Type-1 剪影；并发的第二条 = 目录条目里存的是**包内相对路径**，`linkdesk://` 只在本地已装时可达 ⇒ **未装态恒 404**（用户「卸掉之后图标就没了」即此）。修法 = ① SDK publish 新增 `withCatalogIdentity`：`icon`/`marketIcon` 一律转绝对 URL（与既有 `readmeUrl` 同一拼法同一 tag，**URL 规则只此一处**）② 市场侧契约补两字段 + 行裁决归一为「已装 → 目录 → 默认块」（与详情页同序，**防「已装行转拉远程图」的回归**）③ 禁用子集补图标通道（照 #65a 先例）④ **18 只插件仓目录条目回填**（只改元数据、零版本 bump；工具 `scripts/backfill-catalog-identity.mjs` 可复跑 + `--check` + `--self-test` 8 例）⑤ 插件仓 CI 新增第 ⑤ 段（目录条目图标必须绝对 URL + 来源 `"url"`，纯字段断言、零插件 ID 知识，负控两条实测红）⑥ 文档四处订正（含 `CatalogRow` 那句与设计相反的错注释）。**读数**：`npm run check` EXIT=0（153 文件 / **2,070 例**）；18 仓回填后逐仓 `verify` 五段全绿。**软件 0.1.63→0.1.64 PATCH**；🔴 **作者轴两包升版真发**（`@linkdesk/contracts@0.1.15` / `@linkdesk/plugin-sdk@0.1.16`）+ **marketplace 1.0.29→1.0.30 重发**。AI 接力 = 一个会话只做一个轮次）**；**E6 L7 封层后补丁第 7.9 轮 ✅ 2026-09-14（E6#108，用户实机立案）——F5 销账 + 作者轴五包重发 + npm 发版 runbook**：用户在 `E:\BaiduNetdiskDownload` 跑 `npm create linkdesk-plugin my-cool-plugin`，**产出与 npm 介绍页那张文件树不一致**，追问「我本地再跑**为什么出来的是旧版的**」「这些 npm 包我该怎么更新、packages 下那个 README **不全**」。🔴 **病根不在发布件、在 npx 缓存**——`<npm cache>/_npx` 里躺着 0.1.0（7 文件老模板）＋两份 0.1.4，而货架 `latest` 已 0.1.5；**npx 按"不带版本号的规格"算缓存键、命中即不问货架**，且**CLI 不打印自身版本 ⇒ 症状只有"少文件"、完全静默**（三组实测：裸命令 7 文件 / `@latest` 16 文件 / 删缓存后裸命令 16 文件）。第二个原因：**脚手架 README 那张树本身也旧**（只列 14 项，实测模板 16 件——缺 `vitest.config.ts`/`vitest.setup.ts`）。修法四件：① 五轴 README ＋ 作者面**两棵树**命令一律加 `@latest` 版本锚；② **订正两棵树里一句与实测相反的话**（原写「`npm create linkdesk-plugin` 默认取最新版」——**假**）；③ 脚手架 README 树补到 16 项；④ 新建维护者 runbook **[docs/06-发布管理/作者轴npm发版.md](docs/06-发布管理/作者轴npm发版.md)**（五轴表 ＋ 发版五步 ＋ 三个实测坑 ＋ npx 缓存专章）。🔴 **五轴真发**（`@linkdesk/contracts` 0.1.17 · `@linkdesk/plugin-sdk` 0.1.18 · `create-linkdesk-plugin` 0.1.8 · `@linkdesk/ui` 0.1.6 · `@linkdesk/plugin-docs` 0.1.2，均 PATCH）＋ `release:mark` 记五条基线、`check:npm-release` 黄灯灭 ＋ **货架保真**（`npm pack` 解包核 16 件模板/README `@latest` ×3；**从真货架再真跑一次生成** ⇒ 16 文件 + `main` 分支 git 仓）；`npm run check` **EXIT=0（153 文件 / 2,070 例）**。🔴 **同轮追加（用户点头「包括版本上新」）：脚手架生成物清内部坐标 ＋ 立断言 10**——实测模板里 **15 处内部任务号 ＋ 6 处同类坐标**（`index.js` / `ci.yml` / `ci-verify.mjs` / `vitest.config.ts` / `vitest.setup.ts` / **`src/index.tsx`（作者打开的第一个文件，原来指向的还是中文维护者树）**），共 **21 处**改净；`check-scaffold.mjs` 新增**断言 10「生成物零内部任务号」**，**尺子与 `check-author-docs-symbols.mjs` 同一份**（抽出 `scripts/lib/author-symbols.mjs`——那个脚本 `main()` 顶层无条件执行，不能直接 import），负控两条（`--self-test` 增一例 ＋ **真变异实测：塞 `E6#102` ⇒ 红、还原 ⇒ 绿**）；`create-linkdesk-plugin` 0.1.7→**0.1.8** 真发并核（线上 tarball 残留任务号 **0** · 从货架真跑生成的工程任务号 **0**）。🔴 **顺带抓到一个新真坑**：`npm publish contracts`（裸名字）**被当成"包规格"**去解析货架上**别人**的 `contracts@0.4.0`（日志 `contracts-0.4.0.tgz`），**只因重复版本护栏才没发出去** ⇒ 正确形状 = `cd contracts && npm publish`；⚠️ 7.8 档案 §11.8.4 坑② 写的 `npm publish <folder>` **在本机实测会走偏，已订正**。⚠️ **两条自踩的顺序错（已固化成 runbook 坑④）**：`contracts` 发完才改 README ⇒ 重发；`create`/`sdk` 发完后被 pre-commit 的 `blank-at-eof` 抓到尾空行、trim 后又漂 ⇒ 各重发一位（**五包共发 7 次**）⇒ **规矩 = `git add` 后、`npm publish` 前先真跑一次 pre-commit，钩子先绿再发**。**软件版本不 bump（恒 0.1.64——零 `src/`/`electron/` 改动）**；档案 [08 §5.5b](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)。**E6#109n-b（1.24）token 轴门禁与清账 ✅ 2026-09-16**——件 6 落地：**三条机械面**（壳 `check-css-namespace` **判据⑨「token 作用域」**（域 `src/**/*.css`）· SDK `check-css-namespace` 腿的第三条判据（`@linkdesk/plugin-sdk` **0.1.26**）· 运行时探针**纯分析层判级**）＋ 宿主/共享侧存量**零**（144 个定义点全在契约块或自有 `ldk-*` 类之下）＋ `serial-monitor` **4 处 `:root` 清掉**（含一处死 token「错误态」删除、注释里过期的理由订正；**只动定义位置、值不变 ⇒ 零视觉变化**；1.0.15→**1.0.16** 重发）；理论依据 = 1.23 实测定案（**作用域才是命名空间**；实测：宿主 94 个契约名里 83 个**没有 inline 屏蔽** ⇒ 插件一条 `:root` 真能全局改写宿主）；规则正文与清账逐处见 [31 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)；**软件版本不 bump**（恒 **0.2.0**——本格零 `src/`/`electron/` 改动：门禁在 `scripts/`、判据在 SDK 包、清账在插件仓）。**E6#109o（1.25）选择器形态轴实测与定案 ✅ 2026-09-16**——件 7 评估：**四条标识符轴最后一条、也是唯一「连名字都不需要相同」就能撞的那条**。**读数订正**：宿主「顶层非类名选择器」**16 处 → A 段（顶层无名字锚）17 处 ＋ D 段（id 锚）4 处 ＝ 21 处**（差的 5 处 = `:root` ＋ `::-webkit-scrollbar` 一族——**门禁与运行时探针都看不见它们**）；**插件侧 0 处**（18 仓 ＋ 壳内夹具）⇒ 规则**纯预防、零存量**。**21 处逐条裁 → 基线 17 · 该收 0 · 观察 1**，每条基线带实证（`*` reset 与 `input[type=number]`/`select` 用 **CDP 反事实 A/B**：在插件自己的 DOM 子树里插桩、删规则复读 computed、原下标插回 ⇒ `border-box→content-box`／`margin 0→13px`／`flex-shrink 0→1`）。**四条规则定稿**（口径「有名字锚 ⇔ 复合里出现 `.x`/`#x`」· 宿主基线**文件级 ＋ 条数**登记、零名字清单 · 插件禁无锚（含 id）· 跨方命中必须自带自有命名空间）＋ **两条裁决**（`id` 选 (b) 变体；`src/App.css` 域边界选 **(a) 对齐域** ⇒ `.app-shell` → `.ldk-app-shell`）。🔴 **顺手抓到三条尺子缺陷**：`:root`/`::-webkit-scrollbar` 被 `subjectOf()` 剥成空串后**静默丢弃**（两把尺子共同盲区）· CSSOM 归一化让运行时**再丢 5 站点** · `hasAncestor()` 对伪类独体主体**误判** ⇒ 全部写进 1.26 的必须项；**零 `src/`／零插件／零 `scripts/` 改动**（纯评估轮）；**软件版本不 bump**（恒 **0.2.0**）；1.26 完整任务书 = [32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)。**E6#109o-b（1.26）选择器形态轴门禁与落地 ✅ 2026-09-16**——件 7 落地：把 1.25 定的四条规则（R0 口径 / R1 宿主基线 / R2 插件禁无锚 / R3 跨方命中自带自有锚）**做成四个机械面**，并**顺手修好 1.25 抓到的两把尺子盲区**。**① 壳** `check-css-namespace.mjs` **新增判据⑦（共享组件族段规则）· ⑧（关键帧引用不悬空）· ⑩（宿主基线块 R1）＋ ⑪ 的壳内夹具面**，并新建登记表 **`scripts/css-selector-baseline.json`**（**文件 ＋ 条数，零名字清单**：`src/index.css` ＝ **17 处**，门禁每次**逐条打印**）；**② SDK** 0.1.26→**0.1.27** 新增**第四条判据** `selector-form.ts`（S2 禁无锚含 id / S3 跨方命中必须自带 `.<pluginId>-` 锚，两条都进插件仓 CI 严格腿）＋ **21 例单测**；**③ 探针轴 ④** 修好 **F1（`:root`/`::-webkit-scrollbar` 一族被 `subjectOf()` 剥成空串后静默丢）＋ F2（CSSOM 把 `*::before` 序列化成 `::before` 再丢 5 站点）**，新增 `doc:root` / `pseudo::…` / `pseudo-class::…` 三个形态与**无锚站点计数器**；**④ 只读审计工具**加「无锚 S2 / 跨方 S3」两列。🔴 **两条硬读数**：**轴 ④ 静态 17 ＝ 运行时 17**（池文档与壳窗口文档各 17，逐字相等；改前静默丢 10）· **域边界不一致 1 → 0 个名字**（1.25 裁决 (a) 对齐域落地：**判据③ 的域并进 `src/*.css`** ＋ `.app-shell` → `.ldk-app-shell`）⇒ 「宿主自己定义的类名 100% 是 `ldk-`」**无条件为真**，门禁域 ＝ 探针 host 归属域 ＝ 登记表 `domain.files` **三处逐字一致**（门禁里有断言钉住这次漂移）。**插件侧存量 0**（18 仓 ＋ 壳内夹具四条判据全量复核 0/0 ⇒ 纯预防、零重发）；**自测全接线**（壳 `--self-test` **21→38 例** · 探针自测 **34→42 例** · SDK 单测 **21 例** · 审计工具自测 **12→17 例**）＋ **负控真红留输出**（壳：`@media` 内元素选择器 / 条数守卫 / 夹具 id；SDK：`* { margin: 0 }`；探针：F1/F2 三条钉子）。**作者面**两棵树 §12 新增 **§12.6 选择器形态**（含「今天 0 存量 ⇒ 无需迁移」）。🔴 **作者轴两根同笔真发**：`@linkdesk/plugin-sdk@0.1.27`（38 文件漂移）＋ `@linkdesk/plugin-docs@0.1.10`（48 文件漂移，因 §12.6 进文档包），`release:mark` 记基线、黄灯灭；⚠️ 新判据**先发 SDK、再铺插件仓**（各仓下次 `npm install` 换新）。**软件版本不 bump**（恒 **0.2.0**：`src/` 唯一改动是 `.app-shell` 的纯标识符改名，与 1.21 那 252 名同判「形状证明零视觉变化」）。`npm run check` **EXIT=0（158 文件 / 2,155 例；HEAD 基线 157 / 2,134 ⇒ 本轮 +1 文件 / +21 例，全部来自新单测）**。⚠️ 顺带记账（交 1.20 复核）：CLAUDE.md 里 **7.9 轮**那段记的「153 文件 / 2,070 例」与本机 HEAD 实测 **157 / 2,134** 不符（差 4 文件 / 64 例）——**1.24 自己的流水日志记的正是 157 / 2,134**（逐字相同）⇒ 偏差来自 7.9 与 1.24 之间，不是本轮、也不是 1.24。**E6#109p（1.27）门禁健康度体检 ✅ 2026-09-16**——件 8 体检：**`scripts/` 下 34 道 `check-*.mjs` 逐道体检**（每道 6 问 ＋ 🔴 **负控真跑**；**20 次注入全部逐字节还原，本格零代码改动**）。① **普查订正**：**34 道**（先验记 33 是笔误——`git ls-tree e81f66737 scripts/` 实测写入时就已是 34）／**有自测 17 道且全部已接线**／**无自测 17 道**／🔴 **`check-lsp-smoke.mjs` 根本不在 `npm run check` 链里**（挂 `lsp:smoke`；它也是**唯一的环境依赖**道，另两道 `check-lsp-deps`／`check-lsp-args-base` **离线可跑**）⇒ 先验那句「17 道全部裸跑在 check 里」对它不成立；② 🔴 **两条真缺口（射程对不上声称，且都有真实发生率）**：`check-pool-css-imports` **看不见 `@import url("…")`**（合法且常见；**该门禁正是由 Vite ENOENT 真事故立的**）· `check-spacing-grid` **看不见逻辑/单边属性**（`padding-inline` 一族，src 存量 **42 处**，其中 `src/pool/floating/quick-pick/QuickPickHost.css:71` 的 `padding-left: 14px` **是真暴露**）；另抓到两处**误报形态**（`content:"#fff"` 被判硬编码色）；③ 🔴 **空转判据裁定（本轮规范产出）**：立一句判据——**「空转 ≠ 零存量」**：**零存量＝预防性**（判据会工作，只是无事可报）；**空转＝输入层结构性不可能出现违规形态**；判别只有一问「**它的输入数据源里，那个字段/清单项还存在吗？**」⇒ **真·空转只有两条**：SDK **`reserved-classes.ts` 判据①**（输入 `reserved-class-names.json` 的 `classes` 段**已随 1.21b 整块删除**、`classMap` 恒空；实验：往夹具写 `.badge { }` ⇒ **只有前缀腿报点**；⚠️ **整腿不许删**——拿不到 `pluginId` 时前缀腿 fail-closed，此时**判据②（关键帧撞宿主名）是唯一的独报腿**）· **市场「拒装」腿**（`buildCatalogEntry()` **不写** `minAppVersion` ⇒ **2/18 manifest 有声明 ／ 0/18 catalog 条目有**；⚠️ **加载器侧拒载腿是活的**——订正原登记的「21 条零命中」）；**7 道新判据（壳⑦⑧⑨⑩⑪ ＋ SDK S2/S3 ＋ token 腿）里没有一道是空转**（全是**预防性零存量且负控已证会红**）；④ **两道「假活」补诚实标记**（`check-theme-schema` 是**全链唯一「真空绿且无警告」**：0 个主题文件却输出「全部合规」· `check-lsp-deps` **两端输入同时为 0** 却断言「壳侧仍有效的部分 = 第二源」，读者会读成「0 缺失＝通过」）；⑤ **标本复核闭合**（1.25 裁 (a) 对齐域）：**域边界不一致 0 个名字** · **三处域逐字一致**（探针 host 归属域 ＝ 门禁 `HOST_DOMAIN` ＝ 登记表 `domain.files`）· **轴 ④ 静态 17 ＝ 运行时 17**——⚠️ 走**离线复算** `--analyze scratch/rt-126-a.raw.json --compare-static`（进场时 **CDP 9222 已停**、Vite 1420 仍活；隔离 profile 不恢复工作区 ⇒ 重启实例会让池文档视图全丢、方名册不够真，而 1.26→HEAD 之间 CSS 零改动 ⇒ 旧 dump 更忠实）；⑥ **四个面的自测实数逐字相符**：壳 **38 例** ／ 探针 **42 例** ／ SDK **21 例** ／ 只读审计 **17 例**（＝ **118 例**，全部可复跑）——⚠️ 审计工具**故意不在 `npm run check` 链里**（要 SDK `dist/`，而 `dist/` 是 gitignore 的）＝记忆 `gate-selftest-must-be-wired` 的**判据内例外**，已在 `check-gate-health` 里记**域外声明**，⛔ 不算「无自测门禁」；⑦ **`check-gate-health` 裁决 = 做**（判定式含一条**反启发式要求**：**A① 必须"真跑"，不许 grep 源码里的 `self-test` 字样**——「提到过」≠「有」；豁免**只允许文件级 ＋ 带理由 ＋ 含"怎么在有环境处跑" ＋ 反向核对**，初始豁免**只有 1 行** `check-lsp-smoke.mjs`）；⑧ 🔴 **1.28 完整任务书写齐** = 新建 [33 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/33-任务-门禁修复与常驻体检门禁.md)（逐道改法 ＋ gate-health 判定式／豁免清单／域外声明 ＋ **分格建议 1.28a 样式域 / 1.28b 其余＋常驻门禁** ＋ 判据 9 条 ＋ 禁区 6 条 ＋ 进场命令）；**本格零 `src/`／零 `electron/`／零 `scripts/`／零插件改动**（纯评估轮）⇒ **软件版本不 bump**（恒 **0.2.0**）／**作者轴不 bump**；`npm run check` **EXIT=0（158 文件 / 2,155 例——与 1.26 逐字相同，因零代码改动）**。⚠️ 顺带抓到并登记（交 1.20）：**1.26 的「判据⑧ 插件域缺口为空」被推翻**——18 仓实测**有 3 处 `animation:` 引用**（`marketplace` ×1 ／ `serial-monitor` ×2，与 3 处同名 `@keyframes` 逐一对上、**今天自解析**）而 **SDK 侧没有任何关键帧引用判据** ⇒ 缺口有真实质量 · 探针报 host 域独立定义 **259** 而文档记 **258**（shared 侧 89 逐字相符，差 1 名）。**E6#109p-b（1.28a）门禁修复·上 ✅ 2026-09-16**——件 8 修复的第一格：**8 道 check 脚本补自测并接线**（`check-lsp-args-base` **8 例** · `check-pool-css-imports` **9** · `check-spacing-grid` **15** · `check-css-hardcode` **21** · `check-font-scale-audit` **14** · `check-theme-audit` **14** · `check-theme-schema` **20** · `check-lsp-deps` **10** ＝ **111 例**；`npm run check` 链 **63→71 步**、含自测步 **21→29**）。① 🔴 **两条真缺口修判据**（1.27 抓到的射程缺口；改的是**判据形态**，不是加白名单）：**`check-pool-css-imports`** 从「带引号的 `@import`」改成「**任何 `@import` at-rule**」（`/@import\b/i`）⇒ `@import url("…")` 已会红（该门禁正是由 Vite ENOENT 真事故立的）· **`check-spacing-grid`** 从「三个短手属性」改成「**三个属性族**」（短手 ＋ 物理单边 ＋ 逻辑单边 ＋ `row/column-gap`）⇒ `padding-inline` 一族已会红（**先量存量**：多命中 46 行、其中「>6px 且非 4 倍数」**真违规 1 处**）；② 🔴 **空转两条处置**（1.27 裁定「空转 ≠ 零存量」后照单修）：**SDK `reserved-classes.ts` 判据① 退役**——输入 `classes` 段已随 1.21b 整块删除 ⇒ 恒空；本轮删掉**代码路径 ＋ `ReservedNames.classes` 字段 ＋ `plugin-prefix.ts` 的类名侧补充措辞**，⚠️ **判据②（关键帧撞宿主名）保留**（拿不到 `pluginId` 时前缀腿 fail-closed ⇒ 它是**唯一的独报腿**）＋ 两条**退役钉子**进单测 · **市场「拒装」腿生产端补字段**——`ManifestView` / `collectManifestView` / `buildCatalogEntry` 带上 `minAppVersion`（缺省不写键）⇒ `publish.ts` 那句「回落目标从来不存在」的空转**有了真目标**；⚠️ **存量条目不回溯**（18 仓要等各自下次发布才带上）；③ **两道假活补诚实标记**：`check-theme-schema` 补「覆盖域变更」⚠️ 行（**0 个对象不再伪装成「都合规」**——此前它是全链唯一「真空绿且无警告」的那道）· `check-lsp-deps` 两端为 0 时明说「**本哨兵今天无对象 ≠ 通过**」**且末行那句 ✓ 改成条件式**；④ **一处新挂账范式**（`check-spacing-grid` 的 `REGISTERED`，照 `check-file-size` 的 `EXEMPT_FILES`）：**文件 ＋ 属性 ＋ 值**粒度 ＋ 理由必填 ＋ **每次运行逐条打印** ＋ **过期即红**——首条 = `src/pool/floating/quick-pick/QuickPickHost.css` 的 `padding-left: 14px`（**门禁修好当天翻出的真账**）。🔴 **该条当天就结案了**（用户点头后当场走完视觉裁决）：查清那个前缀是**字面量 `>`**（命令面板/创建面板选择器都传 `prefix: ">"`）、设计稿〔E3.5 命令面板美化〕写的就是 14px ⇒ **过设计 skill**（`ui-ux-pro-max` 库里无对口规则，按它自己的说明不编造库匹配）＋ 三条依据（4px 网格／面板内列表项与空态同在 **16px** 左槽／姊妹视图 `AboutView`·`ReleaseNotesPoolView` 先例）⇒ **14 → 16** ＋ 就地记账 ＋ **挂账清零**（`REGISTERED` 今天 0 条）；🔑 **机制自证**：像素改好而条目未删那一次，门禁当场报「**存量登记过期**」红（EXIT=1）；⑤ **发版裁决 = 本格不发**（SDK 0.1.28 交 1.28b——发版是独立收尾链，塞进来会把「门禁修复」与「作者轴发版」两套读数混在一起）；**软件版本 0.2.0 → 0.2.1**（**PATCH 位**——用户可见的**向后兼容**修复：产品运行时代码只动那 1 行 `padding-left`，不改 API／贡献点／数据格式，已发布插件一行都不用改）＋ CHANGELOG 段 ＋ `package-lock.json` 同笔刷新（`check-lockfile-sync` 当场报过 `lock = 0.2.0 ≠ manifest = 0.2.1`——**门禁在干活**）；`npm run check` **EXIT=0（158 文件 / 2,156 例；+1 例来自新增单测）**。⚠️ 顺带订正四条：`check-font-scale-audit` 头部「豁免 `@font-face`」**与实现不符**（实测会红）⇒ 订正措辞 ＋ **细查后裁决「不豁免」**（`@font-face` **根本没有 `font-size` 描述符** ⇒ 报了它抓的是笔误、不存在误伤；今天**全仓 0 个 `@font-face` 块** ⇒ 该豁免是纯假设；那句错话从 `691af9aeb` 落地第一天就在） · `check-theme-schema` 走查器**不支持 `pattern`/`if`/`format`**（与 SDK 侧 ajv 编同一份 schema 但能力不同）⇒ 自测钉住 · `check-lsp-deps` 抽取器**吞转义**（`"C:\\tools\\a.exe"` → `C:toolsa.exe`）⇒ 钉为已知局限 · 作者面 §12 **无需改动**（「不许借宿主名」由前缀腿继续执行）。⏳ **1.28b 剩**：其余 9 道补自测 ＋ **`check-gate-health` 落地** ＋ 两条发现式判据 ＋ 作者轴发版 ＋ 收尾输出分母（「34 道：有自测＋已接线 N ／ 豁免 1」）。**E6#109p-b（1.28b）门禁修复·下 ✅ 2026-09-16 —— 🔴 件 8 收官**——① **其余 9 道补自测并接线（171 例）**：`check-config-baseline` **10** ／ `check-contributes` **10** ／ `check-design-flow` **17** ／ `check-doc-links` **17** ／ `check-empty-dirs` **22** ／ `check-file-size` **45** ／ `check-namespace-matrix` **31** ／ `check-plugin-schema-sync` **8** ／ `check-gate-health` **11**；链 **71 → 81 步**、含自测步 **29 → 38**；② 🔴 **`check-gate-health` 落地**（**防复发的那一道**）：判定式 A① 链里**精确整段**存在 `<文件> --self-test`（按 `&&` 分词逐段相等——⛔ 不许 `includes()` 子串匹配：`check-x.mjs` 是 `check-x.mjs.bak` 的子串）＋ A② **真跑一次退出码 0**（它自己跑，全部自测合计约 4 秒 ⇒ 不做「只查结构」的弱化版）；B 豁免**只允许文件级 ＋ 理由必填 ＋ 含「怎么在有环境处跑」＋ 反向核对**（已接线却还挂着 ⇒ 报「过期豁免」）；**域外声明写进脚本头**（`audit-*.mjs`／生成器／`plugin-css-prefix-audit.mjs`——后者**故意不接线**：要 SDK `dist/` 而 `dist/` 是 gitignore 的，是记忆 `gate-selftest-must-be-wired` 的**判据内例外**）；**初始豁免只 1 行**（`check-lsp-smoke.mjs`）。＋ 🔴 **已知空转登记表（`IDLE`）**（1.28b 补做 §H.5）：**与「豁免」明确分开**——豁免＝「这道门禁不打算有自测」；空转登记＝「**判据没错，只是它的输入今天不含违规形态**」。每条必填 `what`/`why`/`status`（`已处置`｜`未处置`）/`who`（**谁在什么时候补**），可带 **`absent`/`present` 机械核验**防账本单向腐烂，**每次运行逐条打印**。真跑输出 **3 条**：`reserved-classes.ts` 判据①【✅ 已处置】· 市场拒装腿【✅ 已处置，含「存量条目不回溯」边界】· **判据⑧ 插件域另一半【⬜ 未处置 → 归一个新 SDK 轮】**；门禁自测随之 **11 → 24 例**（12 正／12 负；含「已退役被改回去 ⇒ 红」「生产端被删 ⇒ 红」「未处置却不点名 ⇒ 红」「核验读不到文件 ⇒ fail-closed 红」）。⚠️ **选 marker 的教训**：第一版用裸 `classMap` 撞上了 `reserved-classes.ts` 头部**自己那句退役说明**里的字样 ⇒ 假红一次；marker 必须是「只在代码里出现」的形态。🔴 **真跑输出（1.20 收口判据第 3 条的分母）**：**`35 道 check-*.mjs —— 有自测＋已接线 34 道 ／ 豁免 1 道`**（34 道的自测逐道真跑、退出码全 0）；③ **两条发现式判据**（治「清单漏登记 ⇒ 静默不扫」）：`check-config-baseline` 断言「`src/` 下**既调 `registerConfiguration(` 又声明 `app.*` 键**的生产文件都登记在 `TARGETS`」（今天 3 个／扫 310 个 ts/tsx／0 漏登记；⚠️ 锚带「且声明 `app.*`」是因为定义处与泛化转调处会永久假红）· `check-plugin-schema-sync` 断言「`public/schemas/*.schema.json` 每个 live 都有归属」；④ 🔴 **作者轴发版**：`@linkdesk/plugin-sdk` **0.1.27 → 0.1.28 真发**（107 文件 / 171.4 kB；runbook 五步含「`git add` 后先真跑 pre-commit 定格」；**货架复制延迟实测约 2 分钟**）＋ `release:mark` 记基线（40 文件漂移）＋ 黄灯灭 ⇒ **`minAppVersion` 的市场拒装腿从此有输入**（⚠️ 存量目录条目不回溯）；⑤ **两条新账 ＋ 三条顺带记录 ＋ 一条自测自身的教训**：`check-plugin-schema-sync` 新增 **`LIVE_ONLY` 豁免 1 条**（`public/schemas/workspace.schema.json` **全仓零拷贝面**；附机械核验；⛔ 没塞进 `FILES` 因那会造一组「自己跟自己比」的**空转组**）· 抓到**一座未被 `FILES` 守护的拷贝** `packages/plugin-docs/docs/zh/plugin.schema.json`（生成产物，归公共面决策）· `check-design-flow` 的 `taskBase()` **不取整**（`parseFloat("146.2")` → 146.2；过滤不受影响，自测已钉成事实）· `check-contributes` ③ 三条现状 · `check-doc-links` 基线 593 个 md · **我的自测夹具自己写错了**（`chainOf()` 少 `.mjs` ⇒ 「已接线」用例被判成「未接线」而崩）＝ **「自测必须真跑」的又一个现场**；⑥ **零 `src/`／零 `electron/` 改动**；**软件版本不 bump**（恒 **0.2.1**）／**作者轴 SDK 0.1.28 已发**；`npm run check` **EXIT=0（158 文件 / 2,156 例）**。⏳ **下一棒 = 1.29（件 9 隔离决策落盘，任务书 [28 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/28-任务-隔离决策落盘.md) 已备）**；其后 1.30（件 10 普查）；**1.20 收口恒最后**（要用件 8 的分母）。进度唯一真相源：`docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md`。**工作分支 = 主线 `electron`**——`e6` 已于 2026-09-14 **并回主线**（合并提交 `613b75919`，`--no-ff` 保留合并记录；此后**只在主线发展**，不再往 `e6` 提交；e5.8 当年同样是并回主线的）。E5.7/E5.8 执行清单已封存。
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

23. **🔥 CSS 类名是全局的——共享组件类名一律 `ldk-` 前缀，插件不得借宿主保留名。** 插件视图里**一张样式表同时装着宿主 CSS + 共享组件 CSS + 所有已加载插件的 CSS**（实机读数：池文档 8 张样式表），所以裸类名（`.badge`/`.toggle`/`.input`…）等于全局标识符：一方「定义」、他方「渲染」，两边样式就落到同一个元素上，**不报错、只是长得不对**（`.badge` 案：主题卡片徽标文字被自己的背景吞掉，看着是一块纯色——**这就是本条纪律的由来，也是共享组件那 8 个裸名后来全部收进 `ldk-` 前缀的原因**）。三条纪律：① 自己的元素**与 `@keyframes`** 名都**必须**以**本插件 `pluginId` 加一个连字符**开头（`settings-*`/`editor-*`/`file-tree-*` 先例——`ms-*`/`mpd-*` 那类**缩写已废弃**：缩写不保证唯一，唯一性由 `pluginId` 免费提供，它是发布后不可变的身份；改关键帧名要同笔改 `animation:` 引用）；② **整个 `ldk-` 命名空间属于宿主侧**（**共享组件全部族 ＋ 宿主全部容器/工具类**——E6#109l／1.21b 收口后**宿主与共享组件自己定义的类名 100% 是 `ldk-` 开头**：258 ＋ 89 个独立定义**零例外**；唯一鼓励**消费**的是输入框工具类 `ldk-input`）**不要借来给自有元素用**——要那个样子就用那个组件；🔴 连带一条：**`pluginId` 自身不得以 `ldk-` 开头**（`ldk-` 整个命名空间属宿主，而插件前缀由 `pluginId` 派生 ⇒ `pluginId: "ldk-tools"` 会**由构造**把自己的名字落进宿主空间、纪律①当场失效；`plugin.schema.json` 的 `pattern` 已收窄成 `^(?!ldk-)…` ＝第二道防线，真判红在插件侧的腿）；③ 状态类一律**复合**（`.你的类.active`），不裸写 `.active {}`；④ 🔴 **自定义属性（token）的定义作用域受结构约束**（E6#109n／1.24 起）——**文档级**（`:root`／`html`／`body`／`[data-theme=…]`／`*`）**只有宿主契约块能写**（= `src/index.css` 的 `:root` 与 `[data-theme="light"]` 两块，**文件级登记、不设名字名单**，配方键超出 `index.css` 合法），其余定义**必须挂在自有命名空间的类之下**（宿主/共享 `.ldk-*` · 插件 `<pluginId>-*`；浮层宿主根 `#ld-float-layer` 一族为 **portal 面例外**），**任何一方不得定义 `ldk-*` 自定义属性**；⇒ 插件把**无主名字**写在文档级 = 🔴 红（实测：默认主题下宿主 94 个契约名里 **83 个只有样式表提供、引擎不写 inline** ⇒ **一条 `:root` 就能全局改写宿主的颜色/圆角/z-index** —— 正是 `marketplace` 那次 `--status-connected` 覆写事故的形态），把**自有前缀名**写在文档级 = 🟡 黄（建议改挂自有根类）；🔴 **JS 侧写入不在管辖内**（`setProperty` 到 `documentElement` 是设计，**不许「作用域化」**）。机械兜底 = **两条腿**：**宿主侧** `scripts/check-css-namespace.mjs`（判据 ①③④⑤⑥⑦⑧⑨⑩⑪，挂 `npm run check`；🔴 **判据①（共享组件，E6#109l-b）与判据③（宿主，E6#109l）同为结构性判定——「自己定义的类名必须 `ldk-` 开头」，不查表、无白名单，登记表 `classes` 整块已删**；🔴 **判据⑥ `ldk-` 名跨域唯一性（1.21b 补）**：两个域共用同一个 `ldk-` 命名空间，同名即「宿主元素被共享组件样式命中」＝`.badge` 案同形；判据②（跨组件借用）**已退役**——它的输入是「共享组件的裸定义」，清零之后它是个安静的假判据；🔴 **判据⑨「token 作用域」（E6#109n-b · 1.24 起）**：域 = `src/**/*.css`（共享组件域单独判），判定式／分级／负控见 [31-任务-token轴门禁与清账.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)；🔴 **判据⑦⑧⑩⑪（选择器形态轴，1.26 起）**见上 ⑤）＋ **插件侧** SDK 的 `check-css-namespace` 腿（`@linkdesk/plugin-sdk` **0.1.25** 起随包下发：裸定义类名/关键帧必须以本仓 `<pluginId>-` 开头、拿不到 `pluginId` 一律 fail-closed；**0.1.26 起同一条腿扩自定义属性作用域**——文档级定义／自有类锚定／`ldk-` 禁令四条，级别与上面同档；**0.1.27 起再加第四条判据（选择器形态 S2 禁无锚含 id ／ S3 跨方命中必须自带自有锚）**；**插件仓 CI 的严格腿判红**——在插件工程根 `npm run verify`；只读映射表工具 `npm run audit:plugin-prefix`）；作者面见 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)（含 0.2.0 升级迁移 ＋ §12.2 前缀规则迁移 ＋ §12.4 共享组件余下类名迁移 ＋ **§12.5 自定义属性的作用域** ＋ **§12.6 选择器形态（无锚禁用 ＋ 跨方命中自带自有锚）**五节）；判据与处置见 [11-样式命名空间审计.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md)。**违反=红灯；宿主与共享组件两侧已没有「登记」这个逃生口——只有改名一条路**（E6#109 立 2026-09-15 ／ 件 4 双域收官 2026-09-16 ／ 件 7 落地 2026-09-16）。

⑤ 🔴 **选择器形态轴（E6#109o／1.26 起）——「无名字锚」的选择器受同一句纪律管**（1.25 实测与定案，1.26 落地）：**类名与 id 是「名字锚」；元素 / 通配 / 属性 / 伪类 / 伪元素不是** —— 后者**不需要与任何人同名**就能命中别人的元素（一条 `button { border: none }` 静默改掉宿主与其他插件的按钮）。三条规则：**R1 宿主基线块（文件级 ＋ 条数登记，零名字清单）**——宿主顶层无锚选择器只允许出现在**基线文件**里（登记表 `scripts/css-selector-baseline.json`：今天 = `src/index.css` **17 处**；`*` reset ／ `html`·`body` ／ `[data-theme]` ／ `*:focus-visible` ／ `::-webkit-scrollbar` 一族 ／ `input[type="number"]`·`select` 全部判为「有意的共享基线」——插件依赖它们，⛔ 不许当 bug 删）；**R2 插件禁无锚选择器**（含 id；要写元素样式必须挂在自己的根类之下）；**R3 跨方命中必须自带自有命名空间**（插件的任何选择器里出现 `ldk-*` 类 ⇒ 必须同时含 `<pluginId>-*` 类——**管形态不管意图**，改共享组件外观仍是合法特性）。⇒ 今天插件侧存量 **0**（纯预防）；机械兜底（**1.26 已落地**）= **壳** `check-css-namespace` 判据⑩（宿主基线，附条数守卫）＋ 判据⑦（共享组件族段）· ⑧（关键帧引用不悬空）· ⑪（壳内夹具）＋ **SDK 0.1.27** 的 `check-css-namespace` 腿**第四条判据**（S2／S3，作者 CI 自跑）＋ **运行时探针轴 ④ 镜像**（`--compare-static` 出「静态 17 ＝ 运行时 17」）。🔴 同笔**域对齐**（1.25 裁决 (a)）：**判据③ 的域并进 `src/*.css`** ＋ `.app-shell` → `.ldk-app-shell` ⇒ 「宿主自己定义的类名 100% 是 `ldk-`」**无条件为真**，且门禁域 ＝ 探针 `host` 归属域 ＝ 登记表 `domain.files` **三处逐字一致**。🔴 同笔修好 1.25 抓到的两把尺子缺陷：`:root`／`::-webkit-scrollbar` 一族被 `subjectOf()` 剥成空串后**静默丢**（F1）· CSSOM 把 `*::before` 序列化成 `::before` 再丢 5 站点（F2）——形态判定一律走新写的 `formOf()`，⛔ **不许复用 `hasAncestor()`／`subjectOf()`**（F3：它们把 `.x :pseudo` 误判成 `.x` 的一次顶层定义；那条偏差属轴 ①、已冻结，两条尺子这一层**有意并存**）。规则正文／判据／负控见 [32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)。

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
#   ⚠️ 其中 `check-css-namespace`（E6#109）离线秒级。🔴 **E6#109l-b 起两个定义域同一条结构性规则**
#     =「**自己定义的类名一律 `ldk-` 开头**」：宿主 258 ＋ 共享组件 89 个独立定义零例外，
#     判据①（共享组件）／③（宿主）**都不查表、没有白名单**（登记表 `classes` 整块已删，只剩 `keyframes` 段）；
#     🔴 **判据⑥**：`ldk-` 名**跨域唯一性**（宿主 × 共享组件 同名 ⇒ 红——两域共用同一命名空间）；
#     关键帧跨方重名同样红；判据②（跨组件借用）**已退役**（输入已清零 = 安静的假判据，不留）
#     🔴 **判据⑨「token 作用域」（E6#109n-b · 1.24 已落）**：自定义属性的定义作用域约束——文档级只有
#       宿主契约块能写、其余定义必须挂在自有命名空间的类之下、`ldk-*` 自定义属性任何方禁定义；
#       域 = `src/**/*.css`（共享组件域单独判，**类名轴的域不动**）。规则／判定式／负控／清账见
#       [31 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)
#       ⚠️ 宿主侧存量**零**（144 个定义点全在契约块 `:root`/`[data-theme=…]` 或自有 `.ldk-*` 类之下）；
#         `--self-test` 19 例（新增 4 红 / 4 绿），其中一条锚把**判级文案**与 SDK 那份钉在一起（跨包只能钉文案）
#     🔴 **判据⑦⑧⑩⑪（选择器形态轴，E6#109o／1.26 已落地）**：⑦ 共享组件**族段规则** ·
#       ⑧ **关键帧引用不悬空**（`animation`／`animation-name` 引用的名字必须在宿主域 ＋ 共享组件域
#       有定义 —— 1.21／1.21b 改名后这条有了真实发生率，症状是**动画静默消失**）·
#       ⑩ **宿主基线块**（顶层「无名字锚」选择器只许出现在基线文件里，**文件级 ＋ 条数**登记、
#       零名字清单，登记表 `scripts/css-selector-baseline.json`；今天 = `src/index.css` 的 **17 处**：
#       `*` reset ／ `html`·`body` ／ `[data-theme]` ／ `*:focus-visible` ／ `::-webkit-scrollbar` 一族 ／
#       `input[type="number"]`·`select`；**每次逐条打印**；条数变了 ⇒ 红）· ⑪ 壳内夹具无锚/id 选择器
#       ⚠️ **判据③ 的域同笔并进 `src/*.css`**（原只有 `index.css` ＋ `src/pool/**`）⇒ `.app-shell` 改名
#       `.ldk-app-shell`，此后「宿主自己定义的类名 100% 是 `ldk-`」**无条件为真**，且门禁域 ＝
#       探针 `host` 归属域 ＝ 登记表 `domain.files` **三处逐字一致**（门禁与探针各有一条断言钉住漂移）
#       ⚠️ 形态判定一律走 `lib/css-selectors.mjs` 的 **`formOf()`**——**不许**用 `hasAncestor()`／
#       `subjectOf()`（F3：它们把 `.x :pseudo` 误判成 `.x` 的一次顶层定义 ⇒ 假红）
#       规则／判定式／负控见 [32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)（**1.25 定案，1.26 落地**）
#   ⚠️ **插件侧的另一条腿不在这里**：同一条规则的插件版是 SDK 的 `check-css-namespace` 腿
#     （`@linkdesk/plugin-sdk` 0.1.25 起随包下发类名/关键帧判据、**0.1.26 起扩 token 作用域判据**、
#     **0.1.27 起再加选择器形态判据 S2/S3**，
#     **插件仓 CI 的严格腿判红** —— 在插件工程根 `npm run verify`）；
#     壳仓这条只扫宿主源码树，**够不着插件源码**（两条互不覆盖）
#     ⚠️ **旧版 SDK 的插件仓缺这条腿** ⇒ 新判据要**先发 SDK、再铺插件仓**（各仓 `npm install` 换新 SDK）
#   ⚠️ 其中 `check-reserved-names-doc-sync`（E6#109i，E6#109k-b 扩到关键帧）离线秒级：作者面
#     §12 的**两张表**——「保留名」列**只放 `ldk-` 名**（裸名类别已随 `classes` 一起退役）且必须
#     在宿主源码里真实存在；「保留的关键帧名」表与登记表 `keyframes` **双向**钉住；
#     中英两棵树的表名字集合必须相等 ⇒ **改保留名/关键帧名要同笔改三处**（登记表 ＋ 两棵树 §12 的两张表）

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
npm run audit:plugin-prefix       # 插件 CSS 前缀**只读审计**（E6#109h-b①）：列某仓「裸定义类名 / 关键帧
                     #   → 应改成的名字」（改名轮 ③–⑦ 的映射表、⑧ 的全量复核都复用它）
                     #   🔴 E6#109n-b 起**并列一节 token 段**（E6#109n-b）：自定义属性作用域的红/黄清单
                     #   （红参与 ok／黄只报——`--all` 18 仓全量复核用它；与腿同源：import 同一个函数）
                     #   `-- <仓目录>` 单仓｜`-- --all [<容器>]` 多仓（默认 E:\linkdesk-plugins\official）｜`-- --json`
                     #   ⚠️ 判据不在脚本里：它 import 的正是 `check-css-namespace` 腿的同一个函数（同源）
                     #   ⚠️ 依赖 SDK dist（先 build）；**只读不写**；渲染点/`animation:` 引用不在射程（见 17 号档 §四）
                     #   ⚠️ **故意不在 `npm run check` 链里**（与 `backfill:catalog-identity` 同款）：它要 dist，而 dist 是
                     #     .gitignore 的 ⇒ 接进去干净检出会当场红。**真门禁 = SDK 单测 18 例**（已随 vitest 挂在 check 里）；
                     #     本工具的 `--self-test` 是它自己的体检（memory `gate-selftest-must-be-wired` 的判据内例外）
npm run audit:plugin-prefix:selftest # 上者的正控/负控 7 例（含一条「腿与工具同源」的静态断言）
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
| 🔥 插件源码外移与上架（L7） | **`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/00-整理档案.md`**——源码真相源在插件仓、壳仓只留产物；九轮任务 + 交接.md（AI 一会话一轮接力）。🔴 **本层已于 2026-09-14 全层封层**（七条判据 ＋ 四本账 ＋ 回归对照 ＋ 三档计时全跑完，读数与 6 条真发现住 [08-全层验收 §五](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)）。**出厂种子保鲜 = 账 `bundled-plugins.lock.json`（谁随包看 `seed`）＋ 机制 `npm run sync:bundled` ＋ 门禁 `check-bundled-freshness`（挂 `npm run check`，默认联网）**；**插件仓的门禁在插件仓自己里**（`.github/workflows/ci.yml` + `npm run verify`，四段严格腿）——**壳仓的 `npm run check` 够不着插件源码**，两套互不覆盖，且 🔴 **「由各插件仓 CI 守」这句话有两处不成立**（N6 第 ④ 处锚 / 主题色规则，负控实证，见 [06-门禁与CI.md](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/06-门禁与CI.md) 与 memory `plugin-repo-gate-model` §九）。**作者面文档（`docs/03-插件制造/`）= 教学动线**（导览 ＋ 三档入口 ＋ 区域地图/区域间互动/组件速查/配置项/主题）——两条门禁管它：`check-author-docs-symbols`（禁内部任务号 ＋ **正文里的裸 `#` 坐标**，E6#109k-b）/ `check-author-docs-links`（出界链接必须报备在 `scripts/author-docs-outbound-allowlist.txt`）；**文档 npm 包** = `npm run docs:build` / `docs:check`（产物 `packages/plugin-docs/`，真源是两棵树）。**英文化后：作者面主显 = `docs/03-plugin-authoring/`（英文），中文原文 = `docs/03-插件制造/`；两棵树的篇目对齐由 `check-author-docs-bilingual` 守，跨树映射表写在该门禁的 `FILENAME_MAP`**。⚠️ **L7 之后作者面还欠七篇**（双击文件到渲染的握手 / 工作区文件读写 / 预览宿主能·不能表 / 哪条命令跑 tsc / 多视图数据住哪 / props 表 / `enumDescriptions` 教反了）——清单在 memory `author-face-doc-gaps-l7` |
| 已确认决策 | memory `design-decisions.md` |
| 🔴 **作者轴五个 npm 包怎么发版** | **`docs/06-发布管理/作者轴npm发版.md`**——五轴对照（contracts / plugin-sdk / create-linkdesk-plugin / ui / plugin-docs）＋ 发版五步（改 → bump → publish → `release:mark` → 同笔提交）＋ 三个实测坑（`--registry` 必带 / **contracts 要 `cd contracts && npm publish`** / 货架约 3 分钟复制延迟）＋ **第五节 npx 缓存暗礁**（裸 `npm create linkdesk-plugin` 会静默给旧模板 ⇒ 一律写 `@latest`）。**软件本体的发版另见** `docs/06-发布管理/发布清单.md` |
| 已知坑 | memory `bug-atlas` |
| 🔥 CSS 命名空间（裸类名 / 保留名 / 关键帧） | **`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md`**——🔴 **快照，不是进度真相源**（进度看同目录 交接.md 顶部队列）：文档同表读数（池文档 8 张样式表）＋ 全量分类总表（真案 `.badge`；**§三 已在 E6#109l／E6#109l-b 用门禁自己的解析口径重算并收官**：宿主 258 ＋ 共享组件 89 个独立定义**全部 `ldk-`**、**两个域的非 `ldk-` 独立定义均为 0**、关键帧 8 个全带前缀）＋ 处置五级。🔴 **共享组件那批裸名（`.badge` 起、到 1.21b 的 49 个上）已全部收进 `ldk-` 前缀——登记表 `classes` 整块已删，规则只剩一句**——处置的执行记录与逐轮交接在同目录 **[样式命名空间归一化/](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/00-整理档案.md)**（总档案 ＋ 逐轮详案（01–19 号）＋ 交接.md；🔴 **轮次进度与「还剩什么」的唯一真相源 = 交接.md 顶部的「剩余任务队列」表**）。机械兜底 = **`scripts/check-css-namespace.mjs`**（判据 ①③④⑤⑥⑦⑧⑨⑩⑪，挂 `npm run check`；判据①③ 同为结构性、④ 关键帧跨方重名、⑤ 登记表反向核对、⑥ = `ldk-` 名跨域唯一性、**⑨ = token 作用域**、**⑦ 共享组件族段 ／ ⑧ 关键帧引用不悬空 ／ ⑩ 宿主基线块（登记表 `scripts/css-selector-baseline.json`：文件 ＋ 条数）／ ⑪ 壳内夹具无锚·id**、判据② 已退役；**登记表只剩 `keyframes` 段**）＋ **`scripts/check-reserved-names-doc-sync.mjs`**（登记表 `keyframes` ↔ 作者面 §12 关键帧表**双向对账**；§12「保留名」列只放真实存在的 `ldk-` 名，挂 `npm run check`；改保留名要同笔改三处——登记表 ＋ 中英两棵树的 §12）；作者面纪律见 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)（**§12.1–§12.4 迁移说明**（对应 `@linkdesk/ui` 0.2.0→0.3.0 三轮改名）＋ **§12.5 自定义属性的作用域**（token 轴规则 ＋ 迁移表）＋ **§12.6 选择器形态**（R2 禁无锚 ＋ R3 跨方命中自带自有锚；**今天 0 存量 ⇒ 无需迁移**））。🔴 **同一专项的件 2「插件前缀不变量」也已整件落地（①–⑧ 全部 ✅，2026-09-16）**：规则 = 插件自有类名 / `@keyframes` 名一律 `<pluginId>-` 开头、`pluginId` 自身不得以 `ldk-` 开头；三条机械面 = **① 判据腿**（SDK 的 `check-css-namespace`，`@linkdesk/plugin-sdk` **0.1.25** 起随包下发，插件仓 CI 严格腿判红）＋ **② 只读映射表工具** `npm run audit:plugin-prefix`（`--all` 全量复核，18 仓 0 违规）＋ **③ schema 第二道防线**（`plugin.schema.json` 的 `pluginId.pattern` = `^(?!ldk-)…`，四份拷贝字节相等）。**含裸名的 4 仓（`file-tree`/`settings`/`serial-monitor`/`marketplace`，共 254 名 ＋ 3 关键帧）＋ 壳仓夹具 `panel-demo`（19 名）已逐仓清账**（③–⑦），⑧ 做了真发版与全量复核；作者面新规在两棵树 §12（＋ §12.2 迁移说明）。进度以交接.md 顶部队列为准。🔴 **第四条轴（选择器形态）：宿主 21 处顶层「非类名」选择器 = A 段 17（全部判为**有意的共享基线**）＋ id 4（只登记）；插件侧 0 处；规则 R0–R3 与判据⑦⑧⑩⑪（壳）／S2·S3（SDK，`@linkdesk/plugin-sdk` **0.1.27**）／轴 ④ 运行时镜像（探针）**已由 1.25 定案、1.26 全部落地**——🔴 **两条硬读数**：**轴 ④ 静态 17 ＝ 运行时 17**（改前静默丢 10）· **域边界不一致 1 → 0 个名字**（`.app-shell` → `.ldk-app-shell`，域三处逐字一致）；登记表 `scripts/css-selector-baseline.json`（**文件 ＋ 条数**，零名字清单）；规则正文与负控见 [32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)**。**硬约束 23** |
| 主题系统 | memory `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件，指到本文件与记忆索引；**记忆库重组时同笔更新它** |
