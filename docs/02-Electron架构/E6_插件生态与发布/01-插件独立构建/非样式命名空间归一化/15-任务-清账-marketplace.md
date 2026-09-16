# 第 1.45 轮 · `#111n-4`：**官方仓清账 · `marketplace`**

> 🔄 **§〇c 口径修订（2026-09-16 第二次拍板）——先读 [00 档 §〇c 口径修订令](00-整理档案.md)。**
> **被撤回的旧结论**：~~存量不改名 ／ 只报不改~~ ⇒ **改名 ＋ 迁移，规则零例外**。**根治的机械定义 = 官方仓需改处全 0**（`node scratch/audit-plugin-scope.mjs` 全 0）。
> **上位约束的新措辞**：**操作体验零变化**（**名字可变，取值与功能不许变**）。
> **本档因此新增的必做项**：任何改名**同笔带迁移** ＋ **逐项操作实测**。
>
> **一句话**：`marketplace` 的命令 id / 设置键**全部合规**，只需改 **6 个上下文旗子**——但它们**全部服务于同一个东西：插件条目的齿轮菜单**（`marketplaceItemGear`）⇒ 改错一个，**"启用/禁用"或"选择主题/语言/图标主题/设置/键位"某一项就会凭空消失**，而它**看起来只是菜单项少了一个**，没人会归因到命名。
>
> **编号**：`#111n-4`
> **🔴 执行序与前置**：**前置 = [1.41 迁移基建](11-任务-迁移基建.md) 收官**。**与 1.42/1.43/1.44 互不依赖** ⇒ 次序可换。
> **拍板记录**：无新拍板；继承 §〇c 与 [1.37](07-任务-上下文旗子归属评估.md) 的旗子归属口径（**命名形状以 1.37 的结论为准**）。

> **非新能力声明（`check-design-flow` §8.4 ③）**：既有名字的归属归一，零视觉变化、零功能变化、零新增能力。⇒ **无需新能力设计前置**。

---

## 〇、本格在轴上的位置

| 项 | 值 |
|:--|:--|
| 射程 | `marketplace` **一个仓**：**上下文旗子 6 个** ＋ 它们的**全部 set / 读点** |
| 不射程 | 别的仓 · 壳侧判据与账 · **CSS 类名**（已由 CSS 系列 1.14⑦a/⑦b 清账）· 市场对宿主命令的引用（`theme.pick` / `core.openSettings` 等是**宿主命令**，**不改**） |
| 产出 | 改名 ＋ 实证 ＋ 发版 ＋ 目录/种子对账 |

---

## 一、事实与读数（**2026-09-16 实测**）

| 项 | 读数 | 出处 / 复跑 |
|:--|:--|:--|
| **上下文旗子不合规** | **6**：`pluginDisabled` · `extensionHasThemes` · `extensionHasLanguages` · `extensionHasIconThemes` · `extensionHasConfiguration` · `extensionHasKeybindings` | `node scratch/audit-plugin-scope.mjs`（`── marketplace` 段） |
| 命令 id | **0 条声明**（本仓的命令走**运行时注册**，实测其 `marketplace.*` 已合规） | 同上 |
| 设置键 | **1**，已合规 | 同上 |
| i18n 顶层键 | **184**（跨仓不可判，**只登记**） | 同上 |

### 1.1 🔴 **6 个旗子的 set 点与读点（共 2 个文件 —— 改一处漏一处必静默失效）**

**Set 点（全部在同一处）**：`src/components/ExtensionItem.tsx`

| 行 | 内容 |
|:--|:--|
| `:18` | `set("pluginDisabled", isDisabled)` |
| `:19` | `set("extensionHasThemes", !!c.themes)` |
| `:20` | `set("extensionHasLanguages", !!c.languages)` |
| `:21` | `set("extensionHasIconThemes", !!c.iconThemes)` |
| `:22` | `set("extensionHasConfiguration", !!c.configuration)` |
| `:23` | `set("extensionHasKeybindings", !!c.keybindings)` |
| `:29-33` | 六条**复位**（`false`）——清空时统一归零 |

**读点（全部在同一处）**：`src/services/marketplaceShared/commands.ts` 的菜单项 `when`

| 行 | 菜单项 | `when` |
|:--|:--|:--|
| `:93` | `core.openSettings`（设置） | `extensionHasConfiguration` |
| `:94` | `theme.pick`（主题） | `extensionHasThemes` |
| `:95` | `workbench.action.selectLanguage`（语言） | `extensionHasLanguages` |
| `:96` | `workbench.action.selectIconTheme`（图标主题） | `extensionHasIconThemes` |
| `:97` | `workbench.action.openExtensionKeybindings`（键位） | `extensionHasKeybindings` |
| `:98` | `marketplace.enable`（启用） | `pluginDisabled` |
| `:99` | `marketplace.disable`（禁用） | `!pluginDisabled` |

