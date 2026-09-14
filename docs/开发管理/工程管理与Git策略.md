# 工程管理与 Git 策略

> 2026-07-24 制定 → **2026-09-14 重写**（E6#97e：原版写着分支 `e4` 与 `E:\linkdesk\linkdesk\` 套娃目录，均已是历史——2026-09-04 仓库结构上移三根合一；分支早已推进到 E6）。**项目管理手册。**
> 覆盖：目录结构、Git 分支策略、开发流程、决策记录义务。

---

## 一、目录结构

**Git 仓库根 = npm 根 = VS Code 打开根 = `E:\linkdesk` 单根**（2026-09-04 第 0.15/0.16 轮上移合一，历史经 filter-repo 抽子树保全，commit 一条不丢）。顶层直接可见：

```
E:\linkdesk\                         ← Git 仓库根目录（单根，无套娃）
│
├── CLAUDE.md                        ← 🔥🔥🔥 项目总览——AI 进场第一站
├── package.json / vite.config.ts
├── src/                             ← 核心前端源码（React + TypeScript）
│   ├── core/                        ←    架构核心：Registry、命令、配置、事件、IPC
│   ├── components/                  ←    壳 UI
│   ├── App/ · hooks/ · pool/
├── electron/                        ← Electron 主进程（Node.js）
│   ├── main.ts
│   ├── preload-shell.ts · preload-pool/
│   └── services/
├── plugins/                         ← 插件目录（E6 第 7 层外移后 = 夹具 + 已迁走源码的过渡态；发货插件源码真相源在各自 GitHub 仓）
├── packages/                        ← npm 作者包（plugin-sdk / contracts / linkdesk-ui / create-linkdesk-plugin）
├── bundled-plugins/                 ← 出厂种子 zip——语义 = 种子快照，非源码第二份拷贝（版本账 bundled-plugins.lock.json，7.4 轮起）
├── docs/                            ← 🔥 全部设计文档
│   ├── 01-Tauri_P1至P5.5/           ←    Tauri 时代归档
│   ├── 02-Electron架构/             ←    Electron 时代设计（E1-E6）
│   ├── 03-插件制造/                 ←    插件开发规范（作者面真理源）
│   ├── 04-软件更新/ · 05-插件更新/ · 06-发布管理/
│   ├── 开发管理/                    ←    项目管理（本文件）
│   ├── decisions/                   ← 🔥 决策记录——收录口径见 decisions/README.md 与下方「决策记录义务」
│   └── 总体设计/
```

> **插件源码住在哪（2026-09-14 立法，E6 第 7 层判据先立）：源码真相源 = 插件自己的 GitHub 仓库，不是壳仓。** 判据五条 → [`docs/03-插件制造/09-插件目录规范.md` §源码位置与分发物的关系](../03-插件制造/09-插件目录规范.md)；本地工作区布局（容器目录、容器绝不建仓）→ [15-多仓开发与本地工作区](../03-插件制造/15-多仓开发与本地工作区.md)。外移执行 = E6 第 7 层（进行中）。

---

## 二、Git 分支策略

### 当前状态（2026-09-14）

```
分支：e6（E6 工作分支）；主线 electron（阶段性快进追平，origin/electron = origin/e6）
远程：origin（github.com/Encaron/linkdesk，公开仓）
状态：E6 进行中——L4/L5 已封站；L7 插件源码外移在跑；L6 安全加固与出厂判定在后
```

### 分支脉络

```
phase5.5（Tauri 时代）
  → phase6（冻结——Tauri 最终版，仅作退路）
  → electron（E1 起）
    → e2 / e3 / e4 / e5 各期工作分支（逐期并回 electron）
    → e6（E6 全程工作分支；阶段完成后快进追平 electron）
```

**纪律**：`git push` 必须等用户本人点头、推必带代理（memory `push-wait-for-user` / `dev-environment`）。

**phase6 和 main 的关系：** 不合并。`phase6` 有 `src-tauri/`（Rust），主线有 `electron/`（Node.js）。后端互斥，前端共享。

### 退路

