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

## 维护义务（不只是读——AGENTS.md 的读者是共同维护者）

> **记忆只有一份，工具不分家。** 在本工具会话里发生的用户拍板 / 教训 / 工作法结论，同样要落盘——否则下个会话（无论 Claude 还是 ZCode）都接不住。「让这个记住」在这里说了，就写到下列落点去。

| 要落盘的东西 | 写到哪 | 规矩 |
|------|------|------|
| 用户拍板 / 教训 / 工作法 | 记忆库新建条目（frontmatter `name`/`description`/`type`，`description` 写**触发条件**非摘要）＋ `MEMORY.md` 加一行索引（两段式，一行一文件） | 格式与自检照 [docs/06-记忆系统整理/02-索引重写规范.md](./docs/06-记忆系统整理/02-索引重写规范.md)（行数 ≤100 · 孤儿 = 0 · 断链 = 0） |
| 总纲级变更（架构定论 / 硬约束 / 开发命令 / 阶段推进 / 新增 npm script） | **直接改 [CLAUDE.md](./CLAUDE.md)**——完成工程任务时**同笔**完善其对应段落（头部进度行 / Phase 表 / 硬约束 / 开发命令 / 关键文件表），不要在 AGENTS.md 另立副本 | 压缩纪律见 memory `claude-md-compression-criteria`：废案压成一句、结论保留、删段前先查有无别的落点 |
| 流水教训 / 事件 | [memory/JOURNAL.jsonl](./memory/JOURNAL.jsonl) 追加一行 `{"ts","tags","text"}`（append-only，不回改） | — |
| E6 进度 | 工程内 `E6-执行清单.md`（**唯一真相源**） | 记忆不镜像工程文档——只留结论 + 指针 |

- ⚠️ `MEMORY.md` **每次对话自动加载**，是记忆库里最贵的文件——加行克制，超预算内容下沉到记忆文件本体。
- 🔁 记忆库若再重组（批次 7+），**同笔更新**本指针与 CLAUDE.md 里指向记忆库的行——指针腐烂 = 新会话接不上。

## 红线速记（详文见所指记忆，此处只指路）

- 🔴 **不推**——`git push` 必须等用户本人点头，推必带代理（memory `push-wait-for-user` / `dev-environment`）。
- 🔴 提交纪律（`npm run check` 全绿、类别前缀、版本号同步 CHANGELOG）与设计 skill 门禁，一律照 CLAUDE.md「提交前自检」「硬约束」执行——对本文件读者同样生效。
