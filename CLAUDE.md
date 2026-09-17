# LinkDesk

> **Electron + React 18 + TypeScript 通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
> **历程**：V2（「名字写死 = 功能写死」之祸）→ V3 定圆形大厅 → Tauri P1-P6 ✅（2026-08-03）→ E1-E4 迁 Electron＋文件树/Monaco 插件 ✅ → E5–E5.6 归一化（封站）→ E5.7 极简 Pool（O(1)）✅ → E5.8 归一化基建 ✅ → E6。**废案**：Per-Tab WebView / 多 WebView / 双 Pool（O(N) 进程，被 E5.7 取代，结论见 memory `e5.7-extreme-simple-pool`）。
> **当前进度（2026-09-18）**：🚀 **E6 收官中**——L4/L5/L7 全部封站（2026-09-14）。L7 = 18 只发货插件源码外移各自独立仓（`Encaron/linkdesk-plugin-<id>`）＋ 官方目录 20 条 ＋ 出厂种子 6 只 ＋ 18 仓 CI 全绿；七条判据、四本账、回归对照读数住 [08-全层验收 §五](docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/08-全层验收.md)。软件 **0.2.11**、`@linkdesk/plugin-sdk` **0.1.34**、`@linkdesk/plugin-docs` **0.1.15**；🔴 **两轴归一化**：**样式命名空间四条轴**（类名/关键帧/token/选择器形态）**已收官**（1.20 收口）；**非样式命名空间归一化**（`E6#111` · 20 轮）**走到 1.49**——件 1 命令 id · 件 2 设置键 · 件 3 外观族 id · 件 4 上下文旗子 · 件 5 i18n 的**评估 ＋ 落地全完**，官方 18 仓清账全清（`audit:plugin-scope` 全 0），判据**已收紧为红**、宿主保留名账**已定稿进 SDK 0.1.34**、作者面两棵树已写齐，剩 **1 轮**（下一棒 = 1.50 本轴收口复核，**恒最后**），队列与「每格四件套」见 [非样式命名空间归一化/ 交接.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/)。🔴 **未推**：壳 `v0.2.11` 的 tag ＋ Release ＋ 18 仓 lock 提交（等用户当次点头 ＋ 带代理）。**剩 L6 安全加固与出厂判定，去向由用户拍板**。**进度唯一真相源：[E6-执行清单.md](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md)**。AI 接力 = 一个会话只做一个轮次。
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
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **标签页系统不持有卡片注册表**——卡片状态归插件自持（原 CardRegistry 骨架已随 E5.7#45.7 整删，未来重建亦不得进标签页系统）
4. **workspace.json 禁止嵌套**，必须一层平铺数组
5. **IPC 事件订阅必须用 generation counter 模式**（B11 教训，`useIpcEvent` 已内置）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 独立可替换，RingBuffer 接口 `{ cardId, value }` 是硬边界**——任何代码不得写死「只有这一种协议」
9. **核心无知原则**：往核心加东西前先问——加了之后核心更「知道自己是干什么的」了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 写死插件 ID**（`if (pluginId === "terminal")` / `PLUGIN_ICON_PATH` / `BOTTOM_ICONS` 等一切形式）。所有差异性行为走 plugin.json 声明 → Registry 消费。Phase 5g 把 `TabType` 改成 `string` 就是为消灭此模式——不要写回来
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
23. **🔥 CSS 类名是全局的——共享组件一律 `ldk-` 前缀，插件不得借宿主保留名**（一张样式表装着宿主+共享+所有插件 CSS，裸类名 = 全局标识符，`.badge` 案即此）。四条纪律：① 插件自有类名与 `@keyframes` 名一律 `<pluginId>-` 开头（缩写废弃）；② `ldk-` 整个命名空间属宿主侧，不许借——🔴 `pluginId` 自身不得以 `ldk-` 开头（schema `pattern` 已收窄）；③ 状态类一律复合（`.你的类.active`）；④ 🔴 token 定义作用域受结构约束——文档级只有宿主契约块能写，其余挂自有命名空间类之下，任何方禁定义 `ldk-*` 自定义属性；⑤ 🔴 选择器形态轴：类名/id 是「名字锚」，无锚选择器宿主只许在基线文件（`scripts/css-selector-baseline.json`，今天 = `src/index.css` 17 处）、插件禁无锚、跨方命中必须自带自有锚。机械兜底 = 宿主 `scripts/check-css-namespace.mjs`（判据①③④⑤⑥⑦⑧⑨⑩⑪）＋ SDK `check-css-namespace` 腿（0.1.25 起随包，插件仓 CI 判红；**新判据先发 SDK 再铺插件仓**）。规则正文见 [11-样式命名空间审计.md](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md)、[31 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)、[32 号档](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)、作者面 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)。**🔴 机制层不隔离**（`@layer`/Shadow DOM/CSS Modules/动态注入四路皆不采用，决策见 [docs/decisions/rejected/plugin-view-style-isolation.md](docs/decisions/rejected/plugin-view-style-isolation.md)，含 **5 条可判定触发条件**）——收口现状 = 「事实上不会发生」，**不是**「构造上不可能发生」，由约定＋静态门禁＋运行时探针三层覆盖。**🔴 十件套终态（E6#109 系列 2026-09-16 收官）**：四条轴结构性收口（宿主 **258** ＋ 共享组件 **89** 个独立定义**全部 `ldk-`**；插件侧 **18/18 仓零不合规**）· 静态门禁 **`35 道 —— 有自测＋已接线 34 ／ 豁免 1`** · 运行时探针**真跑零 red 跨方碰撞**（轴 ④ **静态 17 ＝ 运行时 17**、域边界不一致 **0**）；逐件读数 ＋ 四轴「改前 → 改后」对账 ＋ **残余边界六条**见 [35-系列收口报告](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/35-系列收口报告.md)。⚠️ **本条只管样式侧**——非样式面的同形问题（命令 id／设置键／外观族 id／上下文键／i18n 等）另立 **E6#111「非样式命名空间归一化」**专项（[00-整理档案](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/00-整理档案.md)）

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
npm run backfill:catalog-identity  # 目录条目身份图回填（--check / --self-test；依赖 SDK dist）
npm run audit:plugin-prefix # 插件 CSS 前缀只读审计（改名轮映射表；依赖 SDK dist；故意不接 check 链）
npm run audit:plugin-scope  # 插件侧「非样式命名空间」清账面（改名前逐仓清单；只读、不接 check 链；
                            #   ⚠️ 读 scripts/host-reserved.json（生成式）——壳仓命令/设置面改了要 npm run audit:plugin-scope:regen）
                            #   改容器：npm run audit:plugin-scope -- <容器目录>（默认 E:/linkdesk-plugins/official）
