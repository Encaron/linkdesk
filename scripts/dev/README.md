# `scripts/dev/` —— dev 验收 driver（系列外 `D0`）

> **归属**：**开发期工具**。不进软件产物、零用户可见面、**不占版本号**、不接 `npm run check` 链。
> 立件依据 = [docs/04-软件更新/待抉择池/dev验收前置.md](../../docs/04-软件更新/待抉择池/dev验收前置.md)（正典，判据在 §四）；
> 格号 `D0#1`–`D0#3`（**系列外**，不占《AI 友好化-全自动操作》62 格预算）；进度唯一真相源 = 同夹 `AI-执行清单.md` 第 0 轮。

## 这是什么

把「用 CDP 驱真界面取证」这件事从**一次性脚本**变成**一条命令**。三层，职责不串：

| 文件 | 层 | 只管什么 |
|---|---|---|
| `lib/cdp.mjs` | 传输层 | 找 target / 开 WebSocket / 求值 / 等就绪 / 硬 reload / 解节流 / 真鼠标 / 强制伪状态 |
| `lib/linkdesk-driver.mjs` | 语义层 | **LinkDesk 的界面长什么样、怎么驱、怎么读**（区段 / 布局 / 池快照 / 视图菜单 / hover 面 / 构建握手） |
| `driver.mjs` | CLI | 参数、输出、退出码（**红/绿可判**），`npm run dev:driver` |

零第三方依赖：Node 24 自带 `WebSocket` / `fetch`，只 `import node:*` 与相对路径（有自测守着）。

## 30 秒上手

```bash
# ① Vite（dev 轨道）
npm run dev            # http://localhost:1420

# ② 隔离实例（⛔ 别用你正在用的那只：硬 reload 会打断你手上的活）
node_modules/.bin/tsc -p electron/tsconfig.json && node electron-commonjs-fix.cjs
electron . --remote-debugging-port=9333 --user-data-dir="$TEMP/linkdesk-driver-$$"

# ③ 指过去，开始读
export LINKDESK_CDP=http://127.0.0.1:9333
npm run dev:driver -- status
```

> 🔴 **`--user-data-dir` 是 Windows 上唯一真隔离**。设 `APPDATA` 不管用——Electron 走 `SHGetKnownFolderPath`，不读那个环境变量。
> 🔴 **硬 reload 会丢已挂载视图**：dev 的隔离 profile 不恢复工作区 ⇒ `reload` 之后池里只剩「欢迎 ＋ 发行说明」，插件视图要重新开（`open-view <pluginId>`；图标栏里没有的只能人开）。

## 命令

| 命令 | 做什么 |
|---|---|
| `status` | 实例体检：CDP / Vite / target 清单 |
| **`reload`** | **硬 reload 全部 page target 并等就绪**（`D0#1` 第一步，⛔ 别跳过） |
| **`handshake`** | **构建握手**：页面跑的代码 vs 磁盘 mtime（`D0#1` 判据 1） |
| `snapshot` / `sections` / `layout` | 池快照 / 侧栏区段读数 / 持久化面（React fiber）读数 |
| `open <viewId>` / `collapse <viewId>` | 展开 / 收起区段（**幂等**：已是目标态就不点） |
| `open-view <pluginId>` / `menu` | 点图标栏开回视图 / 读「视图」子菜单项与勾选态 |
| `hover <选择器>` | `:hover` 面样板（真鼠标 ＋ 负控对比；`--mode force` 可换强制伪状态） |
| `states` | 读 `plugin-states.json`（`--user-data-dir <路径>`） |
| `eval` / `call` / `wait` / `activate` | 任意求值 / 任意 CDP 方法 / 轮询到成真 / 解后台节流 |
| `decouple [--base <ref>]` | **判据 3**：软件侧一行未改（git 对账） |
| `selftest` | 纯函数自测（**不需实例**，`--self-test` 同义） |

常用选项：`--json` · `--doc pool|shell` · `--props a,b` · `--pseudo hover,focus` · `--mode mouse|force` · `--kill-transitions` · `--user-data-dir <路径>` · `--root <仓库根>` · `--base <git ref>` · `--timeout <ms>`

## `D0#1` 构建握手：**「代码生效了吗」当场可辨**

