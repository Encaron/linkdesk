# 工程管理与 Git 策略——从零开始

> 2026-07-24。**本文档是从零开始的项目管理手册。** 覆盖：目录结构、Git 分支剧本、Tauri→Electron 迁移路线、日常开发流程。
> 新 AI 进场、新同事接手、Encaron 半年后回来看——读完这篇就知道工程怎么管。

---

## 一、目录结构——E:\linkdesk\ 里有什么

```
E:\linkdesk\                         ← Git 仓库根目录（git root）
│                                      分支：phase5.5
│                                      远程：origin
│
├── .git\                            ← Git 数据
├── .gitignore                       ← 忽略 node_modules/ dist/ target/ *.log
│
├── .claude\                         ← Claude Code 项目配置
│   └── skills\                      ← 项目级技能（ui-ux-pro-max 等）
│
├── docs\                            ← 仓库级文档（仅 1 个历史审计文件，不重要）
│
├── Serial_C_Language\               ← 串口 C 语言协议定义（独立资料，不属于工程）
│
├── linkdesk\                        ← 🔥 软件工程本体——所有代码和文档在这里
│   ├── .claude\                     ←    Claude Code 项目技能（find-skills, skill-creator, ui-ux-pro-max 等）
│   ├── .gitignore
│   ├── CLAUDE.md                    ←    🔥🔥🔥 项目总览——AI 进场第一站
│   ├── package.json                 ←    npm 依赖 + 脚本
│   ├── vite.config.ts               ←    Vite 构建配置
│   ├── vitest.config.ts             ←    Vitest 测试配置
│   ├── tsconfig.json
│   ├── index.html                   ←    SPA 入口 HTML
│   │
│   ├── src/                         ←    🔥 核心前端源码（React + TypeScript）
│   │   ├── core/                    ←       架构核心：Registry、命令、配置、事件、IPC
│   │   ├── components/              ←       壳 UI：图标栏、侧栏、标签栏、分屏、状态栏
│   │   ├── hooks/                   ←       通用 hooks
│   │   └── ...
│   │
│   ├── src-tauri/                   ←    🔴 Tauri Rust 后端（Electron 迁移后删除）
│   │   ├── Cargo.toml               ←       Rust 依赖（含 serialport-rs）
│   │   ├── tauri.conf.json          ←       Tauri 配置
│   │   └── src/                     ←       Rust 源码（5 个 .rs 文件，~751 行）
│   │
│   ├── plugins/                     ←    插件目录——每个子目录 = 一个插件
│   │   ├── terminal/                ←      终端插件（plugin.json + React 组件）
│   │   ├── settings/                ←      设置插件
│   │   ├── marketplace/             ←      插件市场
│   │   └── welcome/                 ←      欢迎页
│   │
│   ├── docs/                        ←    🔥 全部设计文档
│   │   ├── 01-Tauri_P1至P5.5/       ←      Tauri 时代归档（P1-P5.5，16 个 md）
│   │   ├── 02-Electron架构/         ←      🔥🔥🔥 Electron 时代设计——E1 迁移 + E2 加固 + E3 收尾
│   │   ├── 03-插件制造/             ←      未来插件设计（文件树/编辑器/工作台/OLED）
│   │   ├── 开发管理/                 ←      项目管理文档（本文件、开发计划、当前状态、操作手册）
│   │   └── 总体设计/                 ←      软件介绍 + 部件命名规范
│   │
│   ├── dist/                        ←    构建产物
│   ├── assets/                      ←    静态资源
│   ├── public/                      ←    公共资源
│   └── scripts/                     ←    构建脚本
│
└── node_modules\                    ← 仓库级 npm 依赖（可能为空——依赖主要在 linkdesk/ 内）
```

**关键规则：**

- **Git 根是 `E:\linkdesk\`**，不是 `E:\linkdesk\linkdesk\`。所有路径在 git 里都以 `linkdesk/` 开头。
- **软件本体在 `linkdesk/`**——`npm run dev`、`npx tsc --noEmit`、`npx vitest run` 都在这个目录下执行。
- **Claude Code 配置在 `E:\linkdesk\.claude\`**——settings.json、记忆系统、权限规则。

---

## 二、Git 分支剧本——从现在到未来

### 2.1 当前状态

```
分支：phase5.5
锚点：1e0b8a3（Tauri 时代完成，48/48 bug 已修）
状态：代码稳定，等待迁移

