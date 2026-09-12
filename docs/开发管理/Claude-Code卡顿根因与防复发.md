# Claude Code for VS Code 卡顿——根因分析与防复发

> **调查日期：** 2026-09-13 · **调查对象：** 在 `E:\linkdesk` 使用 Claude Code for VS Code（扩展 v2.1.269）时的严重卡顿
> **性质：** 根因分析报告 + 可复用判据。**不是 LinkDesk 的缺陷**——LinkDesk 的代码与构建产物未参与其中。
> **配套工具：** 全局 skill `claude-code-health-check`（`~/.claude/skills/claude-code-health-check/`），含可执行体检脚本。
> 🔴 **本次调查未修改工程代码**，只新增本文档。

---

## 一、结论

**卡顿不是 LinkDesk「工程太大」造成的，是 Claude Code 的会话文件（transcript jsonl）无限膨胀 + 扩展全量读写该文件造成的。** 工程规模只是**加速器**——它让会话以 3～10 倍于普通项目的速度膨胀。

一句话链条：

```
一个会话连开好几天
  → 每轮往同一个 jsonl 追加：CLAUDE.md 全文 + skills/agents 清单 + prompt_snapshot
    + 工具结果全文 + 子代理消息（官方确认：子代理消息也写进主文件）
  → 文件涨到 89 MB ~ 313 MB
  → 切会话/恢复时扩展把【整个文件读进内存 + 全量解析】，且【读两次】
  → 前端把整段对话渲染成 DOM → 渲染进程主线程占满 → 光标不闪 / 复制不了字
  → 多进程内存叠加 → 整机换页 → 游戏切画面卡、Win+H 卡
```

---

## 二、实测证据（本机，2026-09-13）

### 2.1 `~/.claude` 数据目录已达 1.77 GB

| 目录 | 大小 | 判定 |
|:--|--:|:--|
| `projects/` | **1.49 GB** | 🔴 |
| `file-history/` | 253.8 MB | 🟡 |
| `plugins/` | 15.7 MB | ✅ |
| `telemetry/` | 13.7 MB | ✅ |
| `shell-snapshots/` | 6.4 MB | ✅ |

其中 `projects/e--linkdesk/` 一个项目占 **1.28 GB / 32 个会话**。

### 2.2 危险会话（> 100 MB）四个，合计 1,018.7 MB

| 大小 | 行数 | 子代理数 | 日期 | 会话 ID |
|--:|--:|--:|:--|:--|
| 312.9 MB | 128,136 | 64 | 2026-09-04 | `c0217356-8625-496d-882d-3a6e2d96b21c` |
| 299.8 MB | 118,267 | 137 | 2026-09-10 | `afc1f30d-ed28-471b-9756-8b440fe54a14` |
| 236.9 MB | 82,447 | 88 | 2026-08-18 | `c2300afd-c2b4-41ac-bb83-488164b2d3f3` |
| 169.0 MB | 70,770 | 16 | 2026-08-22 | `8f0cd9e4-00cc-4431-8603-24cd85279687` |

**子代理数与文件大小强正相关**（137 → 300 MB，88 → 237 MB，64 → 313 MB，26 → 89 MB）——因为**子代理的消息全部写进主会话文件**。

### 2.3 当前活跃会话 89.0 MB / 28,845 行

`f01cc993-79b6-4dce-99f4-270b57fb8889`，2026-09-11 起，48 小时内长到 89 MB。内部构成：

| 类型 | 占用 | 条数 |
|:--|--:|--:|
| `user`（几乎全是工具结果：Read 的文件全文、Bash 输出） | 25.6 MB | 4,893 |
| `attachment`（每轮注入的系统上下文） | 24.2 MB | 5,911 |
| `assistant` | 20.1 MB | 10,515 |
| 元数据（`ai-title`/`mode`/`atis-latch`/`last-prompt`…） | ~1 MB | ~6,800 |

`attachment` 里两个放大器：

1. **同一份内容存两遍**——96% 的 attachment 带 `rendered` 字段，该字段单独占 **6.7 MB（28%）**。
2. **固定开销每轮重复**：

   | 种类 | 占用 | 说明 |
   |:--|--:|:--|
   | `prompt_snapshot` | 8.6 MB | 每轮存一份 prompt 快照 |
   | `instructions` | 5.5 MB | `CLAUDE.md`（26 KB）**每轮重新注入一次** |
   | `invoked_skills` | 2.5 MB | 技能清单 |
   | `total_tokens_reminder` | 2.5 MB | 每轮约 500 B × 4,900 轮 |

### 2.4 实测解析开销（关键数据）

