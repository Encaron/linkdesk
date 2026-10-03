# 侧栏 toolbar 与 section 吸顶丢失（已落地 · ✅ 已发版 v0.2.21）

> **状态：✅ 已修复（2026-09-28，dev 实证）＋ ✅ 用户实机验收通过（原话「看到了，显示正确」）· ✅ 已发版 **v0.2.21**〔2026-10-04 销账订正：`git tag --contains c58689bf7`〕**——用户拍板「这次既然是壳的改动，但是我仍旧不需要发版更新软件，仍旧 dev 测试好即可，再攒一波更新点再发版」。落地读数、拍板结论、遗留见下 §落地记录。
> **现象**（用户 2026-09-28 报）：侧栏工具栏那一行（搜索框／安装／市场源／检查更新）**不再吸顶**，section 列表头（sticky head）也不吸——两者都跟着列表一起滚走。左右栏同病。
> **性质**：**E5.7「侧栏迁池」搬运时的回归**——不是新需求、不是设计变更：**机制一行没删，让机制生效的容器形态丢了**。
> **归属**：**软件本体（壳）· 修复件**——与 [已落地/工作区导入导出-布局恢复断线.md](../已落地/工作区导入导出-布局恢复断线.md) 同类先例（那件根因同样是「重构搬家断线」＝ `E5#5e-ii-f`）。
> 2026-09-28：用户实机发现 ＋ 另一 AI 追根因；本条**已独立复核**（下表逐行是读数，不是传话）。

## 定位

| | |
|---|---|
| 类型 | 用户可见交互回归修复（**纯 CSS／布局面**；零 API、零 IPC、零契约改动） |
| 丢失点 | `ef21def07`（E5.7#10「SidebarZone——侧栏迁池」，2026-08-14） |
| 影响面 | 左栏 ＋ 右栏（`RightSidebarZone` 同构复制了同一份缺陷） |
| 前提 | 无（随时可做）；**建议搭下一次软件版本的车**（与池内他件同批） |
| 涉及架构改动 | 无 |

## 判据（2026-09-28 复核读数，逐行带 file:line / commit）

| # | 读数 | 出处 |
|:--:|:--|:--|
| ① | DOM 形态 = `.ldk-side-panel-content` ›〔`flexShrink:0` 包的 toolbar〕＋〔`flex:1; overflowY:auto; minHeight:0` 包的 section stack〕——**这两个内联属性就是 E5.6#16.7k 立下的机制** | `src/pool/zones/sidebar/SidebarZone.tsx:187-204` |
| ② | 容器 CSS 只有 `flex:1 / overflow-y:auto / overflow-x:hidden / padding`，**没有 `display:flex`** ⇒ ①的两个内联属性是**死属性**；容器自己成了滚动容器 ⇒ toolbar 作为普通块级首子元素跟着滚走；section 那层的「滚动视口」高度 auto ⇒ sticky 位移恒为 0 | `SidebarZone.css:65` |
| ③ | 「机制」本身**都还在仓库里**：toolbar 的 `position:sticky; top:0` 与 section 头的 sticky 均未删 ⇒ 不是「被删了」，是**失效了** | `SidebarZone.css:73` ／ `SidebarSection.css:193` |
| ④ | 代码注释自己就是假话：「ToolbarSlot——粘顶，flex-shrink:0 保证永不滚动消失（E5.6#16.7k）」——**意图留着、机制没了**（本项目老账：注释/文档里的每条承诺都是欠账） | `SidebarZone.tsx:188` |
| ⑤ | 搬运链：`ef21def07` 新建 `SidebarZone.tsx(+167) / .css(+120)`；`44082f933`（E5.7#11）删掉还带着正确内联样式的 `SidebarRenderer.tsx(−156)`；`git log --all -S flexDirection -- '*SidebarZone*'` = **空**（此后从没补回来） | git |
| ⑥ | **唯一真相源也断了**：全仓搜 `.side-panel-content` 只剩两处（左右栏两个池 zone）——当初「各一份」的壳侧载体 `src/components/SidePanel.tsx` **也已不存在** ⇒ 「照旧写法抄回来」这条路今天同样没了，布局**必须**写进 CSS | 全仓 grep |

## 落地记录（2026-09-28）

**拍板四件**（用户选择题全选推荐项）＋ 一条发版口径：

