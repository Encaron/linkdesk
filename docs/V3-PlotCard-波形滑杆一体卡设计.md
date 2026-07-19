# V3 Plot 卡设计——波形 + 滑杆一体卡

> 用户需求：同时看波形并调滑杆。设计目标：Phase 4 首批卡片之一。

## 核心决策：一体卡 vs 两个独立卡

**选一体卡。** 理由：

- 波形通道和滑杆共享同一份配置（数据格式、通道名、命令模板）
- 如果分开，用户需要手动保持两份配置同步
- 滑杆调的就是波形里看到的参数——它们是同一个东西的两个面
- V3 的卡片哲学是"可组合"，不是"必须拆分"——一体卡是可组合的最小有意义单元

## 卡片结构

```
┌─────────────────────────────────────────────────┐
│ 📈 电机 PID 调试                                 │  ← CardShell 标题栏
│ ┌─────────────────────────────────────────────┐ │
│ │     ╱╲                                     │ │
│ │    ╱  ╲    ╱╲                             │ │  ← Canvas 实时波形
│ │   ╱    ╲──╱  ╲──────╲                     │ │
│ │  ╱              ╲─────╲────               │ │
│ │ ── Speed (RPM) ── Current (A) ── Pos (°)  │ │  ← 图例（可点击切换显隐）
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ Kp  ────●────────── 1.25                   │ │
│ │ Ki  ───────●─────── 0.08                   │ │  ← 滑杆面板（可折叠）
│ │ Kd  ──●──────────── 0.01                   │ │
│ │ Target ─────────●─── 1000                  │ │
│ └─────────────────────────────────────────────┘ │
│ [▶ 暂停] [📊 通道: 4] [⚙ 配置] [🗑 清空]       │  ← 工具栏
└─────────────────────────────────────────────────┘
```

## 配置模型

保存在 workspace.json 的卡片数组里：

```jsonc
{
  "cardId": "plot-1",
  "cardType": "plot",
  "title": "电机 PID 调试",
  "x": 0, "y": 0, "w": 6, "h": 4,
  "config": {
    // 波形窗口
    "windowSecs": 10,           // 默认显示最近 10 秒
    "maxPoints": 500,           // 最多保留 500 个数据点

    // 通道定义：从串口数据中解析
    "channels": [
      { "name": "Speed",  "unit": "RPM", "color": "#4FC3F7", "parser": "csv:0" },
      { "name": "Current","unit": "A",   "color": "#FFB74D", "parser": "csv:1" },
      { "name": "Pos",    "unit": "°",   "color": "#81C784", "parser": "csv:2" }
    ],

    // 滑杆定义：发送回串口
    "sliders": [
      { "name": "Kp",     "min": 0, "max": 5,   "step": 0.01, "value": 1.25,
        "sendTemplate": "set kp {value}\n" },
      { "name": "Ki",     "min": 0, "max": 1,   "step": 0.01, "value": 0.08,
        "sendTemplate": "set ki {value}\n" },
      { "name": "Target", "min": 0, "max": 2000,"step": 1,    "value": 1000,
        "sendTemplate": "set target {value}\n" }
    ],

    // 数据解析格式
    "dataFormat": "csv",         // csv | kv | json | binary
    "csvSeparator": ",",         // CSV 分隔符
    "binarySchema": null,        // binary 格式的 struct 定义

    // 可选：示波器触发
    "trigger": { "channel": "Speed", "threshold": 100, "edge": "rising" }
  }
}
```

## 数据管道

```
STM32 发送 "1250,3.2,90\n"
  → Rust serialport 读线程
  → emit("serial-data", "1250,3.2,90")
  → React useTauriEvent("serial-data")
  → RingBuffer.write({ text: "1250,3.2,90", type: "received" })
  → rAF drain → plotCardConsumer
      → CSV 解析 → [1250, 3.2, 90]
      → channels[0] 追加 1250 → Speed 波形
      → channels[1] 追加 3.2  → Current 波形
      → channels[2] 追加 90   → Pos 波形
      → Canvas 重绘最新窗口
```

