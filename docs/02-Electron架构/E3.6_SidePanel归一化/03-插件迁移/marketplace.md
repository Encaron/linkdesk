# marketplace 迁移——551 行拆分为 4 个 view

> 对应任务：E36#7。551 行拆为 4 个 view + 1 个共享 hook + 1 个共享搜索状态 + 1 个共享组件。
>
> **核心挑战：** 四个 section 共享同一个数据源（`pm().list()`/`pm().getDisabled()`/`pm().getUninstalled()`）和同一个搜索框。拆分后必须保持搜索框输入→四个 section 同时过滤的行为。

## 文件清单

```
plugins/builtin/marketplace/src/
├── sidebar.tsx                         551 行  旧文件（废弃）
├── marketplaceShared.ts                新 ~50   模块级搜索状态 + 共享数据 hook
├── ExtensionItem.tsx                   新 ~100  从 L466-549 提取（插件列表项组件）
├── views/
│   ├── InstalledListView.tsx           新 ~80   已安装列表 + 搜索框 + 安装按钮
│   ├── BuiltinListView.tsx             新 ~50   内置列表
│   ├── DisabledListView.tsx            新 ~70   已禁用列表
│   └── UninstalledListView.tsx         新 ~70   待安装列表
├── index.tsx                           改 ~15   共享命令注册移到此文件的 activate()
└── plugin.json                         改 ~20   加 viewsContainers + views
```

---

## 拆分步骤

### 第 1 步：提取共享状态模块 `marketplaceShared.ts`

搜索状态必须是模块级的——四个 view 独立渲染，不共享 React Context（SidePanel 没有提供 Provider 机制）。

```typescript
// plugins/builtin/marketplace/src/marketplaceShared.ts
import { useState, useCallback, useEffect } from "react";
import type { ViewPluginEntry } from "@src/core/types";
import { onPluginLifecycleChange } from "@src/pluginLoader/lifecycle";

const pm = () => (window as any).linkdesk?.pluginManager;

// ═══ 模块级搜索状态 ═══
let _search = "";
const _searchListeners = new Set<() => void>();

export function getMarketplaceSearch(): string { return _search; }
export function setMarketplaceSearch(v: string): void {
  _search = v;
  _searchListeners.forEach(fn => fn());
}
export function onMarketplaceSearchChange(fn: () => void): () => void {
  _searchListeners.add(fn);
  return () => { _searchListeners.delete(fn); };
}

// ═══ 共享数据 hook ═══
// 四个 view 各自调用此 hook。首次调用发起 IPC，后续调用等待同一 Promise。
let _loadingPromise: Promise<void> | null = null;
let _allPlugins: ViewPluginEntry[] = [];
let _disabledPlugins: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
let _uninstalledPlugins: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
let _listeners: Array<() => void> = [];

function notifyListeners() { _listeners.forEach(fn => fn()); }

async function _refresh(): Promise<void> {
  try {
    const [plugins, disabled, uninstalled] = await Promise.all([
      pm().list(), pm().getDisabled(), pm().getUninstalled(),
    ]);
    _allPlugins = plugins;
    _disabledPlugins = disabled;
    _uninstalledPlugins = uninstalled;
  } catch { /* 静默 */ }
}

export function useMarketplacePlugins() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);

  // 首次加载
  useEffect(() => {
    if (!_loadingPromise) {
      _loadingPromise = _refresh();
    }
    _loadingPromise.then(() => {
      rerender();
      // 订阅生命周期变更
      const unsub = onPluginLifecycleChange.event(() => {
        _refresh().then(() => notifyListeners());
      });
      _listeners.push(rerender);
      return () => {
        _listeners = _listeners.filter(fn => fn !== rerender);
        unsub();
      };
    });
  }, [rerender]);

  // 订阅搜索变化
  useEffect(() => {
    const unsub = onMarketplaceSearchChange(rerender);
    return unsub;
  }, [rerender]);

  const search = getMarketplaceSearch();

  const filterByName = (item: { name: string; pluginId: string; description?: string }) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q)
      || item.pluginId.toLowerCase().includes(q)
      || (item.description ?? "").toLowerCase().includes(q);
  };

  return {
    loading: _loadingPromise === null,
    installed: _allPlugins.filter(p => !p.manifest.core && filterByName(p)),
    builtin: _allPlugins.filter(p => p.manifest.core && filterByName(p)),
    disabled: _disabledPlugins.filter(filterByName),
    uninstalled: _uninstalledPlugins.filter(filterByName),
    refresh: () => _refresh().then(() => notifyListeners()),
  };
}
```

