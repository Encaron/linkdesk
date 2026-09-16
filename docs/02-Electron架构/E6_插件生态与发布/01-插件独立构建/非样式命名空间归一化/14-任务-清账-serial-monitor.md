# 第 1.44 轮 · `#111n-3`：**官方仓清账 · `serial-monitor`**

> 🔄 **§〇c 口径修订（2026-09-16 第二次拍板）——先读 [00 档 §〇c 口径修订令](00-整理档案.md)。**
> **被撤回的旧结论**：~~存量不改名 ／ 只报不改~~ ⇒ **改名 ＋ 迁移，规则零例外**。**根治的机械定义 = 官方仓需改处全 0**（`node scripts/audit-plugin-scope.mjs` 全 0）。
> **上位约束的新措辞**：**操作体验零变化**（**名字可变，取值与功能不许变**）。
> **本档因此新增的必做项**：任何改名**同笔带迁移** ＋ **逐项操作实测**。
>
> **一句话**：`serial-monitor` 的**命令 id（12）与设置键（2）都已经合规**，只需改 **2 个上下文旗子**（`sourceOpen` · `serialSessionFocus`）；但本仓有一条**必须复核**的相邻账：它是**命令面板/右键菜单/快捷发送**三处 UI 的宿主，旗子改名**最容易在「快捷发送药丸的右键菜单」上静默失效**（`quickSendContext` 槽）。
>
> **编号**：`#111n-3`
> **🔴 执行序与前置**：**前置 = [1.41 迁移基建](11-任务-迁移基建.md) 收官**。**与 1.42/1.43 互不依赖** ⇒ 次序可换。
> **拍板记录**：无新拍板；继承 §〇c 与 [1.37](07-任务-上下文旗子归属评估.md) 的旗子归属口径（**命名形状以 1.37 的结论为准**）。

> **非新能力声明（`check-design-flow` §8.4 ③）**：既有名字的归属归一，零视觉变化、零功能变化、零新增能力。⇒ **无需新能力设计前置**。

---

## 〇、本格在轴上的位置

| 项 | 值 |
|:--|:--|
| 射程 | `serial-monitor` **一个仓**：**上下文旗子 2 个** ＋ 旗子的**全部读点**（`plugin.json` 的 `when`、源码门控、菜单项条件） |
| 不射程 | 别的仓 · 壳侧判据与账 · **CSS 类名**（已由 CSS 系列 1.14⑤ 清账）· **token 轴**（CSS 系列件 6 的射程） |
| 产出 | 改名 ＋ 实证 ＋ 发版 ＋ 目录/账 对账 |

---

## 一、事实与读数（**2026-09-16 实测**）

| 项 | 读数 | 出处 / 复跑 |
|:--|:--|:--|
| **上下文旗子不合规** | **2**：`sourceOpen` · `serialSessionFocus` | `node scripts/audit-plugin-scope.mjs`（`── serial-monitor` 段） |
| 命令 id | **12**，**全部合规**（`serial-monitor.*`） | 同上 |
| 设置键 | **2**，**全部合规** | 同上 |
| i18n 顶层键 | **129**（跨仓不可判，**只登记**） | 同上 |
| 主题 / 图标主题 / 语言 / 图标 | **0** | 同上 |

### 1.1 本仓的「名字也在这些地方出现」——**改一个旗子要扫的面**

| 面 | 为什么要扫 |
|:--|:--|
| **`contributes.menus`** | 实测本仓声明了 **3 个槽**：`editorContext` · `quickSendContext` · `commandPalette` ⇒ **槽里的 `when` 子句可能引用被改名的旗子** |
| **源码门控** | `when` 不只在 manifest 里——TSX 里可能有 `ContextKeyService`/`linkdesk.menu.getItems(menuId, context)` 的 per-call 上下文（**照 [1.37 §1.5](07-任务-上下文旗子归属评估.md) 的「全局 `set` vs per-call `overrides`」两条路径**：**`overrides` 路径的键名同样要跟着改**，但**它不是"污染"，是合法用法**——别把它删掉） |
| **`plugin.json` 的 `when`** | 逐条 grep 两个旧旗子名 |
| **主区 / 侧栏 / 快捷发送药丸** | ⚠️ 本仓容器是 `location: sidebar`（CSS 系列 1.14⑤ 实测）⇒ **改名后必须真去点图标栏切容器**再验菜单（别在错的容器里找） |