**病根**（正典 §一）：04 实修时 `plugin-states.json` 已更新、池快照却没动（运行中 dev 实例的 HMR 吃不到**壳侧非组件模块**改动）⇒ 据此误判「修了没效」，白查一轮。

**判据**：`performance.timeOrigin`（**这份文档的加载时刻**）vs 磁盘 mtime。

```
磁盘最新改动  E:\linkdesk\src\App.tsx  09:21:21.293
判定  ✔ in-sync（每份文档都加载于磁盘最新改动之后 ⇒ 页面跑的就是磁盘上这份）

文档          加载于        应用模块  页内  晚于页面  忽略(非源码)
  shell   ✔ 09:21:33.386    186    186      0     44
  pool    ✔ 09:21:34.775    103    103      0     44
```

**为什么不是「看 `?t=` 版本章」**（原方案，已推翻）：Vite 只在模块**被 HMR 失效后**才追加 `?t=<mtime>`，**刚加载的页面一个章都没有**（实测 326 个资源、0 个章）⇒ 一律判 `no-evidence`，看着像「全部没生效」。现在 `?t=` 降级为**附加证人**（`stale-stamp`），主判据换成加载时刻。

- **按文档分别判**，聚合取最坏：壳与池是两份文档、两个 HMR 图，**「一个动了、另一个没动」正是 04 的病形**。
- 零可比对 ⇒ 判 **`no-evidence`**，⛔ **不算通过**（同「门禁找不到产物不许跳过」的逻辑）。
- 只看**已加载**的同源模块：没挂载的插件视图不会出现；`node_modules` / 虚拟模块 / 预构建物另计入 `忽略(非源码)`。

**现场复现过一次**：正控 `in-sync` → `touch src/App.tsx` → 壳报 `/src/App.tsx` `newer-than-page`、**池不受影响**（两份文档的差异如实分开）→ `reload` → 双文档就绪 → 回到 `in-sync`。

## `D0#2` 收敛自什么

04 那次实修写了 **17 个**一次性驱动（`scratch/_04-*.mjs` 12 个 ＋ `_cdp-eval*.mjs` / `cdp.mjs` / `_sticky-probe.mjs`），**每个都重写一遍同样的前戏**。那三段前戏在这里各成一处：

| 前戏 | 现在 |
|---|---|
| ① 挑 page target（按内容或按 URL） | `resolveTargets()` / `pickPool()` / `pickShell()` |
| ② `sleep` ＋「读 sections」 | `readSections()`（幂等驱动 = `openSection` / `collapseSection`） |
| ③ 「右键 header → 视图子菜单 → 点一项」 | `readViewMenu()`（读）/ `openView()`（驱） |
| ④ React fiber 走查 props（只被写过一次、但显然会再需要） | `readLayout()` |

④ 之所以必须进库：它是**持久化那一侧的读数**，与 DOM 读数是**两个真相源**——04 那次假阴性正是「一个动了、另一个没动」⇒ 两个读数要能一键并排取。

**实测读数**（隔离实例，2026-09-28）：

```
sections   6 行（folders / search 展开 h=83，installed / explore / disabled / builtin 收起 h=0）
layout     containerId=explorer   collapsedViews=["explore","disabled","builtin"]
open/collapse  folders  true → false（点了）→ 再 collapse false → false（已是目标态，未点）→ open false → true
```

幂等不是洁癖：`SidebarSection` 的 header `onClick` 是 **toggle** ⇒ 无条件点会把上一轮的遗留态**翻反**（memory §「共享 SelectBox 驱动三坑」的 `ensureOpen()` 同款教训）。

## `D0#3` 与主系列解耦自检

**判据**：本件做完，**软件侧一行未改**。

```
产品路径  src / electron / packages / plugins
未提交改动  ✔ 空（软件侧一行未改）
用户手上的文件 docs/04-软件更新/00-README.md  ✔ 干净
```

`decouple` 查两个面：未提交面（默认）＋ `--base <本棒起点>` 的提交范围面；`docs/04-软件更新/00-README.md` **只报不拦**（那份在用户手上，改了不算违规、但要看得见）。

### 顺手件：`:hover` 面样板（给 `AI#47` 铺路）

