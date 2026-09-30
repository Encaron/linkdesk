# 13 · 跨表面共享 chunk——设计前置（`E6#159`，(a) 终局解）

> ✅ **设计前置**：本档按 `Skill(design-flow)` 的 8 维度写全（§四），并对着 10 条软件核心理念逐条过（§五）。
> **状态：✅ 已实施（实施轮 0/1/2 全落地并真机对照完毕，2026-09-30）**。归属 `E6#159`（自 `E6#158` 的 (a) 路拆出——用户 2026-09-30 拍板「(a) 是根治、(b) 是过渡」后立此格）。
> 上游 = [12-多表面共享状态塌缩-立案.md](./12-多表面共享状态塌缩-立案.md)（缺陷立案 ＋ 两条候选解）；本条只做 **(a) 跨表面共享 chunk** 的设计与落地。

---

## 〇 一句话

把「同一插件的多个表面**各打一份自包含产物**」改成「**共享模块只产一份 chunk，各表面以相对 import 引用它**」——**前提复位、断根**：模块级可变状态（store / 守卫 / 去重表 / 订阅计数 / 缓存）自动回到「一个 realm 一份实例」，**作者零改动、零知识**，第三方仓的存量 latent 缺陷随之自然消失。

## 一 判据：什么叫根治

不是「这个 bug 修好了」，而是**这个缺陷类在平台层不再可能发生**——含 ① 第三方面里没被盘点出来的插件 ② 将来任何新插件类型（重库自带的内部单例尤甚） ③ 作者根本没听说过这条规矩的情况。

按此判据，(b)（SDK 原语 ＋ 成规 ＋ 视情门禁）不满足：它是**把平台的债转成作者的纪律**，漏用一次就是静默的面间不一致（marketplace 一案同族 5 处，全静默）。它的价值在「下一版 SDK 就能发」与「存量老包唯一可用」，**不覆盖「作者不知道」**。⇒ 定案：**(a) 是根治，(b) 是过渡＋永久保留的显式接缝**（原语仍留在 SDK，供「有意跨表面共享」与「保单文件」的少数场景）。

## 二 前置侦察结论（2026-09-30，只读侦察；随本档留证）

**结论：两轨道的加载机制都天然支持「表面 → 兄弟 chunk 的相对 import」**——前提是**产物布局让文件实际落在相对引用算出的位置**。

| 面 | 事实 | 证据 |
|:--|:--|:--|
| specifier 怎么拼 | dev = `/@fs/<插件绝对路径>`；prod = `linkdesk://<pluginId>`；视图 = `${root}/${viewDef.render}` | [contributions.ts](../../../../src/pluginLoader/contributions/contributions.ts) `:319-323`、`:251-261`；[runtime.ts](../../../../src/pluginLoader/resolution/runtime.ts) `:67-76`（statusBar 同法） |
| 池侧消费 | 裸 `import(/* @vite-ignore */ renderPath)`（另有回退支现场拼 `/@fs` / `linkdesk://`；css link 同法） | [PluginComponent.tsx](../../../../src/pool/shared/plugin-component/PluginComponent.tsx) `:62-64`、`:69-109`、`:189-190` |
| **prod 协议** | `linkdesk://` 注册为 `standard/secure/supportFetchAPI/corsEnabled`（**`standard: true` 是相对 URL 能解析的前提**）；处理器 **按插件根做路径映射**：`<root>/<pluginId>/<任意相对路径>`，只查「含 `..` ⇒ 403」＋「不存在 ⇒ 404」，**无白名单、不看清单声明**，逐请求 `statSync` ＋ `readFileSync` | [main.ts](../../../../electron/main.ts) `:503-504`；[protocol.ts](../../../../electron/plugins/protocol.ts) `:41-43`、`:88-104`、`:110-141`；[linkdeskProtocolPath.ts](../../../../src/core/utils/path/linkdeskProtocolPath.ts) `:15-21`、`:33-40` |
| **dev 轨道** | 池窗口由**壳自己的 Vite dev server** 服务（非插件自带 dev server）；`server.fs.allow = [壳根, …userPluginsHomes]` ⇒ 插件目录整棵放行 | [window-manager.ts](../../../../electron/windows/window-manager.ts) `:218-224`；[vite.config.ts](../../../../vite.config.ts) `:108-115`（`:16`/`:27` 两个 home 来源；`:18-23` 隔离实例必须导出 `LINKDESK_USER_PLUGINS_HOME`，否则整个插件目录被挡） |
| **安装布局** | zip **整树解压**（zip-slip 检查后按原相对路径写盘；boot 种子同一函数）⇒ 一个插件目录多文件**已天然支持**；落点 `{userData}/plugins/<pluginId>/`（**无版本层**） | [bundle-zip.ts](../../../../electron/plugins/bundle-zip.ts) `:91-121`、`:161-240`；[plugin-install-handlers.ts](../../../../electron/ipc/handlers/plugin-install-handlers.ts) `:152` |
| **无「一视图一文件」断言** | `plugin.schema.json` 的 `render` 是**自由字符串**（无单文件/扩展名/存在性约束）；SDK `validate.ts` 不涉 `render`；加载器不 stat 兄弟文件 | `packages/plugin-sdk/schemas/plugin.schema.json`；`packages/plugin-sdk/src/validate.ts` |
| 单文件承诺只在文档层 | 属设计意图、**无门禁强制** ⇒ 改它 = 改写文档契约，不是拆门禁 | `docs/03-插件制造/04-插件分发格式.md:25,27`、`09-插件目录规范.md:100` |

