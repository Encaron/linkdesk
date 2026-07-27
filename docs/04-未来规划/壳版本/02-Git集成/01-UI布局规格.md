# 01 — UI 布局规格

> 2026-07-28。**Git 插件的 UI/UX 参考规格。** 对标 VS Code SCM 侧栏 + Diff Editor。
> 设计系统：LinkDesk 现有 Dark Mode (OLED) palette + VS Code Git 颜色约定。
> **Git 是纯视图插件——侧栏 + 标签页。不改壳。**

---

## 一、Git 侧栏 Wireframe

```
┌─────────────────────────────────────┐
│ 源代码管理                       ⋯  │  ← 侧栏标题 (h=28px)
├─────────────────────────────────────┤
│ ── 提交 ──                          │
│ ┌─────────────────────────────────┐ │
│ │ 输入提交消息...                  │ │  ← commit message input (h=32px)
│ └─────────────────────────────────┘ │
│ [✔ 提交]  [↻ 刷新]  [⋯ 更多操作]   │  ← 工具栏按钮
├─────────────────────────────────────┤
│ ▸ 暂存的更改 (3)                    │  ← collapsible section, h=22px
│   ┌───────────────────────────────┐ │
│   │ ☑ A  src/components/Modal.tsx │ │  ← 文件名 + 路径（dimmed）+ A badge
│   │ ☑ M  src/core/CoreEvents.ts  │ │  ← M badge (黄色)
│   │ ☑ ➕ src/hooks/useGit.ts      │ │  ← ➕ = 新文件
│   └───────────────────────────────┘ │
│                                     │
│ ▾ 更改 (5)                          │  ← collapsible section
│   ┌───────────────────────────────┐ │
│   │ ☐ M  plugins/terminal/index.tsx│ │
│   │ ☐ M  plugins/settings/App.tsx  │ │
│   │ ☐ D  src/old/deprecated.ts    │ │  ← D badge (红色) + dimmed filename
│   │ ☐ U  src/new/untracked.ts     │ │  ← U badge (绿色)
│   │ ☐ M  package.json              │ │
│   └───────────────────────────────┘ │
├─────────────────────────────────────┤
│ 🌿 分支: main  [▾]                  │  ← 状态栏区域——当前分支
│ ↕ 2↓ 3↑                             │  ← 落后/领先计数
└─────────────────────────────────────┘
```

### 行高与间距

| Token | 值 | 用途 |
|------|------|------|
| `--git-section-header-height` | 22px | Section header（对标 E4 文件树 section） |
| `--git-file-row-height` | 22px | 文件行高——对标文件树节点 |
| `--git-file-indent` | 20px | 文件名缩进（checkbox 16px + gap 4px） |
| `--git-commit-input-height` | 32px | 提交消息输入框高度 |
| `--git-badge-size` | 14px | 状态字母标记高度 |
| `--git-branch-bar-height` | 28px | 底部分支栏高度 |

---

