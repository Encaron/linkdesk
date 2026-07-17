---
name: new-ai-prompt
description: 🔥🔥 新 AI 接入 V3 项目的入口 prompt
metadata:
  type: project
---

# V3 新 AI 前置信息

## 项目概况

Serial Monitor V3 — 基于 **Tauri + React** 的卡片式串口调试工具。

V2（WPF，70+ commits）正常使用中。V3 是重新架构——不是修修补补，是保持 V2 所有功能的前提下换底盘。

**当前阶段：设计定型。** 代码一行没写。

## 用户是谁

Encaron，嵌入式开发者（STM32/ESP32）。不会 TypeScript/React/Rust。所有代码由 AI 写，用户双击 exe 验证。

- 只说实话，不讨好
- UI 细节敏感（颜色、对齐、字体）
- 先讨论后动手，大改动给预览
- 做完说"做了什么"+"双击试试"

## V3 和 V2 的关键差异

| | V2 | V3 |
|------|------|------|
| 框架 | WPF .NET 8 | Tauri + React |
| 协议 | `[type, subType, name, value]` | `[卡片ID, 字段...]` |
| 架构 | 面板筒仓（每个面板封闭） | 卡片壳/组件分离 |
| 串口线程 | 和 UI 同线程（卡顿根因） | Web Worker 独立线程 |
| 主题 | DynamicResource + 41 条约束 | CSS 变量 |
| 配置 | prefs.json 嵌套深 | workspace.json 平铺 |
| 接收区 | AvalonEdit | CodeMirror 6 |
| 发送栏 | — | Monaco Editor 单行模式 |

## 设计文档

**`docs/V3设计方案.md`** —— 完整设计方案，~900 行。读它。

## V3 核心原则

1. **卡片 ID 即路由。** O(1) 字典查找，没有 type/subType 分支
2. **壳与组件分离。** 卡片壳管外观，组件管功能。加新组件 = 实现两个方法
3. **数据管道双线程。** 串口在 Web Worker，UI 在 60fps 消费 RingBuffer
4. **所有配置纯文本。** 人和 AI 改同一个 JSON 文件
5. **workspace.json 禁止嵌套。** 卡片列表必须是一层平铺数组