> 🔑 **本格的结构极清楚**：**6 个旗子 ↔ 一个齿轮菜单的 7 个条目**。⇒ 实证只要**逐条对着这 7 个条目看**就够了（不用猜）。

### 1.2 版本与发行面

| 项 | 值 |
|:--|:--|
| 当前版本 | `1.0.34` |
| **`seed`** | **`true`** ⇒ **随包出厂**：改完要 `npm run sync:bundled` 刷箱 ＋ `check:bundled-freshness` 6/6 ＋ 官方目录回填 |

---

## 二、要做（**含「同笔面」**）

### 2.1 改名（6 处旗子 ＋ 13 处 set/读点）

- 形状 = [1.37](07-任务-上下文旗子归属评估.md) 定的统一形状（例：`marketplace.pluginDisabled` —— **以 1.37 结论为准**）。
- 🔴 **`ExtensionItem.tsx` 的 12 处 set ＋ `commands.ts` 的 7 处 `when` 必须同笔全改**（**只改 set 不改 `when`（或反之）⇒ 菜单项永久消失/永久出现**）。
- ⚠️ **额外扫一遍**：本仓是否还有别的文件**读**这些旗子（`useState`/`useEffect` 里的 `_getValue`？）——**`grep` 全仓，别只看这两处**。

### 2.2 迁移

- 旗子是**运行时状态**（由 `ExtensionItem` 的 hover/选中驱动）⇒ ⚠️ **先核实有无持久化**：
  - 预期**没有** ⇒ **无需迁移**，但**必须在交接段写明"核实过、无迁移面"＋ grep 读数**（**不许静默不做**）；
  - 若有 ⇒ 走 [1.41](11-任务-迁移基建.md) 的迁移机制。

### 2.3 逐项操作实证（**本格的对外交付 —— 对齐 §1.1 的 7 个菜单条目**）

在**隔离 profile ＋ CDP** 下（照 CSS 系列 1.14⑦b 的实机姿势），**逐条**：
1. 打开市场**已装**列表 ⇒ 悬停/选中一个**已装**插件 ⇒ 齿轮菜单：**「禁用」在、「启用」不在**；
2. 选一个**已禁用**的插件 ⇒ **「启用」在、「禁用」不在**（这一对测 `pluginDisabled`）；
3. 选中**有主题**的插件 ⇒ **「主题」条目在**；选一个**没主题**的 ⇒ **不在**（以此类推 **5 个 `extensionHas*`**——**每一条都要单独抓到"在"与"不在"两侧**，只验一侧 = 没验）；
4. **全局**：旧旗子名在池文档的 context store 里**不再出现**（新名出现）· **零本仓报错**。

### 2.4 版本与发布（**同笔**）

`package.json` ＋ `plugin.json` ＋ `CHANGELOG.md` ＋ `AGENTS.md` 版本事实 ⇒ bump ⇒ `verify` / `test` / `build` ⇒ 发版 ⇒ 官方目录回填 ⇒ **`sync:bundled`（`seed:true`）＋ `check:bundled-freshness` 6/6**。

---

## 三、判据表（**含必须真跑过的负控**）

| 判据 | 要求 | 负控（**必须真能红**） |
|:--|:--|:--|
| **① 形状证明** | 改的文件剥前缀后与基线 blob **逐字节相等** | 拿 HEAD 冒充 new ⇒ 红；改一处非名字内容 ⇒ 红且只红那一个文件 |
| **② 残留 0（写明扫描域）** | 本仓 `src/` 面 6 个旧旗子名**整词 0**（`CHANGELOG.md` 历史按**具名例外**报数，不许改写） | 留一处（**尤其 `commands.ts` 的 `when`**）⇒ 红；正控：新名计数 > 0 |
| **③ set 与读点成对** | `ExtensionItem.tsx` 的 set 集合 == `commands.ts` 的 `when` 引用集合（**机械对齐**） | 只在 set 侧改名 ⇒ **本条红**（**这是本格最值钱的一条判据**：它专抓"只改一半"） |
| **④ 7 个菜单条目逐条实证**（§2.3） | 每条都抓到"在/不在"两侧 | 漏改一个 `extensionHas*` ⇒ 对应条目**永久消失**、实机当场红 |
| **⑤ 仓门禁** | `verify` EXIT=0 · `test` 全绿（CSS 系列 1.14⑦b 实测本仓 **233 例**）· `build` **8/8 表面** · `audit:plugin-prefix` 零违规 | — |
| **⑥ 壳侧账** | `check:bundled-freshness` **6/6** · 箱内种子 sha256 与 Release 件**逐字节相同** · 官方目录读回 sha 逐字节对 | — |
| **⑦ 不误伤** | `pluginId` 仍 `marketplace`；对**宿主命令**的引用（`theme.pick` / `core.openSettings` / `workbench.action.*`）**一字未改**；CSS 类名未动 | 断言逐项相等 |

---

## 四、禁区