```
选择器 .ldk-sidebar-section-header   驱动 真鼠标（移到元素中心）
  color              常态 rgb(138, 138, 138)     → 移到元素上 rgb(212, 212, 212)
✔ 有差异的属性 1：color
机制自证 ✔（鼠标挪到探针：常态 rgb(1, 2, 3) → rgb(9, 8, 7)）
```

**两条结论（都是真机打出来的，不是设计推的）**：

1. 🔴 **默认用真鼠标**（`Input.dispatchMouseEvent {type:'mouseMoved'}` 挪到元素中心）。`CSS.forcePseudoState` **对深层既有节点只改 `matches()`、不改计算值**——同一个节点并排实测：

   | 驱动 | color |
   |---|---|
   | `--mode mouse` | `rgb(138,138,138)` → `rgb(212,212,212)` ✔ 真变了 |
   | `--mode force` | `rgb(138,138,138)` → `rgb(138,138,138)`，而 `el.matches(':hover') = true` |

   强制探针（自己造的元素）两边都灵 ⇒ 机制没坏，是**既有深层节点上的强制不传播到计算值**。故 `--mode force` 保留但**降级**，输出里带这条警告；拿不准就用 `mouse`。（memory `cdp-ui-automation` 里「左键 `dispatchMouseEvent` 驱不动 React `onClick`」说的是**点击**，与鼠标**移动**无关。）
2. 🔴 **`querySelector` 只取第 1 个命中——第 1 个可能是特殊变体**。实测坑：`.ldk-icon-btn` 命中 3 个、第 1 个是 `.ldk-icon-btn.active`，而 `.ldk-icon-btn.active`（`background: radial-gradient(…)`）与 `.ldk-icon-btn:hover` **同权重且更靠后 ⇒ hover 规则被压掉**，「悬停不变色」看着像 hover 面坏了，其实是被查的那个按钮**本来就不该变**；换成 `.ldk-icon-btn:not(.active)` 立刻读到 `rgba(0,0,0,0)` → `rgba(255,255,255,0.06)`（＝ `--hover-overlay`，正是预期）。
   ⇒ 命令输出会带 **`命中 N 个（只读第 1 个）`** 的告警；零差异时**先收窄选择器**再怀疑样式。

命令 **零差异判红**（退出码 1）：它的用途是「证明 hover 面确实按预期变」，静默算过 = **假证据**。

> ⚠️ `--kill-transitions` / `settleMs` 是给**过渡**留的：仓里 hover 面普遍带 `transition`（`SidebarSection.css` `color .1s`、`IconBarZone.css` `background 150ms`），而过渡由**渲染帧**驱动——窗口被遮挡时帧不跑、过渡冻在起点值，会读出「常态 = 悬停后」的**假零差异**。先等，仍零差异就把过渡关掉再读一次。

## 设计前置（design-flow 8 维度）

| # | 维度 | 本件回答 |
|---|---|---|
| ① | 能力边界 | **都不是**——不是壳能力、不是插件能力，是**开发期工具**。核心准入三条件（多提供方 / 多消费方 / 桌子不知道内容）一条不沾：消费者只有「维护者与 AI」，且**不随软件发布**。保底：无实例时 `status` 直接报「连不上 CDP」并给出起实例的命令，⛔ 不静默 |
| ② | API | **不暴露给插件**（⛔ 不进 `window.linkdesk.*`）。契约 = CLI 的 `helpText()` ＋ `--json` 的返回结构；⛔ 不动 `contracts/linkdesk.d.ts` |
| ③ | 通信 | 只有一条：**CDP**（`--remote-debugging-port` ↔ WebSocket）。数据流：页面读 → driver 聚合 → stdout/exit code。⛔ 不走 IPC 桥、⛔ 不进配置注册表；**池层禁 `@src/core/*` 运行时 import 的红线在这条通道上天然成立**（driver 从不 import 宿主源码，只 `node:*` ＋ 相对路径，有自测守） |
| ④ | 壳侧代码 | **零改动**——这正是判据 3。放 `scripts/dev/`（脚本目录，非壳目录规范射程），不进 `src/` |
| ⑤ | 插件侧代码 | **零改动**、⛔ 不加贡献点、⛔ 不改插件仓 |
| ⑥ | 显示 | **终端 stdout**（人读）＋ `--json`（机读）。⛔ 无 GUI 面、⛔ 零用户可见面、⛔ 不做截图（读 DOM/计算值/坐标，不读像素） |
| ⑦ | 配置 | 只有**环境变量**：`LINKDESK_CDP`（CDP 地址，默认 `http://127.0.0.1:9222`）、`LINKDESK_VITE`（Vite 地址，默认 `http://localhost:1420`）。⛔ 不进设置页、⛔ 不加 `app.*` 键（那是产品配置面） |
| ⑧ | 规范 + 验收 | 零第三方依赖；`selftest` 14/14（纯函数）；三条判据全部真机跑过（本页读数）；`decouple` 证明软件侧一行未改。⚠️ **本棒故意不接 `npm run check` 链**（理由见下）|

