# Phase 8 — 工作台与 OLED

> 2026-07-22 Encaron 定稿。新路线图：Phase 6 底座 + Phase 7 多 WebView + 编辑能力就位后，Phase 8 做两个纯消费者插件——卡片工作台 + OLED。
>
> **这是验证"万物皆插件"的终极测试。** 工作台卡片不碰任何框架代码——CardRegistry 骨架在 Phase 5 留好，渲染全在 `plugins/workspace/`。OLED 同理——独立插件，`npm install` → 直接注册 → 出图标。

---

## 一、为什么工作台推到 Phase 8

### 1.1 旧路线图的问题

旧 P7：卡片工作台 + 数据管道。但：
- 当时多 WebView 还没做 → 卡片工作台在单 WebView 里写
- 当时文件树还没做 → 没有"打开文件夹"概念，workspace 导入导出缺上下文
- 当时终端还没拆干净 → 卡片消费的数据管道（RingBuffer → 卡片）参考了脏模板

### 1.2 Phase 8 的底座

| 底座 | Phase | 工作台用到什么 |
|------|:--:|------|
| 多 WebView | P7a | 每个卡片类型 = 独立插件 = 独立 WebView |
| FileService | P6c | 卡片布局持久化（`.linkdesk/workspace.json`） |
| WorkspaceService | P6c | workspace 导入导出 |
| 主题系统插件化 | P7c | 卡片颜色走 CSS 变量 |
| CardRegistry | P5 | 卡片注册骨架——Phase 5 已留好接口 |
| DataPipeline | P5 | RingBuffer → ProtocolParser → DataDispatch → 卡片 |

---

## 二、8a — 卡片工作台（~400 行）

### 2.1 消费 Phase 5 的骨架

Phase 5 留了 CardRegistry 接口（注册卡片的"声明"），Phase 8 实现渲染：

```
plugins/workspace/
  ├── plugin.json       → { type: "cardWorkspace", contributes: { cards: [...] } }
  ├── index.tsx         → react-grid-layout 网格渲染
  ├── cards/            → 内置卡片类型（gauge / slider / value / chart）
  └── useDataPipeline.ts → 协议解析 → 卡片消费
```

### 2.2 任务清单

| # | 任务 | 行数 |
|:--:|------|:--:|
| 1 | CardRegistry 渲染引擎——react-grid-layout 网格 | +120 |
| 2 | 内置卡片类型：仪表盘 / 滑块 / 数值 / 折线图 | +150 |
| 3 | 数据管道消费端——RingBuffer → ProtocolParser → DataDispatch → 卡片 | +80 |
| 4 | 卡片拖拽/缩放/添加/删除 | +50 |

### 2.3 和终端的关系

终端是第一个视图插件（数据收发），工作台是第一个卡片工作台插件（数据可视化）。两个不互相依赖——同一套 `DataDispatch` 管道，终端消费原始数据，工作台消费解析后的卡片数据。

---

## 三、8b — OLED（~200 行）

### 3.1 独立插件

```
plugins/oled/
  ├── plugin.json
  ├── index.tsx          → OLED 视图组件
  ├── useI2C.ts          → I2C 通信 hook（Mock + 真实两种模式）
  └── OLEDRenderer.tsx   → Canvas 或 WebGL 渲染 OLED 像素
```

### 3.2 任务清单

| # | 任务 | 行数 |
|:--:|------|:--:|
| 5 | OLED 视图插件——视图注册 + 标签页 + keep-alive | +50 |
| 6 | I2C 通信层（Rust + TS） | +80 |
| 7 | OLED 像素渲染（Canvas） | +70 |

---

## 四、Phase 8 不做的东西

| 不做 | 理由 |
|------|------|
| 代码编辑器（IntelliSense/重构） | 属于具体插件——不是基础设施 |
| 文件搜索替换 | 独立命令系统功能 |
| Debug 断点调试 | 需要调试协议 |
| 固件烧录 | 需要烧录工具链 |
| 逻辑分析仪 | Phase 9+ |
| 地图视图 | Phase 9+ |

---

## 五、相关文档

- [LinkDesk-Phase8-实施顺序.md](./LinkDesk-Phase8-实施顺序.md) — 严格逐步执行计划
- [LinkDesk-Phase7-设计.md](../phase7_多WebView与编辑能力_暂定/LinkDesk-Phase7-设计.md) — Phase 8 的前置条件
- [Phase 5 设计](../phase5_应用基础设施/V3-Phase5-设计.md) — CardRegistry 骨架 + DataPipeline