### 🔴 唯一硬点：SDK assemble 落位错位

现状（[vite-config.ts](../../../../packages/plugin-sdk/src/vite-config.ts) `:420-453` 逐表面独立 build；`:462-481` assemble）：**表面入口被移入 `views/<Key>.bundle.js`，而该次 build 的其余文件（chunk / worker）被拷到包根**，且**相对引用不改写**。⇒ 今天即便产出 chunk，表面里的 `import "./chunk-x.js"` 也会指向 `views/chunk-x.js`（文件不在那）⇒ **404**。**这是本格必须修的第一件事**（属构建侧，不动加载器）。

另有两处既有假设要同笔复核（都属「布局改动的连带面」）：

- **CSS 层级假设**：[bundleCss.ts](../../../../src/pool/shared/plugin-component/bundleCss.ts) `:43-51` 硬编码「表面恰在包根下一层」（靠 `/views/` 下标或最后一个 `/` 回根），且**全插件只链一份根 `index.bundle.css`**。⚠️ 若布局保持「表面在包根下一层、共享件在包根或同层」，此假设**仍然成立 ⇒ 壳侧零改动**（本格的目标形态）。
- **表面收集的两个隐含约束**：只把 `render` 以 `.tsx` 结尾且存在的当可编译表面（`:115`）；每表面入口名固定 `surface.bundle.js`（`:443`，随后 assemble 改名改位）。

### ✅ 两项探针的实测结论（实施轮 0 已跑，2026-09-30，壳仓 `scratch/probe-159/`）

