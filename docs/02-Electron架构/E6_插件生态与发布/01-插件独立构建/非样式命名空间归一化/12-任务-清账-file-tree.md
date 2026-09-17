# 第 1.42 轮 · `#111n-1`：**官方仓清账 · `file-tree`**

> 🔄 **§〇c 口径修订（2026-09-16 第二次拍板）——先读 [00 档 §〇c 口径修订令](00-整理档案.md)。**
> **被撤回的旧结论**：~~存量不改名 ／ 只报不改~~ ⇒ **改名 ＋ 迁移，规则零例外**。**根治的机械定义 = 官方仓需改处全 0**（`node scripts/audit-plugin-scope.mjs` 全 0）。
> **上位约束的新措辞**：**操作体验零变化**（**名字可变，取值与功能不许变**）。
> **本档因此新增的必做项**：任何改名**同笔带迁移** ＋ **逐项操作实测**。
>
> **一句话**：**7 个清账轮里最大的一格**——`file-tree` 一个仓就占了整轴工作量的**大半**（实测 **75 处**：声明命令 id 21 ＋ 运行时注册 25 ＋ 设置键 18 ＋ 旗子 11），而且它**同时是两条活体冲突的当事方**（借 `editor.*` 命名空间 · 借共享组件的 `inputFocus`）⇒ 本格要**把它借出去的名字还回自己的命名空间**。
>
> **编号**：`#111n-1`
> **🔴 执行序与前置**：**前置 = [1.41 迁移基建](11-任务-迁移基建.md) 收官**（要用它的**改名执行器 ＋ 形状证明 ＋ 三条实证跑法**）。再往前 = [1.40](10-任务-i18n与黄灯族落地.md)。
> **所有清账轮（1.42–1.48）互不依赖**（各改各的仓）⇒ **次序可换、甚至可并行**；但**都必须在 1.41 之后、1.49 之前**。

> **非新能力声明（`check-design-flow` §8.4 ③）**：本格是**既有名字的归属归一（只插入/替换前缀）**，零视觉变化、零功能变化、零新增能力。⇒ **无需新能力设计前置**。

---

## 〇、本格在轴上的位置

| 项 | 值 |
|:--|:--|
| 射程 | `file-tree` **一个仓**：命令 id · 设置键 · 上下文旗子 · **视图容器 id**（补漏，见 §2.5） |
| 不射程 | 别的仓（归 1.43–1.48）· 壳侧判据与账（归 1.32/1.34/1.36/1.38/1.49）· CSS 命名空间（**已由 CSS 系列 1.14③ 清账**，本格不动） |
| 产出 | 改名 ＋ 迁移 ＋ 三条实证 ＋ **重发版** ＋ 官方目录 / 出厂种子对账 |

---

## 一、事实与读数（**2026-09-16 实测，逐条带出处**）

### 1.1 逐项清账面（**75 处**，复跑：`node scripts/audit-plugin-scope.mjs`）

| 类 | 处数 | 明细 |
|:--|:--:|:--|
| **声明命令 id**（`contributes.commands[].id`） | **21** | `revealInExplorer` · `explorer.newFile` · `explorer.newFolder` · `explorer.openFile` · `explorer.openToSide` · `explorer.openWith` · `explorer.openFocused` · `explorer.openInTerminal` · `explorer.revealInOS` · `explorer.copyPath` · `explorer.copyRelativePath` · `explorer.cut` · `explorer.copy` · `explorer.paste` · `explorer.rename` · `explorer.delete` · `explorer.findInFolder` · `explorer.refresh` · `explorer.collapseAll` · `explorer.openFolder` · `explorer.search` |
| **运行时注册**（`registerCommand("…")`） | **25 处 / 23 个 id** | 21 个同上 ＋ `explorer.removeFolder` · `explorer.closeAllEditors` ＋ 🔴 **`editor.selectForCompare` · `editor.compareWithSelected`**（出处 `src/components/FileTreeContextMenu/commands/compare.ts:15,19`） |
| **设置键** | **18** | `explorer.*` **15**（`sortOrder` / `compactFolders` / `expandSingleFolderWorkspaces` / `decorations.colors` / `decorations.badges` / `expandOnClick` / `autoReveal` / `autoOpenDroppedFile` / `incrementalNaming` / `enableDragAndDrop` / `confirmDelete` / `confirmDragAndDrop` / `excludeGitIgnore` / `fileNesting.enabled` / `fileNesting.expand`）＋ `files.exclude` ＋ `terminal.external.windowsExec` · `terminal.external.customCommand` |
| **上下文旗子**（`contextKey.set`） | **11** | `explorerItemIsFile` · `explorerItemIsDir` · `explorerItemIsRoot` · `explorerResourceReadonly` · `explorerResourceCut` · `explorerClipboardEmpty` · `explorerResourceMoveableToTrash` · `explorerFocus` · `explorerViewletCompressedFocus` · `viewHasSomeCollapsibleItem` ＋ 🔴 **`inputFocus`（共享组件的！）** |