**🛡️：** `_loadingPromise` 确保四个 view 同时 mount 时只发一次 IPC。对标 `initPluginLoader` 的 `_loadingPromise` 模式（#59c Bug 1 教训）。

### 第 2 步：提取 ExtensionItem 组件

**来源：** sidebar.tsx L466-549
**目标：** 新 `plugins/builtin/marketplace/src/ExtensionItem.tsx`

直接剪切粘贴。这是纯 UI 组件——props 驱动，零副作用（除了齿轮菜单的 context key 设置）。

从原文件 L466-549 提取 `ExtensionItem` 函数 → 加 `export` → 放到新文件。L475-503 的 `clickTimer`/`handleClick`/`handleGear` 逻辑完全不动。

### 第 3 步：创建 InstalledListView（含搜索框 + 安装按钮）

**来源：** sidebar.tsx 的 header（L204-232 搜索框 + 安装按钮）+ installed section（L244-250）
**目标：** 新 `plugins/builtin/marketplace/src/views/InstalledListView.tsx`

```tsx
// InstalledListView.tsx
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTabActions } from "@src/core/TabActionsContext";
import { useMarketplacePlugins, setMarketplaceSearch, getMarketplaceSearch } from "../marketplaceShared";
import { ExtensionItem } from "../ExtensionItem";
import "../MarketplaceSidebar.css";

const lk = () => (window as any).linkdesk;

export default function InstalledListView() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const { installed, loading, refresh } = useMarketplacePlugins();
  const [installing, setInstalling] = useState(false);

  const handleOpenDetail = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: false });
  };
  const handleOpenDetailPinned = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: true });
  };

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const selected = await lk().dialog.open({ directory: true, title: "选择插件目录" });
      if (selected) await lk().pluginManager.install(selected as string);
    } catch { /* 静默 */ }
    finally { setInstalling(false); }
  }, []);

  if (loading) return <div className="ms-empty">{t("加载中...")}</div>;

  return (
    <>
      {/* 搜索框 + 安装按钮 */}
      <div className="ms-header">
        <div className="ms-header-actions">
          <button className="ms-install-btn" onClick={handleInstall} disabled={installing}
            title={t("从本地安装插件")}>
            <span className="codicon codicon-add" />
            {installing ? t("安装中...") : t("安装")}
          </button>
        </div>
        <div className="ms-search-container">
          <input className="ms-search-box" type="text"
            placeholder={t("搜索插件...")}
            value={getMarketplaceSearch()}
            onChange={(e) => setMarketplaceSearch(e.target.value)} />
          {getMarketplaceSearch() && (
            <button className="ms-search-clear" onClick={() => setMarketplaceSearch("")}>✕</button>
          )}
        </div>
      </div>
      {/* 已安装列表 */}
      {installed.length === 0 ? (
        <div className="ms-empty">{getMarketplaceSearch() ? t("未找到匹配的插件") : t("暂无已安装插件")}</div>
      ) : (
        <div className="ms-section-items">
          {installed.map((p) => (
            <ExtensionItem key={p.pluginId} plugin={p}
              onClick={() => handleOpenDetail(p.pluginId)}
              onDoubleClick={() => handleOpenDetailPinned(p.pluginId)} />
          ))}
        </div>
      )}
    </>
  );
}
```

**要点：** 搜索框放在第一个 view 的顶部——因为 SidePanel 的容器 header 暂不支持自定义 widget，ViewContainer 里的第一个 view 充当"容器 header 角色"。未来容器 header 机制就绪后，搜索框可以提取到容器 header，view 只留列表。

### 第 4 步：创建 BuiltinListView（无搜索框，纯列表）

