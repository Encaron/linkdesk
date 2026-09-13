# Git 集成

> **普通插件**——独立版本，纯视图插件不改壳一行代码。对标 VS Code 的 Git 侧栏。旧「工厂插件 / 预装出厂 / 入版 v1.1.0」标记作废（2026-09-13 重组：原 v1.1.0 拆出，菜单补全那一半归 [04-软件更新/待抉择池](../../04-软件更新/待抉择池/菜单补全.md)）。

---

## 定位

| | |
|---|---|
| 类型 | **纯视图插件**——`plugin.json` + React 组件 |
| 前提 | v1.1 文件树就绪（Git 操作基于文件树）+ E2c FileService |
| 涉及架构改动 | **零。** 全部在 `plugins/git/` 内 |
| 对标 | VS Code SCM（Source Control Management）侧栏 |

---

## 插件结构

```
plugins/git/
├── plugin.json          # name/icon/entry/sidebar/tabBehavior
├── index.tsx             # 主视图——Diff 查看器 / 提交详情
├── sidebar.tsx           # 侧栏——暂存区 / 变更列表 / 提交历史
├── git-service.ts        # 壳服务调用封装——调 window.linkdesk.exec()
└── GitColors.css         # diff 颜色（走 CSS 变量）
```

## plugin.json（最小版）

```json
{
  "name": "Git",
  "version": "1.0.0",
  "icon": "git-branch",
  "iconSource": "codicon",
  "description": "Git 版本控制——暂存、提交、分支、历史",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "iconLocation": "top",
  "tabBehavior": {
    "singleton": true
  }
}
```

---

## 功能分层

### 第一层——v1.3 基础：暂存 / 提交 / 变更

| 功能 | 实现 | 依赖 |
|------|------|------|
| **变更列表** | `git status --porcelain` → 解析 → 按文件分组 | `window.linkdesk.exec("git", ["status", "--porcelain"])` |
| **暂存/取消暂存** | `git add` / `git reset` | 同上 |
| **提交** | `git commit -m "..."` | 同上 |
| **Diff 查看** | `git diff` → Monaco 编辑器渲染 | 文件树 + Monaco（v1.1） |
| **分支显示** | `git branch` → 当前分支高亮 | 状态栏显示 |

### 第二层——v1.4+ 进阶：分支 / 远程 / 历史

| 功能 | 说明 |
|------|------|
| **分支切换/创建** | `git checkout -b` + `git switch` |
| **远程操作** | `git push/pull/fetch` + 进度 toast |
| **提交历史** | `git log --oneline --graph` → 树形列表 → 点提交展开详情 |
| **Stash** | `git stash push/pop/list` |
| **合并/变基** | `git merge` / `git rebase` + 冲突标记 |

---

## 为什么是纯插件

Git 插件需要的全部能力都已在 E1-E3 中提供：

| 能力 | 来源 | 插件怎么用 |
|------|:--:|------|
| 执行 Git 命令 | E1 主进程 `exec` 能力 | `window.linkdesk.exec("git", [...])` |
| 读写文件 | E2c FileService | `window.linkdesk.filesystem.readTextFile(path)` |
| 侧栏渲染 | plugin.json `sidebar` 字段（现有机制） | `"sidebar": "sidebar.tsx"` → 自动出现在侧栏 |
| 标签页（Diff 查看器） | E3 | `entry` → Monaco 编辑器 WebContentsView |
| 状态栏（当前分支） | E2c statusBar | `"statusBar": [{ "id": "branch", "text": "main" }]` |
| 右键菜单 | Phase 5 MenuRegistry | 文件树右键 → "Git: 查看历史" |
| 快捷键 | Phase 5 KeybindingRegistry | Ctrl+Shift+G → 聚焦 Git 侧栏 |
| 图标 | codicon 图标集 | `"icon": "git-branch"` |
| 配置 | Phase 5 ConfigurationRegistry | `git.defaultRemote` / `git.autoFetch` |

**不需要：**
- ❌ 不需要改壳代码
- ❌ 不需要新的 IPC 通道（`exec` 已足够）
- ❌ 不需要新的 preload API
- ❌ 不需要 `nodeIntegration`（Git 命令走主进程中转）

---

## 壳看到的是什么

跟终端插件完全一样：
1. `plugins/git/plugin.json` 被 loader 扫描到
2. 图标栏出现 Git 图标（`icon: "git-branch"`）
3. 侧栏自动渲染 `sidebar.tsx`
4. 点击图标 → 主区出现 Git 标签页

**壳不知道 Git 的存在。** 只知道"有个插件，icon 是 git-branch，有 sidebar"。

---

## 任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 1 | `plugin.json` + `index.tsx` 骨架 + 图标栏注册 | ~30 | Git 图标出现在图标栏 |
| 2 | `sidebar.tsx` —— 变更列表 + 暂存区 + 文件名树 | ~150 | `git status` 显示在侧栏 |
| 3 | `git-service.ts` —— exec 封装 + 错误处理 | ~50 | 非 git 目录 → toast "不是 Git 仓库" |
| 4 | Diff 查看器 —— Monaco 渲染 `git diff` 输出 | ~80 | 点变更文件 → Diff 标签页 |
| 5 | 暂存/提交流程——checkbox 暂存 + 输入框提交 | ~60 | 勾选文件 → 输入 message → Ctrl+Enter 提交 |
| 6 | 状态栏分支显示——`git branch --show-current` | ~20 | 状态栏显示 "main" |
| 7 | 右键菜单注册——文件树右键加 Git 命令 | ~20 | 右键文件 → "Git: 查看历史" |
| **合计** | | **~410 行** | |

---

> **← 04 索引：** `00-README.md`
> **← 依赖：** `../../02-Electron架构/E4_文件树与编辑器_暂定/`（文件树 + Monaco）
