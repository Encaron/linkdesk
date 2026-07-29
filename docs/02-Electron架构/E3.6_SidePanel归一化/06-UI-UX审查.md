# E3.6 UI/UX 审查——设计系统对照

> 2026-07-30。基于 `ui-ux-pro-max` 设计系统审查 E3.6 文档中的 UI/UX 问题。
> 设计系统：Dark Mode (OLED) / 开发者工具 / 高密度 / React。
> 审查范围：SidePanel header、SidebarSection 折叠、空状态、搜索框、工具栏、IconBar 高亮、动画。

---

## 设计系统基准

| 维度 | 推荐值 | 来源 |
|------|------|------|
| 风格 | Dark Mode (OLED)——深黑、高对比度、WCAG AAA | `--design-system` |
| 字体 | Inter, 300–700 weight | `--design-system` |
| 间距系统 | 4px/8dp 递增（Material Design） | `quick-reference.md` §5 |
| 动画时长 | 150–300ms，ease-out 进场 / ease-in 离场 | `quick-reference.md` §7 |
| 触摸目标 | ≥44×44px | `quick-reference.md` §2 |
| 文字对比度 | ≥4.5:1 正文 / ≥3:1 大文字 | `quick-reference.md` §1 |
| 图标 | SVG（codicons ✅），无 emoji | `quick-reference.md` §4 |
| 减动 | `prefers-reduced-motion` 必须尊重 | `quick-reference.md` §7 |
| 焦点环 | 可见 focus ring 2–4px | `quick-reference.md` §1 |

---

## 发现的问题——按严重度排列

### 🔴 P0——阻塞级（缺失会导致用户困惑或无法使用）

#### P0-1：空状态缺少行动指引

**当前设计：** SidePanel 渲染 `"无已注册视图"` 纯文字占位（`SidePanel改造.md` L28）。

**UX 规则：** "Empty States——Guide users when no content exists. Show helpful message **and action**. Don't: Blank empty screens."（`ux-guidelines.csv` result 1）

**问题：** 只有文字没有行动。用户看到"无已注册视图"不知道该怎么办。

**修复：**
```tsx
// ❌ 当前
<div className="side-panel-placeholder">{t("无已注册视图")}</div>

// ✅ 修复——加行动指引
<div className="side-panel-placeholder">
  <p>{t("此容器没有已注册的视图")}</p>
  <p className="side-panel-placeholder-hint">
    {t("安装插件以添加视图，或从命令面板运行 \"打开视图\"")}
  </p>
</div>
```

**同样的问题存在于：**
- 容器存在但 views 为空（正常状态——view 的 `when` 条件全不满足）
- 容器不存在（不应出现——E36#4 保证）

#### P0-2：marketplace 搜索框随列表滚动消失

**当前设计：** 搜索框放在 InstalledListView 内容顶部——随列表滚动。

**问题：** 已安装插件列表较长时 → 用户向下滚动 → 搜索框消失在视口外 → 无法修改搜索 → 必须滚回顶部。

**VS Code 做法：** 搜索框是 viewlet header 的一部分——`position: sticky; top: 0`，始终可见。

**修复选项 A（E3.6 内）：** 搜索框 + 安装按钮区域加 `position: sticky; top: 0; z-index: 1; background: var(--bg-side-panel)`。不依赖容器 header 机制。

**修复选项 B（未来）：** 容器 header 支持自定义 widget 插槽——整个 header 区域 sticky。E3.6 后用。

**🔥 推荐 E3.6 内做选项 A——3 行 CSS。**

#### P0-3：SidePanel 折叠动画用 setTimeout 而非 transitionend

**当前代码：** `SidePanel.tsx` L30：`setTimeout(() => setAnimating(false), 220)`

**UX 规则：** "Duration Timing——Animations should feel responsive not sluggish. Use 150-300ms for micro-interactions."（`ux-guidelines.csv`）

**问题：** `setTimeout` 硬编码 220ms——如果 CSS `transition` 时长改了，setTimeout 不匹配 → 动画结束后 `animating` class 仍存在或提前移除。

**修复：**
```tsx
// ❌ 当前
const toggleCollapse = (collapse: boolean) => {
  setAnimating(true);
  setCollapsed(collapse);
  setTimeout(() => setAnimating(false), 220);
};

// ✅ 修复——用 transitionend 事件
const panelRef = useRef<HTMLElement>(null);
const toggleCollapse = (collapse: boolean) => {
  setAnimating(true);
  setCollapsed(collapse);
};
// 在 aside 元素上加 onTransitionEnd
<aside ref={mergeRefs(panelRef, ref)} onTransitionEnd={() => setAnimating(false)} ...>
```

#### P0-4：缺少 `prefers-reduced-motion` 支持

**UX 规则：** "Reduced Motion——Respect user's motion preferences. Check prefers-reduced-motion media query."（CRITICAL）

