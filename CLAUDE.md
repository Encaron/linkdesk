# LinkDesk

> **Electron + React 18 + TypeScript 通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
> **历程**：V2（「名字写死 = 功能写死」之祸）→ V3 定圆形大厅 → Tauri P1-P6 ✅ → E1-E4 迁 Electron＋文件树/Monaco 插件 ✅ → E5–E5.6 归一化（封站）→ E5.7 极简 Pool（O(1)）✅ → E5.8 归一化基建 ✅ → E6。**废案**：Per-Tab / 多 WebView / 双 Pool（O(N) 进程，被 E5.7 取代，见 memory `e5.7-extreme-simple-pool`）。
> **当前进度（2026-10-06）**：🚀 **E6 收官中**——**已封站 = L4 · L5 · L7–L11**（L0–L3 含 L3.5–L3.7 更早已闭）。🔴 **未完成** = **① L6「安全加固与出厂判定」整层七格（未开工 · 等开工令）** ＋ **② 几条零散**（装配清单 profile · 会话级自指插件 · L10 待拍板三格 · i18n 归属 …）。🆕 **最近收口** = [插件最低壳版本门禁](docs/04-软件更新/已落地/插件最低壳版本门禁/00-README.md)：`minAppVersion` 从手写变「按 `@linkdesk/ui` 账本算出」——G1 账本／G2 SDK 门禁／G3 作者面／G4 读数腿／G5 发布链黄灯全落＋验收过表、2026-10-06 归档；存量回归 settings→0.2.48／editor→0.2.13 已落各插件仓。**逐格状态 · 派单门槛 · 层序账一律以 [E6-执行清单](docs/02-Electron架构/插件生态与发布/E6-执行清单.md) 为唯一真相源**（各层任务账 / 实测读数 / 残余边界住各层 `00-整理档案.md`）。🟢 **E6 后迭代期**＝软件与插件按批攒发，台账 [软件](docs/04-软件更新/已落地/00-README.md) ＋ [插件](docs/05-插件更新/00-README.md)；🔧 **发版测试期**实机问题账面见 [发版后问题台账](docs/04-软件更新/已落地/安装界面自绘/发版后问题台账.md)。**版本读数**（唯一真相源 = 各 `package.json`，改版同笔校准本行）：软件 **0.2.49**（dev 攒批 · ⛔ 未发版）· `plugin-sdk` **0.1.84** · `@linkdesk/ui` **0.2.47** · `@linkdesk/contracts` **0.1.41** · `plugin-docs` **0.1.69** · `create-linkdesk-plugin` **0.1.24**。
> 🔴 **改本文件的章法**：进度行只写「**现状 ＋ 指针**」——流水 / 逐格读数 / 版本沿革住上列台账与各层 `00-整理档案.md` · `交接.md`；**加一段同笔删一段**。机械门禁 = `npm run check` 的 `check-claude-md`（全文 / 行数 / 单行 / 进度行 / 单笔净增 五条上限，与 `cost` 审计同口径）；判据见 skill `claude-md-maintenance` ＋ memory `claude-md-compression-criteria`。
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

**核心准入标准（三条同时满足才放 `src/core/`）**：① 多提供方 ② 多消费方 ③ 桌子不知道内容。有一条不满足 → 放插件里——⚠️ **但消费宿主声明的控件 / 动作例外（硬约束 28）**：它即使「单提供方」也必须住壳或 `@linkdesk/ui` 共享件。详见 memory `core-admission-criteria`。**核心无知原则**（硬约束 9）：核心不知道软件是干什么的。标签页系统永不持有卡片注册表（硬约束 3）。

## 历史脉络

