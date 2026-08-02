# React Fallback 退役——多 WebView 真正完成

> 2026-08-02。**E5 第 1 层第 4 轮。** 修复 E3f #58d 遗留的时序 bug——插件 React fallback 退役，多 WebView 真正完成。
> 执行清单任务：E5#10、E5#11

---

## 一、前因——双份渲染现状

### 1.1 E3f #58d/#58e 留下的半完成状态

```
用户切到串口监视器标签页
  → MainContent 渲染插件的 React 组件（壳 fallback）   ← 「主力」
  → 同时 terminal WebView 后台加载                       ← 「覆盖层」
  → WebView 加载完 → 发 plugin-view:ready → MainContent 收到
  → 但关掉 React fallback 后标签页全白（E3f #58d 回退原因）
  → 所以 React fallback 一直跑——从未退役
```

**当前 MainContent.tsx 的双份渲染代码（L84-96）：**

```typescript
// renderTabContent（MainContent.tsx L84-96）
if (readyWebViewIds.has(pluginId)) {
  // WebView 就绪 → 渲染空 div 占位，WebContentsView 覆盖在上面
  return <div className="plugin-webview-placeholder" />;
}
// ⚠️ WebView 未就绪 → React fallback 仍在渲染
const plugin = getViewPlugin(tab.pluginId);
if (plugin?.component) {
  return <ErrorBoundary><plugin.component /></ErrorBoundary>;
}
```

**问题：** `readyWebViewIds` 里的 WebView "已就绪"，但 React fallback 从未真正停止——WebView 覆盖在上面，用户看到的是 WebView，但 React 组件仍在壳 WebView 里跑、仍在消耗内存、`console.log` 仍在壳控制台。

### 1.2 E3f #58e 白屏的根因

```
时序：
1. setReadyWebViewIds.add(pluginId)  ← WebView 发 ready 信号
2. React 重渲染 → renderTabContent 走到 readyWebViewIds.has → 返回空 div
3. 但此时 WebContentsView 还没完成布局——bounds 还没设
4. 用户看到：空 div（React 已关）+ WebView 透明/未就绪 → 全白
```

**根因：** `readyWebViewIds` 更新和 WebContentsView bounds 设置之间存在 gap。在 gap 期间 React fallback 已关，WebView 还没显示——两边都没内容。

### 1.3 目标

```
用户切到串口监视器标签页
  → MainContent 渲染 React fallback（临时占位）
  → terminal WebView 后台加载
  → WebView 加载完 + bounds 已设置 → 两个条件都满足
  → MainContent 关掉 React fallback → 显示 WebView
  → React fallback 彻底卸载——不再占用内存、console.log 不进壳控制台
```

---

## 二、设计方案

### 2.1 核心——双条件就绪判断

当前只判断了 `readyWebViewIds.has(pluginId)`（WebView JS 已加载）。需要加第二个条件：**WebView bounds 已设置**。

```typescript
// MainContent.tsx 中的 renderTabContent（改造后）

// 两个条件都满足才关 React fallback
const webViewFullyReady = 
  readyWebViewIds.has(pluginId) &&        // WebView JS 已加载
  webViewBoundsReady.has(pluginId);       // WebView bounds 已设置（首帧已渲染）

if (webViewFullyReady) {
  return <div className="plugin-webview-placeholder" />;  // 空 div，WebView 覆盖
}
// 未完全就绪 → React fallback 继续渲染
const plugin = getViewPlugin(tab.pluginId);
if (plugin?.component) {
  return <ErrorBoundary><plugin.component /></ErrorBoundary>;
}
```

### 2.2 WebView 同步逻辑改造（MainContent.tsx L169-231）

**当前逻辑：**
1. 遍历 tabState → 找到活跃的插件 tab
2. 对每个活跃插件 → `pv.setVisible(true)` / `pv.setBounds(...)`
3. 对不活跃的插件 → `pv.setVisible(false)`

**改造后——加 bounds 就绪标记：**

```typescript
// MainContent.tsx L169-231（改造后）
useEffect(() => {
  const syncWebViews = async () => {
    // ... 现有逻辑：构建 currentStates、setVisible ...
    
    // 🆕 设置 bounds 后标记就绪
    for (const [pluginId, state] of currentStates) {
      if (state.isFocused) {
        const el = document.querySelector(`[data-group-id="${state.groupId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          await pv.setBounds(pluginId, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          // 🔥 bounds 设置完成 → 标记就绪
          setWebViewBoundsReady(prev => new Set(prev).add(pluginId));
        }
      }
    }
  };
  
  const raf = requestAnimationFrame(() => syncWebViews());
  return () => cancelAnimationFrame(raf);
}, [tabState, activeGroupId]);
```

### 2.3 超时兜底——5s 未就绪回退 React fallback

```typescript
// MainContent.tsx
const [webViewTimeout, setWebViewTimeout] = useState<Set<string>>(new Set());