1. **lib 产物真产 chunk，且入口导出零失真**（原「未实证」→ 已验）：`lib.entry = { index, "views/V1", "views/V2" }` 单次 build ⇒ 共享模块**只产一份** `shared-<hash>.js`，三入口 `default` 全在，三入口 import 到的是**同一份对象**（Node `import()` 实测 `===`）。嵌套表面的相对 specifier 由 rollup **按真实落位自动算对**（`views/V1.bundle.js` 引 `../shared-<hash>.js`；worker 产 `assets/*` 且被嵌套表面引作 `../assets/*`）——这正是旧 assemble「搬位后算不出来」的那件事。
2. 🔴 **「空 facade」旧结论订正（归属记错，非形态有墙）**：E6#15 记的「vite 单 build 多 JS 入口丢其余入口 default 导出」**只对非 lib 的 `rollupOptions.input` 多入口成立**（本轮复现：三入口全成 1 字节空 chunk、共享代码整份消失）；**lib 多入口没有这个问题**，`preserveEntrySignatures: "strict"` 也非必需。⇒ 首选形态 (i) 无墙。
3. ✅ **真机多文件首次加载已消（轮 2，2026-09-30）**：探针 = marketplace **1.1.7** 走**真安装通道**进隔离实例（`<临时 userData>/plugins/marketplace/`），8 个入口 **8/8 加载成功**，**共享 chunk 按相对 specifier 只取一次**（`views/*.bundle.js` → `../index-<hash>.js`；该 chunk 212,185 B、插件 JS 总量 120,129 B），后挂载的表面**复用同一 URL、不重复取**；`__linkdesk_pluginSlots__marketplace` 全产物只 **1 处**（1.1.6 = 7 处）。**未另造一次性探针插件**（原计划如此，末了由真仓充当）。
4. ◐ **两条如实边界**：① 隔离实例跑的是 **dev 轨**（`/@fs`）⇒ `linkdesk://` 下**运行时**的相对 import 跳转未单独复现（协议侧已核：表面 200 / 7,033 B ＋ 共享 chunk 200 / 32,205 B，`views/../index-…` 归一化到**同一 URL**）；② 作者浏览器预览轨（`packages/plugin-sdk/src/dev-server.ts` 的 1421 端口）本轮**未走**、未逐行核。
5. ⚠️ **量具坑（非产品缺陷，harness 记录）**：隔离实例必须把 `LINKDESK_USER_PLUGINS_HOME` 指到 **`<隔离 userData>/plugins`**（不是 `<隔离根>/plugins`），否则 [vite.config.ts](../../../../vite.config.ts) 的 `server.fs.allow` 不含插件目录 ⇒ chunk 请求被 Vite 的 SPA fallback 兜成 `index.html`（**HTTP 200 / 732 B**），**表面静默挂起**（池资源只列两条表面、markers 空）。表象像产品 bug，实为环境变量指错一层。

## 三 实现形态（首选 / 备选）

**(i) 单次多入口 build（✅ 已按此实施）** —— 一次 vite build、单一 outDir，入口用 **`lib.entry` 对象**（`Object.fromEntries(表面 → 绝对路径)`，键 = 表面 finalName 去掉 `.bundle.js`）——**不是** `rollupOptions.input` 多入口（实测那条正是「空 facade」的来源，见 §二.2）：**rollup 自己算去重、自己按 chunk 真实落位写相对 specifier**，最不容易错。

- 入口产物名用 **`lib.fileName` 回调**（`(format, entryName) => \`${entryName}.bundle.js\``）直接映射回既有布局（`index.bundle.js` / `views/<Key>.bundle.js` / `statusBar.bundle.js`），与 `plugin.json` 的 `render` 值一一对应；共享 chunk 沿用 vite 默认 `[name]-[hash].js`（**不另立稳定名**——理由与后果见 §七 定死条）；`base: "./"`、`worker: { format: "es" }`、`cssCodeSplit: false`、external 清单（`DEFAULT_EXTERNAL`：react/react-dom/react-i18next/i18next/@linkdesk/ui）不变。
- **落位修正 = assemble 搬位步骤整段删除**（新产物由 rollup 直接写进最终布局，不再有「移入 `views/` 后相对引用失配」这一形态，见 §二 硬点）。
- 代价：**「逐表面失败隔离」这条既定收益弱化**（一个表面构建失败 ⇒ 整批失败，从「运行期逐表面降级」变成「构建期整体失败」）——已在 [02 号档](./02-linkdesk-plugin格式规范.md) §二 同笔记账，不隐藏。
- ＋ **机械判据两条（G1/G2）随构建常驻**，见 §六。

**(ii) 保留逐表面 build ＋ 外置共享 chunk（备选）** —— 多跑一次「共享层」build，把 shareable 模块产出为可被 external 化的 ESM chunk，各表面 build 把对应模块 id 标 external 并写相对 specifier。

- 好处：保住逐表面隔离。代价：**要自造「模块 id → specifier」映射**（rollup 本可代劳的事自己扛），易错且随模块图变化漂移。⇒ 只在 (i) 于实施轮踩到硬墙时启用。

## 四 8 维度设计前置