### 1.2 版本与发行面

| 项 | 值 |
|:--|:--|
| 当前版本 | `1.0.15` |
| **`seed`** | **`false`** ⇒ **纯市场件**：不随包 ⇒ **不需要 `sync:bundled` 刷箱**，但**要回填官方目录**（账里那行版本要跟着走） |

---

## 二、要做（**含「同笔面」**）

### 2.1 改名（2 处旗子 ＋ 全部读点）

- 形状 = [1.37](07-任务-上下文旗子归属评估.md) 定的统一形状（例：`serial-monitor.sourceOpen` 或 `<pluginId>.<原旗子>` —— **以 1.37 结论为准**）。
- 🔴 **两处旗子的语义要保真**：`sourceOpen` 是**串口数据源是否打开**（正文注释提过它随 E5.8#47 外推为插件自设）· `serialSessionFocus` 是**会话焦点** ⇒ 改名后**门控行为必须一模一样**。

### 2.2 迁移

- 旗子是**运行时状态**（不是持久化配置）⇒ ⚠️ **本格先核实「有没有持久化」**：
  - 若**没有**（预期）⇒ **无需迁移**，但**必须在交接段写明"核实过、无迁移面"**（**不许静默不做**）；
  - 若**有**（例如写进了 `pluginState` 或 workspace 布局）⇒ 走 [1.41](11-任务-迁移基建.md) 的迁移机制。
- 🔴 **核实方法要留读数**：grep `sourceOpen` / `serialSessionFocus` 在**持久化写入口**（`pluginState.set` / `workspace.*` / `StorageService.write`）上的命中数。

### 2.3 逐项操作实证（**本格的对外交付**）

1. **串口主区**：打开/关闭数据源 ⇒ 依赖 `sourceOpen` 的菜单项/按钮**行为与改名前一致**；
2. **快捷发送药丸右键**（`quickSendContext` 槽）⇒ 菜单项**仍按同样条件显隐**；
3. **会话焦点**：切换会话 ⇒ 依赖 `serialSessionFocus` 的门控**行为一致**；
4. **全局**：DOM/控制台**零本仓报错**；旧旗子名在**池文档的 context store** 里**不再出现**（新名出现）。

### 2.4 版本与发布（**同笔**）

`package.json` ＋ `plugin.json` ＋ `CHANGELOG.md` ＋ `AGENTS.md` 版本事实 ⇒ bump ⇒ `verify` / `test` / `build` ⇒ 发版 ⇒ **官方目录回填**（`seed:false` ⇒ **不动箱**，但账的版本行要更新 ⇒ `npm run sync:bundled -- --latest` 记「纯市场，仅账」）。

---

## 三、判据表（**含必须真跑过的负控**）

| 判据 | 要求 | 负控（**必须真能红**） |
|:--|:--|:--|
| **① 形状证明** | 改的文件剥前缀后与基线 blob **逐字节相等** | 拿 HEAD 冒充 new ⇒ 红；改一处非名字内容 ⇒ 红且只红那一个文件 |
| **② 残留 0（写明扫描域）** | 本仓 `src/` ＋ `plugin.json` 面两个旧旗子名整词 **0**（`CHANGELOG.md` 历史按**具名例外**报数，不许改写） | 留一处 ⇒ 红（**尤其 `when` 子句里那一处**）；正控：新名计数 > 0 |
| **③ 无迁移面的核实** | 持久化写入口命中 **0** ＋ 结论写进交接段 | 若真有命中而漏判 ⇒ **本条判据本身要能被复核**（把 grep 命令与输出抄进交接段） |
| **④ 三条操作实证**（§2.3） | ①②③ 三项读数 | **其中一条做假（如只改 manifest 不改源码门控）⇒ 实机当场红** |
| **⑤ 仓门禁** | `verify` EXIT=0 · `test` 全绿（CSS 系列 1.14⑤ 实测本仓 **10 例**）· `build` 通过 · `audit:plugin-prefix` 零违规 | — |
| **⑥ 壳侧账** | 官方目录读回 sha 与候选**逐字节相同** · `check:bundled-freshness` 读数（本仓 `seed:false` ⇒ 只比账） | — |
| **⑦ 不误伤** | `pluginId` 仍 `serial-monitor`；12 个命令 id 与 2 个设置键**一字未改**；CSS 类名未动 | 断言逐项相等 |

