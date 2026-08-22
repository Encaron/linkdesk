# 壳内低耦合——App.tsx 去胶水化

> 2026-08-02。**E5 第 1 层第 2 轮最后一站。** App.tsx 不再传递 30+ props 给四个区域——只做四件事。
> 执行清单任务：E5#7、E5#8

---

## 一、当前状态——App.tsx 是超级胶水

### 1.1 App 当前负责的所有事情

```
App.tsx（1,000+ 行）
├── 状态管理
│   ├── tabState + 9 个标签页回调（useTabManager）         ← 应归 MainContent
│   ├── sidebarView + sidebarWidth                        ← 应归 SidePanel
│   ├── theme / lang / lastError                           ← 应归各消费者
│   ├── paletteOpen / themeBrowserOpen / langPickerOpen     ← 保留（全局 overlay）
│   └── devtoolsOpen / devtoolsTargets                     ← 保留（全局 overlay）
├── 回调工厂
│   ├── handleIconClick（区分 tabOnly vs sidebar）         ← 应归 SidePanel + MainContent
│   ├── handleFocusTab / handleToggleOpen / ...             ← 应归 MainContent
│   └── handleToggleTheme / handleToggleLang               ← 应归 StatusBar
├── Context Provider
│   ├── TabActionsContext.Provider                         ← 应归 MainContent
│   └── SourceStateContext.Provider                        ← 应归 MainContent
├── 布局（JSX）
│   └── <IconBar ...> <SidePanel ...> <MainContent ...> <StatusBar ...>  ← 保留
├── 生命周期
│   ├── initPluginLoader + 插件加载                         ← 保留
│   ├── 主题/语言初始化                                      ← 保留
│   ├── 窗口 resize / F5 恢复                              ← 保留
│   └── PLUGIN_REMOVED handler                             ← 保留
└── Overlay 管理
    ├── CommandPalette / QuickPick                          ← 保留
    ├── ThemeBrowser / LanguagePicker                       ← 保留
    └── ConfirmDialog / Toast                               ← 保留
```

### 1.2 改造后——App 只做四件事

```
App.tsx（改造后 ~400 行）
├── 1. 初始化——插件加载 + 主题 + 语言 + F5 恢复
├── 2. 布局壳——LayoutEngine + 四个区域渲染
├── 3. 全局 overlay——CommandPalette / QuickPick / ThemeBrowser / Toast
└── 4. 生命周期——PLUGIN_REMOVED revert 逻辑
```

---

## 二、改造方案

### 2.1 App.tsx JSX 改造后

```tsx
function App() {
  // ── 1. 初始化（保留）──
  useEffect(() => { initPluginLoader(); }, []);
  useEffect(() => { registerFallbackThemes(); }, []);
  // ... F5 恢复、IPC 事件 ...

  // ── 2. 布局引擎（新增）──
  useEffect(() => {
    const handleResize = () => layoutEngine.setContainerSize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const iconbarBounds = layoutEngine.getBounds("iconbar");
  const sidebarBounds = layoutEngine.getBounds("sidebar");
  const mainBounds = layoutEngine.getBounds("main");
  const statusbarBounds = layoutEngine.getBounds("statusbar");

  // ── 3. 全局 overlay（保留）──
  // paletteOpen / themeBrowserOpen ... 

  return (
    <div className="app-shell">
      {/* 🔥 四个区域——不再传 props（除了 bounds） */}
      <div style={{ position: "fixed", ...iconbarBounds }}>
        <IconBar />
      </div>
      {sidebarBounds && (
        <div style={{ position: "fixed", ...sidebarBounds }}>
          <SidePanel />
        </div>
      )}
      <div style={{ position: "fixed", ...mainBounds }}>
        <MainContent />
      </div>
      <div style={{ position: "fixed", ...statusbarBounds }}>
        <StatusBar />
      </div>

      {/* 全局 overlay——保留 */}
      {paletteOpen && <CommandPalette />}
      {themeBrowserOpen && <ThemeBrowser />}
      <ToastContainer />
      <ConfirmDialog />
    </div>
  );
}
```

### 2.2 具体改动——删什么