滑杆发送（反向）：

```
用户拖 Kp 滑杆到 1.50
  → 乐观更新 UI（立即显示 1.50）
  → 防抖 50ms（拖拽中只发最后一次）
  → invoke("send_text", "set kp 1.50\n")
  → 等待 MCU 回显（可选）
```

## 滑杆实时发送策略

**问题：** 滑杆拖拽每像素触发 onChange → 每像素发一次串口命令 → MCU 命令队列爆炸。

**解决：**

```
onChange → setLocalValue(立即更新 UI 显示)
        → debounce 50ms
        → 到期 → 取当前最新值
              → invoke("send_text", template.replace("{value}", value))
              → 可选：显示发送确认 ✓（100ms 后消失）
```

**为什么不拖完再发（onMouseUp）？** 因为嵌入式调试需要实时反馈——用户边拖边看波形变化。50ms 防抖既保证实时性，又不压垮 MCU。

## Canvas 渲染

**为什么 Canvas 而不是 SVG/Recharts？**

- 实时波形每秒可能追加数十个数据点，SVG DOM 操作太慢
- Canvas 直接操作像素缓冲区，适合高频重绘
- 不引入第三方图表库：V3 的 2D 折线图 + 网格 + 图例 ≈ 200 行 Canvas 代码

**渲染策略：**

```
rAF drain → 新数据点入队（最多 N 个）
          → Canvas clearRect + 重绘
          → 网格线 → 通道折线（遍历数据点 drawLine）→ 图例
```

**可选优化：** 当没有新数据时跳过重绘（用 flag 标记脏）。

## 滑杆面板

```
┌──────────────────────────────────────────────────┐
│ Kp     ────●───────────  1.25                    │
│ Ki     ───────●────────  0.08    [折叠 ▲]        │
│ Kd     ──●─────────────  0.01                    │
│ Target ─────────●──────  1000                    │
└──────────────────────────────────────────────────┘
```

- 拖拽滑杆时显示精确数值
- 双击数值区域 → 直接输入精确值（嵌入式常用：我知道我要设多少）
- 滑杆颜色和对应通道颜色一致（视觉关联）
- 滑杆过多时面板内部可滚动

## 可选：示波器触发模式

对标真实示波器：

```
触发模式：None | Auto | Normal
触发通道：Speed ▼
触发阈值：[  100  ]
触发边沿：Rising ▼ | Falling | Both

行为：
- None：连续滚动显示
- Auto：有触发时对齐触发点，无触发时自动滚动
- Normal：只在触发条件满足时更新画面（波形"停住"）
```

## 与其他卡片的关系

| 卡片类型 | 关系 |
|------|------|
| **GaugeCard** | 和 PlotCard 同类——从串口数据解析值并可视化。可以共享 `channels` 配置模式 |
| **SliderCard** | 是 PlotCard 的子集——只有滑杆，没有波形。配置格式和 PlotCard 的 `sliders` 字段完全一致 |
| **KeyPad** | 独立卡片类型，不共享配置 |
| **TerminalCard** | 工作台内的终端卡片——接收原始文本，不解析 |

## 实现优先级

### Phase 4 第一批
1. CardShell（卡片容器通用组件：标题栏、拖拽手柄、折叠、关闭、统一视觉）
2. PlotCard 基本版（Canvas 折线图 + 从 CSV 解析 + 滚动窗口）

### Phase 4 第二批
3. PlotCard 滑杆面板（input[type=range] + 防抖发送 + 双击输入）
4. GaugeCard（表盘——和 PlotCard 共享 channels 配置）

### Phase 5+
5. Trigger 模式
6. SliderCard 独立版（纯滑杆，无波形）
7. 导出 PNG/SVG 截图
8. 双 Y 轴（比如 Speed 用左轴，Current 用右轴，量纲不同）

---

*设计日期：2026-07-19。Phase 4 正式设计时可以调整。*
