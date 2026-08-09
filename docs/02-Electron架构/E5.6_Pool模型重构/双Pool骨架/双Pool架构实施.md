# 双Pool骨架——架构实施细节

> 📖 对应执行清单：[E5.6#5-#9](../E5.6-执行清单.md)
> 📖 核心设计：[01-Pool模型设计.md](../01-Pool模型设计.md)

---

## 1. 目标

Phase 1 回退后，所有插件在壳 React 树里渲染。Phase 2 把插件代码从壳 React 树移到两个独立 WebContentsView：
- **SidebarPool**——渲染侧栏插件（file-tree/search/插件面板）
- **MainPool**——渲染主区插件（editor/serial-monitor/…）

---

## 2. WindowManager 双Pool方法

### 2.1 字段

```typescript
class WindowManager {
  // 保留现有的——Phase 8 再删
  private pluginViews = new Map<string, { view: WebContentsView; pluginId: string }>();
  
  // 🆕 双Pool
  sidebarPoolView: WebContentsView | null = null;
  mainPoolView: WebContentsView | null = null;
}
```

### 2.2 createPool(zone)

```typescript
createPool(zone: 'sidebar' | 'main'): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-plugin.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  view.webContents.loadURL(`pool.html?zone=${zone}`);
  
  // 崩溃监听
  view.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[WindowManager] ${zone} Pool 崩溃`, details);
    this.rebuildPool(zone);
  });
  
  this.mainWindow.contentView.addChildView(view);
  
  if (zone === 'sidebar') this.sidebarPoolView = view;
  else this.mainPoolView = view;
  
  return view;
}
```

### 2.3 updatePoolBounds()

```typescript
updatePoolBounds(): void {
  const layout = layoutEngine; // 从壳传进来或读全局
  
  const sidebarBounds = layout.getBounds('sidebar');
  if (this.sidebarPoolView && sidebarBounds) {
    this.sidebarPoolView.setBounds({
      x: sidebarBounds.x,
      y: TITLE_BAR_HEIGHT,
      width: sidebarBounds.width,
      height: sidebarBounds.height,
    });
  }
  
  const mainBounds = layout.getBounds('main');
  if (this.mainPoolView && mainBounds) {
    this.mainPoolView.setBounds({
      x: mainBounds.x,
      y: TITLE_BAR_HEIGHT + TAB_BAR_HEIGHT,
      width: mainBounds.width,
      height: mainBounds.height - TAB_BAR_HEIGHT,
    });
  }
}
```

**关键：** MainPool bounds 的 y 扣掉 `TAB_BAR_HEIGHT`——因为 TabBar 是壳 DOM，覆盖在 MainPool 顶部。

### 2.4 pushLayout(zone, layout)

```typescript
pushLayout(zone: 'sidebar' | 'main', layout: PoolLayout): void {
  const view = zone === 'sidebar' ? this.sidebarPoolView : this.mainPoolView;
  if (!view) return;
  
  // SidebarPool 只收 sidebar 部分
  if (zone === 'sidebar') {
    view.webContents.send('pool:layout', { sidebar: layout.sidebar });
  } else {
    view.webContents.send('pool:layout', { groups: layout.groups });
  }
}
```

---

## 3. pool.html（项目根） + src/pool/pool-main.tsx

### 3.1 pool.html（项目根目录——Vite 约定，和 index.html / plugin-view.html 平级）

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LinkDesk Pool</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #pool-root { width: 100%; height: 100%; overflow: hidden; }
    /* CSS 变量由 ipcRenderer 在收到 'pool:layout' 时通过 webFrame 注入 */
  </style>
</head>
<body>
  <div id="pool-root"></div>
  <script type="module" src="./src/pool/pool-main.tsx"></script>
</body>
</html>
```

### 3.2 src/pool/pool-main.tsx——路由

```tsx
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import type { PoolLayout } from './core/types/poolLayout';

function PoolApp() {
  const zone = new URLSearchParams(window.location.search).get('zone') as 'sidebar' | 'main';
  const [layout, setLayout] = useState<PoolLayout>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 注册 onLayout 回调
    const unsub = window.linkdesk.pool.onLayout((l) => setLayout(l));
    // 通知壳——池就绪
    window.linkdesk.pool.ready();
    setReady(true);
    return unsub;
  }, []);

  // pool:ready 之前渲染空状态
  if (!ready) return <div className="pool-loading">Loading...</div>;

  if (zone === 'sidebar') {
    return <SidebarRenderer layout={layout} />;
  }
  return <MainRenderer layout={layout} />;
}

createRoot(document.getElementById('pool-root')!).render(<PoolApp />);
```

### 3.3 SidebarRenderer

```tsx
function SidebarRenderer({ layout }: { layout: PoolLayout }) {
  const s = layout.sidebar;
  
  if (!s?.visible) {
    return <div className="pool-sidebar-empty" />;
  }

  return (
    <aside className="pool-sidebar" style={{ width: '100%', height: '100%' }}>
      {s.viewId ? (
        <PluginViewSlot pluginId={s.viewId} viewId={s.viewId} />
      ) : (
        <div className="pool-sidebar-no-view">No view selected</div>
      )}
    </aside>
  );
}
```

### 3.4 MainRenderer