### 1.2 🔴 两条活体（**本格要把它们还回去**）

| # | 活体 | 出处 | 为什么必须还 |
|:--:|:--|:--|:--|
| **1** | **借 `editor.*` 命名空间**：`editor.selectForCompare` · `editor.compareWithSelected` 由 **`file-tree` 注册**（`src/components/FileTreeContextMenu/commands/compare.ts:15,19`），**menuItems 引用它们**（`commands/menuItems.ts:17,18`），且**未在 `plugin.json` 声明**（纯运行时） | 同上 | 后果可判定：**卸载 `file-tree` 时这两条命令永不被清理**（`unregisterCommands` 只删 `file-tree.*`）；**卸载 `editor` 时反而会把 `file-tree` 的这两条删掉**。⇒ 还回 `file-tree.*`（**同时要确认 `editor` 仓没有同名声明**） |
| **2** | **借共享组件的 `inputFocus`**：`src/components/FileTree/useTreeRename.ts:35,41` 设它；而**同名旗子由共享组件 `InlineInput` 拥有**（`src/components/shared/inline-input/InlineInput.tsx:106,117,145`） | 同上 | 两方为**不同目的**写同一个旗子（共享组件：内联输入框焦点；本仓：重命名框焦点）⇒ 同屏时**互相踩**，任何依赖它的门控取到错值。⇒ **还回 `file-tree.inputFocus`**（或按 [1.37](07-任务-上下文旗子归属评估.md) 的裁决统一处置 —— **以 1.37 的结论为准，本格执行**） |

### 1.3 本仓的「还有一类面」——**键位与 `when` 子句也要同笔改**

`plugin.json` 实测（`node scratch/show-plugin-manifest.mjs <仓>`）：

| 项 | 读数 | 影响 |
|:--|:--|:--|
| **`contributes.keybindings`** | **6 条**：`Ctrl+Shift+E`→`workbench.view.explorer`；`Ctrl+N`→`explorer.newFile`（`when: explorerFocus`）；`Ctrl+Shift+N`→`explorer.newFolder`（同）；`Enter`→`explorer.openFocused`（`when: explorerFocus && !inputFocus`）；`Ctrl+Enter`→`explorer.openToSide`（`when: explorerFocus && explorerItemIsFile`）；`Ctrl+Shift+F`→`explorer.search` | 🔴 **命令 id 与旗子名同时出现在这里** ⇒ **改一处漏一处 = 静默死键** |
| **`contributes.menus`** | **空**（菜单项在运行时经 `linkdesk.menu.registerItems` 注册） | ⇒ **运行时的 menuItems 字面量也要扫**（`src/components/FileTreeContextMenu/commands/menuItems.ts`） |
| **视图容器 / 视图** | `viewsContainers.explorer` · `views.explorer` | ⚠️ **容器 id `explorer` 也不带归属** —— **不在 1.35/1.37 的射程里**（本格补漏，见 §2.5） |
| 🔴 **疑似死键位** | `workbench.view.explorer` 在**壳仓与 file-tree 源码里 grep 均零命中**（无注册点） | ⚠️ 疑似**指向不存在命令的死键位**（用户按 Ctrl+Shift+E 无反应）⇒ **本格复核并给结论**（**若是死的：登记，不许顺手删**——删除属另一件事） |

### 1.4 版本与基线