**问题：** SidePanel 折叠动画、SidebarSection twistie 旋转、view 切换过渡——都没有检查 `prefers-reduced-motion`。

**修复：**
```css
/* src/components/SidePanel.css */
@media (prefers-reduced-motion: reduce) {
  .side-panel {
    transition: none !important;
  }
  .side-panel.animating {
    transition: none !important;
  }
  .sidebar-section-twistie {
    transition: none !important;
  }
}
```

#### P0-5：缺少可见焦点环

**UX 规则：** "Focus States——Visible focus rings on interactive elements (2–4px)."（CRITICAL）

**问题：** E3.6 文档完全没有提及焦点管理。以下元素需要可见的 `:focus-visible` 样式：
- SidebarSection 折叠头（可点击展开/折叠）
- SidePanel 折叠按钮（◀ / ▶）
- 文件树节点（键盘导航 ↑↓←→）
- 工具栏按钮（新建/刷新/收起）
- IconBar 图标按钮

**修复：** 全局加 `:focus-visible` 样式——2px solid `var(--accent)` outline + 2px offset。不写死颜色，走 CSS 变量。

---

### 🟡 P1——高优先级（影响体验质量）

#### P1-1：SidePanel header 尺寸未指定

**当前设计：** `SidePanel改造.md` 画了分层结构但没给尺寸。

**问题：** header 高度、padding、文字大小都没有定义。VS Code sidebar header ~35px，padding 0 20px，font-size 11px uppercase。LinkDesk 不一定要跟 VS Code 一模一样，但必须有一组明确的 token。

**推荐：**
```css
.side-panel-header {
  height: 35px;               /* 对标 VS Code */
  padding: 0 12px;             /* 左对齐文字、右放折叠按钮 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;             /* VS Code: UPPERCASE 11px */
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  user-select: none;
}
.side-panel-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;         /* 长标题截断——不换行 */
}
```

#### P1-2：侧栏工具栏按钮溢出

**当前设计：** file-tree FoldersView 内容顶部 4 个按钮（新建文件/新建文件夹/刷新/收起全部）水平排列。

**问题：** 侧栏最小宽度 160px（`App.tsx` L433），最大 520px。160px 宽度放 4 个按钮 → 溢出或挤压。

**修复选项：**
- 方案 A：工具栏按钮 `flex-wrap: wrap`。窄屏时换行。
- 方案 B：工具栏移到 header actions 插槽——header 行有标题 + 折叠按钮 + 工具栏，不占用内容区高度。对标 VS Code Explorer header（`...` 更多菜单）。
- E3.6：`flex-wrap: wrap`（保证可用）。E4V#43：`...` 溢出菜单（对标 VS Code WorkbenchToolBar）。

#### P1-3：SidebarSection twistie 触摸目标

**UX 规则：** "Touch Target Minimum——Min 44×44pt interactive area."（`pro-rules.md`）

**问题：** SidebarSection 折叠头是一个 `<button>` 或 `<div onClick>` ——click 区域是整个 header 行还是只 twistie 图标？VS Code 是整个 header 行可点击——方便用户。

**修复：** SidebarSection 的 `onClick` 绑定在整个 header 行上，不止 twistie 图标。header 行 `min-height: 22px`（单行文件树节点高度）+ `padding: 4px 8px` → 有效点击区域 ≥30px 高度——接近但未达到 44px 桌面标准。对桌面应用可接受，但应明确 `cursor: pointer` 在整个 header 行。

#### P1-4：serial-monitor SessionListView 新建按钮位置

**当前设计：** 新建按钮 `+ 新建` 放在 SessionListView 内容顶部——view 内部自己渲染。

**问题：** 这个按钮在"内容顶部"没有 sticky——如果会话列表很长，按钮随内容滚动消失。用户想新建会话 → 必须滚到顶部。

**修复：** `+ 新建` 按钮放到 SidebarSection 的 `actions` prop——折叠头右侧、始终可见（不随内容滚动）。

```tsx
// SessionListView 中——用 SidebarSection 的 actions prop
// 但 SessionListView 不自己包 SidebarSection（SidePanel 统包）
// 所以需要 ViewDescriptor 支持 actions
```

**🔥 暴露架构缺口：** `ViewDescriptor` 需要 `actions` 字段——已在 E36#1.1 中加好。SidebarSection 的 `actions` prop 已通过 SidePanel 渲染循环传入。

---

### 🟢 P2——改善级（锦上添花）

#### P2-1：SidebarSection badge 溢出

**当前设计：** serial-monitor 的 `badge={sessions.length > 0 ? \`(${sessions.length})\` : undefined}`

**问题：** sessions 数量多时 `(15)` → `(150)` → 文字变长。如果侧栏窄 + 标题长 → badge 可能溢出或被截断。

**推荐：** badge 有 `max-width` + `text-overflow: ellipsis`。超过 99 显示 `(99+)`。