| # | 事 | 结论 |
|:--:|:--|:--|
| ① | 修法 A／B | **A**——布局写进 CSS（B＝保留容器自滚，滚动容器归属里外两处、语义糊） |
| ② | 那条失效的 `position:sticky` 留不留 | **删**（连它的 `calc(var(--z-sidebar-sticky-header) + 1)` z-index 一起删；留着会被下一个人当生效机制读——判据表 ④ 就是这么来的） |
| ③ | 右栏 | **同一件一起修**（不另立第二件） |
| ④ | 补门禁腿 | **先一次性 CDP 实证**，门禁化**另登记** → [../待抉择池/侧栏布局形态门禁化.md](../待抉择池/侧栏布局形态门禁化.md) |
| — | 发版 | **本次不发版**：dev 测好即止，攒下一批一起发（`package.json` 仍 0.2.20） |

**落点**（两文件，各两处；左右栏同值）

| 文件 | 改动 |
|:--|:--|
| `src/pool/zones/sidebar/SidebarZone.css` | `.ldk-side-panel-content` ＋`display:flex; flex-direction:column;`，`overflow-y:auto` → `overflow:hidden`；`.ldk-side-panel-toolbar` 删 `position/top/z-index`；两处注释改写为「粘顶靠容器 flex 纵列，不靠 sticky」 |
| `src/pool/zones/right-sidebar/RightSidebarZone.css` | 同上（`RightSidebarZone.css:60/:68` 与左栏同构同病） |

**实证读数（CDP，9222 上 dev 实例；Vite HMR 把改动推入同一实例，未重启、未动持久化）**

- **先造确定性溢出**：往 section 内层注入 2000px 填充块——空 workspace 下 section 无内容体，不造溢出就量不出真假（这本身也是判据表 ②③ 之外的一个测量前提）。
- **修前**：`content` `display:block`／clientH 813 · scrollH 2230（**它自己在滚**）；带 `flex:1` 的内层 clientH = scrollH = 2161（**＝内容高**，剩余 752 被无视 ⇒ `flex:1` 是死属性）；滚外层 300 → **toolbarTop 65 → −235、section 头 126 → −174**（症状复现）；内层 `scrollTop` 恒 0（**不可滚 ⇒ sticky 的包含块永不滚动，吸顶物理上不可能**）。
- **修后**：`content` `display:flex / flex-direction:column / overflow:hidden`，clientH = scrollH = 813（**不再自滚**）；内层 clientH 744 · scrollH 2161 → 可滚；内层滚 300／700 时 **toolbarTop 恒 65**；section 头钉在内层顶端 **126 不动**（`stuck=true`）。再往 section 体内注入 900px（section 高 983）复测，头仍钉 126 ⇒ 吸顶真的生效，且被父盒边界正确钳制（空 profile 下每个 section 仅 22px 头、无行程，是**正确**行为，不是缺陷）。
- **收尾**：两块填充 div 均已拔除（`innerScrollH` 回到 744）；实例保持运行，未关。

**门禁**：`npm run check` **全绿**——vitest 205 文件 / 2785 例（`check` 是单条 `&&` 链，vitest 跑到即前序 tsc×3／ESLint／pool-css／grid／contracts／全部脚本判据均过）。
**版本判定**：PATCH 量级（纯 CSS 布局修复，零 API／契约／IPC 改动）；**落号随下一批攒批统一定**，不在本件单独占号。
**实机验收**：2026-09-28 用户在自己的窗口目视确认——回复「看到了，显示正确」（起因那枚「检查更新」钮滚动时不再消失、钉在顶部）。

## 当初要拍板的事（四件 · 2026-09-28 已拍板，结论见上）

1. **修法 A（推荐）／B** —— 两个 `.ldk-side-panel-content` 各补 `display:flex; flex-direction:column;` ＋ 把 `overflow-y:auto` 换成 `overflow:hidden`（滚动交回内层那个 `flex:1` 的 div，正是 #16.7k 原意）。
   - **推荐 A 的理由**：丢失的根因就是**布局只活在内联样式里**——搬运时掉一个 prop 不报错、门禁也不查；写进类名才是防复发。
   - B（次选）：只补 `display:flex` ＋ `flex-direction`、保留容器自己的 `overflow-y:auto`——改动更小，但**滚动容器归属变成里外两处**，语义更糊。
