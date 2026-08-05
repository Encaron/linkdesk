# UI 合规——Emoji 图标 → Lucide

> 2026-08-06。E5 收尾 UI/UX 审计 P0。
> 位于 E5 收尾 → `05-收尾/UI合规/`

---

## 一、问题

~12 处 emoji 用作功能性 UI 元素（按钮、标签、导航图标）。Emoji 字体依赖平台、跨 OS 不一致、无法用设计 token 控制颜色/大小。

**违反 UI/UX Pro Max 规则：禁止 emoji 作为功能性 UI 元素。**

E5#6e 已将 StatusBar 的 ☀/☾ 换为 codicon-color-mode 矢量图标——其他 ~12 处未迁移。

---

## 二、清单

| 文件 | Emoji | 用途 |
|------|-------|------|
| `PluginDetailView.tsx:285` | 📦 | "推荐同时安装" 标题 |
| `PluginDetailView.tsx:304` | 💡 | "可选" 标题 |
| `PluginDetailView.tsx:320` | 🔒 | "依赖" 标题 |
| `WelcomeView.tsx:109` | 📂 | "打开文件夹" 按钮 |
| `WelcomeView.tsx:122` | 📁 | 最近文件夹列表 |
| `WelcomeView.tsx:179` | 📖 | "使用文档" 条目 |
| `WorkspaceView.tsx:20` | 📊 | 工作台标签 |
| `PluginIcon.tsx:19` | 📄 | 全局回退图标 |
| `PluginIcon.tsx:36` | 动态 | `plugin-icon--emoji` class 渲染 |
| StatusBar | 中/EN | 语言切换按钮（文字，非 emoji——同属图标化问题） |

---

## 三、修复方案

### 第一步：安装 Lucide

```bash
npm install lucide-react
```

Lucide 是 Feather Icons 的维护分支——~1,000 图标，MIT 协议，React 原生支持，tree-shakeable。

### 第二步：PluginIcon 改渲染逻辑

`PluginIcon.tsx` 改为 Lucide 优先——建立 `plugin.json icon` → Lucide 组件映射：

```typescript
import { File, Folder, Package, ShoppingBag, Monitor, Settings } from "lucide-react";

const LUCIDE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  file: File,
  folder: Folder,
  package: Package,
  marketplace: ShoppingBag,
  serial: Monitor,
  settings: Settings,
  // ... 按需扩展
};
```

渲染逻辑：查 manifest.icon → 匹配 Lucide → 渲染 `<Icon size={16} />` → 不匹配降级 codicon 或回退图标。

### 第三步：逐文件替换 emoji

| Emoji | Lucide 替代 | 语义 |
|-------|-----------|------|
| 📦 | `Package` | 包/推荐安装 |
| 💡 | `Lightbulb` | 可选/提示 |
| 🔒 | `Lock` | 依赖/锁定 |
| 📂 | `FolderOpen` | 打开文件夹 |
| 📁 | `Folder` | 文件夹 |
| 📖 | `BookOpen` | 文档 |
| 📊 | `BarChart3` | 工作台 |
| 📄 | `File` | 文件（回退图标） |
| 中/EN | `Languages` | 语言切换（见下方 §三.5） |

#### §三.5 语言切换按钮——设计问题（不只是图标）

**当前：** StatusBar 语言按钮显示 `中` 或 `EN`——当前语言的文字缩写。

**问题：**
1. **不通用——** 加日语（日本語/JP）、韩语（한국어/KO）、法语（Français/FR）后怎么办？三个字塞进 24px 高的状态栏？
2. **文字不是图标——** 语言切换是**功能性按钮**，不是内容展示。按钮应该用**语言无关**的图标——`Languages`（地球）或 `Globe`。
3. **违反设计规范——** UI/UX Pro Max 规则：功能性 UI 元素用矢量图标，不用文字/emoji。

**设计：**

```
当前：  [中 ▾]  或  [EN ▾]
       ↑ 当前语言缩写

改为：  [🌐 ▾]  或  [Globe icon ▾]
       ↑ 通用语言图标，永远不变

点击后弹出 LanguagePicker（已是 SelectBox）→ 用户看到完整语言名列表
```

**行为不变：** 点击仍然弹出语言选择下拉。只改按钮上的**视觉呈现**——从"当前语言缩写"改为"通用语言图标"。

**对标：** VS Code 没有语言切换按钮（语言在设置里改）。JetBrains IDE 的文件编码选择器用文字缩写但不是状态栏常驻按钮。LinkDesk 的语言切换作为状态栏常驻项——图标化是正确方向。

### 第四步：清理

- 删除 `.plugin-icon--emoji` CSS class
- `PluginIcon.tsx` 中的 emoji fallback 逻辑移入 `@deprecated` 注释——保留一个月后删除

---

## 四、可能遇到的问题

### 1. Lucide icon 大小不一致

**风险：** Lucide 默认 `size={24}`，LinkDesk 侧栏图标 ~16px。直接替换可能偏大。

**缓解：** 统一传 `size={16}`，和现有 codicon `font-size: 16px` 对齐。

### 2. 颜色控制

**风险：** Emoji 自带颜色（📦 棕色、💡 黄色），Lucide 是单色 SVG——默认 `currentColor`。替换后颜色走 CSS 变量，和设计系统一致，是**改进**而非风险。

**缓解：** 确认替换后的图标在暗色/亮色主题下都可见——`color: var(--text-primary)` 或继承父级。

### 3. 插件自定义图标

**风险：** 第三方插件可能有自己的 emoji 图标——`PluginIcon` 渲染的 emoji 不只 ~12 处。

**缓解：** `PluginIcon` 改为 Lucide 优先、codicon 其次、SVG/PNG 第三、emoji 作为最后回退（标 `@deprecated`）。

### 4. 构建体积

**风险：** `lucide-react` 全量导入会增加 bundle。

**缓解：** Lucide 支持 tree-shaking——`import { File, Folder } from "lucide-react"` 只打包使用的图标。~20 图标约 +5KB gzipped。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `package.json` | `npm i lucide-react` |
| `src/components/shared/PluginIcon.tsx` | 渲染逻辑改造——Lucide 优先 |
| `src/components/views/PluginDetailView.tsx` | 📦💡🔒 → `<Icon name="..." />` |
| `src/components/views/WelcomeView.tsx` | 📂📁📖 → `<Icon />` |
| `src/components/views/WorkspaceView.tsx` | 📊 → `<Icon />` |
| `src/components/StatusBar.tsx` | 中/EN → `Languages` |
| `*.css` | 删 `.plugin-icon--emoji` |

**改动量：** ~12 处替换 + PluginIcon 重构 + Lucide 安装。

参考 memory：[[ui-ux-audit-todos]]

---