```
git checkout phase6    # 回到 Tauri 完整工程（如果 Electron 路径不可行）
```

---

## 三、开发环境

| 工具 | 要求 |
|------|------|
| Node.js | ≥20 |
| npm | 最新 |
| Rust / VS Build Tools / Tauri CLI | ❌ 不再需要 |

新机器初始化：
```bash
git clone <origin> E:\linkdesk
cd E:\linkdesk
npm install
npm run electron:dev
npx tsc --noEmit    # 类型检查
npx vitest run      # 单元测试
```

---

## 四、日常开发

```bash
# 在 E:\linkdesk\ 下执行

npm run dev              # 纯前端热更新
npm run electron:dev     # Electron 桌面应用（日常开发主力）
npm run electron:build   # 打包为 Setup.exe
npm run check            # 双工程 tsc + ESLint 0 警告 + vitest + 各道门禁——commit 前必过
```

### commit 纪律

```
1. 改（一次一小步，做完一格勾一格）
2. npm run check      → 全绿（无「基线接受」）
3. git diff --stat    → 确认只动了该动的文件、无调试残留
4. git commit         → 一条 commit 只修一个概念；src/ + electron/ 代码改动必须带类别前缀
                         （feat: / fix: / breaking: —— commit-msg 钩子硬拦，规则见 CLAUDE.md 硬约束 22）
```

### 决策记录义务（E5.8#6 立；2026-09-14 收录口径从「非平凡就写」换成按判据收）

> 决策记录落 `docs/decisions/`（状态机 proposed/implemented/rejected/archived + 5-15 行格式 → [`docs/decisions/README.md`](../decisions/README.md)）。**收录口径 = 一句判据：这个决策，需要「仓库外的人」知道吗？**

| | 落 `docs/decisions/`（**进 git**） | 落 memory（**不进 git**，机器本地） |
|:--|:--|:--|
| 判据 | 第三方插件作者 / 别的 AI / **clone 仓库或换机器的人**需要看见的 | 只有我和我的 AI 用：工作法、教训、执行节奏、进度记账 |
| 例 | 一插件一仓（`plugin-source-out-of-shell-repo`）· 作者文档边界（`author-docs-reader-based-boundary`）· lefthook monorepo 方案 | AI 工作法正典 · 提交前自检 · 检查清单节奏 |

**边界三条（防它长成第二真相源）**：
1. **层的执行决策仍留层档案**（如 L7 的 D1-D7）——它们是过程，不进 decisions/；只有**对外契约级**的才单独成篇。
2. **memory 侧不镜像** decisions/ 的内容——只互指、不复制。
3. **不写「关于记录的记录」**——本判据的正文就住在本档与 decisions/README.md 两处，不再单独立篇。

**为什么这条判据在 L7 变硬**：L7 之后插件作者与他们的 AI 在**别的仓库**工作、读不到 memory（memory 不进 git）——**「仓库外的读者」正是 decisions/ 目录存在的真正理由**（该目录 2026-08-19 立项后一个月只 3 篇、零门禁、总纲不指它，「重要但没人用」的机制就是第二真相源的候选，必须划清边界）。

### 插件开发

```
第三方作者：npm create linkdesk-plugin my-plugin——在自己机器的容器目录里做，不碰壳仓
            （容器布局与红线 → docs/03-插件制造/15-多仓开发与本地工作区.md）
壳仓内：plugins/ = 夹具（demo）；bundled-plugins/ = 出厂种子 zip
        官方插件源码随 E6 第 7 层外移后在各自仓（壳仓不再承担插件开发目录）
```

---

## 五、文档导航

| 你要了解 | 读这个 |
|---|---|
| 项目总览 + 约束 | `../CLAUDE.md` |
| 当前状态 | `当前状态.md` |
| 开发计划 | `开发计划.md` |
| E1-E6 设计 | `../02-Electron架构/` |
| 插件制造规范 | `../03-插件制造/` |
| 日常开发操作 | `开发操作手册.md` |

---

> **E6 进行中（L4/L5 已封站，L7 插件源码外移在跑）。** 此后框架永远不改——任何新功能 = 写插件。
