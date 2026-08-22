# 决策记录（Decision Records）

> **E5.8#6 立案（2026-08-19）——Agent Notes 缩水版。** 决策轨迹给未来 AI 当上下文（对标 AI 友好第 3 层）。
> memory `design-decisions.md`（25 条已确认决策）是快速索引；本目录是**逐条文件化 + 状态机**版本。
> 规则成文见 [docs/开发管理/工程管理与Git策略.md](../../开发管理/工程管理与Git策略.md) §决策记录。

## 规则：非平凡改动必须落一篇决策记录

**什么算「非平凡」→ 必须落一篇：**
- 架构/方向性取舍（有多个明显答案，选了其一）——如"单 Pool 还是多 Pool"
- 跨文件行为契约 / 协议约束——如 pushLayout 两条铁律
- 未来维护者会困惑的"为什么这样不那样"——如 lefthook monorepo 的 LEFTHOOK_CONFIG 注入
- 推翻或修订已有决策

**什么不算（不落）**：纯实现细节、格式整理、机械重构、文档搬运、bug 修复（除非修法定型了行为契约）。

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