| 项 | 值 |
|:--|:--|
| 当前版本 | `1.0.10`（`plugin.json` ＋ `package.json` 同源） |
| 仓目录 | `E:\linkdesk-plugins\official\file-tree`（`Encaron/linkdesk-plugin-file-tree`） |
| 随包 | `seed: true`（**出厂种子 6 只之一**）⇒ 改完要跑 `npm run sync:bundled` ＋ `check:bundled-freshness` |

---

## 二、要做（**含「同笔面」：源码 ＋ 迁移 ＋ 文档 ＋ 发版，缺一件即半成品**）

### 2.1 改名（**用 1.41 的作业包，⛔ 不自己造工具**）

> 🔴 **作业包已交付**：[21-清账轮作业包.md](21-清账轮作业包.md)（执行器 / 形状证明 / 映射表格式 / 三条实证跑法）。
> **本格照它跑即可**——**同源是判据的一部分**：自己另写一个工具，形状证明就证明不了「与七格同一套」。

#### 2.1.1 执行器用法（**照抄 §六，别改参数**）

```bash
# 0) 记基线（🔴 显式——中途 amend 会让默认 HEAD 悄悄换掉参照物）
BASE=$(git -C "E:/linkdesk-plugins/official/file-tree" rev-parse HEAD)
git -C "E:/linkdesk-plugins/official/file-tree" status --short      # 必须干净才动手

# 1) dry-run 看清单（**先看再动**）
node scratch/rename-nonnaming.mjs --plugin file-tree      --space setting --space command --space flag

# 2) 落盘
node scratch/rename-nonnaming.mjs --plugin file-tree --base $BASE --write

# 3) 🔴 形状证明（**带负控**——不带负控的绿不算绿）
node scratch/prove-rename-shape.mjs --plugin file-tree --base $BASE --self-check
#    ⇒ 期望 EXIT=0 **且**「负控红了」；只绿没红 ⇒ 判据压根没执行，回头查
```

- 形状 = **统一的前缀替换**（[1.31](01-任务-命令id归属评估.md) 定的全轴形状）；本仓一律 `<pluginId>.`。
- 面 = **§1.1 四类 75 处 ＋ §1.3 的键位/`when`/menuItems 字面量**。
- ⚠️ 执行器**只做直接文本替换**；`when` 子句是**字符串里的表达式**（`explorerFocus && !inputFocus`）⇒
  跑完**必须逐条人看残留 grep 的输出**（工具说"无残留"只代表直接文本那一类干净）。

#### 2.1.2 1.41 已在**本仓副本**上实测过的读数（**不是声明，是真跑**）

| 项 | 读数 |
|:--|:--|
| `--space setting` 命中 | **18 个文件**（`plugin.json` 18 条 / `README.md` 2 条 / `flatten.ts` 1 条 / …） |
| 形状证明 | 比对 **93 个文件** ⇒ ✅ 逐字节相等 |
| 负控 | ✅ 红了（3 个文件报差异） |
| **第三方独立复核** | `git diff --numstat`：18 个文件 **总 +80 / -80**，**每文件 +N == -N** ⇒ 纯替换、零增删 |
| 人工抽看 | `flatten.ts` 的 diff：连注释里的 `E4V#34b: explorer.compactFolders` 都同步改了，行数不变、无夹带 |

> ⚠️ **这只是 `--space setting`（19 条键）在副本上的预演**——**本格真正的面是 75 处 ＋ 命令/旗子两空间**，
> 读数会大得多。**别把预演读数当成本格的交付读数**（交付读数要§五.2 那三组）。

#### 2.1.3 🔴 残留判据要写明扫描域

照 CSS 系列教训：「旧名 0 残留」**必须说清是 `src/` 还是全仓、含不含注释与 CHANGELOG**——
**`CHANGELOG.md` 里的历史记录不许改写**（改写历史 = 假记录），按**具名例外**报数。

### 2.2 还回两条借用的名字（§1.2）

- `editor.*` → `file-tree.*`（**先确认 `editor` 仓没有同名声明**；若它也有 ⇒ 与 1.43 协调）。
- `inputFocus` → 按 [1.37](07-任务-上下文旗子归属评估.md) 的裁决执行。

