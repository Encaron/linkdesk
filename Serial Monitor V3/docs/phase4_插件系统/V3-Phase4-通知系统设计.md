# Phase 4 通知系统设计

> 对标 VS Code Notifications 系统。读源码后照搬，设计决策零争议。

---

## 一、VS Code 源码分析

### 关键文件

| 文件 | 内容 |
|------|------|
| `notificationsCenter.ts` | Notification Center 面板（右下角弹出） |
| `notificationsToasts.css` | Toast 定位 + 动画 |
| `notificationsList.css` | 单条通知卡片布局 |
| `notificationsViewer.ts` | 通知渲染器——icon/message/toolbar/source/buttons |
| `common/notifications.ts` | 数据模型（INotification, Severity, Actions）

### Toast 定位（notificationsToasts.css）

```css
.monaco-workbench > .notifications-toasts {
  position: absolute;
  z-index: 2545;          /* 高于 modal backdrop (2540), 低于 quick input (2550) */
  right: 3px;
  bottom: 25px;           /* 22px status bar + 3px gap */
}

/* 入场动画：从下滑入 + 淡入 */
.notification-toast {
  transform: translate3d(0px, 100%, 0px);
  opacity: 0;
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}
.notification-fade-in {
  opacity: 1;
  transform: none;
}
```

### 单条通知布局（notificationsList.css）

```
┌─────────────────────────────────────────┐
│ [icon] message text (ellipsis)  [⏷][✕] │  ← main row: severity + message + toolbar
│ source: "terminal"   [btn1] [btn2]      │  ← details row: source + primary buttons
└─────────────────────────────────────────┘

ROW_HEIGHT = 42px
padding: 10px 5px
icon: 16px, font-size 18px
message: line-height 22px, flex: 1
toolbar: hidden by default, shown on hover/focus
details row: hidden by default, shown on expand
```

### 交互模式

1. **Toast 自动堆叠**：多条通知从右下角向上堆叠，每条 4px 间距
2. **Hover 显露操作**：关闭按钮默认隐藏，hover 时显示
3. **双击展开**：双击通知展开详情（source + buttons 行）
4. **中键关闭**：鼠标中键点击直接关闭
5. **Notification Center**：点击状态栏铃铛图标打开面板，显示全部通知历史
6. **CLEAR ALL**：面板 header 有清除全部按钮

---

## 二、LinkDesk 落地方案

### 2.1 改造范围

| 模块 | 改动 |
|------|------|
| `toast.ts` | 增强数据模型：加 severity/source/icon/action 分组 |
| `ToastContainer.tsx` + `.css` | 重写渲染：对标 VS Code 通知卡片 |
| `loader.ts` | 删 `window.location.reload()`，install/uninstall/reinstall 全部走通知 |
| `marketplace/sidebar.tsx` | 安装/卸载后刷新列表，不跳转 |
| `StatusBar.tsx` | 加铃铛图标 + 未读计数（Notification Center 入口，Phase 4 做面板入口，面板本体 Phase 5+） |

### 2.2 Toast 数据模型扩展

```ts
interface Toast {
  id: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';  // 对标 VS Code Severity
  source?: string;                           // 来源插件名
  icon?: 'info' | 'warning' | 'error' | string;
  actions?: ToastAction[];
  ttl?: number;                              // 0 = 不自动消失
}

interface ToastAction {
  label: string;
  isPrimary?: boolean;   // true → 主按钮，false → secondary（默认）
  onClick: () => void;
}
```

### 2.3 插件生命周期通知对标

| 操作 | VS Code 行为 | LinkDesk 行为 |
|------|-------------|-------------|
| 安装扩展（商店） | 下载→安装→通知 "已安装 X" + [启用] [重载] | 安装→通知 "已安装 X。重启后生效" + [立即重启] |
| 重装（本地 .disabled/） | 从本地重新安装→通知 "已安装 X" | loadPlugin 即时生效→通知 "已安装 X（即时生效）" |
| 卸载扩展 | 通知 "已卸载 X" + [撤销] | 通知 "已卸载 X" + [撤销] |
| 禁用扩展 | 通知 "已禁用 X" + [撤销/启用] | 通知 "已禁用 X" + [撤销] |

**核心原则：不自动 reload，不自动跳转。所有操作结果通过通知告知用户，用户自行决定何时跳转/重启。**

### 2.4 通知卡片 CSS 规范

完全对标 VS Code：

```css
/* 容器 */
.toast-container {
  position: fixed;
  bottom: 28px;           /* 状态栏高度 + gap */
  right: 12px;
  z-index: 2545;          /* 高于 modal，低于 quick input */
  display: flex;
  flex-direction: column-reverse;  /* 最新在底部 */
  gap: 4px;               /* 对标 VS Code margin: 4px */
  max-width: 450px;       /* 对标 VS Code MAX_DIMENSIONS */
}

/* 单条通知 */
.toast-item {
  background: var(--bg-card);        /* 对标 --vscode-notifications-background */
  border: 1px solid var(--separator);
  border-radius: 4px;                /* 对标 VS Code */
  box-shadow: var(--shadow-lg);
  padding: 10px 5px;
  opacity: 0;
  transform: translateY(100%);
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}

/* 入场 */
.toast-item.toast-fade-in {
  opacity: 1;
  transform: none;
}

/* 主行 */
.toast-main-row {
  display: flex;
  align-items: center;
  height: 22px;           /* 对标 VS Code LINE_HEIGHT */
}

/* 图标 */
.toast-icon {
  flex: 0 0 16px;
  font-size: 18px;
  margin: 0 4px;
}

/* 消息 */
.toast-message {
  flex: 1;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 工具栏（关闭按钮，hover 显示） */
.toast-toolbar {
  display: none;
}
.toast-item:hover .toast-toolbar {
  display: flex;
}

/* 详情行（source + buttons） */
.toast-details-row {
  display: none;
  padding-left: 24px;     /* 对齐消息文字（16px icon + 4px margin + 4px） */
  margin-top: 4px;
}
.toast-item.toast-expanded .toast-details-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Source */
.toast-source {
  font-size: 11px;
  color: var(--text-muted);
  flex: 1;
}

/* 主按钮 */
.toast-primary-btn {
  background: var(--accent);
  color: var(--badge-text);
  border: none;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
```

### 2.5 不做的（Phase 5+）

- ❌ Notification Center 面板（铃铛图标点击后的完整通知列表）—— Phase 5
- ❌ Do Not Disturb 模式
- ❌ 通知来源过滤/配置菜单
- ❌ 进度条通知
- ❌ 展开/折叠长消息

---

## 三、实施步骤

1. **重构 `toast.ts`**：新数据模型（severity/source/icon/action 分组）+ 无 MAX_VISIBLE 限制
2. **重写 `ToastContainer.tsx` + `.css`**：对标 VS Code 布局 + 动画
3. **改造 `loader.ts`**：
   - `installPlugin`: 删 `window.location.reload()` → 通知 + `needRestart` flag
   - `reinstallPlugin`: 已改，删 reload → `loadPlugin` 即时生效
   - 通知内容加 severity/source/action 信息
4. **改造 `marketplace/sidebar.tsx`**：安装/卸载后刷新列表
5. **StatusBar 铃铛图标**：未读通知计数 + 点击打开/关闭通知面板（面板本体 Phase 5）
