# 插件 — 工作台与 OLED

> 2026-07-24。**第二批消费者插件。** E3 架构完工后，纯插件实现——不改壳一行代码。

---

## 定位

| | |
|---|---|
| 类型 | **消费者插件**——使用 E1-E3 建的架构能力 |
| 前提 | E3 架构完工（多 WebView + CardRegistry + DataPipeline + FileService） |
| 涉及架构改动 | **零。** 只写 `plugin.json` + React 组件 |
| 版本 | v1.5 |

---

## 包含

| 插件 | 内容 | 对标 |
|---|---|---|
| **卡片工作台** | 卡片网格布局——`react-grid-layout`，卡片组件注册到 CardRegistry | VS Code 的 Panel 区域 + Dashboard 概念 |
| **OLED 模拟器** | Canvas 逐像素渲染——模拟 OLED 屏幕显示 | 嵌入式调试工具 |

---

## 一、卡片工作台

### 1.1 概念

工作台 ≠ 编辑器。编辑器是"打开一个文件"，工作台是"摆一堆卡片"。对标场景：串口数据进来 → 仪表盘显示温度、波形图显示信号、数值卡片显示速率——三张卡片摆在同一屏，拖拽排列。

```
┌──────────────────────────────────────────────────┐
│  工作台标签页                                      │
│  ┌─────────┐ ┌─────────┐ ┌──────┐ ┌──────────┐  │
│  │ 温度计   │ │ 波形图   │ │ 速率  │ │ 开关     │  │
│  │ 37.2°C  │ │ ╱╲ ╱╲  │ │115200 │ │ ON ●    │  │
│  │ ████░░  │ │╱  ╲╱  ╲ │ │ bps   │ │          │  │
│  └─────────┘ └─────────┘ └──────┘ └──────────┘  │
│  ┌───────────────┐                               │
│  │ 折线图——历史数据 │                               │
│  │  ╱╲   ╱╲      │                               │
│  │ ╱  ╲_╱  ╲___  │                               │
│  └───────────────┘                               │
└──────────────────────────────────────────────────┘
```

**卡片可拖拽、缩放、添加、删除。** 布局保存到 `.linkdesk/workspace.json`。

### 1.2 插件结构

```
plugins/workspace/
├── plugin.json
├── index.tsx                 # 主视图——react-grid-layout 网格
├── cards/                    # 内置卡片类型
│   ├── GaugeCard.tsx         # 仪表盘
│   ├── SliderCard.tsx        # 滑块
│   ├── ValueCard.tsx         # 数值
│   ├── LineChartCard.tsx     # 折线图
│   └── SwitchCard.tsx        # 开关
├── CardPicker.tsx            # 添加卡片面板
├── CardContainer.tsx         # 卡片 wrapper——标题栏 + 缩放/删除按钮
└── workspace.json            # 默认布局（可选）
```

### 1.3 plugin.json

```json
{
  "name": "工作台",
  "version": "1.0.0",
  "icon": "dashboard",
  "iconSource": "codicon",
  "description": "卡片工作台——拖拽式仪表盘，可视化串口数据",
  "entry": "index.tsx",
  "tabBehavior": {
    "singleton": true
  },
  "contributes": {
    "commands": [
      { "id": "workspace.addCard",    "title": "工作台: 添加卡片" },
      { "id": "workspace.resetLayout", "title": "工作台: 重置布局" },
      { "id": "workspace.exportLayout", "title": "工作台: 导出布局" }
    ]
  }
}
```

### 1.4 数据流

```
串口数据
  │
  ▼
RingBuffer（壳——Phase 5）
  │
  ▼
ProtocolParser（插件注册——解析 SBQ 等协议）
  │
  ▼
DataDispatch → CardRegistry → 逐卡片更新字段
  │
  ▼
GaugeCard    ValueCard    LineChartCard
  temp: 37.2   rate: 115200  history: [...]
```

**工作台不生产数据——只消费数据。** 数据到达后，CardRegistry 按 `cardId` 分发到对应卡片组件。卡片组件只实现 `OnData(fields)` ——字段更新，React 重渲染。

### 1.5 内置卡片类型

| 卡片 | 渲染 | 配置项 | 适用场景 |
|------|------|------|------|
| **GaugeCard** | SVG 弧形仪表盘 | min / max / 单位 / 颜色阈值 | 温度、湿度、压力 |
| **ValueCard** | 大字号数值 + 单位标签 | 单位 / 小数位数 / 前缀 | 速率、计数、电压 |
| **LineChartCard** | Canvas 折线图 | 时间窗口 / Y 轴范围 / 颜色 | 历史趋势 |
| **SliderCard** | `<input type="range">` + 数值 | min / max / step | 调试参数 |
| **SwitchCard** | 拨动开关 | onLabel / offLabel / onCommand | GPIO 控制 |

**第三方插件可以注册新卡片类型：** `CardRegistry.registerCard("thermometer", ThermometerCard)` → 工作台的"添加卡片"面板自动出现。

### 1.6 为什么是纯插件

| 能力 | 来源 | 工作台怎么用 |
|------|:--:|------|
| 卡片注册 | Phase 5 CardRegistry | `registerCard()` ——已留好接口 |
| 数据管道 | Phase 5 DataPipeline | RingBuffer → ProtocolParser → DataDispatch |
| 布局持久化 | E2c FileService | `window.linkdesk.filesystem.writeTextFile(".linkdesk/workspace.json", layout)` |
| 拖拽库 | npm | `react-grid-layout` ——纯前端库，不碰壳 |
| 颜色 | E3b 主题引擎 | 全部走 CSS 变量 |
| 独立进程 | E3a | 工作台 = 一个 WebContentsView |