### 2.3 迁移（**本格不能自己写——1.41 已建好，本格只补映射数据**）

本仓涉及**三类**需要迁移的用户数据，**运行时机制 1.41 全部已建**（`schemaMigrations.ts` 的 **v7** ＋ `keybindingMigration.ts`）：

| # | 用户数据 | 在哪 | 1.41 已建的机制 | 本格要做 |
|:--:|:--|:--|:--|:--|
| 1 | **18 个设置键** | `settings.json` | v7 迁移：`setMany(新值)` → `deleteMany(旧键)`，**presence 门控**（没写过的不产出） | 🔴 **补齐映射数据**（见下） |
| 2 | **命令 id**（21 声明 ＋ 23 运行时） | `keybindings.json` 的 `command` 字段 | `migrateUserKeybindings`：整词替换 `(?<![\w.-])…(?![\w.-])`，**文件不存在则零动作（不新建）** | 🔴 **补齐映射数据** |
| 3 | **旗子名**（`when` 子句） | `keybindings.json` 的 **`when`** 字段 ＋ `plugin.json` 的 `when` | 同上（`flag` 空间一并过） | 🔴 **补齐映射数据** |

#### 🔴 映射数据的落点与纪律

- **唯一落点**：`src/core/services/configuration/renameMigrations.ts` 的 `RENAME_ROUNDS`（**一物两用**——
  运行时迁移与改名执行器**读同一个对象**）。⛔ **不许另开一张表**（第二张表必漂移 = 本轴 1.15 的病根）。
- 本格现有数据：`round: "1.42+1.43"` / `plugin: "file-tree"` / **`setting` 19 条**；
  **`command` / `flag` / `appearance` 三列在 1.41 是空的**——那是**刻意的**：1.41 不替清账轮预先决定映射。
- ⇒ **本格要补**：`command`（本仓 21 声明 ＋ 2 条只在运行时注册的 `explorer.removeFolder` / `explorer.closeAllEditors`）
  与 `flag`（11 条）两列。补完**当场跑 `selfCheckRenameMaps()`**（四条自检：旧≠新 / 撞新名 / 新名又是别人旧名 / 逐空间重名）。
- ⚠️ **`inputFocus` 的处置以 [1.37](07-任务-上下文旗子归属评估.md) 的裁决为准**，本格执行——**它可能不进映射表**
  （若裁决为「共享组件保留原名」，那就没有旧名要搬）。**先读裁决，再填表**。

#### 🔴 迁移的落盘顺序（1.41 实测修出来的，别改回去）

**先写新值 ⇒ 确认真的落盘 ⇒ 才删旧键**。1.41 用负控验出：`StorageService.write` 对文件写失败是
**catch 掉只 warn**，于是磁盘满/权限/进程被杀时批写照样 resolve ⇒ 编排以为写成了、接着去删旧键
⇒ **新值没写、旧值被删**（本轴定义的最重伤害）。已在 `StorageService.ts` 加 `takeLastFileWriteFailed()`
＋ `schemaMigrations.ts` 两处守卫。**本格不要动这条链**。

### 2.4 版本与发布（**同笔**）

`package.json` ＋ `plugin.json` ＋ `CHANGELOG.md` ＋ **`AGENTS.md` 的版本事实**（不改它 `publish` 会因"工作区不干净"被拒）⇒ bump 后 `npm run verify` ＋ `build` ＋ **发版**（照 [作者轴 npm 发版 runbook](../../../../06-发布管理/作者轴npm发版.md) 与 L7 的插件发布纪律）＋ **官方目录回填** ＋ **出厂种子刷新**（`npm run sync:bundled` ⇒ `check:bundled-freshness` 6/6）。

### 2.5 🔴 本格补漏的一项裁决：**视图容器 id `explorer`**

- 事实：`viewsContainers.explorer` / `views.explorer` —— 容器 id 存在 `ViewContainerService._containers`（**扁平 Map**）＋ 有 `_containerOwner` 归属表（`ViewContainerService.ts:73,104,110`）。
- **它不在 1.35/1.37 的射程里**（那两件管外观 id 与旗子）⇒ 本格**必须裁一次**：**改 / 不改 ＋ 理由**（若改 ⇒ 同笔写迁移：用户 workspace 布局里若存了容器 id ⇒ **要查**）。
- ⚠️ 与本轴纪律一致：**判"不改"要把理由写进交接段**（不许静默不做）。