```tsx
function MainRenderer({ layout }: { layout: PoolLayout }) {
  const groups = layout.groups ?? [];

  return (
    <main className="pool-main" style={{ display: 'flex', width: '100%', height: '100%' }}>
      {groups.map(group => (
        <div
          key={group.id}
          className="pool-group"
          style={{ flex: group.flex, display: 'flex', flexDirection: 'column', position: 'relative' }}
        >
          {group.tabs.map(tab => (
            <div
              key={tab.id}
              className="pool-tab-content"
              style={{
                display: tab.id === group.activeTabId ? 'flex' : 'none',
                flex: 1, overflow: 'hidden',
              }}
            >
              <ErrorBoundary pluginId={tab.pluginId} tabId={tab.id}>
                <PluginComponent
                  pluginId={tab.pluginId}
                  tabId={tab.id}
                  sourceId={tab.sourceId}
                  isActive={tab.id === group.activeTabId}
                />
              </ErrorBoundary>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
```

---

## 4. preload-plugin.ts 新增

```typescript
// 模块顶层——IPC 监听器常驻
let _layoutCallback: ((layout: PoolLayout) => void) | null = null;
let _layoutBuffer: PoolLayout[] = [];
let _onLayoutActive = false;

// E5#11l Bug 4 防线：IPC 监听在模块顶层，不在 useEffect 里
ipcRenderer.on('pool:layout', (_event, layout: PoolLayout) => {
  if (_onLayoutActive && _layoutCallback) {
    _layoutCallback(layout);
  } else {
    _layoutBuffer.push(layout);
  }
});

// 暴露给 React
contextBridge.exposeInMainWorld('linkdesk', {
  ...existingApi,
  pool: {
    onLayout(cb: (layout: PoolLayout) => void): () => void {
      _layoutCallback = cb;
      _onLayoutActive = true;
      // 回放缓冲
      for (const l of _layoutBuffer) { cb(l); }
      _layoutBuffer = [];
      return () => { _layoutCallback = null; _onLayoutActive = false; };
    },
    ready(): void {
      ipcRenderer.send('pool:ready', { zone: getZoneFromUrl() });
    },
    getZone(): string {
      return getZoneFromUrl();
    },
  },
});
```

---

## 5. 壳侧 syncLayout

### 5.1 usePoolSync.ts

```typescript
import { useCallback, useEffect } from 'react';

export function usePoolSync(tabState: TabState, sidebarState: SidebarState) {
  const sync = useCallback(() => {
    const layout: PoolLayout = {
      sidebar: {
        visible: sidebarState.isOpen,
        width: layoutEngine.getBounds('sidebar')?.width ?? 260,
        viewId: sidebarState.activeViewId,
      },
      groups: tabState.groups.map(g => ({
        id: g.id,
        flex: g.flex ?? 1,
        activeTabId: g.activeTabId,
        tabs: g.tabs.map(t => ({
          id: t.id,
          pluginId: t.pluginId,
          title: t.title,
          sourceId: t.sourceId,
          dirty: t.dirty,
        })),
      })),
    };

    window.linkdesk.pool.pushLayout('sidebar', layout);
    window.linkdesk.pool.pushLayout('main', layout);
  }, [tabState, sidebarState]);

  useEffect(() => { sync(); }, [sync]);

  return { sync };
}
```

### 5.2 MainContent.tsx 集成

```typescript
function MainContent({ editorAreaRef }: MainContentProps) {
  // ... 现有 tabState / sidebarState 逻辑 ...

  // 🆕 Pool sync——替代 useWebViewSync
  const { sync } = usePoolSync(tabState, sidebarState);

  // 窗口 resize → updatePoolBounds
  useEffect(() => {
    const onResize = () => windowManager.updatePoolBounds();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="main-content">
      {/* TabBar——壳DOM，位置在 MainPool 上方 */}
      <div className="tab-bar" style={{ height: TAB_BAR_HEIGHT }}>
        <TabBar ... />
      </div>

      {/* 内容区——由两个 Pool WebContentsView 覆盖 */}
      <div className="content-area" style={{ position: 'relative', flex: 1 }}>
        {/* 壳 DOM 的侧栏和主区 div → display: none（Pool 覆盖） */}
      </div>

      {/* StatusBar——壳DOM */}
      <StatusBar />
    </div>
  );
}
```

---

## 6. 两阶段过渡

### Phase 2（本Phase）：壳 DOM + Pool 共存

```
壳侧栏 div (display: none)    ← 壳 DOM 隐藏
SidebarPool WebContentsView   ← 覆盖在侧栏位置

壳主区 div (display: none)    ← 壳 DOM 隐藏
MainPool WebContentsView      ← 覆盖在主区位置

壳 TabBar                     ← 壳 DOM 渲染
壳 StatusBar                  ← 壳 DOM 渲染
```

### Phase 8（清理后）：Pure Pool

```
壳 TabBar                     ← 壳 DOM 渲染
壳 StatusBar                  ← 壳 DOM 渲染
SidebarPool                   ← 独立 WebContentsView
MainPool                      ← 独立 WebContentsView

无壳 DOM 侧栏/主区 div
无 useWebViewSync
```

---

## 7. 验证检查点

1. `npm run electron:dev` → 壳窗口 + 两个 Pool 创建
2. SidebarPool DevTools → `document.querySelector('#pool-root')` 非空
3. MainPool DevTools → 同 #2
4. 壳创建标签页 → MainPool 渲染编辑器
5. 侧栏展开 → SidebarPool 渲染文件树
6. F5 刷新 → 两个 Pool 重建，状态恢复
