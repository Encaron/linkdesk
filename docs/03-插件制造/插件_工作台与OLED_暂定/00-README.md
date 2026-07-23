# 插件 — 工作台与 OLED

> 2026-07-24。**第二批消费者插件。** 不占用 P 编号——纯插件实现。

---

## 定位

| | |
|---|---|
| 类型 | **消费者插件**——使用 E1-E3 建的架构能力 |
| 前提 | E3 架构完工 |
| 涉及架构改动 | **零。** 只写 `plugin.json` + React 组件 |

## 包含

| 插件 | 内容 | 说明 |
|---|---|---|
| **卡片工作台** | 卡片网格布局——`react-grid-layout`，卡片组件注册到 CardRegistry | 原 Phase 8 核心内容 |
| **OLED 模拟器** | Canvas 逐像素渲染——模拟 OLED 屏幕显示 | 原 Phase 8 附带内容 |

## 为什么它们是纯插件

工作台 = 一个 React 组件 + `react-grid-layout`。卡片拖拽、缩放、布局保存——全部在前端完成。布局 JSON 通过 `window.linkdesk.filesystem.writeTextFile()` 持久化。

OLED 模拟器 = Canvas + 串口数据源。逐像素刷新走 `requestAnimationFrame`。

**从架构视角看：两个普通的 React 组件。** E3 之后壳已完工——不需要为它们改任何架构代码。

## 任务清单

### 卡片工作台（~400 行）

| # | 任务 | 行数 |
|:--:|------|:--:|
| 1 | CardRegistry 渲染引擎——react-grid-layout 网格 | ~120 |
| 2 | 内置卡片类型：仪表盘 / 滑块 / 数值 / 折线图 | ~150 |
| 3 | 数据管道消费端——RingBuffer → ProtocolParser → DataDispatch → 卡片 | ~80 |
| 4 | 卡片拖拽/缩放/添加/删除 | ~50 |

### OLED 模拟器（~200 行）

| # | 任务 | 行数 |
|:--:|------|:--:|
| 5 | OLED 视图插件——视图注册 + 标签页 + keep-alive | ~50 |
| 6 | I2C 通信层——Electron main process 服务 + preload API | ~80 |
| 7 | OLED 像素渲染（Canvas）| ~70 |

> ⚠️ **Task 6 不是纯插件。** I2C 需要 Electron 主进程服务——和 E1 步 2 串口服务完全相同的模式：
> `npm i i2c-bus` → `electron/services/i2c-service.ts` → `preload-shell.ts` 暴露 `window.linkdesk.i2c.*`。
> 参考 E1 串口服务的实现模板——不需要从零设计。

### 底座依赖

| 底座 | 来源 | 工作台用到什么 |
|------|:--:|------|
| 多 WebView | E3a | 每个卡片类型 = 独立插件 = 独立 WebContentsView |
| FileService | E2c | 卡片布局持久化（`.linkdesk/workspace.json`） |
| WorkspaceService | E2c | workspace 导入导出 |
| 主题引擎 | E3b | 卡片颜色走 CSS 变量 |
| CardRegistry | Phase 5 | 卡片注册骨架——Phase 5 已留好接口 |
| DataPipeline | Phase 5 | RingBuffer → ProtocolParser → DataDispatch → 卡片 |

---

> **← 依赖：** `../../02-Electron架构/E3_多WebView与壳收尾_暂定/`（架构完工后才做）
> **同级别插件：** `../../02-Electron架构/插件_文件树与编辑器_暂定/`