复刻扩展 `--resume` 的解析逻辑（`readFile` 全量读 + 全量 `JSON.parse` + 存 Map），对 88.9 MB 会话：

```
readFile    36 ms
全量 parse  339 ms
Map 条目    21,458
RSS 峰值    512 MB      ← 单会话、单次
external    235 MB
```

**上游根因分析指出这段代码会跑两次**（一次取消息、一次取标题），且 `catch {}` 静默吞错：

> `b2$()` 调用 `getLastLog(H)` → `s1H()` 是第 1 次读；紧接着又调 `GbA(H)` → `s1H()` 是第 2 次读。两次都独立解析整个文件。
> 实测：102.7 MB 文件 → 720 MB RSS / 14 秒。
> — [issue #23373](https://github.com/anthropics/claude-code/issues/23373)

按此推算，本机 313 MB 会话单次解析量级为 **1.5～2.5 GB RSS**。

---

## 三、上游已知缺陷（这不是 LinkDesk 特有问题）

| Issue | 症状 | 与本次卡顿的关系 |
|:--|:--|:--|
| [#23373](https://github.com/anthropics/claude-code/issues/23373) | resume 大 session 全文件解析、读两次、静默吞错 | **主因** |
| [#54373](https://github.com/anthropics/claude-code/issues/54373) | 大响应后 stream-json reader 不重新 arm → UI 冻结 | **直接对应「光标不闪、复制不了字」** |
| [#22225](https://github.com/anthropics/claude-code/issues/22225) | 扩展启动即吃 6 GB + 2 GB | 对应「20 进程撑到 6 G」 |
| [#12814](https://github.com/anthropics/claude-code/issues/12814) | 长时间使用后 OOM | 对应「内存到 97%」 |
| [#19199](https://github.com/anthropics/claude-code/issues/19199) | 进度事件不压缩 → transcript 膨胀、resume 卡住 | 对应元数据冗余 |
| [#41113](https://github.com/anthropics/claude-code/issues/41113) | ArrayBuffer 内存泄漏 ~2 MB/s | 对应持续增长 |

---

## 四、四个猜测的逐条判定

| # | 猜测 | 判定 | 依据 |
|:--|:--|:--|:--|
| 2.3.1 | AI 每次检索上下文太多，**甚至 node_modules** | **方向对，对象错** | `node_modules` 已在 `.vscode/settings.json` 的 `files.watcherExclude` 里，Claude Code 也不会自动读它。真正的问题是**每轮注入的固定上下文**（CLAUDE.md 26 KB + skill 清单 + agent 清单 + prompt_snapshot）**且每轮写进 jsonl 一次**。 |
| 2.3.2 | 插件本身有问题 | **✅ 正确，官方 issue 证实** | 见 §三——全文件解析、读两次、reader 不 re-arm、OOM、内存泄漏五条独立缺陷。 |
| 2.3.3 | 插件组合问题（markdown 预览等） | **关系不大** | 配置里 `chat.disableAIFeatures: true`、Copilot 已 disabled，两个已知内存大户已关。Markdown Preview Enhanced 只在主动开预览时吃资源。 |
| 2.3.4 | 电脑一直没关机 | **❌ 不是主因** | 关键：**jsonl 是磁盘上的持久文件**。关掉 VS Code 重开，313 MB 的文件还在，下次 resume 照样全量解析。重开只是释放了进程内存——这正好解释「重开后好一会儿又卡」。同理 `/clear` 也不会让文件变小。 |

---

## 五、核心问题：新工程会不会重蹈覆辙？

**会——但判据不是「工程大小」。**

> **卡顿的决定性变量是：一个会话活多久、每轮往里灌多少东西、开了多少子代理。**
> 一个 100 文件的小工程，只要同样连开三天会话 + 狂开子代理 + 整篇读文档，一样会卡到不能用。

### 可复用判据表（新工程照此自测）

| 指标 | ✅ 安全 | 🟡 警戒 | 🔴 危险 |
|:--|:--|:--|:--|
| **单个会话 jsonl** | < 5 MB | 10–50 MB | **> 100 MB** |
| **单个项目会话总量** | < 100 MB | 100–500 MB | **> 500 MB** |
| **会话寿命** | 一个任务一个会话 | 1 天 | **连开 2 天以上** |
| **会话内子代理数** | < 20 | 20–60 | **> 60** |
| **每轮固定注入**（CLAUDE.md + skills + agents） | < 5 KB | 5–20 KB | **> 20 KB** |
| **一次 Read 的大小** | offset/limit 切片 | 100–500 行 | **整篇大文档** |
| `~/.claude` 总占用 | < 300 MB | 300 MB–1 GB | **> 1 GB** |

**LinkDesk 各项读数**（2026-09-13）：会话 89 MB 🟡、项目总量 1.28 GB 🔴、会话寿命 2 天 🔴、子代理 26 🟡、CLAUDE.md 26 KB 🔴、`~/.claude` 1.77 GB 🔴。

> 🔴 **重要区分（2026-09-13 实测补正）：上面这些指标里，只有「单个会话的大小」直接决定卡不卡。**
> 实测证据两条：① 扩展启动时的进程命令行是 `--resume=<一个会话ID>`——**只加载一个对话**，其余全躺硬盘上不碰；② 模拟列表扫描（读每个文件首尾 16 KB）：**27 个会话只花 5 ms**，扩展不读全文。
> ⇒ **「对话数量多」「总量大」影响的是硬盘空间，不是流畅度。** 100 个 10 MB 的对话（共 1 GB）不会比 1 个 300 MB 的对话更卡——**只占地方**。
> ⇒ 真正的变量只有一个：**你此刻正在用的那个对话有多大。** 别因为总量指标标红就慌，先看当前那个。

---

## 六、对策

### A｜立即止血 ✅ **已执行（2026-09-13）**

1. **已归档 7 个 >10 MB 的旧会话**，合计 **1.6 GB** → `C:\Users\fengy\.claude-archive\2026-09-13\`
   （每个含 `jsonl` + `subagents/` + 对应 `file-history/` 三部分）。

   | 会话 | jsonl | 子代理 | file-history |
   |:--|--:|--:|--:|
   | `c0217356…` | 313 MB | 17 MB | 43 MB |
   | `afc1f30d…` | 300 MB | 156 MB | 35 MB |
   | `c2300afd…` | 237 MB | 15 MB | 38 MB |
   | `8f0cd9e4…` | 170 MB | 5.3 MB | 25 MB |
   | `9156d76b…` | 66 MB | 2.1 MB | 19 MB |
   | `049a2bb3…` | 61 MB | 996 KB | 36 MB |
   | `7b6bf2bb…` | 47 MB | 560 KB | 30 MB |

   🔴 **全部是移动，没有删除任何一个字节**，还原命令在归档目录的 `README-还原说明.md` 里。
   **实测验证：`~/.claude` 1.77 GB → 224 MB；危险会话 4 个 → 0 个。**

2. **第二批（用户确认后执行）**：`f01cc993`（89.6 MB）——用户已另开新会话并明确表示不要了，故一并归档 → `~/.claude-archive/2026-09-13-2/`（含 jsonl 89.6 MB + 子代理 7.0 MB + file-history 45.6 MB）。

   **累计结果：`~/.claude` 1.77 GB → 82.8 MB**，危险会话与警戒会话双双清零。

3. **后续处置 ✅ 已完成（2026-09-13 用户拍板「直接删掉」）**：归档区 `C:\Users\fengy\.claude-archive\` **已整个删除**（1.8 GB），C 盘可用空间 105 GB → 106 GB。

   **删前清点**：558 个 `.jsonl` ＋ 550 个 `.json`（子代理元数据）＋ 278 个 `.txt`（工具结果）＋ 16 个工作流脚本——**全部落在 `projects/` 与 `file-history/` 内，无任何项目文件混入**。

   > ⚠️ 守卫脚本**第一版误报过一次**（正则漏了日期层级，把 `2026-09-13/file-history/…` 判成"预期外"）。但它「宁可错杀」的方向是对的：**误判的代价是「没删」，不是「误删」**。写删除守卫必须选这个方向。

> 🔴 **归档正在使用的会话会出事，动之前必须先确认。** 判断方法：`ls -lat ~/.claude/projects/<项目>/*.jsonl | head` 看哪个文件还在写（mtime 是当下），并用 `env | grep CLAUDE_CODE_SESSION_ID` 确认自己不在那个会话里。本次归档 `f01cc993` 前已确认：它已停止写入 5 分钟，且当时活跃的是新会话 `92b0e780`。

### B｜工作模式（**决定新工程会不会重蹈覆辙，最关键**）

1. **🔴 一个任务一个会话**——任务完成 → 写 handoff → 开新会话。绝不一个会话连开几天。
2. **🔴 控制子代理数量**——子代理消息全进主文件，是膨胀头号推手。
3. **🔴 大文件用 `offset`/`limit` 切片读**，别整篇读。
4. **🔴 命令输出要短**——大输出重定向到文件再 `head`/`tail`。
5. **`CLAUDE.md` 保持精简**——26 KB 每轮都重新注入一次。

### C｜工程侧

| 项 | 处置 |
|:--|:--|
| `CLAUDE.md` 26 KB | 瘦身（每轮注入 × 轮次） |
| `.claude/skills/` 27.1 MB | ⚠️ **不做处置**——见下方红线；注入上下文只有约 9 KB/轮，体积只占磁盘 |
| `docs/` 523 个 md | 读时切片，别整篇读 |

> 🔴 **红线：`.claude/skills/amap-skills` 不许删。** 它是 **git submodule**（索引里是 `160000` gitlink），上游 `AMap-Web/amap-skills` **整个仓库没有 LICENSE** ⇒ 只能引用、不能再分发。2026-09-13 已补 `.gitmodules` 修复（`df861c40b`）。**19 MB 是它的内容体积，根本不进上下文**——不要因为体积指标去动它。详见项目 memory `ghost-submodule-amap-skills`。

### D｜VS Code 侧

1. 定期 `Developer: Reload Window`——**治标**（只释放进程内存，不清 jsonl）。
2. 当前配置 `claudeCode.preferredLocation: "panel"`（底部面板）。

---

## 七、配套工具

全局 skill **`claude-code-health-check`**：

```bash
# ① 体检（只读，不删不改，约 0.3s）
node ~/.claude/skills/claude-code-health-check/scripts/check.mjs
node ~/.claude/skills/claude-code-health-check/scripts/check.mjs --deep   # 加行数 + 工程侧开销

# ② 归档（处置——默认预演，必须 --yes 才动文件）
node ~/.claude/skills/claude-code-health-check/scripts/archive.mjs
node ~/.claude/skills/claude-code-health-check/scripts/archive.mjs --yes
```

- **体检脚本**只读，可随时跑。触发词：卡、变卡、内存、内存爆了、resume 慢、切换会话卡。也用于**新工程开工前做基线体检**。
- **归档脚本**默认**预演模式**（一个文件都不动），且**默认跳过最近 24 小时还在写的会话**——正在用的那个绝不会被误伤。动作是**移动**到 `~/.claude-archive/<日期>/`，自动生成还原说明。

# ③ 哨兵（已挂 SessionStart hook，每次新会话自动跑，无需手动）
#    ~/.claude/settings.json → hooks.SessionStart → scripts/sentinel.mjs
```

**哨兵**：每次新会话开始自动检查一次，**健康时零输出**（hook 输出会进上下文，平时必须闭嘴），只在「当前会话 > 50 MB / 有会话 > 100 MB / 总量 > 500 MB」时提醒一句。**只提醒不动手**，且任何异常都 `exit 0`，绝不阻塞会话。

🔔 **两道推送通道，直达用户本人**：① **Windows 系统通知**（右下角弹窗，走 `notify.ps1`，不阻塞）② hook 输出由 AI 在开场白转述。

> 🔴 **绝不能只靠 AI 转述。** 初版设计就是把提醒递给 AI 就完事——中间断一环就全废：**AI 要是不提，用户根本不知道有过提醒，还以为一切正常**。提醒这种事必须直达本人。（2026-09-13 用户点出，当场加通知通道并实测通过。）

**心跳**：每次跑完写 `~/.claude/.sentinel-last-run`（时间 + 会话数 + 总量 + 结果）。健康时零输出，所以要**用这个文件确认哨兵真的跑了**——「没报错」分不清「健康」和「根本没执行」。

⚠️ hook 里是硬编码绝对路径，**换用户名或挪动 skill 目录后要同步改 `~/.claude/settings.json`**。

---

## 八、独立佐证与相关记录

- 项目 memory `knip-needs-6gib`：「这台机器总共 15.73 GB、VSCode ＋ Claude Code 一开工就吃 8 GB＋ ⇒ 用户腾不出 6 GiB」——内存压力**已实际影响** `npm run check` 里的 `knip`（其 `oxc-parser` 需一次性申请 6 GiB 连续内存）。
- 项目 memory `ghost-submodule-amap-skills`：`amap-skills` 的 submodule 身份与「不许删」红线。
- 项目 memory `dev-environment`：本机开发环境读数。

---

## 九、本次调查的自我修正（如实记录）

初版分析中有两条**被已有记录推翻**，在此留痕：

| 初判 | 修正 | 推翻依据 |
|:--|:--|:--|
| 「`.claude/skills/` 28 MB 是 🔴 工程侧开销，应移出无关技能」 | **撤回**。① `amap-skills` 是外部 submodule，**不许删**；② skill 目录**体积不进上下文**，注入的只有 name+description。指标已改为「skill 清单注入量」而非目录体积。 | memory `ghost-submodule-amap-skills` |
| 「内存不足导致卡顿」尺度未量化 | 补上：`knip` 需 **6 GiB 连续内存**，不是「2 GB」 | memory `knip-needs-6gib` |