2. **那条失效的 `position:sticky` 留不留**（`SidebarZone.css:73` ／ `RightSidebarZone.css:68`）：建议**删**，并在注释里写明「吸顶靠容器 flex 列，不靠 sticky」——留着它，下一个人还会以为它是生效机制（④就是这么来的）。
3. **右栏同修**（同一件里，不另立第二件）：`RightSidebarZone.tsx:105` ＋ `.css:60` 与左栏同构同病。
4. **要不要补一条机械腿**（防同类「搬运掉容器形态」再发生）：候选 = dev/CDP 冒烟，量 `.ldk-side-panel-content` 的 `computed display` ＋「谁是真滚动容器」。
   - 现状门禁全是**静态与结构性判据**（tsc×2 / ESLint / vitest-jsdom / pool-css **只校「类名有没有 CSS 定义」**——类名确实有定义，只是定义里少一行 / grid）⇒ **计算后布局是盲区**（sticky 的包含块在 jsdom 里根本不存在）。
   - ⚠️ 若做，按规矩「新增门禁要写判据」——判据写进本件，不只在池里记一句。

## 为什么现在才发现（教训，入记忆／JOURNAL）

- E5.7#10 的验收清单里**明明写着这一项**——6 项之 ④「toolbar/section 角色分离（toolbar 粘顶在滚动容器外）」（`E5.7-执行清单.md:146`），而且 `#11` 还再钉了一句「toolbar 粘顶是 E5.6#16.7k 打磨的活代码，**禁止重写**」（同档 `:152`）。
  ⇒ **丢的不是清单，是「怎么对」**：当时对照的是**行为**（toolbar 在不在、角色分没分），没对**让行为成立的前提**（容器是不是 flex 纵列）；那笔执行注里的 4 条差异（`:150`）也没记这一条 ⇒ **验收是假绿**。
- 门禁三件全过，但过的都是「结构性判据」：类名有定义 ✔、TS 合法 ✔、jsdom 不跑布局 ✔。
- ⇒ **「搬运等价」不能只对照行为清单，还要对照「让行为生效的前提」**（容器形态、定位祖先、滚动容器归属都在此列）。

## 验收判据（做完怎么算成）

- [x] 列表滚到底，工具栏仍在顶部（**CDP 实证**：内层滚 300／700，toolbarTop 恒 65；右栏与左栏同值同删，未单独量）
- [x] 多 section 场景：section 头吸顶、折叠交互不受影响（**CDP 实证**：注入内容体后 section 高 983，头钉在内层顶端 126 不动）
- [x] 断点回归：插件市场搜索框内容超限（E5.6#16.7k 的**原始场景**）不再把 toolbar 挤出可视区——**用户 2026-09-28 实机目视通过**（改动已把 toolbar 整个移出滚动区，见 §落地记录读数）
- [x] 窄侧栏（170px）／亮暗主题／`--ui-scale` 放大一档：不破格、不裁切——用户同一次实机目视未报异常（**未逐项单测**）；本件只动容器 `display` 与滚动归属，不涉宽度/主题/字号 token
- [x] `npm run check` 全绿（含 pool-css 门禁）；04 本行已划销 ＋ 本档已 `git mv` 进 `已落地/`

> ✅ **动手前两条程序（已执行）**：① 先 CDP 实证——改前与改后都量了 `.ldk-side-panel-content` 的 `computed display` ＋「谁是真滚动容器」＋滚动前后坐标（读数见 §落地记录）；② 纯 CSS／布局改动过了 CLAUDE.md **硬约束 16**（经 `Skill` 调 `ui-ux-pro-max`；本件**零新增颜色/间距/token**，只补容器形态）。

## 遗留（另登记，不在本件内）

- **门禁化**（用户拍板「先一次性实证，门禁化另登记」）⇒ [../待抉择池/侧栏布局形态门禁化.md](../待抉择池/侧栏布局形态门禁化.md)——给「搬运类任务丢容器形态」补一条机械腿（候选 A dev＋CDP 冒烟／B 静态断言容器规则块／C 只上文档纪律）。
- **✅ 已发版 v0.2.21**〔2026-10-04 销账订正：`git tag --contains c58689bf7`〕：当时号随该批统一（`package.json` 当时仍 0.2.20）。

## 顺带记一条影响面

刚发布的插件市场 **v1.1.0** 那枚「检查更新」钮**就长在这条 toolbar 里** ⇒ 实机验收时它会跟着列表滚走。**这不是新插件的 bug**，是 E5.7 这条遗留的表现——两条账别混。

## 出处记账（同笔要补，否则下一个人从层档案找不到）

- `docs/02-Electron架构/E5.7_极简Pool/E5.7-执行清单.md` 的 #10 条目下**已补**一行「已知遗留 → 本档」指针：#10 的 6 项验收里第 ④ 项（toolbar 粘顶）**在清单上、却是假绿**——对照只对了**行为**、没对**前提**，那笔执行注的差异表也没记这条。
- ⚠️ 这条**不是**插件侧／E6 事项，处置地就是本目录（04-软件更新）。