### 2.6 🔴 三条实证（**本格的对外交付，缺一不可**）

> **跑法在作业包 §四**（[21-清账轮作业包.md](21-清账轮作业包.md)）——下面只写**本仓的具体化**。
> ⚠️ **三条共同禁忌**：① **别用「全新安装」测**（全新盘上旧键压根不存在，三条全绿也证明不了任何事）；
> ② **别只看界面**——三步都要**回读磁盘文件**（界面读内存缓存，落盘失败了界面照样好看）；
> ③ 每次都**从改名前状态起**（不能拿已经改过一轮的盘接着测）。

#### 实证 ① 设置项切换（验 `setting` 空间）

```
1. 改名前：把 18 个键各设一个**非默认值**
   ⚠️ 必须非默认——默认值在盘上可能压根没写（v7 的 presence 门控不产出），测了个空
   例：explorer.confirmDelete=false · files.exclude="**/tmp" · explorer.sortOrder="type"
2. 关应用 → 改名 → 打开应用
3. 期望：① 新名下读得到**同值** ② 设置项**仍能切换**（拨动即生效）③ **旧键已清**（读 settings.json 确认，
   旧键残留 = 删那一步没执行，属判据 🟡）
```

#### 实证 ② 快捷键触发（验 `command` ＋ `flag` 两空间 —— 🔴 本格最易漏）

```
1. 改名前：给待改命令设**自定义快捷键**（写进 keybindings.json，**不是**默认表）
   ⚠️ 这条**不在 settings.json 里、没有枚举兜底** ⇒ 漏了就**静默变死键**（按了没反应，也不报错）
2. **另测一条带 when 的**：plugin.json 里 6 条 keybindings 中
   `Enter→explorer.openFocused` 的 `when: explorerFocus && !inputFocus` 是**命令 id 与旗子名同时出现**的
   典型 ⇒ **改一处漏一处 = 静默死键**（这正是 CSS 系列 ⑦b 抓到的形态）
3. 关应用 → 改名 → 打开应用
4. 期望：**按那个自定义键仍触发**；keybindings.json 里 command 已换新 id、**自定义键位没丢**、
   **`when` 里的旗子名也已换**
```

#### 实证 ③ 菜单可用性 / 主题跟随（验 `flag` 空间；本仓无主题面）

```
⚠️ file-tree **没有外观 id**（不是主题仓）⇒ 作业包的「主题跟随」那条**在本格不适用**，
   本格用**功能等价物**顶替：**右键菜单项逐项仍按同样条件显隐**。

1. 改名前：记录右键菜单在几种场景下的**显隐组合**
   （文件上 / 文件夹上 / 空白处 / 剪贴板空 / 只读资源）——门控键：explorerFocus · explorerItemIsFile ·
   explorerItemIsDir · explorerResourceReadonly · explorerClipboardEmpty · inputFocus
2. 关应用 → 改名 → 打开应用
3. 期望：**逐项显隐与改名前完全一致**——旗子改名最容易在这里静默出错
   （旗子是 `contextKey.set` 写的字符串，改名后**没有任何编译期检查**能发现 when 子句对不上）
```

> 🔴 **主题跟随那条归 [1.47 清账·主题族](17-任务-清账-主题族.md)**——那里才适用。**本格用菜单显隐顶替**，
> 并在交接段**明写这条替换**（不许静默不做）。

---

## 二·五、🔴 落地完成勾格（**2026-09-17 实测，1.42 本格**）

> **上位约束**：**操作体验零变化**（名字可变，取值与功能不许变）。**机械定义**：`node scripts/audit-plugin-scope.mjs` 本仓 **75 → 0**。

### 2.5.1 三处面一起动（缺一处 = 静默死键）

