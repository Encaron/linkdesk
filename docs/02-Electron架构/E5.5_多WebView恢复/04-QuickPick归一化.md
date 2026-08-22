# 04-QuickPick 归一化——四面板合并为单组件

> E5.5#7 Phase 5。2026-08-08。

## 问题

多 WebView + 键盘路由修复后验证时发现——`Ctrl+Shift+P` 打开 `CommandPalette`，`Ctrl+K Ctrl+T` 打开 `ThemeBrowser`，`Ctrl+K Ctrl+L` 打开 `LanguagePicker`，F12 DevTools 用 `QuickPick`。**四个独立组件各自重复实现输入框+列表+过滤+上下键+Enter。**

**VS Code 做法：** 只有一个 `QuickPick` 控件。命令面板/主题/语言都是同一个 QuickPick 的**不同渲染模式**，不是独立面板。

**影响：**
- 代码重复——四套 `useState` + 四套 `CustomEvent` 监听 + 四套关闭逻辑在 App.tsx
- OverlayWindow 前置债——#26 上线时应只需渲染**一个** QuickPick 组件，不是四个
- 插件扩展——插件无法复用这个浮层机制（当前只能靠壳作者加 `useState`）

## 方案——QuickPickService 单例

```
插件/命令 → QuickPickService.show({ mode, items, render* }) 
          → QuickPickService._state 更新 
          → onChange() 通知
          → App.tsx setQuickPickState() 重渲染
          → <QuickPick open={state.open} items={state.items} renderLabel={state.renderLabel} ... />
```

**核心思想：** 服务管理状态，组件纯渲染。App.tsx 只渲染一个 `<QuickPick>`，所有浮层内容通过 `QuickPickService.show()` 注入 data + render slot props。

## 新旧对比

| 维度 | 旧方案 | 新方案 |
|------|--------|--------|
| App.tsx useState | 4 个（paletteOpen / themeBrowserOpen / langPickerOpen / devtoolsOpen） | 1 个（quickPickState） |
| CustomEvent 监听 | 4 个（SHOW_PALETTE / SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER / SHOW_DEVTOOLS_PICKER） | 0 个 |
| QuickPick 组件渲染 | 4 处（各带不同 props） | 1 处（统一 props 从 state 读取） |
| 新浮层模式 | 需改 App.tsx 加 useState + event + 渲染 | 调 `QuickPickService.show()` 即可——壳零改动 |
| OverlayWindow 迁移 | 改 4 处 | 改 1 处 |

## 架构——文件分工

### `QuickPickService.ts`（新建 72 行）

```typescript
export type QuickPickMode = "commands" | "theme" | "language" | "devtools" | "custom";

export interface QuickPickState<T = unknown> {
  open: boolean;
  mode: QuickPickMode;
  items: T[];
  placeholder: string;
  prefix?: string;
  getSearchText: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onHighlight?: (item: T) => void;
  onClose: () => void;
  // E3.5 slot props——每个工厂函数注入自己的渲染逻辑
  renderLabel?: (item: T) => ReactNode;
  renderCategory?: (item: T) => ReactNode;
  renderDetail?: (item: T) => ReactNode;
  renderDetailRight?: (item: T) => ReactNode;
  renderItemActions?: (item: T, isSelected: boolean) => ReactNode;
}

export const QuickPickService = {
  show<T>(state: Omit<QuickPickState<T>, "open">): void,
  hide(): void,
  getState<T>(): QuickPickState<T> | null,
  onChange(fn: Listener): () => void,
};
```

### 工厂函数——每个面板导出一个命令式入口

| 文件 | 函数 | mode | 对应快捷键 |
|------|------|------|-----------|
| `CommandPalette.tsx` | `showCommandPalette()` | `"commands"` | Ctrl+Shift+P |
| `ThemeBrowser.tsx` | `showThemePicker(pluginId?)` | `"theme"` | Ctrl+K Ctrl+T |
| `LanguagePicker.tsx` | `showLanguagePicker()` | `"language"` | Ctrl+K Ctrl+L |
| `developerCommands.ts` | 内联 `QuickPickService.show()` | `"devtools"` | F12 |

每个工厂函数内调用 `QuickPickService.show<T>({ mode, items, render*, onSelect, onClose, ... })` → 注入该模式的全部 render slot props。

### App.tsx