> Tauri 时代存档 `docs/01-Tauri_P1至P5.5/` · Electron 各期存档 `docs/02-Electron架构/` · 完整脉络 memory `evolution-chronicle`。**E5–E5.6 弯路只记结论**：多 WebView / Per-Tab / 双 Pool 全废弃。**旧账已清、别再当待办**：卸载相关六项结构性改进 2026-07-24 起陆续做完（memory `bug-atlas` §A1 §A3）。**活到今天的成果**：`linkdesk.*` 命名空间 API（`electron/preload-pool/namespaces-*.ts`）＋ ESLint 自定义防线（硬约束 13/14 兜底）。

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
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）——⚠️ **例外（2026-09-28 设计裁决，`AI#8`）**：命令/参数元数据的 `description` 是**声明数据、不是 UI 文字**（消费方 = 契约 → AI，零渲染消费方）⇒ `scripts/audit-i18n.mjs` **按属性名排除** `description:`。🔴 **撤销条件：命令说明一旦进 UI，排除同笔撤销并补译**
3. **标签页系统不持有卡片注册表**——卡片状态归插件自持（原 CardRegistry 骨架已随 E5.7#45.7 整删，未来重建亦不得进标签页系统）
4. **workspace.json 禁止嵌套**，必须一层平铺数组
5. **IPC 事件订阅必须用 generation counter 模式**（B11 教训，`useIpcEvent` 已内置）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 独立可替换，RingBuffer 接口 `{ cardId, value }` 是硬边界**——任何代码不得写死「只有这一种协议」
9. **核心无知原则**：往核心加东西前先问——加了之后核心更「知道自己是干什么的」了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 写死插件 ID**（`if (pluginId === "terminal")` / `PLUGIN_ICON_PATH` / `BOTTOM_ICONS` 等一切形式）——差异性行为全走 plugin.json 声明 → Registry 消费（Phase 5g 把 `TabType` 改成 `string` 即为此，⛔ 别写回来）。🔴 **同一条道理管到全仓**（2026-09-29 拍板）：**第三方插件的 id 不许出现在壳内任何文件**（含代码 / 脚本 / 门禁与跳过名单 / 注释 / 文档 / 技能 / 清单）；工具跳过第三方仓一律**按现场目录/数据认**（⛔ 不写名单）；叙述外部作者来历一律写「**2026-09 首次由外部独立 AI 作者用 npm 包（脚手架 ＋ SDK ＋ UI 包）制作插件时…**」，⛔ 不点名插件、不写「壳外作者做某插件遇到某麻烦」；⭐ **同一条道理管仓名号**（2026-10-01 拍板）：⛔ 不写「官方 N 仓／N 只」这类**编号名号**（数字会烂），一律写「**官方各仓**」，要读数带日期（如「那时 18 只插件仓」）。
11. **插件身份唯一来源是 plugin.json 声明字段**。🔴 「插件身份 id」= 顶层 `pluginId`（发布后永不可变；`derivePluginId` 目录名兜底只为兼容存量）；`core: true` 仅 = 卸载按钮隐藏（纯 UI 防误删旗标）；注释禁发明 schema 没有的分类名词（「工厂插件」「内置插件」）——用字段名。🔴 **插件只有一个等级**——目录平铺单根，⛔ 无 builtin/user 之分；**设置页那套内置 UI 同样只是一台普通「设置插件」**（默认激活、可被第三方**整套替换**、可多套并存）⇒ ⛔ 说「设置插件属于壳」即错（2026-10-02 用户「大错特错」）。
12. **🔥 禁止硬编码路径——资产路径一律 `getAssetPath()`**（`src/core/utils/assetPath.ts`）。dev 下 `http://localhost:1420` 能工作只是巧合，打包后 `file://` 全炸。插件作者自定义图标同走 `resolvePluginIcon`
13. **🔥 async 初始化必须防 StrictMode 双重 effect 竞态**——第二次调必须返回第一次的进行中 Promise（`_loadingPromise`），不能 return undefined（memory `invisible-bugs-lesson-59c` Bug 1）
14. **🔥 useEffect 有回调 prop 做非 DOM 副作用时必须加活跃守卫**（`if (!open) return;` 且纳入依赖数组）；写完 grep 同组件其他 effect——漏守卫的就是 bug（同上 Bug 2）
15. **🔥🔥🔥 出了隐形 bug 不要猜——`git checkout` 逐 commit 二分定位**。找到最后正常与首个异常之间的 diff，bug 就在那个 commit 里
16. **🔥🔥🔥🔥 任何 CSS/样式/配色/字体/间距/布局改动前，必须先经 `Skill` 调设计 skill 拿设计系统**（默认 `ui-ux-pro-max`；可竞标 taste 系 / impeccable，见 memory `design-skills-inventory`）——不调 = 违反硬约束；落地走 CSS 变量，禁硬编码 hex/px。🔴 **技能住用户级**：impeccable 真身 = `C:/Users/fengy/.agents/skills/impeccable`（≥4.5），工程内 `.claude/skills/impeccable` 只是**入口联接**（2026-10-03 出库，⛔ 别 force-add 回仓）。
17. **🔥 `useRef` 不得用于影响渲染输出的状态**——渲染决策走 `useState`；ref 仅用于 DOM 引用、前值对比、generation counter（#58e 教训：全插件标签页空白）
18. **🔥 Electron 窗口顶部 30px 是 `-webkit-app-region: drag` 拖拽区**——所有 fixed 叠加层必须 `top: 30px` 起步（OS 级截事件，`z-index` 无效）
19. **🔥 禁止模块级 `_initialized` guard + IPC 监听器注册**——导入即执行 = 永不清理 = 僵尸回调。IPC 监听走 `useEffect` + 引用计数；ESLint `linkdesk/no-module-level-ipc-listener` 机械拦截
20. **🔥 preload 的 IPC 监听器必须在模块顶层注册**（`contextBridge.exposeInMainWorld` 之前），用缓冲+回放模式——mount 前到达的事件不能丢（E5#11l Bug 4）
21. **🔥 测试 fixture 禁真实插件名 + 真实 UI 文案**——一律虚构值（`demo-plugin`/`Demo View`）。边界：断言被测代码产出的真实文案不算违规；loader 等验证真实接线必须用真 id 的除外
22. **🔥 软件侧用户可见变更提交前必须调 version-bump skill 判类别并报告版本判定**；改 `src/`/`electron/` 的 commit message 必须带 `feat:`/`fix:`/`breaking:` 前缀。三层机械兜底：`check-version-bump` 挂 lefthook `commit-msg` ＋ `check-changelog-section` 挂 check ＋ 发版门禁；逃生口 `--no-verify`（如实记着）。⚠️ **惟一例外（2026-09-29）＝「改动全是注释行」不算软件侧代码**——逐文件看 `git diff --cached -U0`，**每行 +/- 都是注释形态**（`//` · 块注释起止 · JSDoc 续行 `*` · JSX `{/*`）⇒ 免分类；判定偏保守（**认不出当代码、仍拦**；新增文件不适用；读不到 diff 不豁免）。理由：本约束管**行为改动**，而「文档搬笔」若被逼挂 `fix:` = 撒谎、走 `--no-verify` = 绕过钩子——两条都更坏
23. **🔥 CSS 类名是全局的——共享组件一律 `ldk-` 前缀，插件不得借宿主保留名**（一张样式表装着宿主＋共享＋所有插件 CSS，裸类名 = 全局标识符，`.badge` 案即此）。五条纪律：① 插件自有类名与 `@keyframes` 名一律 `<pluginId>-` 开头；② `ldk-` 命名空间属宿主不许借——🔴 `pluginId` 自身不得以 `ldk-` 开头（schema `pattern` 已收窄）；③ 状态类一律复合（`.你的类.active`）；④ token 定义作用域受结构约束——文档级只有宿主契约块能写，其余挂自有命名空间类之下，禁定义 `ldk-*` 自定义属性；⑤ 选择器形态轴：类名/id 是「名字锚」，无锚选择器宿主只许在基线文件（`scripts/css-selector-baseline.json`）、插件禁无锚、跨方命中必自带自有锚。机械兜底 = 宿主 `scripts/check-css-namespace.mjs` ＋ SDK `check-css-namespace` 腿（0.1.25 起随包判红插件仓 CI；**新判据先发 SDK 再铺插件仓**）。**🔴 机制层不隔离**（`@layer`/Shadow DOM/CSS Modules/动态注入四路皆不采用）——现状 = 「事实上不会发生」而非「构造上不可能」，靠约定＋静态门禁＋运行时探针三层覆盖。判据正文/读数/四轴对账/残余边界见 [11-样式命名空间审计.md](docs/02-Electron架构/插件生态与发布/01-插件独立构建/11-样式命名空间审计.md) ＋ [样式命名空间归一化/](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/)、作者面 [05-插件UI写法规约 §12](docs/03-插件制造/05-插件UI写法规约.md)、否决决策 [plugin-view-style-isolation.md](docs/decisions/rejected/plugin-view-style-isolation.md)。⚠️ **本条只管样式侧**——非样式面同形问题（命令 id／设置键／外观族 id／上下文键／i18n）另立 **E6#111**（[00-整理档案](docs/02-Electron架构/插件生态与发布/01-插件独立构建/非样式命名空间归一化/00-整理档案.md)）。