**① 能力边界** —— **壳/平台能力**（构建 ＋ 打包布局 ＋ 加载语义），不是可选的插件能力；准入三条件：多提供方（任意插件作者）／多消费方（每只插件的每个表面）／桌子不知道内容（SDK 不认识插件业务）。**保底**：不实施时一切照旧（现有单文件插件继续跑，老包不受影响）；本轴**无 UI**，故无「无插件时的显示保底」问题。

**② API 设计** —— 🔴 **不新增任何 API**（「作者零改动」是它的全部卖点）。变化的是 **SDK 构建产物契约**：dist 布局与 chunk 命名。契约位置 = `packages/plugin-sdk/src/vite-config.ts`（实现）＋ [02-linkdesk-plugin格式规范.md](./02-linkdesk-plugin格式规范.md)（**「单文件自包含」条要改写**）；作者面同笔改写 `docs/03-插件制造/04-插件分发格式.md` 与 `09-插件目录规范.md`。并行的作者面 API = (b) 的 `realmSingleton`（另格 `E6#158`，本格不动）。

**③ 通信方式** —— 不涉插件↔壳 IPC/配置/事件。本格涉的是**模块图内的通道**：表面 bundle →（相对 URL import）→ 共享 chunk；解析由加载轨道（dev `/@fs` ／ prod `linkdesk://`）负责，§二已验。

**④ 壳侧代码设计** —— **目标形态下壳侧零改动**（`protocol.ts` / `contributions.ts` / `PluginComponent.tsx` / `bundleCss.ts` 全不动）——因为布局保持「表面在包根下一层、共享件在包根或同层」。若实施中改到更深层级，则须同笔改 `src/pool/shared/plugin-component/bundleCss.ts`（壳，另一格记账）。**单一权威** = dist 布局规范（02 号档）＋ `vite-config.ts`（唯一产出实现）。

**⑤ 插件侧代码设计** —— 贡献点语义不变（`contributes.views[].render` / `appearsIn.statusBar` 照旧）；作者源码**零改动**、不新增目录约定；插件内的动态 `import()` 落位规则由构建侧统一决定（作者无需知道）。

**⑥ 显示设计** —— 无 UI 变化（缺陷是行为面：翻新是否同帧、过滤是否跨面生效）。

**⑦ 配置设计** —— 🔴 **不新增配置项、不设构建开关**。理由（归一性）：两条产物语义并存 = 每个作者都要判「我该用哪种」，正是本轴要消灭的负担；确有个别插件需要「每表面独立实例」时，用 (b) 的原语显式声明即可，**不需要构建开关**。

**⑧ 代码规范 ＋ 验收** —— 见 §六；另需：产物命名/布局规则单一权威、无死代码（旧的逐表面 build 代码路径若被替换即删净）、归一化（一种产物语义）。

## 五 10 条软件核心理念对照

| 理念 | 判断 |
|:--|:--|
| 精品/低耦合高内聚/AI 友好/归一化/插件自由/禁硬编码/声明式/易操作 | ✅ 直接服务：一处修好、全体作者受益；产物语义唯一；布局规则单一权威 |
| ② 利未来插件生态 | ✅ 生态税归零——每一条要作者背的例外规矩都会变成长文档、AI 生成代码的额外对齐、以及最难诊断的面间不一致 |
| ③ 插件独立（第三方不须改壳） | ✅ 更强：**第三方连打包内幕都不必知道** |
| ④ 无死代码 | ✅ 实施时删净被替换的旧构建路径 |
| ⑤ 易拓展 | ✅ 新插件类型（重库自带单例）自动进入保护范围 |
| ⑨ AI 友好三层 | ✅ 作者面文档**变短**（没有例外规则要教），AI 按常规 ESM 直觉生成即正确 |
| ⑩ 健壮·生存力 | ✅ **已复核并记账**：「逐表面失败隔离」弱化（§三 (i)）＝ **批量原子化**（一个表面失败 ⇒ 整批红，作者见红即修，不再有「运行期逐表面降级」）；记账已落 [02 号档](./02-linkdesk-plugin格式规范.md) `:48` 与 §三 步骤 3 |
| ① 禁硬编码 | ⚠️ chunk 命名/布局若写散在多处即违规 ⇒ 收在 `vite-config.ts` 一处 ＋ 02 号档 |

