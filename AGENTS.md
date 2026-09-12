# AGENTS.md — 进场指针（ZCode / Codex 及一切读 AGENTS.md 的工具）

> **CLAUDE.md 的规矩在这里同样生效。** 那份文件虽以 Claude 命名，但它是本项目的总纲（架构 · 进度 · 硬约束 · 提交纪律），**不因当前工具不同而豁免**。
>
> 本文件是**指针，不是副本**——单一真相源，不复制被指文件的正文；如有出入，以被指文件为准。

## 进场必读（顺序固定，读完再动手）

1. **[CLAUDE.md](./CLAUDE.md)——全文读完**（不是只读开头）：圆形大厅架构、Phase 路线、硬约束、提交前自检、关键文件表都在里面。
2. **记忆索引：`C:\Users\fengy\.claude\projects\e--linkdesk\memory\MEMORY.md`**——125+ 条记忆的全量索引。先读其「🔥🔥🔥 新 AI 进场——先读这些」一节（AI 工作法正典 / 提交前机械自检 / 硬约束 / 十条戒律…），其余条目按需取对应文件。

## 记忆体系（都在哪）

- **主力记忆库（仓库外，机器本地，不进 git）**：`C:\Users\fengy\.claude\projects\e--linkdesk\memory\`——Claude Code 按工程路径生成的记忆目录，索引即上条 `MEMORY.md`。
- **仓内流水日志**：[memory/JOURNAL.jsonl](./memory/JOURNAL.jsonl)——教训/事件追记（append-only）。
- **记忆整理档案**：[docs/06-记忆系统整理/](./docs/06-记忆系统整理/)——批次处置档案 + 索引重写规范。
- 细节查证次序：CLAUDE.md → MEMORY.md 索引 → 对应记忆文件 → `docs/` 各期存档 → 源码。

## 红线速记（详文见所指记忆，此处只指路）

- 🔴 **不推**——`git push` 必须等用户本人点头，推必带代理（memory `push-wait-for-user` / `dev-environment`）。
- 🔴 提交纪律（`npm run check` 全绿、类别前缀、版本号同步 CHANGELOG）与设计 skill 门禁，一律照 CLAUDE.md「提交前自检」「硬约束」执行——对本文件读者同样生效。