- [x] **设置键 18** —— 全部换成 `file-tree.*`（`contributes.configuration.*.key` ＋ 源码引用点）
- [x] **命令 id** —— **21 条声明**（`plugin.json`）＋ **25 处运行时注册**（`registerCommand` 字面量，执行器够不着，人工逐条改）
- [x] **上下文旗子 11** —— `contextKey.set` 的字符串
- [x] 🔴 **`plugin.json` 6 条键位的 `when` 同笔跟改** —— `Enter → file-tree.openFocused` 的 `when: file-tree.focus && !file-tree.inputFocus` **命令 id 与旗子名同时出现**，无编译期检查
- [x] 🔴 **`Menu.tsx` 4 处裸对象键 → 加引号**（执行器产出的是**语法错误**，`npm run verify` 的 eslint fatal 腿抓到；`context` 经 `ContextMenu` 以 `Record<string, unknown>` 按字符串键读 ⇒ 零语义变化）

### 2.5.2 借用已还

- [x] `editor.selectForCompare` / `editor.compareWithSelected` → `file-tree.*`（本仓零命中）
- [x] `inputFocus` → `file-tree.inputFocus`（按 1.37 裁决）
- [x] 🔴 **映射条目已进 `RENAME_ROUNDS` 的 `command` 栏** —— ⚠️ **1.43 别重复登记**（`selfCheckRenameMaps()` 判据③ 会红）

### 2.5.3 形状证明与残留

- [x] **形状证明真跑**：93 文件，逆映射还原回旧名比 `--base` 的 **git blob**（不比工作区）⇒ ✅
- [x] **4 处差异逐条有据**：3 处＝1.31 §10.2.1 裁的 `revealInExplorer` 合并；1 处＝`Menu.tsx` 引号修复（净 +2 字符）
- [x] **残留逐条人看**：插件侧 `explorer.*` / 裸旗子 **命中 0**
- [x] **`plugin.json` 的 `workbench.view.explorer` 原样保留**（**引用宿主命令，合法**；**改名＝替宿主造新命令＝越界**）

### 2.5.4 🔴 三条实证（**改名不实测 = 本轴要治的那种无声失效**）

- [x] **实证① 设置项**：**18/18 取值不变**；活体 `true → false → true` 往返经 `linkdesk.config` 实测一致；旧键清盘；🔴 `files.autoSave` **被 `next in schema` 门禁正确拦下**（归 **1.43**）
- [x] **实证② 快捷键（含 `when`）**：6 条默认 ＋ 3 条自定义全部照旧生效；`when: file-tree.focus && !file-tree.inputFocus` 完整；**零冲突**；真鼠标点击文件夹节点 ⇒ `file-tree.itemIsDir = true`
- [x] **实证③ 右键菜单逐项显隐一致**（🔴 **顶替「主题跟随」** —— 本仓**无外观 id**，主题跟随归 **1.47**）：4 场景（文件/文件夹/根/空白）条目数 **12 / 11 / 8 / 8**，含快捷键提示与禁用态**逐字节相同**
- [x] 🔴 **替换是明确的，不是静默跳过**（写进任务书 §2.6 与交接段）

### 2.5.5 🔴 本轮实测抓到的真缺陷（**不在任务书里，是本格发现的**）

- [x] **版本门禁把 v7 提前烧掉了**：1.41 交付 v7 时映射表三栏为空，而迁移成功语义是「含零产出也标记已迁」⇒ v7 **在改名落地之前**就把用户盘推到 `app.schemaVersion = 7`；1.42 真改名后 `7 > 7 = false` ⇒ **一条都不跑 ⇒ 设置键永不搬家、用户设置静默全丢**（同一次启动里 `migrateUserKeybindings` 无门禁照跑 ⇒ 快捷键**搬早了**＝静默死键）
- [x] **修法**：v7 迁移体提成 `runNamespaceRenameMigration`，**v8 纯数据复用同一函数体**（不是第二套逻辑）
- [x] 🔴 **负控真跑三态**（首版是**假负控**：测试自己 import 符号并登记 ⇒ 生产装配点没被走到）：完好 ⇒ 绿 ／ 摘登记行 ⇒ **红** ／ 还原 ⇒ 绿
- [x] ⚠️ **1.43–1.48 每一轮都要各自再补一个版本号**（v8 也已被烧掉，同一坑会重犯）

### 2.5.6 收尾

