# 工程管理与 Git 策略

> 2026-07-24 制定 → 2026-07-29 更新。**项目管理手册。**
> 覆盖：目录结构、Git 分支策略、开发流程。

---

## 一、目录结构

```
E:\linkdesk\                         ← Git 仓库根目录
│
├── linkdesk\                        ← 🔥 软件工程本体
│   ├── CLAUDE.md                    ←    🔥🔥🔥 项目总览——AI 进场第一站
│   ├── package.json
│   ├── vite.config.ts
│   │
│   ├── src/                         ←    核心前端源码（React + TypeScript）
│   │   ├── core/                    ←       架构核心：Registry、命令、配置、事件、IPC
│   │   ├── components/              ←       壳 UI
│   │   └── hooks/
│   │
│   ├── electron/                    ←    Electron 主进程（Node.js）
│   │   ├── main.ts
│   │   ├── preload-shell.ts
│   │   ├── preload-plugin.ts
│   │   └── services/
│   │
│   ├── plugins/                     ←    插件目录——每个子目录 = 一个插件
│   │
│   ├── docs/                        ←    🔥 全部设计文档
│   │   ├── 01-Tauri_P1至P5.5/       ←      Tauri 时代归档
│   │   ├── 02-Electron架构/         ←      Electron 时代设计（E1-E4 + E3.5）
│   │   ├── 03-插件制造/             ←      插件开发规范
│   │   ├── 04-出厂制造/             ←      UI 设计优先排序
│   │   ├── 05-版本更新/             ←      版本规划 + 未来插件设计
│   │   ├── 开发管理/                 ←      项目管理（本文件）
│   │   ├── decisions/                ←      🔥 决策记录——非平凡改动落一篇（规则见 decisions/README.md）
│   │   └── 总体设计/                 ←      软件介绍 + 部件命名规范
```

---

## 二、Git 分支策略

### 当前状态

```
分支：e4（当前活跃）
远程：origin
状态：E3 已完成（封站），E4 文档已就绪
```

### 已完成的分支线

```
phase5.5（Tauri 时代）
  → phase6（冻结——Tauri 最终版，仅作退路）
  → electron（E1 开始）
    → E1 完成 → E2 完成 → E3 完成 → E4 进行中（当前 e4 分支）
```

**phase6 和 main 的关系：** 不合并。`phase6` 有 `src-tauri/`（Rust），`main` 有 `electron/`（Node.js）。后端互斥，前端共享。

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
cd E:\linkdesk\linkdesk
npm install
npm run electron:dev
npx tsc --noEmit    # 类型检查
npx vitest run      # 单元测试
```

---

## 四、日常开发

```bash
# 在 E:\linkdesk\linkdesk\ 下执行

npm run dev              # 纯前端热更新
npm run electron:dev     # Electron 桌面应用（日常开发主力）
npm run electron:build   # 打包为 Setup.exe
npm run check            # tsc + ESLint + vitest——commit 前必过
```

### commit 纪律

```
1. 改（小步，尽量 < 30 行）
2. npx tsc --noEmit  → 零错误
3. npx vitest run    → 全过
4. git diff --stat   → 确认只动了该动的文件
5. git commit         → 一条 commit 只修一个概念
```

### 决策记录义务（E5.8#6）

> 🔥 **非平凡改动必须落一篇决策记录**——规则全文见 [`docs/decisions/README.md`](../decisions/README.md)。

- **什么算非平凡**：架构/方向性取舍、跨文件行为契约、未来维护者会困惑的"为什么"、推翻/修订已有决策。纯实现细节/格式/机械重构不算。
- **落点**：`docs/decisions/{proposed,implemented,rejected,archived}/`——**路径即状态**（目录编码）；被取代 → 移 `archived/` + `Superseded by` 链接。
- **为什么**：决策轨迹给未来 AI 当上下文（对标 AI 友好第 3 层）；E5.8 执行清单任务收口时，执行注引用对应决策记录。

### 插件开发

```
1. 新建目录：plugins/my-plugin/
2. 写 plugin.json（声明 id/name/viewRole/contributes 等）
3. 写 index.tsx（React 组件）
4. npm run dev → 即时生效，零重启
```

---

## 五、文档导航

| 你要了解 | 读这个 |
|---|---|
| 项目总览 + 约束 | `../CLAUDE.md` |
| 当前状态 | `当前状态.md` |
| 开发计划 | `开发计划.md` |
| E1-E4 设计 | `../02-Electron架构/` |
| 插件制造规范 | `../03-插件制造/` |
| 日常开发操作 | `开发操作手册.md` |

---

> **🏁 E3 封站。** E4 进行中。此后框架永远不改——任何新功能 = 写插件。