现有分支：
  master                  ← 旧主线（将改名为 main）
  phase4-plugin-system    ← Phase 4 归档
  phase5-app-infrastructure ← Phase 5 归档
* phase5.5                ← 当前位置
```

### 2.2 核心原则——每 Phase 一个分支

```
每个 Phase 开出独立分支 → 完工验证 → 合并回 main → 下一个 Phase 从 main 开出。

好处：
  - 每个 Phase 可独立 review（git diff main..electron-e1 只看到 E1 的变更）
  - 一个 Phase 出问题不影响其他 Phase
  - main 始终是可运行的稳定版本
  - 任何时候想回溯"E1 刚做完时长什么样"→ electron-e1 分支还在
```

### 2.3 分支操作时间线

```
第 0 步：整理基线——先把 Tauri 稳定版合入主线
──────────────────────────────────────────────────
  git branch -m master main              # 旧主线改名
  git checkout main
  git merge phase5.5                     # 🔥 Tauri 稳定版 → main
  git push origin main

  git branch -m phase5.5 phase6          # 当前分支改名——冻结 Tauri
  git push origin phase6

  现在：
    main    = Tauri 稳定版（基线）
    phase6  = 同一份代码的只读快照（保险箱，永不再动）

  此后 phase6 分支不再有新 commit。
  它是 Tauri 时代的完整快照——src-tauri/、Rust 源码、tauri.conf.json 全部保留。
  唯一用途：如果 Electron 路径出现不可逾越的问题，切回来继续。


第 1 步：E1——Electron 迁移
──────────────────────────────────────────────────
  git checkout -b electron-e1 main       # 从主线基线开出

  在 electron-e1 分支上：
    E1 迁移 7 步（~16h AI）
    完工标准：软件行为与迁移前 100% 一致
    关键动作：删 src-tauri/（3.9GB）→ 建 electron/ → invoke → window.linkdesk

  完工后：
    npx tsc --noEmit  ← 零错误
    npx vitest run    ← 全过
    端到端验证全部功能

    git checkout main
    git merge electron-e1            # 🔥 合并到主线
    git push origin main
    git branch -d electron-e1        # 可选——保留也不占空间

  现在 main = Electron 桌面应用，行为与 Tauri 版完全一致。


第 2 步：E2——底层加固 + 侧栏扩展位
──────────────────────────────────────────────────
  git checkout -b electron-e2 main   # 从稳定主线开出

  在 electron-e2 分支上：
    E2 23 项任务（#1-#23）
    完工标准：ErrorBoundary 全覆盖 + 侧栏能挂文件树

  完工后：
    npx tsc --noEmit  ← 零错误
    npx vitest run    ← 全过
    侧栏能挂持久面板验证通过

    git checkout main
    git merge electron-e2
    git push origin main


第 3 步：E3——多 WebView + 壳收尾
──────────────────────────────────────────────────
  git checkout -b electron-e3 main   # 从稳定主线开出

  在 electron-e3 分支上：
    E3 33 项任务（#24-#56）
    完工标准：🏁 架构完工。此后框架永远不改

  完工后：
    npx tsc --noEmit  ← 零错误
    npx vitest run    ← 全过
    多进程隔离 + 主题/语言跨进程同步 + Profile 全部可用

    git checkout main
    git merge electron-e3
    git push origin main

    🏁 main = 架构完工。E 编号到此为止。


第 4 步及以后：写插件
──────────────────────────────────────────────────
  不需要新分支。直接在 main 上写。
  文件树插件 / 编辑器插件 / 工作台 / OLED / 地图 / 逻辑分析仪……

  任何新功能 = 写 plugin.json + React 组件，不碰框架。
```

### 2.4 分支全景图

```
phase6 (冻结)            main (主线)               electron-e1/e2/e3 (已合并)
─────────────           ─────────────────           ──────────────────────────
Tauri 完整工程           Electron 稳定发布           每 Phase 的独立开发分支
仅作退路               E1→E2→E3 逐阶段合并          完工后合并到 main
不再有新 commit         CI/CD + 发布                 保留或不保留均可

  phase6 ──→ electron-e1 ──→ main ──→ electron-e2 ──→ main ──→ electron-e3 ──→ main
              (E1 开发)      (合并)     (E2 开发)      (合并)     (E3 开发)      (🏁)