## 二、Diff 查看器 Wireframe

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 📄 App.tsx (工作区 ↔ 索引)                                   [⬜ 内联] [⊞ 并排] │
├────────────────────────────────┬─────────────────────────────────────────┤
│  1 │ import React from 'react' │  1 │ import React from 'react'           │
│  2 │ import { useState }       │  2 │ import { useState, useEffect }      │ ← 新增行(绿色背景)
│  3 │                          │  3 │                                     │
│  4 │ const App = () => {      │  4 │ const App = () => {                 │
│  5 │   const [count, setCount]│  5 │   const [count, setCount]           │
│  6 │     = useState(0);       │    │                                     │ ← 删除行(红色背景)
│    │                          │  6 │     = useState(0);                  │ ← 新位置(绿色)
│  7 │                          │  7 │                                     │
│  8 │   return (               │  8 │   return (                          │
│  9 │     <div>                │  9 │     <div className="app">           │ ← 修改行(蓝色背景)
│ 10 │       <h1>Hello</h1>     │ 10 │       <h1>Hello World</h1>          │ ← 修改行(蓝色)
│ 11 │     </div>               │ 11 │     </div>                          │
│ ...                           │ ... │                                     │
├────────────────────────────────┴─────────────────────────────────────────┤
│ 📄 CoreEvents.ts (工作区 ↔ 索引)                                   未暂存  │
│ ┌────────────────────────────────┬─────────────────────────────────────┐ │
│ ...                              │ ...                                  │ │
└──────────────────────────────────┴─────────────────────────────────────┘
```

**布局：** 左右并排。左侧 = 旧版（索引/HEAD），右侧 = 新版（工作区）。文件之间灰色分隔符 + 文件名头。

### Diff 颜色——走 CSS 变量，跟随主题

| Token | 用途 | 对标 |
|------|------|------|
| `--git-added-bg` | 新增行背景 | VS Code `diffEditor.insertedTextBackground` |
| `--git-removed-bg` | 删除行背景 | VS Code `diffEditor.removedTextBackground` |
| `--git-modified-bg` | 修改行背景（左右两侧都高亮） | VS Code 行内 diff |
| `--git-added-border` | 新增行左侧竖线 | 3px solid，绿色 |
| `--git-removed-border` | 删除行左侧竖线 | 3px solid，红色 |
| `--git-gutter-added` | 行号旁 + 标记 | 绿色 `+` 图标 |
| `--git-gutter-removed` | 行号旁 - 标记 | 红色 `-` 图标 |
| `--git-added-text` | 新增文本（行内差异） | 深绿色或加粗 |
| `--git-removed-text` | 删除文本（行内差异） | 深红色或删除线 |

### 默认颜色值（暗色主题基准）

```css
:root {
  --git-added-bg: rgba(76, 175, 80, 0.15);
  --git-removed-bg: rgba(239, 83, 80, 0.15);
  --git-modified-bg: rgba(33, 150, 243, 0.10);
  --git-added-border: #4CAF50;
  --git-removed-border: #EF5350;
  --git-deleted-filename: #EF5350;
  --git-untracked-filename: #4CAF50;
  --git-modified-filename: #EAB308;
  --git-ignored-filename: #757575;
  --git-conflict-marker: #FF9800;
}
```

---

## 三、变更文件行格式

```
┌──────────────────────────────────────────────┐
│ ☐ M  src/components/Modal.tsx          [+]  │  ← 勾选 → 暂存
│       src/components                     [-]  │  ← 操作按钮 hover 出现
│ ☐ A  src/core/CoreEvents.ts            [+]  │
│       src/core                               │
│ ☐ D  src/old/deprecated.ts             [+]  │  ← 文件名红色 + 删除线
│       src/old                                │
└──────────────────────────────────────────────┘

第二行 = 父目录路径, 11px, text-secondary
hover 时右侧出现 [+] (暂存) / [-] (取消暂存) / [↩] (还原)
```

| Token | 值 | 用途 |
|------|------|------|
| `--git-file-row-height` | 22px | 第一行——文件名 + checkbox |
| `--git-file-path-height` | 18px | 第二行——路径 |
| `--git-file-checkbox-size` | 14px | 勾选框尺寸 |
| `--git-file-action-btn-size` | 18px | hover 操作按钮 |

---

## 四、状态矩阵

| 状态 | 触发条件 | 视觉表现 |
|------|------|------|
| **正常——有变更** | `git status` 有文件 | 变更列表正常渲染 + 侧栏标题 badge 显示数量 "(5)" |
| **正常——无变更** | working tree clean | 侧栏显示 "没有待提交的更改。"（`--text-secondary`，居中） |
| **非 Git 仓库** | 当前工作区不在 git repo 中 | 侧栏显示 "当前文件夹不是 Git 仓库。" + [初始化仓库] 按钮 |
| **Git 未安装** | `git --version` 失败 | 侧栏显示 "未找到 Git。请安装 Git 后重启。" + [打开下载页] 链接 |
| **加载中** | `git status` 执行中 | 侧栏显示 spinner + "正在读取仓库状态…" |
| **Git 命令失败** | 权限拒绝/git 内部错误 | toast "Git 操作失败：{错误信息}" |
| **提交中** | `git commit` 执行中 | [✔ 提交] 按钮变为 spinner + disabled |
| **提交成功** | commit 完成 | 变更列表清空 + toast "已提交 ✓" |
| **合并冲突** | `git status` 显示冲突文件 | 冲突文件显示 `!` badge + 橙色文字 + 文件名后标注 "(冲突)" |
| **暂存区为空** | 无 staged changes | "暂存的更改" section 不渲染 |
| **工作区为空** | 无 unstaged changes | "更改" section 不渲染 |
| **Diff 加载中** | 点文件 → 读 diff | 编辑区显示 spinner + "正在计算差异…" |
| **二进制文件** | diff 不可读 | 编辑区显示 "无法显示二进制文件的差异。" |

---

## 五、提交流程交互

```
1. 勾选文件 (checkbox) → 文件从 "更改" 移到 "暂存的更改"
   └── 实际上: git add → git status 刷新 → 列表重排

2. 输入提交消息 → [✔ 提交] 按钮从 disabled 变为 enabled
   └── 消息为空 → 按钮 disabled (灰色)

3. Ctrl+Enter 或点 [✔ 提交] → git commit
   └── 按钮变 spinner → 完成后列表清空

4. 提交消息为空 → 按钮 disabled + tooltip "请输入提交消息"
```

---

## 六、与文件树的联动

Git 侧栏中的文件点击：
- **单击文件名** → Monaco 打开文件 + Git 装饰器在文件树中高亮
- **单击 diff 标记** → 打开文件的 Diff 视图
- **文件树中 M/A/D 装饰器** → 由 FileDecorationProvider 注册（E3f #59b + E4c #82）

文件树右键菜单注入：
- `Git: 暂存` / `Git: 还原` / `Git: 查看历史` → 通过 `MenuId.FileContext` 注入

---

## 七、CSS 变量汇总

> 复制到 `plugins/git/src/GitColors.css`

```css
:root {
  /* === Diff 颜色 === */
  --git-added-bg: rgba(76, 175, 80, 0.15);
  --git-removed-bg: rgba(239, 83, 80, 0.15);
  --git-modified-bg: rgba(33, 150, 243, 0.10);
  --git-added-border: #4CAF50;
  --git-removed-border: #EF5350;
  --git-conflict-marker: #FF9800;

  /* === 文件状态颜色 === */
  --git-modified-color: #EAB308;
  --git-added-color: #4CAF50;
  --git-deleted-color: #EF5350;
  --git-untracked-color: #4CAF50;
  --git-ignored-color: #757575;
  --git-conflict-color: #FF9800;

  /* === 布局 === */
  --git-section-header-height: 22px;
  --git-file-row-height: 22px;
  --git-file-path-height: 18px;
  --git-commit-input-height: 32px;
  --git-branch-bar-height: 28px;
}
```

---

> **索引：** `00-README.md`
> **对标 VS Code：** `src/vs/workbench/contrib/scm/browser/scmViewPane.ts`