#### 改前 App.tsx 传给子组件的所有 props（逐条删）：

**IconBar（L836-840）：**
```diff
- <IconBar sidebarView={sidebarView} onOpenOrFocus={handleIconClick} showHamburger={showHamburger} />
+ <IconBar />   // 零 props
```

**SidePanel（L841-847）：**
```diff
- <SidePanel activeTabType={...} activePluginId={...} sidebarView={sidebarView} width={sidebarWidth} ref={sidebarRef} />
+ <SidePanel />  // 零 props
```

**MainContent（L851-873）：**
```diff
- <MainContent tabState={...} activeGroupId={...} onFocusTab={...} onCloseTab={...} onCreateTab={...}
-   onSplitTab={...} onMoveTab={...} onReorderTab={...} onPinTab={...}
-   onDropSplit={...} onDropCopySplit={...} onSplitResize={...}
-   dropZone={...} dragDropTargetGroupId={...} editorAreaRef={...}
-   onDragDropZone={...} isDragging={...} onDraggingChange={...} />
+ <MainContent />  // 零 props
```

**StatusBar（L876-882）：**
```diff
- <StatusBar error={...} theme={...} lang={...} onToggleTheme={...} onToggleLang={...} />
+ <StatusBar />  // 零 props
```

#### 改前 App.tsx 的状态变量（逐条删）：

```diff
- const [sidebarView, setSidebarView] = useState<string | null>(null);  // → SidePanel 内部
- const [sidebarWidth, setSidebarWidth] = useState(280);                 // → LayoutEngine
- const [theme, setTheme] = useState("dark");                            // → ThemeEngine（已有）
- const [lang, setLang] = useState<"zh"|"en">("zh");                     // → LanguageEngine（已有）
- const [lastError, setLastError] = useState<string | null>(null);       // → SourceStateContext（已有）
- const { tabState, focusTab, closeTab, ... } = useTabManager();         // → MainContent 内部
```

#### 改前 App.tsx 的回调（逐条删）：

```diff
- const handleIconClick = ...   // → SidePanel 内部（订阅事件）+ MainContent 内部（tabOnly）
- const handleFocusTab = ...    // → MainContent 内部（已有 focusTab）
- const handleToggleTheme = ... // → StatusBar 内部（走 executeCommand）
- const handleToggleLang = ...  // → StatusBar 内部（走 executeCommand）
```

### 2.3 保留——不能删的

```typescript
// ✅ 保留——全局 overlay 状态
const [paletteOpen, setPaletteOpen] = useState(false);
const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
const [langPickerOpen, setLangPickerOpen] = useState(false);
const [devtoolsOpen, setDevtoolsOpen] = useState(false);

// ✅ 保留——PLUGIN_REMOVED handler（revert 逻辑依赖 App 的全局视角）
useEffect(() => {
  const handler = (e: Event) => {
    const { pluginId } = (e as CustomEvent).detail;
    revertContainerIfCurrent(pluginId);  // ← 需要全局视角——不能放子组件
    // closeTab 逻辑 → emit shellEvents 让 MainContent 处理
  };
  window.addEventListener("PLUGIN_REMOVED", handler);
  return () => window.removeEventListener("PLUGIN_REMOVED", handler);
}, []);

// ✅ 保留——初始化
useEffect(() => { initPluginLoader(); }, []);
useEffect(() => { registerFallbackThemes(); }, []);
```

---

## 三、改动量汇总

| 删什么 | 行数 |
|------|:--:|
| App.tsx 传给四个区域的 props（JSX 中） | −25 |
| App.tsx 的状态变量（sidebarView/theme/lang/lastError/tabState 等） | −15 |
| App.tsx 的回调函数（handleIconClick/handleToggleTheme/...） | −30 |
| App.tsx Context Provider（移到 MainContent） | −5 |
| **App.tsx 净减** | **~−75 行** |

| 保留什么 | 行数 |
|------|:--:|
| 初始化逻辑（插件/主题/语言/F5） | 保留 |
| 全局 overlay（CommandPalette/ThemeBrowser/Toast） | 保留 |
| PLUGIN_REMOVED handler | 保留 |
| 布局引擎 initialize + resize | +10 |
| **App.tsx 改造后约** | **~350-400 行**（从 ~1,000+ 行减半） |

