# LinkDesk

> **Electron + React 18 + TypeScript 通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
> **历程**：V2（「名字写死 = 功能写死」之祸）→ V3 定圆形大厅 → Tauri P1-P6 ✅（2026-08-03）→ E1-E4 迁 Electron＋文件树/Monaco 插件 ✅ → E5–E5.6 归一化（封站）→ E5.7 极简 Pool（O(1)）✅ → E5.8 归一化基建 ✅ → E6。**废案**：Per-Tab WebView / 多 WebView / 双 Pool（O(N) 进程，被 E5.7 取代，结论见 memory `e5.7-extreme-simple-pool`）。
> **当前进度（2026-10-01）**：🚀 **E6 收官中**——**已封站 = L4 · L5 · L7 · L8 · L9 · L10 · L11**（L0–L3 含 L3.5–L3.7 更早已闭）。🔴 **未完成**：**① L6「安全加固与出厂判定」整层七格**（`#48a`/`#48b`/`#49a`/`#50a`/`#51a`/`#52a`/`#52b`，`#30.8e` 随 `#49`）——**整层未开工、等开工令**；**② 几条零散**：`#53a-b`（装配清单 profile）/ `#56a-b`（会话级自指插件）两条产出都是「设计文档 → 你拍板」· `#141`–`#143`（L10 待拍板三格）· `#161`（i18n 归属「谁的仓谁译文」＝**已收口**）· `#162`/`#163`（输出死命令退场／诊断日志归口＝唯一写入口＋5 MB×2 轮转＝「无限日志」断根；均立案即闭、随壳 v0.2.30 出货）· `#164`（变更日志·分发面裁剪：目录与 zip **同窗口 N=5** ＋ 壳 CHANGELOG 首次归档 189,840→68,585 B＝**已落地**）· `#165`（**插件主题名去双语化**：字面量只写中文原文＋译名住本仓字典＝「谁的仓谁译文」续篇；壳侧显示路径翻面＋判据扩域，官方各主题仓已发版；**同批两条边界同日还清**（`app.iconTheme` 下拉改显「id ＋ 显示名」，设置插件零改动；`label` 摘判据豁免）；壳侧已随 **0.2.33** 出货）。**逐格状态 · 派单门槛 · 层序账一律以 [E6-执行清单](docs/02-Electron架构/插件生态与发布/E6-执行清单.md) 为唯一真相源**（每层的任务账 / 实测读数 / 残余边界住各层 `00-整理档案.md`）。🟢 **E6 后迭代期**＝软件与插件按批攒发，台账 [软件 已落地/00-README](docs/04-软件更新/已落地/00-README.md) ＋ [05-插件更新/00-README](docs/05-插件更新/00-README.md)。**版本读数**（唯一真相源 = 各 `package.json`；改版同笔校准本行）：软件 **0.2.33** · `plugin-sdk` **0.1.66**（已上架；E6#165 图标主题 `label` 摘豁免）· `@linkdesk/ui` **0.2.34**（E6#166 起对货不对号·号自走）· `@linkdesk/contracts` **0.1.29** · `plugin-docs` **0.1.53** · `create-linkdesk-plugin` **0.1.20**。
> 🔴 **改本文件的章法（防「进度行长成巨无霸」复发）**：进度行只写「**现状 ＋ 指针**」——过程流水 / 逐格读数 / 版本沿革一律住上列台账与各层 `00-整理档案.md` · `交接.md`；**加一段就同笔删一段**（单笔净增有上限）。机械门禁 = `npm run check` 的 `check-claude-md`（全文 / 行数 / 单行 / 进度行 / 单笔净增 五条上限，与 `cost` 审计的 CLAUDE.md 判据同口径），判据与压缩标准见 skill `claude-md-maintenance` ＋ memory `claude-md-compression-criteria`。
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
10. **禁止在 core/ 或 pluginLoader/ 写死插件 ID**（`if (pluginId === "terminal")` / `PLUGIN_ICON_PATH` / `BOTTOM_ICONS` 等一切形式）。所有差异性行为走 plugin.json 声明 → Registry 消费。Phase 5g 把 `TabType` 改成 `string` 就是为消灭此模式——不要写回来。🔴 **同一条道理管到全仓**（2026-09-29 用户拍板）：**第三方插件的 id 不许出现在壳内任何文件**——代码、脚本、门禁/跳过名单、注释、文档、技能、清单全算；工具要跳过第三方仓一律**按现场目录/数据认**（⛔ 不写名单），叙述外部作者的实测来历一律写成「**2026-09 首次由外部独立 AI 作者用 npm 包（脚手架 ＋ SDK ＋ UI 包）制作插件时…**」——⛔ 不点名某只插件、不写「壳外作者做了某插件遇到某麻烦」；⭐ **同一条道理管「这批仓的名号」**（2026-10-01 拍板：「什么所谓『官方xx（某个数字）仓』，完全不要这个东西」）：⛔ 不许写「官方 N 仓／官方 N 只／官方插件 N 只」这类**编号名号**（数字会烂），一律写「**官方各仓**」；要读数就带日期（可写「那时 18 只插件仓」）
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
22. **🔥 软件侧用户可见变更提交前必须调 version-bump skill 判类别并报告版本判定**；改 `src/`/`electron/` 的 commit message 必须带 `feat:`/`fix:`/`breaking:` 前缀。三层机械兜底：`check-version-bump` 挂 lefthook `commit-msg`（不带前缀 = 提交被拒）＋ `check-changelog-section` 挂 check（bump 必同笔写 CHANGELOG 段）＋ 发版门禁再拦一次；逃生口 `--no-verify`（git 机制，如实记着）。⚠️ **惟一的例外（2026-09-29 实测补）＝「改动全是注释行」时不算软件侧代码**——判据 ④ 逐文件看 `git diff --cached -U0`，**每行 +/- 都是注释形态**（行首 `//` · 块注释起止 · JSDoc 续行 `*` · JSX `{/*`）⇒ 免分类；判定一律偏保守（**认不出就当代码、仍拦**；新增文件不适用；读不到 diff 不豁免），自测 **34 例**。理由：注释不执行，本约束管的是**行为改动**——而「档案搬家改指注释里的路径」这类**文档搬笔**若被逼挂 `fix:` = 撒谎、走 `--no-verify` = 绕过全部钩子，两条都比判据本身更坏
23. **🔥 CSS 类名是全局的——共享组件一律 `ldk-` 前缀，插件不得借宿主保留名**（一张样式表装着宿主+共享+所有插件 CSS，裸类名 = 全局标识符，`.badge` 案即此）。五条纪律：① 插件自有类名与 `@keyframes` 名一律 `<pluginId>-` 开头（缩写废弃）；② `ldk-` 整个命名空间属宿主侧，不许借——🔴 `pluginId` 自身不得以 `ldk-` 开头（schema `pattern` 已收窄）；③ 状态类一律复合（`.你的类.active`）；④ 🔴 token 定义作用域受结构约束——文档级只有宿主契约块能写，其余挂自有命名空间类之下，任何方禁定义 `ldk-*` 自定义属性；⑤ 🔴 选择器形态轴：类名/id 是「名字锚」，无锚选择器宿主只许在基线文件（`scripts/css-selector-baseline.json`，今天 = `src/index.css` 17 处）、插件禁无锚、跨方命中必须自带自有锚。机械兜底 = 宿主 `scripts/check-css-namespace.mjs` ＋ SDK `check-css-namespace` 腿（0.1.25 起随包，插件仓 CI 判红；**新判据先发 SDK 再铺插件仓**；今天腿内七条判据 = 前缀/类名/关键帧名 · token 作用域 · 选择器形态 · 关键帧引用悬空 · 悬空名 · 自有类名引用悬空）。**🔴 机制层不隔离**（`@layer`/Shadow DOM/CSS Modules/动态注入四路皆不采用）——现状 = 「事实上不会发生」，**不是**「构造上不可能发生」，由约定＋静态门禁＋运行时探针三层覆盖。判据正文 / 逐件读数 / 四轴对账 / 残余边界见 [11-样式命名空间审计.md](docs/02-Electron架构/插件生态与发布/01-插件独立构建/11-样式命名空间审计.md)、[31 号档](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/31-任务-token轴门禁与清账.md)、[32 号档](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md)、[35-系列收口报告](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/35-系列收口报告.md)、作者面 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)、否决决策 [decisions/rejected/plugin-view-style-isolation.md](docs/decisions/rejected/plugin-view-style-isolation.md)（含 5 条可判定触发条件）。⚠️ **本条只管样式侧**——非样式面的同形问题（命令 id／设置键／外观族 id／上下文键／i18n 等）另立 **E6#111「非样式命名空间归一化」**（[00-整理档案](docs/02-Electron架构/插件生态与发布/01-插件独立构建/非样式命名空间归一化/00-整理档案.md)）

