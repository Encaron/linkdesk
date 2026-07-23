# 插件 — 工作台与 OLED

> 2026-07-24。**第二批消费者插件。** 不占用 P 编号——纯插件实现。

---

## 定位

| | |
|---|---|
| 类型 | **消费者插件**——使用 P6-P8 建的架构能力 |
| 前提 | P8 架构完工 |
| 涉及架构改动 | **零。** 只写 `plugin.json` + React 组件 |

## 包含

| 插件 | 内容 | 说明 |
|---|---|---|
| **卡片工作台** | 卡片网格布局——`react-grid-layout`，卡片组件注册到 CardRegistry | 原 P8 核心内容 |
| **OLED 模拟器** | Canvas 逐像素渲染——模拟 OLED 屏幕显示 | 原 P8 附带内容 |

## 为什么它们是纯插件

工作台 = 一个 React 组件 + `react-grid-layout`。卡片拖拽、缩放、布局保存——全部在前端完成。布局 JSON 通过 `window.linkdesk.filesystem.writeTextFile()` 持久化。

OLED 模拟器 = Canvas + 串口数据源。逐像素刷新走 `requestAnimationFrame`。

**从架构视角看：两个普通的 React 组件。** P8 之后壳已完工——不需要为它们改任何架构代码。

## 历史参考

- 原 P8 设计：`../phase8_工作台与OLED/`
- 卡片注册表（已有）：`src/core/CardRegistry.ts`

---

> **← 依赖：** `../P8_多WebView与壳收尾_暂定/`（架构完工后才做）
> **同级别插件：** `../插件_文件树与编辑器_暂定/`