24. **🔥 「发版」= 用户能在软件里点更新，不是「GitHub 上有个 Release」**——发完必须能回答：**用户现在打开软件，点得到这个更新吗？**（用户 2026-09-27 原话：「让你发版的意思就是让我直接能在软件里点更新」）。**壳轴** = bump ＋ CHANGELOG 段 ＋ tag → CI 出安装包 → Release 资产齐 → 旧版实机「检查更新」真装上；**插件轴多决定性一步 = 官方目录收录**（`Encaron/linkdesk-marketplace`）——插件仓根那份 `marketplace.json` 只是**它自己的**市场源，**不收录，用户在软件里永远点不到**；顺序 `build`（⚠️ `publish` **不重建**，只上传仓内现成产物）→ `publish` → **收录** → `sync:bundled --latest`。⚠️ 两轴都有**不可见窗口**。🟢 **发版已全授权**（2026-09-28 作者轴四包 · 2026-09-29 软件/插件/npm 全授权，**发就走到端**）；🔴 **2026-10-03 收窄：壳不发版、只走 dev 攒批**（发一次 20 分钟太慢，攒够更新点再发）；🟢 **`git push` 常态化授权（推必带代理 127.0.0.1:7890）**；⛔ 撤版与改写已发布 tag 仍归用户。细则 [发布清单](docs/06-发布管理/发布清单.md) ＋ memory `version-and-release`。
25. **🔥 面板层（Pool 渲染进程）禁用 `input.click()` 弹文件选择框——一律走主进程 `dialog` 通道**（E5.7 极简 Pool 的结构性坑：面板层没有原生窗口上下文，跨窗文件手势会失效或挂起；2026-09-26 立规矩，落点 = dialog 通道注释 ＋ 命名空间矩阵）
26. **🔥 AI 可操作面是常驻纪律**（`AI#49` 立，2026-09-29——**不是一次性交付，此后每个新功能/新插件都适用**）：① **每个用户动作至少一条非鼠标路径**（命令 / API / CLI），鼠标手势可留作手感但 ⛔ 不得是唯一路径，OS 层够不着的如实列册；② **业务动作注册为命令**，注册 meta **必带 `description` ＋ `params`**（否则 AI 读得到命令却得猜参数）；③ 达标 = **结构化操作**（读结构化状态 → 调命令带参数 → 读结构化结果），⛔ 不是「截图 → 视觉理解 → 猜坐标点击」；④ **验收同样与物理指针无关**（命令/API/CLI 驱动；hover 面口径见 [设计 §三](docs/04-软件更新/已落地/AI友好化-全自动操作/01-设计.md)）。机械自查 = `npm run audit:plugin-commands`（**只报不拦**，⛔ 不进 check）＋ `npm run manual:build`（手册漂移门禁）；作者面 [21-插件命令化规范.md](docs/03-插件制造/21-插件命令化规范.md)；系列账 [AI-执行清单.md](docs/04-软件更新/已落地/AI友好化-全自动操作/AI-执行清单.md)。