```tsx
// BuiltinListView.tsx
import { useTranslation } from "react-i18next";
import { useTabActions } from "@src/core/TabActionsContext";
import { useMarketplacePlugins } from "../marketplaceShared";
import { ExtensionItem } from "../ExtensionItem";
import "../MarketplaceSidebar.css";

export default function BuiltinListView() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const { builtin, loading } = useMarketplacePlugins();

  if (loading || builtin.length === 0) return null;

  return (
    <div className="ms-section-items">
      {builtin.map((p) => (
        <ExtensionItem key={p.pluginId} plugin={p}
          onClick={() => tabActions?.createTab("plugin-detail", { pluginId: p.pluginId, pinned: false })}
          onDoubleClick={() => tabActions?.createTab("plugin-detail", { pluginId: p.pluginId, pinned: true })} />
      ))}
    </div>
  );
}
```

**要点：** `builtin.length === 0` 时 `return null`——view 组件返回 null = SidebarSection 渲染空内容。对标 VS Code `hideIfEmpty`。

### 第 5 步：创建 DisabledListView + UninstalledListView

同 BuiltinListView 结构，但行组件复用 ExtensionItem 还是用各自的简化版？

DisabledSection 和 UninstalledSection 的数据类型不同（`{ pluginId, name, description?, version? }` vs `ViewPluginEntry`）。ExtensionItem 接收 `ViewPluginEntry`。

**决策：** 新建 `SimplePluginItem.tsx` 用于 disabled/uninstalled——只显示 name + version + desc + 单个操作按钮（启用/安装）。

或者，修改 ExtensionItem 使其接受两种数据类型（联合类型 + 条件渲染）。

**推荐：** 提取一个更泛化的 `PluginRow` 组件：
```tsx
interface PluginRowProps {
  pluginId: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;  // 从 manifest 读或默认
  core?: boolean;
  actions?: React.ReactNode;  // 操作按钮插槽
  onClick?: () => void;
  onDoubleClick?: () => void;
}
```

ExtensionItem 内部构造 PluginRow + gear 按钮。Disabled/Uninstalled 各自构造 PluginRow + enable/install 按钮。

**行数影响：** ~30 行额外（PluginRow 提取 + Disabled/Uninstalled 适配）

### 第 6 步：plugin.json 声明

```json
{
  "contributes": {
    "viewsContainers": {
      "marketplace": {
        "title": "插件市场",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    },
    "views": {
      "marketplace": [
        { "id": "installed",   "title": "已安装", "render": "src/views/InstalledListView.tsx",   "order": 0 },
        { "id": "builtin",     "title": "内置",   "render": "src/views/BuiltinListView.tsx",     "order": 1, "collapsed": true },
        { "id": "disabled",    "title": "已禁用", "render": "src/views/DisabledListView.tsx",    "order": 2, "collapsed": true },
        { "id": "uninstalled", "title": "待安装", "render": "src/views/UninstalledListView.tsx",  "order": 3, "collapsed": true }
      ]
    }
  }
}
```

`"collapsed": true` → SidePanel 渲染时 SidebarSection 初始折叠。对标 VS Code——内置/已禁用/待安装默认折叠。

### 第 7 步：命令注册迁移

sidebar.tsx L27-70 的 `ensureMarketplaceCommands` + `registerCommand` + `registerMenuItems` 从 sidebar.tsx 移到 `index.tsx` 的 `activate()`：

```typescript
// index.tsx
export function activate() {
  ensureMarketplaceCommands();
}
```

模块级 `_marketplaceCommandsRegistered` guard 保持——多次 activate（StrictMode）只执行一次。

### 第 8 步：旧 sidebar.tsx → 标记废弃

```typescript
/** @deprecated 自 E3.6——拆为 4 个独立 view。R4 删除。 */
export { default } from "./views/InstalledListView";
```

---

## 验证清单

- [ ] 点 🛒 → 侧栏显示"插件市场"+ 4 个 section
- [ ] "已安装"默认展开，其余三个默认折叠
- [ ] 搜索框输入→4 个 section 同步过滤
- [ ] 清除搜索→全部恢复
- [ ] 点击已安装插件→打开详情标签页（预览模式）
- [ ] 双击→固定打开
- [ ] 齿轮菜单→启用/禁用/卸载/设置/主题/语言/快捷键入口正常
- [ ] 安装按钮→选择目录→插件出现在已安装列表
- [ ] 卸载插件→列表刷新 + 齿轮菜单消失
- [ ] `npm run check` 零错误