24. **🔥 「发版」= 用户能在软件里点更新，不是「GitHub 上有个 Release」**——发完必须能回答一句：**用户现在打开软件，点得到这个更新吗？**（用户 2026-09-27 原话：「让你发版的意思就是让我直接能在软件里点更新，以后记住」）。**壳轴** = bump ＋ CHANGELOG 段 ＋ tag → CI 出安装包 → Release 资产齐 → 旧版实机「检查更新」真装上；**插件轴多一步、且是决定性的那一步 = 官方目录收录**（`Encaron/linkdesk-marketplace`）——插件仓根那份 `marketplace.json` 只是**它自己的**市场源，**不收录，用户在软件里永远点不到**；顺序 `build`（⚠️ `publish` **不重建**，只上传仓内现成产物）→ `publish` → **收录** → `sync:bundled --latest`。⚠️ 两轴都有一段**不可见窗口**（细则见发布清单）。🟢 **发版已全授权**：2026-09-28 —— 作者轴四包随时可发、不必逐次问；2026-09-29 ——「软件的发版，插件的发版，npm 包的发版，我全部授权你了」⇒ **软件本体（壳 / 安装版）同授权**；🔴 两边同一条硬要求：**发就走到端**；🟢 **`git push` 已常态化授权（推必带代理 127.0.0.1:7890）**；⛔ 撤版与改写已发布 tag 仍归用户。细则 [docs/06-发布管理/发布清单.md](docs/06-发布管理/发布清单.md)，记忆 `release-means-in-app-updatable` ＋ `release-discipline-three-axes`
25. **🔥 面板层（Pool 渲染进程）禁用 `input.click()` 弹文件选择框——一律走主进程 `dialog` 通道**（E5.7 极简 Pool 的结构性坑：面板层没有原生窗口上下文，跨窗文件手势会失效或挂起；2026-09-26 立规矩，落点 = dialog 通道注释 ＋ 命名空间矩阵）
26. **🔥 AI 可操作面是常驻纪律**（AI 友好化系列 `AI#49` 立，2026-09-29——**不是一次性交付，此后每个新功能/新插件都适用**）：① **每个用户动作至少一条非鼠标路径**（命令 / API / CLI）——鼠标手势可以是给人用的手感，⛔ 不得是唯一路径；OS 层够不着的如实列册；② **业务动作注册为命令**，且注册 meta **必带 `description` ＋ `params`**（缺了 AI 读得到命令、却得猜参数——实测踩过）；③ 达标 = **结构化操作**（读结构化状态 → 调命令带参数 → 读结构化结果），⛔ 不是「截图 → 视觉理解 → 猜坐标点击」的视觉循环；④ **验收同样与物理指针无关**（命令/API/CLI 驱动；hover 面口径见 [设计 §三 验收面](docs/04-软件更新/已落地/AI友好化-全自动操作/01-设计.md)）。机械自查 = `npm run audit:plugin-commands`（**只报不拦**，⛔ 不进 check）＋ `npm run manual:build`（手册漂移门禁）；作者面 = [21-插件命令化规范.md](docs/03-插件制造/21-插件命令化规范.md)；系列账 = [AI-执行清单.md](docs/04-软件更新/已落地/AI友好化-全自动操作/AI-执行清单.md) ／收口 [06-系列收口报告.md](docs/04-软件更新/已落地/AI友好化-全自动操作/06-系列收口报告.md)

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
#   ⚠️ 三个坑：check-bundled-freshness 默认联网比对官方目录（离线用 --offline）· check-scaffold 需 git 在 PATH · check-css-namespace 判据面见硬约束 23 与 31/32 号档
#   ⚠️ 插件侧的腿在 SDK（插件仓 CI 判红）；壳仓 check 够不着插件源码，两套互不覆盖
npm run sync:bundled        # 出厂种子保鲜（--latest 显式追新 / --offline 只校验指纹）
npm run sync:plugin-ci      # 插件仓门禁铺装（只写本地容器，不碰 git）
npm run sync:plugin-agents  # 插件仓的 AGENTS.md（唯一维护入口，别手改；--check 漂移门禁）
npm run pull:plugins        # 本地容器拉最新——只拉不推；🔴 容器哪级被 git init 就红着喊
npm run docs:build          # 作者面文档包产物（docs:check 与真源逐字节比对，挂 check）
npm run manual:build        # AI 操作手册 02 章生成区刷新（⛔ 别手改那两段；门禁 = aiManualIndex.test.ts 逐字节比对＋三条负控；故意不接 check-gate-health〔域外〕）
npm run backfill:catalog-identity  # 目录条目身份图回填（--check / --self-test；依赖 SDK dist）
npm run audit:plugin-prefix / audit:plugin-scope / audit:plugin-dead-css / audit:plugin-tests / audit:nonnaming / audit:nonnaming:json
                            # 六条只读尺（E6#113 死 CSS · #153 测试覆盖 · #111 非样式命名空间 …）——只报不拦、⛔ 不接 check 链、
                            #   需插件容器在场、依赖 SDK dist；壳仓命令/设置面改了要走 audit:plugin-scope:regen（读 scripts/host-reserved.json）
