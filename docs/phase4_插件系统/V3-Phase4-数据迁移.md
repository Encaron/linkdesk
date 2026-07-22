# Phase 4 数据迁移方案

> 2026-07-19。Phase 3.5 → Phase 4：prefs.json 结构变化、布局恢复变化、终端保底→欢迎页保底。
> 关联：[V3-Phase4-终端插件化设计.md](V3-Phase4-终端插件化设计.md) / [V3-Phase4-插件系统与UI重构设计.md](V3-Phase4-插件系统与UI重构设计.md)

---

## 1. prefs.json 变化

### 1.1 Phase 3.5 结构

```json
{
  "window": { "left": 100, "top": 50, "width": 960, "height": 640 },
  "theme": "Dark",
  "lastPort": "COM3",
  "preferences": {
    "timestampFormat": "HH:mm:ss:fff",
    "showEcho": true,
    "showLineNumbers": true,
    "separateSystemLog": true,
    "lineEnding": "\r\n",
    "autoRepeat": false,
    "repeatInterval": 1000,
    "autoClear": false,
    "receiveMode": "text",
    "receiveCoding": "UTF-8",
    "sendMode": "text",
    "sendCoding": "UTF-8"
  },
  "quickSends": { "AT": "AT\r\n" },
  "layout": {
    "groups": [...],
    "activeGroupId": "main",
    "root": { "type": "leaf", "groupId": "main" }
  }
}
```

### 1.2 Phase 4 结构

```json
{
  "window": { ... },           ← 不变
  "theme": "Dark",             ← 不变
  "locale": "zh",              ← 新增（原"中:EN"按钮的状态持久化）
  "lastPort": "COM3",          ← 保留。字段名虽然绑串口，但终端插件继续用。改名为 lastSource 留 Phase 5+
  "preferences": { ... },      ← 不变。终端插件自己读写
  "quickSends": { ... },       ← 不变。终端插件自己读写
  "recentViews": [],           ← 新增。欢迎页"最近"区域数据源——不只是 workspace，任何视图打开后都记录
  "enabledPlugins": [],        ← 新增（Phase 4 默认空 = 全部启用。Phase 5 Profile 时使用）
  "layout": {
    "groups": [
      {
        "id": "main",
        "tabs": [
          { "id": "welcome-1", "type": "welcome", "label": "Welcome", "pluginId": "welcome" }
        ],
        "activeTabId": "welcome-1"
      }
    ],
    "activeGroupId": "main",
    "root": { "type": "leaf", "groupId": "main" }
  }
}
```

### 1.3 自动迁移逻辑

```typescript
function migratePhase4(prefs: OldPrefs): Phase4Prefs {
  return {
    ...prefs,
    locale: prefs.locale ?? "zh",           // 缺了就默认中文
    recentViews: prefs.recentViews ?? [],
    enabledPlugins: prefs.enabledPlugins ?? [],
    // layout 迁移：旧 terminal 标签页 → TerminalView 仍存在（现在是插件），不丢数据
    layout: migrateLayout(prefs.layout),
  }
}

function migrateLayout(layout: LayoutData): LayoutData {
  // 旧布局中 groups 的 terminal 标签页保留不动
  // TerminalView 虽然移到了 plugins/，但 type: "terminal" 规则不变
  // pluginId: "terminal" 由加载器自动补上
  for (const g of layout.groups) {
    for (const t of g.tabs) {
      if (t.type === "terminal" && !t.pluginId) {
        t.pluginId = "terminal"
      }
    }
  }
  // 确保至少一个标签页
  if (allTabs(layout).length === 0) {
    layout = createInitialTabState()  // 创建 welcome 标签页
  }
  return layout
}
```

### 1.4 终端偏好设置——留在 prefs.json，不改地方

- `preferences.*`（时间戳、回显、行号、编码……）留在 `prefs.json` 不动
- 理由：这些是终端插件的持久化数据，PreferenceService 是唯一配置入口。
  挪到 `plugins/terminal/prefs.json` = 多了一个 AI 需要知道的位置 = 违反归一化
- 未来如果有第二个数据源（CAN、TCP），它的设置也走 `prefs.json`，
  用命名空间区分：`"can.preferences"` / `"tcp.preferences"`——不建新文件

---

## 2. 布局恢复变化

### 2.1 启动逻辑

```
Phase 3.5：
  启动 → loadPrefs() → 有 layout → restoreLayout()
    → 没有 terminal → 补一个 terminal
    → 有 terminal → 正常恢复

Phase 4：
  启动 → loadPrefs() → migratePhase4() → 有 layout → restoreLayout()
    → 所有 tabs 补 pluginId 字段（旧 tab 没有）
    → 总 tab 数为 0 → 创建 welcome
    → 有 tab → 正常恢复
```

### 2.2 旧布局中 terminal 标签页恢复

恢复出的 `{ type: "terminal", label: "COM3 终端" }` 标签页 → `renderTabContent()` 查 `viewRegistry.get("terminal")` → 插件加载器已注册 "terminal" → 正常渲染。

**如果终端插件被卸载了：** `viewRegistry.get("terminal")` → undefined → 显示占位 UI：
```
┌─────────────────────────────┐
│ ⚠ 插件 "终端" 未安装         │
│                              │
│ 此标签页需要终端插件才能显示   │
│ [安装终端插件]               │  ← 从 .disabled/ 恢复
└─────────────────────────────┘
```

---

## 3. 降级与回滚

### 3.1 用户从 Phase 4 退回到 Phase 3.5（git checkout master）

`layout` 里有 `type: "welcome"` → Phase 3.5 的 `renderTabContent()` 不认识 → `default` case → 空白标签页。**无害。** 用户创建新 terminal 标签页即可恢复。或删 `prefs.json` 的 layout 字段让 Phase 3.5 重建初始状态。

### 3.2 prefs.json 被 Phase 4 写过后，在 Phase 3.5 中打开

- `locale` / `recentViews` / `enabledPlugins` → Phase 3.5 忽略，不报错
- `"type": "welcome"` tab → default case，空白标签页
- 所有其他字段 → 正常读取

**结论：向前兼容——Phase 3.5 能读 Phase 4 的 prefs.json，只是 welcome 标签页不渲染。向后兼容——加字段，不改结构。**

---

## 4. 检查清单

```
☐ Phase 4 首次启动 → prefs.json 自动迁移（加 locale/recentViews/enabledPlugins）
☐ 旧布局有 terminal 标签页 → 恢复后正常渲染（插件已注册）
☐ 旧布局无 terminal 标签页 → 恢复后创建 welcome
☐ 旧布局无任何标签页 → 创建 welcome
☐ 终端插件被卸载 → 旧布局中的 terminal 标签页显示占位 UI + [安装] 按钮
☐ prefs.json 被 Phase 4 写过后 → Phase 3.5 能打开，不崩溃
☐ `preferences.*` 设置 → 终端插件继续正常读写，值和 Phase 3.5 完全一致
```