---

## 🔴 预测 Bug

### Bug E5-7a 🔴🔴🔴 PLUGIN_REMOVED handler 中 closeTab——找不到 tabState

**当前：** App.tsx 的 PLUGIN_REMOVED handler（~L197-210）遍历 `tabState.groups` → `forceCloseTab`。`tabState` 来自 App 的 `useTabManager`。

**改造后：** `tabState` 在 MainContent 内部——App 访问不到。

**🔥 防线——通过 ShellEvents 通信：**
```typescript
// App.tsx PLUGIN_REMOVED handler
const handler = (e: Event) => {
  const { pluginId } = (e as CustomEvent).detail;
  
  // Step 1: revert 容器（App 能做——读 ViewContainerService）
  revertContainerIfCurrent(pluginId);
  
  // Step 2: 关闭标签页（App 不能做——发事件让 MainContent 处理）
  shellEvents.emit("plugin:removed", pluginId);
  // MainContent 订阅 → 遍历 tabState → forceCloseTab
};

// MainContent 内部
useEffect(() => {
  const unsub = shellEvents.on("plugin:removed", (pluginId) => {
    for (const group of tabState.groups) {
      for (const tab of group.tabs) {
        if (tab.pluginId === pluginId) forceCloseTab(tab.id);
      }
    }
  });
  return unsub;
}, [tabState]);
```

**⚠️ 顺序要求（对标 E3.6 Bug 2）：** `revertContainerIfCurrent` 必须在 `closeTab` 之前。App 先发 `plugin:removed` → MainContent 收到后才关标签页 → 顺序由事件系统保证（同事件循环内排队）。

---

### Bug E5-7b 🔴 布局引擎未初始化 → bounds 为 0 → 四个区域不可见

**触发条件：** App 渲染时 `layoutEngine` 的 `_containerWidth/_containerHeight` 还是 0（setContainerSize 在 useEffect 中调用，晚于首次 render）。

**🔥 防线——首次 render 用 CSS 兜底：**
```tsx
const bounds = layoutEngine.getBounds("sidebar");
const style = bounds 
  ? { position: "fixed" as const, left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }
  : { visibility: "hidden" as const };  // ← 布局未就绪时隐藏——避免 0×0 闪烁
```

---

### Bug E5-7c 🔴 ErrorBoundary——原来包裹四个区域的 ErrorBoundary 去哪了

**当前：** App.tsx 中没有显式的 ErrorBoundary 包裹四个区域——每个区域各自处理错误。MainContent L56-61 有 `ErrorBoundary` 包裹 PluginDetailView。

**改造后：** 每个区域内部有自己的 ErrorBoundary——不需要 App 提供。

**✅ 不需改动。**

---

## 四、端到端验证（E5#8）

完成 E5#3–#7 全部改造后执行：

- [ ] **E5#8a** 点 📁 → 侧栏正确、图标高亮、状态栏不变
- [ ] **E5#8b** 点 🪢 → 侧栏切换到串口监视器、图标切换
- [ ] **E5#8c** 切换标签页 → 侧栏不关（lastSidebar）+ 状态栏跟随
- [ ] **E5#8d** `npm run check` 零错误
- [ ] **E5#8e** Console dev 模式打印完整事件流
- [ ] **E5#8f** F5 刷新 → 布局/标签页/工作区恢复
- [ ] **E5#8g** 卸载插件 → revertContainerIfCurrent 正确执行 → closeTab 正确执行
- [ ] **E5#8h** 窗口 resize → 布局自动更新——无重叠、无空白

---

## 五、完工标准

- [ ] App.tsx 不再传递任何业务 props 给四个区域——只传 bounds style
- [ ] App.tsx 的 JSX 从 ~80 行减到 ~30 行
- [ ] App.tsx 总行数从 ~1,000+ 减到 ~350-400
- [ ] 四个区域各自独立——换框架只需换 App.tsx 的布局壳 + EventBus 实现
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#7–#8
> **← 前置：** E5#3–#6（四个区域全部改造完成）