npm run dev:driver          # dev 验收 driver（D0 系列外；⛔ 故意不接 check 链——要活实例）——隔离实例 / LINKDESK_CDP / --selftest / --handshake 全在 scripts/dev/README.md
npm run check:lockfile-sync # lockfile 同源门禁；升 packages/* 版本后必须重跑 npm install 同笔提交 lock
npm run ui:build            # 🔴 改了壳共享组件（src/components/shared/**）后必跑——ui 的 dist 是构建产物、dev 轨道解析的就是它，不重建则 dev 里看不到任何变化（机制见 L9 00-整理档案）；打包轨道不用手跑（build-pool-vendor 有保鲜）
npm run lint / dev / electron:dev / npx tsc --noEmit / npx vitest run
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | `docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`（48 旧 bug 会怎么回来）＋ `00-迁移执行守则.md` |
| 🔥🔥🔥 加文件前 | `docs/开发管理/壳目录规范.md`——放错 = 返工（E5#42→#36k 教训） |
| 🔥🔥 改壳边界 | `docs/02-Electron架构/通道范式·设备插件独立.md`（改壳=加通用通道≠加设备业务） |
| 写插件 | `docs/03-插件制造/`（中文维护者面）；**作者面主显 = `docs/03-plugin-authoring/`**（英文树，双语对齐门禁守） |
| 🔥 插件源码外移与上架（L7） | `docs/02-Electron架构/插件生态与发布/插件源码外移层/00-整理档案.md`——**已封站**（18 只插件源码各移独立仓）；种子三件套与两套门禁边界见 memory `plugin-source-external-repos`，读数 = 同夹 `08-全层验收.md` |
| 🔥 插件兼容机械化（L8） | `docs/02-Electron架构/插件生态与发布/插件兼容机械化/00-整理档案.md`——`E6#114`-`#120` **已落地**（悬空名核验 / 只加不删门禁 / 退役登记 / 兼容读数 / 市场显示状态 / 判据铺开 / 通用悬停提示卡 `HintCard`）；🔴 **用户面文案只许五个词**（正常 / 兼容 / 部分不适配 / 不适配 / —，词表与禁词见总纲 §〇d）；生命周期三段与四件机械件现状见 memory `plugin-lifecycle-three-tier`；队列真相源 = 同夹 `交接.md` |
| 🔥 UI 集中供给（L9） | `docs/02-Electron架构/插件生态与发布/UI集中供给/00-整理档案.md`——`E6#121`-`#130`（含 `#127a`）**已全层收官 2026-09-19**：`@linkdesk/ui` 从「编译进插件 bundle」翻转为「池 vendor 单实例供给」（react external 推广；插件代码 / 契约零改动）；🔴 **契约纪律 = 导出面只加不删 ＋ 同版本内行为不变**；**版本重锚 = ui 与壳同号锁步**（`E6#124` 定案，0.3.x 线弃用）；**皮骨拍板 = 皮全开放 / 骨不开放**（壳 chrome 结构永不作为插件能力）；队列真相源 = 同夹 `交接.md` |
| 🔥 第三方作者实测反馈落地（L10） | `docs/02-Electron架构/插件生态与发布/第三方作者实测反馈落地/00-整理档案.md`——`E6#132`-`#143` 十二格；**`#132`-`#140` 已收官**（**壳不动**，发版全落作者轴四包），**`#141`-`#143` 待拍板**（[04-待拍板方向题.md](docs/02-Electron架构/插件生态与发布/第三方作者实测反馈落地/04-待拍板方向题.md)）；🟢 2026-09-28 用户预授权：作者轴四包任务执行阶段随时可发、不必逐次问；队列真相源 = 同夹 `交接.md` |
| 🔥 插件测试覆盖层（L11） | `docs/02-Electron架构/插件生态与发布/插件测试覆盖层/00-整理档案.md`——`E6#144`-`#157` **已全层收官 2026-09-26**：8 份同体 `vitest.setup.ts` 收进 SDK 一个 subpath 真源 ＋ 脚手架与 18 仓铺开 ＋ 五仓补纯逻辑与替身层测试（「纯逻辑零测试」清零）＋ 覆盖尺 `npm run audit:plugin-tests`（**已升「拦」**：模板 `ci-verify.mjs` 第六段判红）；🔴 **官方各仓默认不 bump**（例外 = 补测碰出真 bug ⇒ `fix:` ＋ 目录收录，已三次兑现）；⛔ **第三方作者仓不代改**（⛔ 壳内不写它的 id——硬约束 10 同一条道理）；13 只声明式仓有据豁免；队列真相源 = 同夹 `交接.md`；⚠️ 一个会话只做一个轮次 |
| ✅ **AI 友好化-全自动操作（已收口 · 已归档 `已落地/`）** | [00-README](docs/04-软件更新/已落地/AI友好化-全自动操作/00-README.md)——把「一个能够完全自动化的软件」落成工程件（判据 = **可读 · 可操作 · 可查**）；**5 模块 ＋ 收口 / 62 格（`AI#1`–`AI#49` ＋ 生长格全销）· 六轮 62 / 62 全收口 2026-09-29**；台账 [AI-执行清单.md](docs/04-软件更新/已落地/AI友好化-全自动操作/AI-执行清单.md)（**进度唯一真相源**）· 收口 [06-系列收口报告.md](docs/04-软件更新/已落地/AI友好化-全自动操作/06-系列收口报告.md) · 接力 [交接.md](docs/04-软件更新/已落地/AI友好化-全自动操作/交接.md)；⚠️ 量级实证 = **门外每加一条命令 ⇒ 必然一次 lang-defaults 发版 ＋ 官方目录收录 ＋ 种子追新**；产出面见下行（AI 操作手册）＋ 硬约束 26 |
| 🟡 **AI 操作手册** | [docs/07-AI操作手册/](docs/07-AI操作手册/00-README.md)——给**不读源码的 AI**（用户机器零源码）的操作面，判据 = **可读 · 可操作 · 可查**：`00-README` 导航 · `01-路径总览`（三层门＝命令面／契约 API／CLI+MCP ＋ token 占位铁律）· `02-命令与API索引`（**生成式**，`npm run manual:build` 刷新、门禁逐字节盯漂）· `03`–`06`（按任务操作／手势隐藏规则／够不着清单／CDP 坑表）· `07-如何接入`。🔴 **随安装包发货 ＋ 软件内可打开**（用户点名硬要求）= `AI#16` **已接线**：安装版落 `resources/ai-manual/`（`electron-builder.yml` extraResources）＋ 池侧壳视图 `ai-manual` ＋ 命令 `app.openAiManual` ＋ 菜单 帮助 |
| 🗂 **E6 剩余任务与派单序** | [E6-剩余任务分档-派单序.md](docs/02-Electron架构/插件生态与发布/E6-剩余任务分档-派单序.md)——⚠️ **该档「未勾账」表停在 2026-09-19/25，状态一律以 `E6-执行清单.md` 为准**（本档只写顺序与派单门槛，⛔ 不复制正文）；🔴 档头纪律 = **完成的条目整段删**（记录在执行清单与收口报告里，别在这里堆「已完成」） |
| 🔴 作者轴五个 npm 包发版 | `docs/06-发布管理/作者轴npm发版.md`（发版五步＋实测坑）；软件发版另见 `docs/06-发布管理/发布清单.md` |
| 🔥 CSS 命名空间 | `docs/02-Electron架构/插件生态与发布/01-插件独立构建/11-样式命名空间审计.md` ＋ 同目录 [样式命名空间归一化/](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/)（**轮次进度唯一真相源 = 交接.md 顶部剩余任务队列**） |
| 已确认决策 / 已知坑 / 主题系统 | memory `design-decisions.md` / `bug-atlas` / `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件；**记忆库重组时同笔更新它** |