## 六 验收判据（机械 ＋ 真机）

- **机械（✅ 已落地，进每次构建）**：判据两条，**看模块 id 不看指纹**（rollup `OutputChunk.modules` 的键）。实现 = [surface-chunk-guard.ts](../../../../packages/plugin-sdk/src/surface-chunk-guard.ts)（**纯函数、零 vite 依赖** ⇒ 可被 vitest 直测，绕开 `pack.test.ts:108` 的「测试不得引 `vite-config`」约束），挂在 [vite-config.ts](../../../../packages/plugin-sdk/src/vite-config.ts) 的 `generateBundle`（薄钩子）：
  - **G1 入口齐备**：声明的每个表面 finalName 必须真被产出（护住 SDK ↔ loader 的接口面；非入口 chunk 同名不算数）。
  - **G2 共享模块唯一**：任一源模块不得出现在 ≥2 个**入口** chunk 的 `modules` 里——缺陷类的机械指纹（worker 产物在 lib 模式是 `asset`、且本就是独立 realm，构造上不参与）。
  - 命中即抛 `PACKAGER_RED` ⇒ **构建硬失败、不吞**。单测 **7 例全绿**（含反向对照：`s/p/src/services/store.ts` 跨三入口 = 旧形态必判红）；并实证**判据真挂上**（非只单测）：临时塞一个假期望表面 ⇒ `EXIT=1`、红前缀在、**zip 不产出**，撤掉后复绿。
  - **fixture 端到端实测**（真插件 4 表面、打补丁 SDK 构建）：共享 `store-BQmg5hbX.js` **只一份**、三入口各 0 命中、`sameStoreObjectAsPanel: true`、单一聚合 `index.bundle.css`、dist manifest 的 `render` 已改写、zip 正常产出、日志 `4 表面`。
- ＋ `npm run check` 全绿（含 `docs:check`）。
- **真机（回归样本 = marketplace 1.1.7 真安装 · 隔离实例 · 2026-09-30 读数）**：① 「检查更新」侧栏与详情页**同帧翻新** ＝ ◐ **样本受限**（流程跑到完成「已是最新 · 刚刚」，但新隔离 profile **无待更新项** ⇒ 无「徽标增量」可观测；**替代读数** = 新挂载的详情页与侧栏行**版本读数一致**（`官方语言 v1.0.35`）——1.1.4 报障的「详情页落后一格」（1.1.5 / 1.1.4）**不再复现**）② 跨表面搜索过滤生效 ＝ ✅（侧栏搜索框输入 ⇒ **另一表面**「已装列表」~200 ms 内过滤成 0 行 ＋「未找到匹配的插件」，清空即恢复 3 行）③ `events.on` 单次订阅 ＝ ◐ **量具受限**（`window.linkdesk.events` 被 contextBridge 冻结：`Object.isFrozen === true`、`Cannot redefine property: on` ⇒ 页面内挂不住计数器；**替代读数** = 产物侧机械证据：槽指纹 1 处 ＋ 8/8 入口同指一份 chunk）。
- **对照基线**：marketplace **1.1.6**（`realmSlot` 版）＝ 行为等价的参照——**(a) 落地后应做到「同一只插件，源码零改动，行为与 1.1.6 一致」**（这同时证明「作者本不该写那 8 处槽」）。

## 七 风险、边界与不并案

