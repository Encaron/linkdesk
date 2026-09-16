# 决策记录（Decision Records）

> **E5.8#6 立案（2026-08-19）——Agent Notes 缩水版。** 决策轨迹给未来 AI 当上下文（对标 AI 友好第 3 层）。
> memory `design-decisions.md`（25 条已确认决策）是快速索引；本目录是**逐条文件化 + 状态机**版本。
> 规则成文见 [docs/开发管理/工程管理与Git策略.md](../开发管理/工程管理与Git策略.md) §决策记录。

## 规则：收录口径 = 一句判据——这个决策，需要「仓库外的人」知道吗？

> 🔴 **2026-09-14 E6#97e 换口径**（原口径「非平凡改动必须落一篇」废弃——「非平凡」机械判不住，实测一个月只 3 篇、零门禁、总纲不指它，「重要但没人用」的机制就是第二真相源的候选）。

| | 落 `docs/decisions/`（**进 git**） | 落 memory（**不进 git**，机器本地） |
|:--|:--|:--|
| 判据 | 第三方插件作者 / 别的 AI / **clone 仓库或换机器的人**需要看见的 | 只有我和我的 AI 用：工作法、教训、执行节奏、进度记账 |
| 例 | 一插件一仓（`plugin-source-out-of-shell-repo`）· 作者文档边界（`author-docs-reader-based-boundary`）· lefthook monorepo 方案 | AI 工作法正典 · 提交前自检 · 检查清单节奏 |

**边界三条（防它长成第二真相源）**：
1. **层的执行决策仍留层档案**（如 E6 第 7 层的 D1-D7）——它们是**过程**，不进 decisions/；只有**对外契约级**的才单独成篇。
2. **memory 侧不镜像** decisions/ 的内容——只互指、不复制（`design-decisions.md` 与本目录重叠处照此办理）。
3. **不写「关于记录的记录」**——本判据的正文住在 [工程管理与Git策略.md §决策记录义务](../开发管理/工程管理与Git策略.md) 与本档两处，**不再单独立一篇决策记录**。

**为什么这条判据在 L7 变硬**：L7 之后插件作者与他们的 AI 在**别的仓库**工作、读不到 memory——**「仓库外的读者」正是本目录存在的真正理由。**

## 目录状态编码（路径即状态）

```
docs/decisions/
  proposed/      新提议，待评审
  implemented/   已拍板落地（多数决策直接到这）
  rejected/      考虑过但否决——否决理由同价值
  archived/      被取代——从 implemented 移入 + 顶部加 Superseded by 链接
```

**状态迁移**：`proposed → implemented / rejected`；`implemented` 被新决策取代 → 移入 `archived/`，新决策记录里 `Superseded:` 指回旧决策。

## 记录格式（缩水版，5-15 行）

```markdown
# <决策标题>

- **日期**：YYYY-MM-DD
- **状态**：implemented（目录编码状态，此处复述便于 grep）
- **背景**：为什么有这个决策点（2-3 句）
- **决策**：选了哪个 + 一句话理由
- **影响**：谁受影响、破坏了什么
- **Superseded by**：（被取代时填新记录链接）
```

## 与执行清单挂钩

E5.8 执行清单任务的**执行注**引用对应决策记录（`decisions/implemented/<slug>.md`）；
任务收口时若体现了某决策，执行注补链接——验收：#6 起 E5.8 后续任务执行注与决策记录挂钩。

## 目录

- [implemented/lefthook-monorepo](implemented/lefthook-monorepo.md) — E5.8#3 lefthook 接入的 monorepo 方案（LEFTHOOK_CONFIG 注入 + job root: linkdesk）
- [implemented/normalization-sentinels](implemented/normalization-sentinels.md) — E5.8#6.6 归一化全景审计 + 双机械哨兵（no-hardcoded-hex error 级 / no-hardcoded-chinese 升 error 扩 src，豁免必须入账本）
- [implemented/reversible-registration-decision](implemented/reversible-registration-decision.md) — E5.8#8 可逆注册 Phase 2 三项拍板（兼容期一步到位 / 声明式全清全重扫 vs 命令式 disposer 回滚 / registerExternalGetter 不进插件回滚）
- [implemented/plugin-source-out-of-shell-repo](implemented/plugin-source-out-of-shell-repo.md) — 2026-09-14 插件源码外移：一插件一仓、壳仓只留产物、出厂=构建期拉取（执行载体 = E6 第 7 层 #97-#104）
- [implemented/author-docs-reader-based-boundary](implemented/author-docs-reader-based-boundary.md) — 2026-09-14 作者面文档边界按读者不按目录；老 15 篇不搬（索引式归纳）；主题手册从设计文档提炼新写；文档单独发 npm 包；脚手架 `AGENTS.md` 四件事（执行载体 = E6 第 7.8 轮 #105）
- [rejected/plugin-view-style-isolation](rejected/plugin-view-style-isolation.md) — 2026-09-16 插件视图样式隔离：`@layer` / Shadow DOM / CSS Modules / 动态注入**四路皆不采用**（`@layer` 只解决「谁赢」不解决「谁命中」，附最小实验）；改用「命名空间约定 ＋ 静态门禁 ＋ 运行时探针」三层替代；**含 5 条可判定触发条件**（执行载体 = E6 第 1 层 1.29）
