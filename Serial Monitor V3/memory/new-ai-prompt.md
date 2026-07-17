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

## V2 参考——随时去读

V3 不是一个全新的东西——它是对 V2 的重架构。**大部分功能的"正确答案"在 V2 里已经有实现了。** 当你不确定某样东西怎么做时，去读 V2：

| 你要做什么 | 去读 V2 的哪里 |
|------|------|
| 串口收发逻辑 | `E:\serial\Serial Monitor V2\Core\Services\SerialPortSession.cs` |
| 协议解析规则 | `E:\serial\Serial Monitor V2\Core\Services\ProtocolParser.cs` |
| DataConverter（Hex/Text 转换） | `E:\serial\Serial Monitor V2\Core\Services\DataConverter.cs` |
| 接收区行为（LogReceived/蓝色回显/右键菜单） | `E:\serial\Serial Monitor V2\Views\Log.cs` |
| 传感面板——9 类卡片渲染、增量更新、编辑模式 | `E:\serial\Serial Monitor V2\Panels\Sensors.cs` |
| 滑杆——拖拽节流、双向协议 | `E:\serial\Serial Monitor V2\Panels\Sliders.cs` |
| 按键——6 种布局、按下/松开发送 | `E:\serial\Serial Monitor V2\Panels\Keys.cs` |
| 波形图——OxyPlot 封装 | `E:\serial\Serial Monitor V2\Panels\Plot.cs` |
| OLED——13 条子协议、选择/控点/旋转、F5 增量同步 | `E:\serial\Serial Monitor V2\Panels\Display.cs` |
| 主题——21 色、亮暗切换 | `E:\serial\Serial Monitor V2\Views\Theme.cs` + `App.xaml` |
| 双语——~515 EnMap、T() vs LocText() | `E:\serial\Serial Monitor V2\Core\LocaleData.cs` + `Views\Locale.cs` |
| V2 的设计决策和踩坑 | `C:\Users\fengy\.claude\projects\e--serial\memory\` |
| V2 的工程文档 | `E:\serial\Serial Monitor V2\Docs\Serial V2 修缮\` |

**读 V2 的目的不是复制代码——是理解逻辑。** V3 用不同的语言和框架实现同一套逻辑。算法照搬，写法变了。

**⚠️ 不要一把梭读整个文件。** V2 的 Sensors.cs 有 3570 行，Display.cs 有 3700 行。正确的读法：

- 先 `grep` 定位你要找的函数/字段/逻辑，只读那段代码（50-200 行）
- 不确定读哪里 → 先问用户"你要我参考 V2 的哪个行为？"
- 读日志/蓝色回显 → 只读 `Log.cs` 的 `LogReceived` 函数（~30 行）
- 读协议解析 → 只读 `ProtocolParser.cs` 的 `ParseMessage` 函数（~60 行）
- 读 V2 记忆目录里的摘要文件（如 `v2.4-handoff.md`），而不是直接翻代码