```

**phase6 和 main 的关系：** 不合并。`phase6` 有 `src-tauri/`（Rust），`main`（E1 后）有 `electron/`（Node.js）。后端互斥，前端（`src/`、`plugins/`）共享。不存在"把 Tauri 的 commit 合并到 Electron"的场景。

### 2.5 日常工作流

```
开发 E2 某任务：
  当前在 electron-e2 分支
  → 改代码 → tsc + vitest → git commit
  → push origin electron-e2

需要参考 Tauri 代码：
  git stash
  git checkout phase6  → 看 → git checkout electron-e2 → git stash pop

日常在 main 上修 bug：
  git checkout main
  → 改 → commit → push

E2 开发期间 main 有新提交：
  git checkout electron-e2
  git merge main              # 把 main 的修复同步过来

---

## 三、迁移前后对比——目录变化

### E1 迁移前（现在——phase5.5/phase6）

```
E:\linkdesk\linkdesk\
├── src-tauri\           ← Rust 后端（~3.9GB 含编译产物）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src\             ← 5 个 .rs 文件
├── src\                 ← React 前端（invoke() 调 Tauri）
├── plugins\             ← 4 个插件
├── package.json         ← 含 @tauri-apps/* 依赖
└── vite.config.ts       ← 含 Tauri 配置
```

### E1 迁移后（electron-e1 分支 → 合并到 main）

```
E:\linkdesk\linkdesk\
├── src-tauri\           ← ✕ 删除（释放 3.9GB）
├── electron\            ← 🆕 Electron 主进程（Node.js）
│   ├── main.ts          ←   BrowserWindow + WebContentsView
│   ├── preload-shell.ts ←   window.linkdesk 壳侧 API
│   ├── preload-plugin.ts←   window.linkdesk 插件侧 API
│   ├── services/        ←   SerialService / FileService / ConfigService
│   └── protocol.ts      ←   linkdesk:// 协议处理
├── src\                 ← React 前端（window.linkdesk.* 替代 invoke）
├── plugins\             ← 4 个插件（不变）
├── package.json         ← 含 electron 依赖，无 @tauri-apps/*
└── vite.config.ts       ← 无 Tauri 配置
```

---
## 四、开发环境——迁移前后对比

### 4.1 系统依赖

| 依赖 | Tauri 时代 | Electron 时代 | 变化 |
|---|---|---|---|
| **Node.js** | ✅ 需要（≥18） | ✅ 需要（≥20，Electron 30+） | 版本要求提升 |
| **npm** | ✅ 需要 | ✅ 需要 | 不变 |
| **Rust 工具链** | ✅ `rustc` + `cargo`（`rustup` 安装） | ✕ **不再需要** | Rust 748 行后端消失 |
| **Visual Studio Build Tools** | ✅ C++ 桌面开发（Rust 编译需要 MSVC linker） | ✕ **不再需要** | Electron/serialport 用预编译二进制 |
| **Tauri CLI** | ✅ `cargo install tauri-cli` | ✕ **不再需要** | — |
| **WebView2** | ✅ Windows 10/11 自带 | ✕ **不再依赖系统** | Electron 自带 Chromium |
| **Python** | ❌ 不需要 | ❌ 不需要（`serialport` npm v10+ 用 prebuild，无需 node-gyp） | — |

### 4.2 npm 依赖变化

```
删除（@tauri-apps/*）：
  @tauri-apps/api            ← invoke / listen / event
  @tauri-apps/plugin-fs      ← 文件系统
  @tauri-apps/plugin-dialog  ← 对话框
  @tauri-apps/cli            ← Tauri 命令行

新增（Electron 生态）：
  electron                   ← 框架本体（~30.0+）
  electron-builder           ← 打包为 Setup.exe
  serialport                 ← 串口通信（替代 Rust serialport-rs）

保留（框架无关）：
  react / react-dom          ← UI
  @codemirror/*              ← 终端编辑器
  @monaco-editor/react       ← 未来编辑器
  i18next / react-i18next    ← 国际化
  @vscode/codicons           ← 图标
  vite / vitest / typescript ← 工具链
```

### 4.3 package.json scripts 变化

```
改前（Tauri）：              改后（Electron）：
  "tauri": "tauri"             删除
  "dev": "vite"                不变——纯前端热更新
  -                           "electron:dev": "vite build && electron ."
  -                           "electron:build": "electron-builder"
```

### 4.4 新机器初始化——从零到跑起来