useEffect(() => {
  for (const pluginId of activePluginIds) {
    if (!webViewFullyReady && !webViewTimeout.has(pluginId)) {
      const timer = setTimeout(() => {
        console.warn(`[MainContent] ⚠️ WebView "${pluginId}" 5s 未就绪，回退 React fallback`);
        setWebViewTimeout(prev => new Set(prev).add(pluginId));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }
}, [activePluginIds]);
```

### 2.4 过渡动画——fallback → WebView 不闪白

```css
/* MainContent.css */
.plugin-webview-placeholder {
  /* 空 div 占位——保持布局不跳变 */
  width: 100%;
  height: 100%;
}

/* React fallback 退出时短暂淡出 */
.plugin-fallback-fading {
  opacity: 0;
  transition: opacity 150ms ease;
}
```

---

## 三、实现步骤

### E5#10a 定位白屏根因（~20 行调查）

**内容：** 在 MainContent.tsx 中加临时 console.log——追踪 `readyWebViewIds` 更新时间 + WebView bounds 设置时间。

**调查输出：**
```
[MainContent] ready signal: serial-monitor @ +320ms
[MainContent] bounds set: serial-monitor @ +380ms
[MainContent] gap: 60ms  ← 这就是白屏窗口
```

### E5#10b 加双条件就绪判断（~15 行）

**文件：** `src/components/MainContent.tsx`

**内容：**
1. 新增 `webViewBoundsReady` state（`Set<string>`）
2. `renderTabContent` 中改判断——`webViewFullyReady = readyWebViewIds.has(id) && webViewBoundsReady.has(id)`
3. `syncWebViews` effect 中 `setBounds` 后加 `setWebViewBoundsReady`

### E5#10c 超时兜底（~5 行）

**内容：** 5s 超时 → 标记 `webViewTimeout` → 不再等待 WebView——React fallback 作为永久方案。

### E5#11 验证——多 WebView 验收

#### E5#11a console.log 隔离

**验证：** 在串口监视器插件代码中加 `console.log("test-serial")` → 只在 terminal DevTools 看到，壳 DevTools 看不到。

#### E5#11b 文件树 console.log 隔离

**验证：** 同上——只在 file-tree DevTools 看到。

#### E5#11c 壳 console.log 隔离

**验证：** 壳自己的 `console.log("shell")` 只在壳 DevTools 看到。

#### E5#11d 插件崩溃隔离

**验证：** 在串口监视器中 `throw Error("test crash")` → ErrorBoundary 捕获 → 只有 terminal WebView 重启 → 壳和其他插件不受影响。

#### E5#11e DevTools 入口

**验证：** `Ctrl+Shift+P → DevTools` → 列表清晰区分每个插件和壳。

---

## 🔴 预测 Bug

### Bug E5-10a 🔴🔴🔴 时序 gap 仍存在——白屏回归

**历史：** E3f #58d——React 关掉后 WebView 未就绪 → 标签页全白。E3f #58e 的 `plugin-view:ready` 信号 + `readyWebViewIds` 未能解决——因为 bounds 设置是另一个异步步骤。

**E5 触发条件：** WebView 发 ready 信号（JS 已加载）→ 但此时 WebContentsView 的 bounds 还没设（需要等 React 渲染 DOM → getBoundingClientRect → setBounds）→ 和 #58d 同样的 gap。

**🔥 防线——双条件：** `readyWebViewIds && webViewBoundsReady`——两个条件都满足才关 React fallback。

---

### Bug E5-10b 🔴 WebView 崩溃后回退——React fallback 已卸载

**历史：** E3j #81——双份渲染中壳 fallback 和 WebView 各自独立。WebView 崩溃 → 壳 fallback 不可用（已卸载）→ 用户看到空白。

**E5 触发条件：** WebView 完全接管后崩溃 → React fallback 已卸载 → 无法回退。

**🔥 防线——WebView 崩溃→自动重建 React fallback：**
```typescript
// 订阅 WebView crash 事件
useEffect(() => {
  const handler = (pluginId: string) => {
    // 清除就绪标记 → renderTabContent 走 React fallback 分支
    setReadyWebViewIds(prev => { const s = new Set(prev); s.delete(pluginId); return s; });
    setWebViewBoundsReady(prev => { const s = new Set(prev); s.delete(pluginId); return s; });
    // 触发重渲染 → React fallback 重新渲染
    forceUpdate();
  };
  return linkdesk.pluginViews.onCrashed?.(handler);
}, []);
```

---

### Bug E5-10c 🔴 React fallback 和 WebView 同时渲染——数据双份

**历史：** E3j #77b——双份渲染时串口数据到两边。实测推翻假设：数据只到一个地方（看谁先 openPort）。

**E5 触发条件：** 在 gap 期间（WebView JS 就绪但 bounds 未完成）→ React fallback 和 WebView 可能同时有数据通道。

**🔥 防线——gap 期间 React fallback 设 isTransitioning 标记：** 插件代码检测到 `isTransitioning` → 不初始化数据通道（等待 WebView 完全接管后再初始化）。

---

## 四、涉及文件

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/MainContent.tsx` | 加 webViewBoundsReady state / 改 renderTabContent / 超时兜底 / 崩溃回退 | ~40 |
| `src/components/MainContent.css` | 加 fallback 淡出过渡 | ~5 |
| `src/core/ShellEvents.ts` | 加 `"webview:crashed"` 事件（可选） | +1 |
| `electron/services/plugin-view-registry.ts` | 加 onCrashed 事件（可选） | ~10 |

---

## 五、完工标准

- [ ] 插件 `console.log` → 只在插件自己的 DevTools 出现——不进壳 DevTools
- [ ] 壳 `console.log` → 只在壳 DevTools 出现
- [ ] 插件崩溃 → ErrorBoundary 捕获 → 只该插件 WebView 重启
- [ ] WebView 5s 未就绪 → 回退 React fallback + console.warn
- [ ] WebView 崩溃 → 自动恢复 React fallback
- [ ] 切换标签页 → 无白屏、无闪烁
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#10–#11
> **← 前置：** `壳内低耦合-App去胶水化.md`（E5#7）——MainContent 独立管理标签页后做