#### P2-2：容器切换缺少过渡

**当前设计：** 切换容器（📁→🪢）——SidePanel 直接替换内容。

**UX 规则：** "Animation Duration——150-300ms for micro-interactions."

**VS Code 做法：** 无过渡——直接替换（侧栏内容区宽度不变、只是内容换掉）。这是正确的——容器切换不需要动画。

**结论：** 不需要改动——当前行为对标 VS Code ✅。

#### P2-3：z-index 分层未定义

**UX 规则：** "z-index Management——Define layered z-index scale (e.g. 0/10/20/40/100/1000)."（`quick-reference.md` §5）

**问题：** SidePanel 内部有这些需要 z-index 的元素：
- SidebarSection twistie（不需要）
- 右键菜单（FileTreeContextMenu）——需要高于侧栏内容
- 内联输入框（serial-monitor 新建会话输入）——不需要
- 搜索框 dropdown（未来）——需要高于侧栏

**推荐：** 定义侧栏内 z-index 分层：
```css
--z-sidebar-content: 0;       /* 默认内容 */
--z-sidebar-sticky-header: 10; /* sticky 搜索框/工具栏 */
--z-sidebar-dropdown: 50;     /* 搜索建议/下拉 */
--z-sidebar-context-menu: 100; /* 右键菜单 */
```

---

## 不需要改动的地方（设计正确）

| 项目 | 判断 | 原因 |
|------|:--:|------|
| codicons 图标集 | ✅ | 统一的矢量图标——符合 `pro-rules.md` "Consistent icon family" |
| CSS 变量颜色系统 | ✅ | Token-driven theming——符合 `pro-rules.md` "Token-driven theming" |
| SidePanel 折叠动画 220ms | ⚠️ | 时长在 150-300ms 范围内——符合。但实现方式需改（P0-3） |
| SidebarSection 复用 | ✅ | 组件纯度正确——不重复造轮子。需扩展 4 个 prop（E36#3.5b） |
| IconBar 42px 宽 | ✅ | 对标 VS Code Activity Bar 48px——在范围内 |
| 侧栏最小宽度 160px | ✅ | 对标 VS Code——足够显示文件树 |
| 拖拽调整宽度 | ✅ | 对标 VS Code——正确交互 |
| lastSidebar sticky | ✅ | 对标 VS Code 行为——侧栏不随标签页切换关闭 |
| view 注册顺序 = 渲染顺序 | ✅ | 对标 VS Code `order` 字段 |

---

## 合并到执行清单的建议

以下 6 项应加入 E3.6 执行清单作为 UI/UX 任务（或融入现有任务）：

| # | 严重度 | 内容 | 融入任务 | 行数 |
|:--|:--|------|:--|:--:|
| UX01 | 🔴 P0 | 空状态文字→加行动指引 | E36#3.5 | ~3 |
| UX02 | 🔴 P0 | 搜索框 sticky | E36#7.3 | ~3 CSS |
| UX03 | 🔴 P0 | setTimeout→transitionend | E36#3.8 | ~5 |
| UX04 | 🔴 P0 | prefers-reduced-motion | E36#3.8 | ~8 CSS |
| UX05 | 🔴 P0 | :focus-visible 全局样式 | E36#3（新增） | ~10 CSS |
| UX06 | 🟡 P1 | header 尺寸 token + 标题截断 | E36#3.4 | ~8 CSS |
| UX07 | 🟡 P1 | 工具栏 flex-wrap | E36#6.3 | ~2 CSS |
| UX08 | 🟡 P1 | SidebarSection header 行全宽可点击 | 不改 SidebarSection（已支持） | 零行 |
| UX09 | 🟢 P2 | badge max-width + 99+ | 不改 E3.6 | 零行 |
| UX10 | 🟢 P2 | z-index 分层 | E36#3（新增） | ~5 CSS |

---

## 设计系统拒绝的提议

以下提议**不符合**设计系统指导——不应采用：

| 提议 | 拒绝理由 | 设计系统来源 |
|------|------|------|
| 容器切换加过渡动画 | VS Code 无此动画——直接替换是正确行为 | Duration: 150–300ms for micro-interactions（容器切换不是 micro-interaction） |
| 侧栏 header 用大字号 | VS Code 11px UPPERCASE——LinkDesk 对标 | Typography: consistency with product type |
| SidebarSection twistie 用 emoji ▶ | Emoji as structural icons 是 anti-pattern | `pro-rules.md` No Emoji as Structural Icons |
| view 按字母排序 | 注册顺序 = 用户/插件作者意图——不自行重排 | 对标 VS Code `order` 字段 |

---

> **← 索引：** `00-README.md`
> **→ 执行清单：** `05-执行清单.md`（UX01–UX08 建议融入现有任务）
> **设计系统：** `ui-ux-pro-max` skill——Dark Mode (OLED) / Developer Tool / High Density