- 🔴 **不许改宿主命令的引用**（`theme.pick` / `core.openSettings` / `workbench.action.selectLanguage` / `workbench.action.selectIconTheme` / `workbench.action.openExtensionKeybindings` 是**宿主命令**，本格只改**旗子名**）。
- 🔴 **不许动 CSS 类名**（已由 CSS 系列 1.14⑦a/⑦b 清账；重复开工 = 撞车）。
- 🔴 **不许为了"改干净"顺手删/改任何东西**（死旗子、死设置项一律**只登记**）。
- 🔴 **不许改写 `CHANGELOG.md` 的历史**。
- 🔴 **不许引白名单 / 基线 / 棘轮**。
- 🔴 **不许改 `pluginId`**（硬约束 11）· **不许改视图 id / 容器 id**（实测本仓与 9 个视图/容器 id 无一与类名同名——CSS 系列 1.14⑦a 已核）。
- 🔴 **不许自己造改名工具 / 形状证明**（用 [1.41](11-任务-迁移基建.md) 的作业包）。
- ⚠️ **上位约束**：**操作体验零变化**（名字可变，取值与功能不许变）· 只做加法且名字一次定对 · [29 号档](../样式命名空间归一化/29-主题系统保护条款.md) 优先 · 对外宽容。
- ⚠️ 照旧：不跳 `npm run check` · 推前现测代理 · 推完 `ls-remote` 对 SHA · **提交只按路径 `git add`**。
- ⚠️ 🔴 **发布前置两条**：**工作区干净** ＋ **本地 HEAD 已在远端**；发布成功后 API 会往插件仓根提交 `marketplace.json` ⇒ `git pull --ff-only` 跟上。
- ⚠️ 🔴 **官方目录读回别用 raw**（**CDN 滞后**）⇒ 用 **API Contents 的 blob sha ＋ size** 核（CSS 系列 1.14⑦b 实测）。

---

## 五、交棒要求

1. **收尾四件套**（交接段顶部追加 · 清单轮次进度行 · 勾格全套 · **队列表整张复制**）。
2. 🔴 **回报三组读数**：① 改名前/后 `node scratch/audit-plugin-scope.mjs` 的**本仓处数**（期望 6 → **0**）；② §三 的 ①②③④ 判据读数（**④ 要逐条列出的 7 个菜单条目**）；③ **§2.2 的「有无迁移面」核实结论 ＋ grep 输出**。
3. 🔴 **判「本格不做某条」必须写明理由**。
4. **下一棒 = [1.46 清账 · `settings`](16-任务-清账-settings.md)（`#111n-5`）** —— ⚠️ **注意**：那一格要动**宿主命令的 `when`**（跨仓），是本轴**最高风险**的一格；本格的经验（"set 与读点成对"那条判据）**要写进交接段给它参考**。
5. 跑 [00 档 §八](00-整理档案.md) 探针并记账。

---

## 六、🔴 进场第一步（命令）

```bash
# 0) 确认自己是哪一棒
sed -n '1,40p' "docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/交接.md"

# 1) 拿「清账轮作业包」（1.41 交付）→ 交接段顶部第一段

# 2) 自量本仓
node scratch/audit-plugin-scope.mjs | sed -n '/── marketplace/,/^──/p'

# 3) 6 个旗子的全部 set / 读点（§1.1 的两处 ＋ 全仓复核）
grep -rn "pluginDisabled\|extensionHasThemes\|extensionHasLanguages\|extensionHasIconThemes\|extensionHasConfiguration\|extensionHasKeybindings" \
  "E:/linkdesk-plugins/official/marketplace/src" | grep -v node_modules

# 4) 有无持久化面（§2.2 的判据）
grep -rn "pluginState\|StorageService\|workspace\." "E:/linkdesk-plugins/official/marketplace/src" | head -20

# 5) 基线
git -C "E:/linkdesk-plugins/official/marketplace" rev-parse HEAD
git -C "E:/linkdesk-plugins/official/marketplace" status --short   # 必须干净

# 6) 收尾（禁跳）
npm run check
```

---

## 七、与其它格的关系

- **[1.41 迁移基建](11-任务-迁移基建.md)（紧接前序）**：🔴 **依赖它的作业包**。
- **[1.37/1.38（上下文旗子）](07-任务-上下文旗子归属评估.md)**：🔴 **本格的改名形状与映射表从它来**；本格是它的**执行方**。
- **[1.46 清账 · `settings`](16-任务-清账-settings.md)**：🔴 **同族但风险更高**（它要动**宿主命令的 `when`**）⇒ 本格§三判据③（set 与读点成对）**要传给它**。
- **[1.42](12-任务-清账-file-tree.md) / [1.44](14-任务-清账-serial-monitor.md)**：同为清账轮，互不依赖。
- **记忆 `css-rename-round-toolkit`**（改名执行器十条坑；⑦b 的官方目录 CDN 滞后坑）。