27. **🔥 用户机落点必须先登记**（2026-10-02 拍板「哪些东西该放在哪里必须心里有数，坚决禁止乱放」）——任何新增「写盘 / 写注册表 / 建快捷方式」的代码，**先在 [用户机落点规范](docs/开发管理/用户机落点规范.md) 总账里加一行再落代码**（谁写 / 谁删 / 卸载怎么处置）；同类数据一处一个落点，只许标准位（`%APPDATA%` / `%LOCALAPPDATA%` / `%TEMP%`／已知文件夹 API），⛔ 禁自造路径（反例 `%APPDATA%\Temp`）。机械兜底 = `scripts/check-install-surface.mjs`（挂 `check`）：开发机绝对路径 · 自造落点 · 未登记 `app.getPath` 键 · 注册表写碰 HKLM · 登记表与豁免账本自洽。
28. **🔥 能力落位：消费宿主声明的控件 / 动作住壳或 `@linkdesk/ui` 共享件**（2026-10-06 拍板）——宿主面 = 插件清单 / `contributes.fileAssociations` / 配置项 / 主题 · 图标 · 键位；⛔ **不许「先放插件、等第二个再共享」**（D10 反向用法已废止——D10 只管「别为假想消费者提前造共享件」，管不了「已有人要的能力该住哪层」）。机械兜底 = `npm run check` 七条腿（R1 跨仓命令 id · R2 宿主声明落位 · R3 菜单项可执行 · R4 第二份实现 · R5 壳命令常量对账 · R6 共享件零壳依赖 · R7 插件仓自足）。判据 A ＋ 三问 ＋ 落位表 ＝ [新能力设计流程 §十](docs/开发管理/新能力设计流程.md) ＋ [纠正案 05](docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md)。