对着 10 条核心理念过一遍：**4 无死代码**（自测 ＋ `knip` 均过）· **9 AI 友好**（这正是目的：让下一次验收「第二次做不新写脚本」）· **10 健壮**（连不上、读不到、零命中、零差异**各有独立判定，都不静默算过**）。其余（插件自由 / vscode 化 / 声明式…）不适用——它不是产品面。

## 入库裁决（`D0#2` 唯一的判断题）

**裁决：入库，放 `scripts/dev/`（进 git）。** 理由三条：

1. **判据 2 要求的就是跨会话复用**：「同类验收第二次做，**不新写脚本**」——放 gitignore 的 `scratch/` 里，下一个会话（另一台 AI）**看不到它**，判据当场落空。
2. **`scratch/` 已被证明是易失的**：本棒开工时它里面躺着 `_cleanup-manifest-2026-09-28.txt` 这类随手产物；仓库对它的态度就是「临时」。
3. **有先例**：`audit-nonnaming` 2026-09-17（1.32）**正是从 gitignore 的 `scratch/` 搬进 `scripts/`**，同笔删原件——同一个判断，已经做过一次。

**为什么不接 `npm run check` 链**：它需要一只活着的隔离实例（`check` 是纯离线门禁，不能变成「必须先起 Electron」）；且本件零产品面 ⇒ 不进 CI 是对的。**但要留在射程可见处**（见下）。

**门禁射程（已核对，⛔ 别凭感觉）**：

| 门禁 | 射程 | 结论 |
|---|---|---|
| `check-gate-health` | 域 = `/^check-.*\.mjs$/`，`readdirSync(scripts/)` **非递归** | 够不着 `scripts/dev/`，也管不着非 `check-*` 文件 |
| `.jscpd.json` | `["typescript","tsx","css"]` | `.mjs` 不扫 |
| `check-file-size` | 只看 `src/` `electron/` `plugins-src/` | 够不着 |
| `knip` | `project` 含 `scripts/**/*.{mjs,cjs}`；**package.json 的 script 即入口** | ✅ 已在 `package.json` 加 `dev:driver` ⇒ 三个文件全部可达、导出全部被消费（`npx knip` 退出 0） |

## 自测

```bash
npm run dev:driver -- selftest     # 14 组，纯函数，不需实例、不碰磁盘产物
```

不只在测「函数返回值」——**字符串契约**也测（`has(expr, needle)`），因为**页面侧表达式**没法在这里真跑。⛔ 但它查不出下面这两类**只在真机才暴露**的错，故各单列一条守卫／警示：

1. 🔴 **ASI 陷阱**：`return` 后换行 ⇒ 自动分号 ⇒ **静默返回 `undefined`**（`readSections` / `readLayout` 都踩过：命令报「读不到」，而 `eval` 里明明有 6 个 `[data-view-id]`）。守卫 = 「ASI 守卫」那条自测，扫描所有页面表达式的 `return` 后有无换行。**字符串契约查不出这条**——因为它语法合法。
2. 🔴 **`?t=` 章不是总在**（见上 §`D0#1`）——设计阶段的假设被真机推翻，故判据换了地基。

## 记忆指针

- `cdp-ui-automation`（用户 2026-08-25 授权的 CDP 驱真界面取证；坑表：`--user-data-dir` 隔离 / 硬 reload 丢视图 / 后台节流冻帧）
- `dev-environment`（推必带代理 `127.0.0.1:7890`）
- 正典：[docs/04-软件更新/待抉择池/dev验收前置.md](../../docs/04-软件更新/待抉择池/dev验收前置.md)