- 🔴 **升级写盘原子性（本格内必须定）**：多文件后，若「表面已加载、chunk 尚未按需取」的窗口内发生原地升级，旧的按需 chunk 可能已被新文件替换/删除 ⇒ **新增一种跨文件 404 形态**。本格内须定死**布局与命名策略**（倾向：chunk 名稳定、升级写盘原子＝先落新目录再切换，或保留旧 chunk 不被同笔清掉）。⛔ **不并「池按 URL import 不 cache-bust（升级须重启）」那件**——那是加载器优化域的**另一个**已知面（12 号档 §六），本格只在**不新增失败形态**的意义上受它约束。
- ✅ **本格已定死（实施轮 1）**：**chunk 名 = vite 默认 `[name]-[hash].js`**（内容哈希：同内容同址、改内容即换址）；升级写盘沿用**现状**（zip 整树覆盖写，`{userData}/plugins/<id>/` 无版本层）。⚠️ 如实结论：池按 URL import 不 cache-bust ⇒ **升级须重启**这条既有前提不变；「表面已加载、chunk 未取」窗口内就地升级仍可能 404——**但这是既有失败形态的延续、不是本格新增**（内容哈希比「稳定名同址换内容」更少静默错配：变了名就是明确 404，不会拿旧 chunk 配新 entry）。真正的原子升级（先落新目录再切换）属**池装载与升级写入域的另一格**，本格不并案，只保证不新增形态。
- **老包不自动受益**：已发布/已安装的产物仍是单文件自包含 ⇒ 需要重建重发才享受 (a)。官方仓批量重建的轮次另议（marketplace 已有 1.1.6 先例，可作对照基线）；第三方仓由作者自行重建。
- **文档层改写**：02 号档（壳侧契约）＋ 03-插件制造 04/09 号档（作者面）同笔；改写「单文件自包含」＝**一次公共面决策**，须与版本账一起定。
- ⛔ **不是**「单例模式错了」，**不是**「加载器坏了」——12 号档 §六 两条边界继续有效。

## 八 实施轮次建议与版本账

- **实施轮 0（✅ 已完成，2026-09-30）**：§二 两项探针——**lib chunk 产出与入口导出保真已实测成立**（并顺带订正 E6#15「空 facade」的归属：非 lib 路由的问题，不是形态墙）；「真机多文件首次加载」**未消**，改由**轮 2 marketplace 真安装**充当探针（见 §二.3）。
- **实施轮 1（✅ 已完成，2026-09-30）**：`vite-config.ts` 构建内核改写为 **`lib.entry` 多入口单次 build**（原 assemble 搬位整段删除）；机械判据 G1/G2（§六）落地并验证**真拦得住**；02 号档＋作者面两档（zh/en 两树）同步改写；`packages/plugin-docs/docs/**` 由 `npm run docs:build` 重生成；**壳侧 `src/` `electron/` 零改动**（`bundleCss.ts` 的「表面恰在包根下一层」层级假设在新布局下原样成立）。
- **实施轮 2（✅ 已完成，2026-09-30）**：`@linkdesk/plugin-sdk` **0.1.58** ＋ `@linkdesk/plugin-docs` **0.1.46** 上 npm 并记基线；marketplace **源码零改动**（只升 devDep）重建重发 **1.1.7**（资产 77,089 字节，旧 128,455）＋ 官方目录收录 `2eec194` ＋ 出厂种子 1.1.6→1.1.7。**真机对照读数（隔离实例真安装，详读数见 §二.3-4 与 §六）**：「真机多文件相对 import 首次加载」✅ ／ 跨表面搜索过滤 ✅ ／ 「检查更新」同帧翻新 ◐（隔离 profile 无待更新样本，替代读数 = 详情页与侧栏行版本读数一致）／ `events.on` 单次订阅 ◐（壳侧 contextBridge 冻结，替代读数 = 产物侧槽指纹 1 处 ＋ 8/8 入口同指一份 chunk）——两条 ◐ 均属**样本／量具限制，非产品疑点**；`linkdesk://` 运行时相对 import 跳转未单独复现（隔离实例走 dev 轨；协议侧两 URL 均可取）。官方其余多表面仓择机重建。
- **版本账（落地辨正）**：设计档原写「**倾向 MINOR**」，实操按 [作者轴 npm 发版正典](../../../06-发布管理/作者轴npm发版.md):62「0.x 阶段**向后兼容**变更一律走 patch 位」判 **0.1.57 → 0.1.58（PATCH）**——判据 = 作者零改动、老产物仍可跑、壳侧零改动**三件同时成立**（「输出布局变化」本身不构成破坏）。发布随轮 2 走（用户 2026-09-30 已授权「同意制作，同意发版对照」）。壳侧目标**零改动**（本轮已验证；未动 `bundleCss.ts`）。