npm run audit:nonnaming     # 非样式命名空间普查探针（①命令 id ②设置键 ③外观族 ⑤协议 id…＋⑩b 账背对账；
                            #   2026-09-17（1.32）从 gitignore 的 scratch/ 搬进 scripts/，同笔删原件；只读、不接 check 链）
npm run audit:nonnaming:json # 上条的机读输出（--json）
npm run check:lockfile-sync # lockfile 同源门禁；升 packages/* 版本后必须重跑 npm install 同笔提交 lock
npm run lint / dev / electron:dev / npx tsc --noEmit / npx vitest run
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | `docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`（48 旧 bug 会怎么回来）＋ `00-迁移执行守则.md` |
| 🔥🔥🔥 加文件前 | `docs/开发管理/壳目录规范.md`——放错 = 返工（E5#42→#36k 教训） |
| 🔥🔥 改壳边界 | `docs/02-Electron架构/通道范式·设备插件独立.md`（改壳=加通用通道≠加设备业务） |
| 写插件 | `docs/03-插件制造/`（中文维护者面）；**作者面主显 = `docs/03-plugin-authoring/`**（英文树，双语对齐门禁守） |
| 🔥 插件源码外移与上架（L7） | `docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/00-整理档案.md`——已封层；出厂种子三件套与两套门禁的边界都写在 memory `plugin-source-external-repos` |
| 🔴 作者轴五个 npm 包发版 | `docs/06-发布管理/作者轴npm发版.md`（发版五步＋实测坑）；软件发版另见 `docs/06-发布管理/发布清单.md` |
| 🔥 CSS 命名空间 | `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md` ＋ 同目录 [样式命名空间归一化/](docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/)（**轮次进度唯一真相源 = 交接.md 顶部剩余任务队列**） |
| 已确认决策 / 已知坑 / 主题系统 | memory `design-decisions.md` / `bug-atlas` / `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件；**记忆库重组时同笔更新它** |