删除了：
- 4 个 `useState`（paletteOpen / themeBrowserOpen / themeBrowserPluginId / langPickerOpen / devtoolsOpen / devtoolsTargets）
- 4 个 `CustomEvent` 监听（SHOW_PALETTE / SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER / SHOW_DEVTOOLS_PICKER）
- `DevToolsTarget` 类型
- 4 个组件导入（CommandPalette / ThemeBrowser / LanguagePicker）

新增了：
```tsx
const [quickPickState, setQuickPickState] = useState<QuickPickState | null>(null);
useEffect(() => {
  return QuickPickService.onChange(() => {
    setQuickPickState(QuickPickService.getState());
  });
}, []);

// 渲染区：
{quickPickState && (
  <QuickPick
    open={quickPickState.open}
    onClose={quickPickState.onClose}
    items={quickPickState.items}
    placeholder={quickPickState.placeholder}
    prefix={quickPickState.prefix}
    getSearchText={quickPickState.getSearchText}
    getKey={quickPickState.getKey}
    onSelect={quickPickState.onSelect}
    onHighlight={quickPickState.onHighlight}
    renderLabel={quickPickState.renderLabel}
    renderCategory={quickPickState.renderCategory}
    renderDetail={quickPickState.renderDetail}
    renderDetailRight={quickPickState.renderDetailRight}
    renderItemActions={quickPickState.renderItemActions}
  />
)}
```

### 命令注册

| 文件 | 改动 |
|------|------|
| `coreCommands.ts` | `showCommands` handler → `await import(".../CommandPalette")` → `showCommandPalette()` |
| `settingsCommands.ts` | `selectTheme` → `await import(".../ThemeBrowser")` → `showThemePicker(ctx?.pluginId)` |
| `settingsCommands.ts` | `selectLanguage` → `await import(".../LanguagePicker")` → `showLanguagePicker()` |
| `developerCommands.ts` | `togglePluginDevTools` → 直调 `QuickPickService.show<DevToolsTarget>(...)` |

旧方案通过 `dispatchEvent(SHOW_PALETTE)` / `dispatchEvent(SHOW_THEME_BROWSER)` 等 CustomEvent 通知 App.tsx → 全部删除。

## 验证清单

1. `Ctrl+Shift+P` → 命令面板弹出，所有命令可搜索，Enter 执行
2. `Ctrl+K Ctrl+T` → 主题选择器弹出，↑↓ 预览，Enter 确认，Esc 回退原主题
3. `Ctrl+K Ctrl+L` → 语言选择器弹出，选中即切换
4. F12 → DevTools picker 弹出，选择插件或壳窗口
5. 关闭浮层（Esc / 点遮罩）→ QuickPick 消失，App.tsx 不残留旧状态

## 已知限制

- **Z-order：** 弹窗在壳 HTML 渲染，被插件 WebContentsView 的 OS 原生 Z-order 盖在后面。键盘可操作但视觉不可见。E5.5#26 OverlayWindow 根治。
- **旧 `quickpick.show` 命令：** `QuickPick.tsx:349-357` 的 `showQuickPick()` 命令式 API（`createRoot` 挂到 body）仍存在——它是 `E5.5#23k` 的雏形，等 OverlayWindow 上线后归一化到 QuickPickService。

## 文件清单

| 文件 | 改动 |
|------|------|
| `src/core/registry/QuickPickService.ts` | **新建** +72 行 |
| `src/App.tsx` | −70/+30 行 |
| `src/components/shared/CommandPalette.tsx` | +15 行（`showCommandPalette` 工厂函数） |
| `src/components/ThemeBrowser.tsx` | +42 行（`showThemePicker` 工厂函数） |
| `src/components/LanguagePicker.tsx` | +24 行（`showLanguagePicker` 工厂函数） |
| `src/core/builtin/coreCommands.ts` | −7/+10 行 |
| `src/core/builtin/settingsCommands.ts` | −12/+8 行 |
| `src/core/builtin/developerCommands.ts` | −25/+29 行 |

## 未来——E5.5#23k QuickPick 插件 API

```
// 插件侧：
const picked = await window.linkdesk.quickPick.show({
  items: ["COM3", "COM5", "COM7"],
  placeholder: "选择串口…",
});
// picked === "COM3" or undefined (Esc)
```

此 API 内部也走 `QuickPickService.show()`——壳只渲染一个 `<QuickPick>`，`mode = "custom"`。等 OverlayWindow 上线后实现。
