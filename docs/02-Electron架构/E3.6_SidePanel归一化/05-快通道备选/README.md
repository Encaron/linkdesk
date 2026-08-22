# 插件迁移——两种注册形式

> 主方案为全拆。快通道为备选——可在迁移第一步先跑通全链路，后续需要时再拆细。

---

## 方案 A：全拆（主方案）

**每个 Section 独立注册为一个 view。** 旧 sidebar.tsx 拆为多个组件，各自由 plugin.json 声明式或 activate() 命令式 `registerView`。

### marketplace（拆 4 个）

```
registerView("marketplace", { id: "installed",   title: "已安装", render: InstalledList })
registerView("marketplace", { id: "builtin",     title: "内置",   render: BuiltinList })
registerView("marketplace", { id: "disabled",    title: "已禁用", render: DisabledList })
registerView("marketplace", { id: "uninstalled", title: "待安装", render: UninstalledList })
```

```
┌──────────────────┐
│ 插件市场        ◀│
├──────────────────┤
│ ▼ 已安装         │  ← 独立的 view（ViewContainer 包一层 SidebarSection）
│   插件A          │
│   插件B          │
│                  │
│ ▶ 内置           │  ← 独立的 view，可单独折叠/展开
│                  │
│ ▶ 已禁用         │  ← 独立的 view
│                  │
│ ▶ 待安装         │  ← 独立的 view
└──────────────────┘
```

✅ 每个 section 可单独折叠  
✅ 其他插件可在任意两个 section 之间插入 view  
✅ 可单独隐藏某个 section（when context key）  
❌ 要拆旧代码

### serial-monitor（拆 2 个）

```
registerView("serial-monitor", { id: "sessions", title: "串口监视器会话", render: SessionListView })
registerView("serial-monitor", { id: "settings", title: "收发设置",       render: SerialSettingsView })
```

```
┌──────────────────┐
│ 串口监视器      ◀│
├──────────────────┤
│ ▼ 串口监视器会话  │  ← 独立的 view
│   COM3 · 115200  │
│   COM4 · 9600    │
│                  │
│ ▶ 收发设置       │  ← 独立的 view
└──────────────────┘
```

✅ 其他插件可在 "会话" 和 "收发设置" 之间加 section  
❌ 要拆 460 行 sidebar.tsx

### file-tree（拆 1 个，本来就是 1 个）

```
registerView("explorer", { id: "folders", title: "", render: FoldersView })
```

```
┌──────────────────┐
│ 资源管理器      ◀│
├──────────────────┤
│ ▼                 │  ← 唯一的 view（title 为空，只显示 twistie）
│   src/            │
│   docs/           │
│   ...             │
└──────────────────┘
```

✅ 零拆分——file-tree 本来就是一个 view  
✅ 其他插件注册到 explorer 容器 → 自动出现在 FOLDERS 上面或下面

---

## 方案 B：合成一份（快通道备选）

**整个旧 sidebar.tsx 原封不动塞进一个 view。** 旧代码一刀不砍，内部 SidebarSection 保持不动。

```
// 每个插件只注册一个 view，旧 sidebar.tsx 直接当 render
registerView("marketplace",    { id: "main", title: "", render: MarketplaceSidebar })
registerView("serial-monitor", { id: "main", title: "", render: SerialMonitorSidebar })
registerView("explorer",       { id: "main", title: "", render: FileTreeSidebar })
```

### marketplace

```
┌──────────────────┐
│ 插件市场        ◀│
├──────────────────┤
│ ▼                 │  ← 唯一的 view（外层折叠，ViewContainer 包）
│                  │
│   ▼ 已安装       │  ┐
│     插件A        │  │
│     插件B        │  │
│   ▶ 内置         │  ├ 旧 sidebar.tsx 内部的 SidebarSection
│   ▶ 已禁用       │  │ 一刀没改，折叠照样工作
│   ▶ 待安装       │  ┘
└──────────────────┘
```

### serial-monitor

```
┌──────────────────┐
│ 串口监视器      ◀│
├──────────────────┤
│ ▼                 │  ← 唯一的 view（外层折叠）
│                  │
│   ▼ 串口监视器会话│  ┐
│     COM3 · 115200│  │
│     COM4 · 9600  │  ├ 旧 460 行 sidebar.tsx 一刀没改
│   ▼ 收发设置     │  │
│     时间戳: HH.. │  ┘
└──────────────────┘
```

### file-tree

```
┌──────────────────┐
│ 资源管理器      ◀│
├──────────────────┤
│ ▼                 │  ← 唯一的 view
│   src/            │
│   docs/           │
└──────────────────┘
```

✅ 零改动旧代码——三份 sidebar.tsx 一刀不动，只写 plugin.json  
✅ 多了一层外层折叠——整个插件侧栏可以一键收起  
❌ 其他插件不能插在旧 section 之间——只能加在整个插件上面或下面  
❌ 两层折叠嵌套——外层 ViewContainer + 内层旧 SidebarSection

---

## 对比

| | 全拆（主方案）| 合成一份（备选）|
|------|:--:|:--:|
| 改旧 sidebar.tsx | **拆 460+300+137 行** | **零** |
| plugin.json 改动 | 同 | 同 |
| 外层折叠 | 每 section 独立折叠 | 整个插件一个折叠（多一层功能）|
| 外部插件可插入位置 | 任意 section 之间 | 整个插件上/下 |
| 迁移工作量 | ~105 行 | **~15 行** |
| 后续拆细成本 | — | 拆哪个改哪个，互不牵连 |

---

> **主方案：** 全拆（`03-插件迁移/` 三份文档）
> **备选：** 快通道——第一步跑通全链路，看到效果后再决定哪些容器需要拆细