```bash
# 1. 装 Node.js（≥20，LTS）
#    https://nodejs.org

# 2. 克隆仓库
git clone <origin> E:\linkdesk
cd E:\linkdesk\linkdesk

# 3. 切到工作分支
git checkout main          # 稳定主线
# 或
git checkout electron-e1   # E1 开发期间

# 4. 安装依赖
npm install

# 5. 启动
npm run electron:dev       # Electron 桌面应用 + 热更新

# 6. 检查
npx tsc --noEmit           # 类型检查——零错误
npx vitest run             # 单元测试——全过
```

**对比 Tauri 时代的新机器初始化——少了 3 步：**
- ~~安装 Rust（`rustup`）~~
- ~~安装 VS Build Tools（C++ 桌面开发）~~
- ~~安装 Tauri CLI（`cargo install tauri-cli`）~~
- ~~`cargo check`~~

---

## 五、日常开发——Electron 时代的工作流

### 5.1 开发命令

```bash
# 在 E:\linkdesk\linkdesk\ 目录下执行

npm run dev              # 纯前端热更新（React 开发用）
npx electron .           # 完整 Electron 桌面应用
npm run electron:dev     # Electron + Vite 热更新（日常开发主力）
npm run electron:build   # 打包为 Setup.exe

npx tsc --noEmit         # TypeScript 检查——commit 前必过
npx vitest run           # 单元测试——commit 前必过
```

### 5.2 插件开发

```
# 在 E:\linkdesk\linkdesk\plugins\ 下

1. 新建目录：plugins/my-plugin/
2. 写 plugin.json（声明 id/name/viewRole/tabBehavior 等字段）
3. 写 index.tsx（React 组件——核心代码能用的库和 API，插件全能）
4. npm run dev  → 插件即时生效
5. 零重启——Vite 热更新
```

### 5.3 commit 纪律

```
每一步执行模板：
1. 读相关代码（3 分钟 max）
2. 改（小步，尽量 < 30 行）
3. npx tsc --noEmit  → 零错误
4. npx vitest run    → 全过
5. git diff --stat   → 确认只动了该动的文件
6. git commit         → 一条 commit 只修一个概念
7. 告诉用户测什么    → 用户验证
8. 用户确认          → 下一步

不做的事：
❌ 一口气修多个概念——一条 commit 只做一件事
❌ 跳过 tsc/vitest 直接 commit
❌ "顺手"加新功能——E1/E2 零新功能
❌ 单 WebView 里先写功能再迁 IPC——双倍工作量
```

---

## 六、退路——如果 Electron 不行怎么办

```
git checkout phase6
```

回到 Tauri 完整工程。丢失的：`main` 分支上的 E1 迁移代码。保留的：全部 React 组件、Registry、Hooks、插件——这些代码在两条分支上完全一样，不存在"白干"。

**触发条件（概率低）：**
- Electron 打包的应用在目标机器上无法启动
- 串口性能不可接受（serialport npm 不如 serialport-rs）
- 遇到 Electron 的不可逾越限制

---

## 七、文档导航

| 你要了解 | 读这个 |
|---|---|
| 项目总览 + 约束 | `linkdesk/CLAUDE.md` |
| Tauri 时代完整记录 | `linkdesk/docs/01-Tauri_P1至P5.5/` |
| E1 迁移设计 | `linkdesk/docs/02-Electron架构/E1_Electron迁移_暂定/` |
| E2 底层加固 | `linkdesk/docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/` |
| E3 多 WebView 收尾 | `linkdesk/docs/02-Electron架构/E3_多WebView与壳收尾_暂定/` |
| Phase 重排映射 | `linkdesk/docs/02-Electron架构/E1_Electron迁移_暂定/09-Phase重排-任务映射.md` |
| 实施顺序 + 执行纪律 | `linkdesk/docs/02-Electron架构/E1_Electron迁移_暂定/06-实施顺序.md` |
| 日常开发怎么跑 | `linkdesk/docs/开发管理/开发操作手册.md` |
| 本文件 | `linkdesk/docs/开发管理/工程管理与Git策略.md` |

---

> **前一个锚点：** `1e0b8a3`（Tauri 时代完成，48/48 bug 已修）
> **下一个锚点：** `electron-e1` 分支第一个 commit——E1 迁移开始
> **🏁 终点：** E3 完成——架构完工。此后框架永远不改，所有新功能 = 写插件。