---

## 二、OLED 模拟器

### 2.1 概念

嵌入式开发常见场景：设备有一块 OLED 屏幕（128×64 像素），通过 I2C 连接 MCU。调试时需要看到屏幕当前显示内容——OLED 模拟器在电脑上逐像素渲染。

```
┌──────────────────────────────┐
│  OLED 模拟器                  │
│  ┌──────────────────────────┐│
│  │  ██    ██  ████  ██     ││  ← 128×64 Canvas 逐像素
│  │  █ █  █ █  █     █ █    ││
│  │  █  █ █  █  ███   █  █  ││
│  │  █   ██  █  █     █   █ ││
│  │  ██    ██  ████  ██   █ ││
│  └──────────────────────────┘│
│  亮度: ████████░░ 80%        │
│  [截图] [导出]                │
└──────────────────────────────┘
```

### 2.2 技术方案

```
MCU（硬件）
  │ I2C 总线
  ▼
I2C-USB 适配器
  │
  ▼
主进程（i2c-service.ts）
  │ IPC：i2c 数据流
  ▼
壳 WebView（oled-plugin）
  Canvas 2D → requestAnimationFrame → 逐像素渲染
```

- I2C 通信走主进程——跟串口服务完全相同的模式（E1 步 2 模板）
- Canvas 渲染在渲染进程——`requestAnimationFrame` 驱动，~60fps
- 像素数据格式：`Uint8Array`（128×64÷8 = 1024 字节/帧）

### 2.3 plugin.json

```json
{
  "name": "OLED 模拟器",
  "version": "1.0.0",
  "icon": "device-camera",
  "iconSource": "codicon",
  "description": "OLED 屏幕模拟——128×64 Canvas 逐像素渲染",
  "entry": "index.tsx",
  "contributes": {
    "configuration": {
      "oled.i2cAddress": {
        "type": "string",
        "default": "0x3C",
        "description": "I2C 设备地址"
      },
      "oled.brightness": {
        "type": "number",
        "default": 80,
        "minimum": 0,
        "maximum": 100,
        "description": "模拟亮度"
      }
    }
  }
}
```

### 2.4 为什么 Task 6 不是纯插件

I2C 需要 Electron 主进程服务——和 E1 步 2 串口服务完全相同的模式：

```
npm i i2c-bus
  → electron/services/i2c-service.ts   # 主进程——I2C 读写
  → preload-shell.ts                   # 暴露 window.linkdesk.i2c.*
  → oled-plugin                        # 渲染进程——Canvas 消费数据
```

**不是架构改动——是 E1 串口服务模板的第二次应用。** 参考 E1 步 2 的 `serial-service.ts`，照抄模式即可。

---

## 三、任务清单

### 卡片工作台（~400 行）

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 1 | `plugin.json` + `index.tsx` 骨架 + `react-grid-layout` 网格 | ~50 | 图标栏出现工作台图标 → 点击 → 空网格 |
| 2 | CardRegistry 消费——网格中渲染已注册卡片 | ~70 | 终端数据到达 → 卡片实时更新 |
| 3 | 内置卡片类型：GaugeCard / ValueCard / LineChartCard / SliderCard / SwitchCard | ~150 | 每张卡片独立渲染、独立配置 |
| 4 | 卡片拖拽/缩放/添加/删除——`react-grid-layout` 全套交互 | ~50 | 拖卡片 → 位置变化 → F5 刷新 → 布局恢复 |
| 5 | CardPicker —— "添加卡片"面板（从 CardRegistry 读取可选卡片类型） | ~30 | 点 "+" → 卡片类型列表 → 选一个 → 网格出现新卡片 |
| 6 | 布局持久化——`.linkdesk/workspace.json` 读写 | ~50 | 调布局 → F5 → 布局不变 |

### OLED 模拟器（~200 行）

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 7 | `plugin.json` + `index.tsx` 骨架——Canvas 128×64 逐像素渲染 | ~50 | 静态测试图案正确显示 |
| 8 | `electron/services/i2c-service.ts`——主进程 I2C 读写 | ~50 | `i2c-bus` 检测到设备 |
| 9 | I2C 数据流 IPC——主进程 → 插件 WebView | ~30 | I2C 数据到达 → Canvas 实时更新 |
| 10 | 控制面板——亮度滑块 / 截图 / 导出 | ~40 | 截图保存为 PNG |
| 11 | `preload-shell.ts` 暴露 `window.linkdesk.i2c.*` | ~30 | 插件侧能调 `window.linkdesk.i2c.read()` |

### 底座依赖

| 底座 | 来源 | 工作台用到什么 | OLED 用到什么 |
|------|:--:|------|------|
| 多 WebView | E3a | 工作台 = 独立 WebContentsView | OLED = 独立 WebContentsView |
| FileService | E2c | 布局持久化 | 截图导出 |
| 主题引擎 | E3b | 卡片颜色走 CSS 变量 | Canvas 颜色走 CSS 变量 |
| CardRegistry | Phase 5 | 卡片注册 + 分发 | — |
| DataPipeline | Phase 5 | RingBuffer → DataDispatch | — |
| 串口服务模板 | E1 步 2 | — | I2C 服务照抄串口模式 |

---

> **← 04 索引：** `../00-README.md`（官方插件索引）
> **← 依赖：** `../../../02-Electron架构/E3_多WebView与壳收尾_暂定/`（架构完工后才做）
> **同级别插件：** `../../../02-Electron架构/E4_文件树与编辑器_暂定/`（文件树 + Monaco，E4 编号）