---

## 四、禁区

- 🔴 **不许动 CSS 类名**（已由 CSS 系列 1.14⑤ 清账；重复开工 = 撞车）。
- 🔴 **不许动 token 轴**（`serial-monitor` 有 4 处 `:root` 自定义属性 —— 那是 **CSS 系列件 6** 的射程，本轴**不碰**）。
- 🔴 **不许把 per-call `overrides` 的上下文当成"污染"删掉**（它是合法用法，只是键名要跟着改）。
- 🔴 **不许为了"改干净"顺手删/改任何东西**（死旗子、死设置项一律**只登记**）。
- 🔴 **不许改写 `CHANGELOG.md` 的历史**。
- 🔴 **不许引白名单 / 基线 / 棘轮**。
- 🔴 **不许改 `pluginId`**（硬约束 11）。
- 🔴 **不许自己造改名工具 / 形状证明**（用 [1.41](11-任务-迁移基建.md) 的作业包）。
- ⚠️ **上位约束**：**操作体验零变化**（名字可变，取值与功能不许变）· 只做加法且名字一次定对 · [29 号档](../样式命名空间归一化/29-主题系统保护条款.md) 优先 · 对外宽容。
- ⚠️ 照旧：不跳 `npm run check` · 推前现测代理 · 推完 `ls-remote` 对 SHA · **提交只按路径 `git add`**。
- ⚠️ 🔴 **发布前置两条**：**工作区干净** ＋ **本地 HEAD 已在远端**；发布成功后 API 会往插件仓根提交 `marketplace.json` ⇒ `git pull --ff-only` 跟上。

---

## 五、交棒要求

1. **收尾四件套**（交接段顶部追加 · 清单轮次进度行 · 勾格全套 · **队列表整张复制**）。
2. 🔴 **回报三组读数**：① 改名前/后 `node scripts/audit-plugin-scope.mjs` 的**本仓处数**（期望 2 → **0**）；② §三 的 ①②④ 判据读数；③ **§2.2 的「有无迁移面」核实结论 ＋ grep 输出**。
3. 🔴 **判「本格不做某条」必须写明理由**（尤其若判"旗子无持久化 ⇒ 无迁移面"）。
4. **下一棒 = [1.45 清账 · `marketplace`](15-任务-清账-marketplace.md)（`#111n-4`）**。
5. 跑 [00 档 §八](00-整理档案.md) 探针并记账。

---

## 六、🔴 进场第一步（命令）

```bash
# 0) 确认自己是哪一棒
sed -n '1,40p' "docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/交接.md"

# 1) 拿「清账轮作业包」（1.41 交付）→ 交接段顶部第一段

# 2) 自量本仓
node scripts/audit-plugin-scope.mjs | sed -n '/── serial-monitor/,/^──/p'
node scratch/show-plugin-manifest.mjs "E:/linkdesk-plugins/official/serial-monitor"

# 3) 两个旗子的全部出现点（三处都要看：manifest / 源码 set / 源码 when 与 overrides）
grep -rn "sourceOpen\|serialSessionFocus" "E:/linkdesk-plugins/official/serial-monitor/" --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules

# 4) 有无持久化面（§2.2 的判据）
grep -rn "pluginState\|StorageService\|workspace\." "E:/linkdesk-plugins/official/serial-monitor/src" --include=*.ts --include=*.tsx | head -20

# 5) 基线
git -C "E:/linkdesk-plugins/official/serial-monitor" rev-parse HEAD
git -C "E:/linkdesk-plugins/official/serial-monitor" status --short   # 必须干净

# 6) 收尾（禁跳）
npm run check
```

---

## 七、与其它格的关系

- **[1.41 迁移基建](11-任务-迁移基建.md)（紧接前序）**：🔴 **依赖它的作业包**。
- **[1.37/1.38（上下文旗子）](07-任务-上下文旗子归属评估.md)**：🔴 **本格的改名形状与映射表从它来**；本格是它的**执行方**。
- **[1.42](12-任务-清账-file-tree.md) / [1.45](15-任务-清账-marketplace.md)**：同为清账轮，**互不依赖**（各改各的仓）。
- **记忆 `css-rename-round-toolkit`**（改名执行器十条坑，含 ⑦「隔离 profile 实机」与 ⑨⑩ 的可见性判据坑）。