- [x] 本仓门下三关：`npm run verify` ✅ ／ `npm run test` **69 passed** ✅ ／ `npm run build` **3/3 表面** ✅
- [x] 插件仓提交（`0a52098`，**只按路径 `git add`**）＋ 壳仓提交（**只按路径**）
- [x] 裁决档 [22](22-裁决-容器id与死键位-1.42.md)（容器 id 裁决 ＋ 死键位登记 ＋ `revealInExplorer` 合并登记）
- [x] 收尾四件套（交接段顶部追加含队表整表 · 清单轮次进度行 · 勾格全套 · 队表整张复制）
- [x] [00 档 §八](00-整理档案.md) 探针已跑并记账
- [ ] 🔴 **发版未做（gated on 推送）** —— 见交接段「未完成事项」：仓已提交未推 ⇒ **必须先推后发** ⇒ `npm run publish` ⇒ `git pull --ff-only`
- [ ] ⏳ **出厂种子 `sync:bundled` ＋ 目录回填未做**（依赖发版）

**读数总账**：`npm run check` **EXIT=0 · 173 文件 / 2396 测试**（1.41 基线 172 / 2386）／`audit:plugin-scope` **file-tree 75 → 0**／插件 `file-tree` **1.0.10 → 1.0.11**。

---

## 三、判据表（**含必须真跑过的负控**）

| 判据 | 要求 | 负控（**必须真能红**） |
|:--|:--|:--|
| **① 形状证明** | 逐文件剥前缀后与基线 blob **逐字节相等** | 拿 HEAD 冒充 new ⇒ 红；改一处**视觉属性**（非名字）⇒ 红且**只红那一个文件** |
| **② 残留 0（写明扫描域）** | `src/` 面旧名整词 0；`CHANGELOG.md` 等**具名例外**逐条列出 | 留一处旧名 ⇒ 红；**正控**：新名计数 > 0（否则判据可能是恒真） |
| **③ 借用已还** | `editor.selectForCompare` / `editor.compareWithSelected` **在本仓零命中**；`inputFocus` 按裁决零命中 | 留一处 ⇒ 红 |
| **④ 键位与 `when` 同笔** | 6 条 keybindings 的 `command` 与 `when` 里的旗子名**全部新名** | 只改 `command` 不改 `when` ⇒ 红（**这正是 CSS 系列 ⑦b 抓到的形态**） |
| **⑤ 迁移实证三条**（§2.6） | 三条读数 | 迁移函数改成恒真 ⇒ 断言红 |
| **⑥ 仓门禁** | `npm run verify` EXIT=0 · `npm run test` 全绿 · `npm run build` 通过 · `audit:plugin-prefix` 零违规 | — |
| **⑦ 壳侧账** | `check:bundled-freshness` 6/6 · 官方目录回填后读回 sha 与候选逐字节相同 | — |
| **⑧ 不误伤** | `.md` / `.svg` / 图标资产 / `pluginId` **一字未改** | 断言 `pluginId` 仍为 `file-tree` |

---

## 四、禁区

- 🔴 **不许为了"改干净"去删/改任何东西**：本格**只改名字**（含同笔的引用与迁移）。**死键位、死设置项、死旗子一律只登记**（照 CSS 系列「加前缀、不顺手删」的纪律）。
- 🔴 **不许改写 `CHANGELOG.md` 的历史记录**（它是实录）——旧名出现在历史里属**具名例外**。
- 🔴 **不许动 CSS 类名**（已由 CSS 系列 1.14③ 清账；重复开工 = 撞车）。
- 🔴 **不许引白名单 / 基线 / 棘轮**（映射表是**一次性迁移数据**，用完即失效）。
- 🔴 **不许改 `pluginId`**（硬约束 11）。
- 🔴 **不许自己造改名工具 / 形状证明**（用 [1.41](11-任务-迁移基建.md) 的作业包——**同源是判据的一部分**）。
- 🔴 **不许跳过三条实证**（§2.6）——**"改名不实测"就是本轴要治的那种无声失效**。
- ⚠️ **上位约束**：**操作体验零变化**（名字可变，取值与功能不许变）· 只做加法且名字一次定对 · [29 号档](../样式命名空间归一化/29-主题系统保护条款.md) 优先 · 对外宽容。
- ⚠️ 照旧：不跳 `npm run check` · 推前现测代理 · 推完 `ls-remote` 对 SHA · **提交只按路径 `git add <本格文件>`**。
- ⚠️ 🔴 **发布前置两条**（实测坑）：**工作区必须干净** ＋ **本地 HEAD 必须已在远端**（`publish` 会把 tag 打在远端 HEAD 上）⇒ `publish` **必须先推后发**；发布成功后 API 会往插件仓根提交 `marketplace.json` ⇒ 本机要 `git pull --ff-only` 跟上。