## 部件命名速查

固定名称，不用「三栏中间那个」。详见 `docs/总体设计/V3-部件命名规范.md`。图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）；主区顶部标签栏，最上顶栏，最下状态栏。

## 关键设计与反模式——不要改

- **keep-alive**：所有面板绝对定位平级渲染，CSS display 切换（条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）**：面板 key=groupId 永远不变（递归嵌套会 unmount 面板）；递归分屏 SplitNode 树，MAX_TREE_DEPTH=4
- **独立 RingBuffer 多消费者**（串口数据是流不是事件）；drop zone 照抄 VS Code（SPLIT_THRESHOLD=0.25，不自创算法）
- **插件 = 独立构建产物**（Vite 逐插件打包）；核心不认 pluginId，行为全走声明；欢迎页是壳兜底（`tabBehavior.isFallback`）
- **不要把壳级功能放在插件里**——自检：「卸载所有插件后还能用吗？」（B79：CommandPalette 寄生 terminal → 无终端时 Ctrl+Shift+P 无效）
- **不要说「插件做不了」**（插件没有 API 白名单，核心能用的 JS 库与 Web API 全能用）；**也不要把终端当软件的定义**（终端是第一个视图插件，串口是第一个数据源）
- 完整决策集：memory `design-decisions.md`

## 常发已知问题（改到相关处先看）

- **文件树/侧栏 sticky 不生效**：双层滚动架构与 sticky 不兼容（E4V#57 曾放弃重做，动前读 memory `evolution-chronicle`）
- **Monaco 颜色不跟/token 错乱**：① 异步竞态（`StandaloneWorkbenchThemeService` 抢跑，bug-atlas B4）② Pool 下 `window.monaco` 是共享单例，插件禁调 `defineTheme`/`setTheme`。**插件首选 CM6**

## 开发命令

