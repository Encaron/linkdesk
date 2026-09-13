# 卡片工作台——完整蓝图

> **普通插件** | 从 `插件_工作台与OLED_暂定` 拆分——独立建设。旧「市场插件」标记作废（2026-09-13 重组）。
> **性质：** 纯插件，零核心改动。消费 E1-E3 全部架构能力。
> **UI 设计系统：** `ui-ux-pro-max` → Dark Mode (OLED) / Fira Code / Real-Time Operations

---

## 定位

| | |
|---|---|
| 类型 | **消费者插件**——不写 `src/core/`，不写 `electron/` |
| 前提 | E3 架构完工（CardRegistry + DataPipeline + FileService + 主题引擎 + 多 WebView） |
| 对标 | 荣耀平板桌面 + Figma 无限画布 + VS Code 三栏交互 |
| 核心概念 | 无限画布 + 网格吸附 + 卡片 = 数据显示 + 设备控制 |

---

## 大纲

| 文档 | 内容 |
|------|------|
| 🔥 [00.5-UI布局规格](00.5-UI布局规格.md) | **状态矩阵 + 像素 Token 收敛 + 动画补充 + CSS 变量**——开发前必读 |
| [01-UI设计](01-UI设计.md) | 设计系统——颜色/字体/间距/动画 + 布局总览 |
| [02-卡片类型](02-卡片类型.md) | 10 种卡片完整定义——显示类 7 + 控制类 3 |
| [03-交互模型](03-交互模型.md) | hover/click/right-click/dialog/drag/resize 完整交互 |
| [04-数据流](04-数据流.md) | 协议→cardId→卡片 + 控制回发 MCU |
| [05-布局系统](05-布局系统.md) | 无限画布 + 网格吸附 + 缩放 + 持久化 |
| [06-子项系统](06-子项系统.md) | 卡片内嵌子项——进度条/波形图/数值大字/仪表盘/指示灯 |
| [07-执行计划](07-执行计划.md) | 任务拆解 + 依赖 + 预估行数 |

---

## 核心架构——大厅模型下的卡片工作台

```
MCU → 串口 → 原始文本行
  │
  ▼
ProtocolParser: [temp, 37.2] → { id: "temp", fields: ["37.2"] }
  │
  ▼
RingBuffer → CardRegistry → 按 cardId 找卡片实例
  │
  ▼
温度卡片 (cardId: temp, 2×2, 三个子项)
  │
  ├── 子项: 进度条 → 37.2/50=74%
  ├── 子项: 波形图 → push(37.2) → 面积图
  └── 子项: 数值大字 → "37.2°C"

用户拖滑块 → LinkDesk 发 [speed, 75] → MCU 执行 → MCU 回发 [speed, 75] → 确认
```

**硬件是真相源。** 用户操作 = 请求，MCU 回发 = 确认。卡片状态永远以 MCU 最后发来的值为准。

---

## 为什么是纯插件

| 能力 | 来源 | 工作台怎么用 |
|------|:--:|------|
| 卡片注册 | Phase 5 CardRegistry | `registerCard()` |
| 数据管道 | Phase 5 RingBuffer + DataDispatch | 按 cardId 推数据 |
| 协议解析 | ProtocolRegistry（核心桌子） + 协议插件（方括号/SBQ/JSON 行—全插件） | 核心无默认协议——不预设用户场景 |
| 布局持久化 | E2c FileService | `.linkdesk/workspace/*.json` |
| 主题 | E3b ThemeEngine | 卡片颜色走 CSS 变量 |
| 独立进程 | E3a WebContentsView | 工作台 = 独立 View |
| 对话框 | DialogService | 删除确认弹窗 |
| 条件显隐 | #59d0 dependsOn | 弹窗颜色选择器 |
| 下拉组件 | #59c SelectBox | 弹窗下拉框 |

---

## 与 OLED 模拟器的关系

**两者独立。** 卡片工作台 = `plugins/workspace/`，OLED 模拟器 = `plugins/oled/`。互不依赖。

> **← OLED 模拟器：** `../插件_工作台与OLED_暂定/00-README.md`（仅 OLED 部分）
> **← 架构依赖：** `../../../02-Electron架构/E3_多WebView与壳收尾_暂定/`