---

## 五、交棒要求

1. **收尾四件套**（交接段顶部追加 · 清单轮次进度行 · 勾格全套 · **剩余任务队列表整张复制**）。
2. 🔴 **必须回报三组读数**：① 改名前/后 `node scripts/audit-plugin-scope.mjs` 的**本仓处数**（期望 75 → **0**）；② 形状证明与残留判据读数；③ §2.6 三条实证读数。
3. 🔴 **判「本格不做某条」必须写明理由**（尤其 §2.5 的容器 id 裁决）。
4. **下一棒 = [1.43 清账 · `editor`](13-任务-清账-editor.md)（`#111n-2`）** —— ⚠️ **注意**：本格若动了 `editor.*` 相关的事，**要在交接段点名告诉 1.43**（那格也要看这个前缀）。
5. 跑 [00 档 §八](00-整理档案.md) 探针并记账。

---

## 六、🔴 进场第一步（命令）

```bash
# 0) 确认自己是哪一棒
sed -n '1,40p' "docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/交接.md"

# 1) 拿「清账轮作业包」（1.41 交付 —— 执行器 / 形状证明 / 映射表 / 三条实证跑法）
#    → 交接段顶部第一段；本档 §2.1/§2.3

# 2) 自量本仓（面清单只用来对账）
node scripts/audit-plugin-scope.mjs | sed -n '/── file-tree/,/^──/p'
node scratch/show-plugin-manifest.mjs "E:/linkdesk-plugins/official/file-tree"

# 3) 两条活体的原文
sed -n '10,25p' "E:/linkdesk-plugins/official/file-tree/src/components/FileTreeContextMenu/commands/compare.ts"
grep -n "inputFocus" "E:/linkdesk-plugins/official/file-tree/src/components/FileTree/useTreeRename.ts"
grep -n "inputFocus" src/components/shared/inline-input/InlineInput.tsx

# 4) 基线（形状证明要显式 --base，先 rev-parse 再贴）
git -C "E:/linkdesk-plugins/official/file-tree" rev-parse HEAD
git -C "E:/linkdesk-plugins/official/file-tree" status --short   # 必须干净才动手

# 5) 收尾（禁跳）
npm run check
```

---

## 七、与其它格的关系

- **[1.41 迁移基建](11-任务-迁移基建.md)（紧接前序）**：🔴 **本格依赖它的作业包**（执行器 / 形状证明 / 映射表格式 / 三条实证跑法）——**它没交付就不要开工**。
- **[1.31/1.32（命令 id）](01-任务-命令id归属评估.md) · [1.33/1.34（设置键）](03-任务-设置键归属评估.md) · [1.37/1.38（旗子）](07-任务-上下文旗子归属评估.md)**：本格是它们的**执行方**；映射表与裁决从它们来。
- **[1.43 清账 · `editor`](13-任务-清账-editor.md)**：🔴 **交集**——本格还回 `editor.*` 的两个命令；1.43 要确认 `editor` 仓**没有**同名声明，并顺带看 `explorer`/`files.*` 的历史关系。
- **[1.47 清账 · 主题族](17-任务-清账-主题族.md)**：🔴 **交集**——`theme-defaults` 声明了 `files.*`？**不**（那是 editor/file-tree）——但 `files.exclude` 的语义归属**要在作者面说明一次**（1.49）。
- **记忆 `css-rename-round-toolkit`**（改名执行器十条坑）· **`plugin-out-of-repo-build-rules`**（仓外构建四规则）· **`sdk-github-pat-expiry`**（publish 401）。