```bash
npm run check   # 🔥 提交前必跑：双工程 tsc + ESLint --max-warnings 0 + vitest + 各专项门禁
#   ⚠️ 三个坑：check-bundled-freshness 默认联网比对官方目录（离线用 --offline）· check-scaffold 需 git 在 PATH · check-css-namespace 判据面见硬约束 23；⚠️ 插件侧的腿在 SDK（插件仓 CI 判红），壳仓 check 够不着插件源码，两套互不覆盖
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
node scripts/archive-case.mjs <案名>  # 归档搬件器（干跑 / --apply）：git mv ＋ 夹内外双解析回填 ＋ 清空目录 ＋ 复验 ＋ 台账行草稿；⛔ 不接 check 链——**写盘前自跑 15 例自测**，判据坏即拒跑；规矩见 已落地/00-README.md §归档规矩 7
npm run check:lockfile-sync # lockfile 同源门禁；升 packages/* 版本后必须重跑 npm install 同笔提交 lock
npm run ui:build            # 🔴 改了壳共享组件（src/components/shared/**）后必跑——ui 的 dist 是构建产物、dev 轨道解析的就是它，不重建则 dev 里看不到任何变化（机制见 L9 00-整理档案）；打包轨道不用手跑（build-pool-vendor 有保鲜）
npm run lint / dev / electron:dev / npx tsc --noEmit / npx vitest run
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | `docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`（48 旧 bug 会怎么回来）＋ `00-迁移执行守则.md` |
| 🔥🔥🔥 加文件前 | `docs/开发管理/壳目录规范.md`——放错 = 返工（E5#42→#36k 教训） |
| 🔥 **新落点（写盘 / 写注册表 / 建快捷方式）前** | `docs/开发管理/用户机落点规范.md`——用户机上东西放哪；**未登记 = 门禁红**（硬约束 27） |
| 🔥🔥 改壳边界 | `docs/02-Electron架构/通道范式·设备插件独立.md`（改壳=加通用通道≠加设备业务） |
| 写插件 | `docs/03-插件制造/`（中文维护者面）；**作者面主显 = `docs/03-plugin-authoring/`**（英文树，双语对齐门禁守） |
| 🔥 插件源码外移与上架（L7） | `docs/02-Electron架构/插件生态与发布/插件源码外移层/00-整理档案.md`——**已封站**（源码各移独立仓）；种子三件套与门禁边界见 memory `plugin-source-external-repos`，读数 = 同夹 `08-全层验收.md` |
| 🔥 插件兼容机械化（L8） | `docs/02-Electron架构/插件生态与发布/插件兼容机械化/00-整理档案.md`——`E6#114`-`#120` **已落地**（悬空名核验 / 只加不删门禁 / 退役登记 / 兼容读数 / 市场显示状态 / 判据铺开 / 悬停卡 `HintCard`）；🔴 **用户面文案只许五个词**（正常 / 兼容 / 部分不适配 / 不适配 / —，见总纲 §〇d）；生命周期三段见 memory `plugin-lifecycle-three-tier`；队列真相源 = 同夹 `交接.md` |
| 🔥 UI 集中供给（L9） | `docs/02-Electron架构/插件生态与发布/UI集中供给/00-整理档案.md`——`E6#121`-`#130`（含 `#127a`）**已全层收官 2026-09-19**：`@linkdesk/ui` 从「编译进插件 bundle」翻转为「池 vendor 单实例供给」（react external；插件代码 / 契约零改动）；🔴 **契约纪律 = 导出面只加不删 ＋ 同版本内行为不变**；**版本重锚 = ui 与壳同号锁步**（0.3.x 线弃用）；**皮骨拍板 = 皮全开放 / 骨不开放**；队列真相源 = 同夹 `交接.md` |
| 🔥 第三方作者实测反馈落地（L10） | `docs/02-Electron架构/插件生态与发布/第三方作者实测反馈落地/00-整理档案.md`——`E6#132`-`#143` 十二格：**`#132`-`#140` 已收官**（**壳不动**，发版全落作者轴四包），**`#141`-`#143` 待拍板**（[04-待拍板方向题.md](docs/02-Electron架构/插件生态与发布/第三方作者实测反馈落地/04-待拍板方向题.md)）；队列真相源 = 同夹 `交接.md` |
| 🔥 插件测试覆盖层（L11） | `docs/02-Electron架构/插件生态与发布/插件测试覆盖层/00-整理档案.md`——`E6#144`-`#157` **已全层收官 2026-09-26**：`vitest.setup.ts` 收进 SDK 一个 subpath 真源 ＋ 脚手架与各仓铺开 ＋ 五仓补纯逻辑与替身层测试 ＋ 覆盖尺 `npm run audit:plugin-tests`（**已升「拦」**：模板 `ci-verify.mjs` 第六段判红）；🔴 **官方各仓默认不 bump**（例外 = 补测碰出真 bug ⇒ `fix:` ＋ 目录收录）；⛔ **第三方作者仓不代改**（壳内不写它的 id——硬约束 10 同理）；13 只声明式仓豁免；队列真相源 = 同夹 `交接.md`；⚠️ 一个会话只做一个轮次 |
| ✅ **AI 友好化-全自动操作（已收口 · 归档 `已落地/`）** | [00-README](docs/04-软件更新/已落地/AI友好化-全自动操作/00-README.md)——判据 = **可读 · 可操作 · 可查**；**62 格全收口 2026-09-29**；台账 [AI-执行清单.md](docs/04-软件更新/已落地/AI友好化-全自动操作/AI-执行清单.md)（**进度唯一真相源**）· 收口 [06-系列收口报告.md](docs/04-软件更新/已落地/AI友好化-全自动操作/06-系列收口报告.md)；⚠️ 量级实证 = **门外每加一条命令 ⇒ 一次 lang-defaults 发版 ＋ 目录收录 ＋ 种子追新**；产出面 = AI 操作手册 ＋ 硬约束 26 |
| 🟡 **AI 操作手册** | [docs/07-AI操作手册/](docs/07-AI操作手册/00-README.md)——给**不读源码的 AI**（用户机零源码）的操作面，判据 = **可读 · 可操作 · 可查**：`00-README` 导航 · `01-路径总览`（三层门 ＝ 命令面／契约 API／CLI+MCP ＋ token 占位铁律）· `02-命令与API索引`（**生成式**，`npm run manual:build` 刷新、门禁逐字节盯漂）· `03`–`06`（按任务操作／手势隐藏／够不着清单／CDP 坑表）· `07-如何接入`。🔴 **随安装包发货 ＋ 软件内可打开** = `AI#16` **已接线**：落 `resources/ai-manual/`（`electron-builder.yml` extraResources）＋ 池侧壳视图 `ai-manual` ＋ 命令 `app.openAiManual` ＋ 菜单 帮助 |
| 🗂 **E6 剩余任务与派单序** | [E6-剩余任务分档-派单序.md](docs/02-Electron架构/插件生态与发布/E6-剩余任务分档-派单序.md)——⚠️ **该档「未勾账」表停在 2026-09-19/25，状态一律以 `E6-执行清单.md` 为准**（本档只写顺序与派单门槛，⛔ 不复制正文）；🔴 档头纪律 = **完成的条目整段删**（记录在执行清单与收口报告里，别在这里堆「已完成」） |
| 🔴 作者轴五个 npm 包发版 | `docs/06-发布管理/作者轴npm发版.md`（发版五步＋实测坑）；软件发版另见 `docs/06-发布管理/发布清单.md` |
| 🔥 CSS 命名空间 | `docs/02-Electron架构/插件生态与发布/01-插件独立构建/11-样式命名空间审计.md` ＋ 同目录 [样式命名空间归一化/](docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/)（**轮次进度唯一真相源 = 交接.md 顶部剩余任务队列**） |
| 已确认决策 / 已知坑 / 主题系统 | memory `design-decisions.md` / `bug-atlas` / `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件；**记忆库重组时同笔更新它** |
