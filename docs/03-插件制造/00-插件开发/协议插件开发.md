# 协议插件开发指南

> 创建协议插件——让串口数据按自定义格式解析，路由到对应卡片。

---

## 协议插件能做什么

串口发来原始文本行，协议插件负责把一行文本变成 `{ cardId, value }` 数组。换协议 = 换一个解析函数，卡片 UI 不改一行。

---

## 起步：最小协议插件

### 目录结构

```
plugins/my-protocol/
├── plugin.json
└── index.ts
```

### plugin.json

```json
{
  "type": "protocol",
  "name": "我的协议",
  "version": "1.0.0",
  "icon": "circuit-board",
  "iconSource": "codicon",
  "description": "自定义数据协议解析",
  "author": "开发者",
  "entry": "index.ts",
  "mode": "text"
}
```

### index.ts

```typescript
/**
 * 解析一行文本，返回 { cardId, value } 数组。
 * cardId 对应卡片注册的 ID，value 支持 number | boolean | string | Uint8Array。
 * 返回空数组 = 该行没有协议数据（原始 hex 模式处理）。
 */
export function parseLine(line: string): Array<{ cardId: string; value: number | boolean | string | Uint8Array }> {
  // 你的解析逻辑
  return []
}

/**
 * 可选：自动检测——收到开头几行时判断是否匹配此协议。
 * 返回 true → 自动锁定协议，终端提示"检测到协议：XXX"。
 * 不提供此函数 → 跳过自动检测，只能手动下拉框选择。
 */
export function detect(rawBytes: Uint8Array): boolean {
  // 你的检测逻辑
  return false
}
```

---

## 完整示例 1：方括号协议

`[cardId, value]` 格式——V2/V3 默认协议。

```typescript
// plugins/protocol-bracket/index.ts

export function parseLine(line: string) {
  const match = line.match(/^\[(\w+),\s*([^\]]+)\]$/)
  if (!match) return []

  const cardId = match[1]
  const raw = match[2].trim()

  // 尝试解析为数字
  const num = parseFloat(raw)
  const value = isNaN(num) ? raw : num

  return [{ cardId, value }]
}

export function detect(rawBytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(rawBytes.slice(0, 200))
  const lines = head.split('\n').filter(Boolean)
  if (lines.length < 2) return false
  // 前几行中超过半数匹配方括号格式 = 命中
  const matches = lines.filter(l => /^\[[\w-]+,\s*[^\]]+\]$/.test(l.trim()))
  return matches.length >= lines.length * 0.5
}
```

---

## 完整示例 2：SBQ 心率协议

单字符包头 + 数值。LabVIEW 课设常见的格式。

```
s128    → ADC 值 128
B72     → 心率 72 BPM
Q800    → 搏间 800ms
```

```typescript
// plugins/protocol-sbq/index.ts

export function parseLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return []

  const header = trimmed[0]
  const value = parseFloat(trimmed.slice(1))
  if (isNaN(value)) return []

  switch (header) {
    case 's': return [{ cardId: 'adc_value',     value }]
    case 'B': return [{ cardId: 'heart_rate',    value }]
    case 'Q': return [{ cardId: 'beat_interval', value }]
    default:  return []
  }
}

export function detect(rawBytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(rawBytes.slice(0, 200))
  const lines = head.split('\n').filter(Boolean)
  if (lines.length < 2) return false
  // SBQ 特征：每行以 s/B/Q 开头 + 数字
  const matches = lines.filter(l => /^[sBQ]\d+/.test(l.trim()))
  return matches.length >= lines.length * 0.5
}
```

---

## 完整示例 3：JSON 行协议

每行一个 JSON 对象 `{"id": "chip_temp", "val": 32.5}`。

```typescript
// plugins/protocol-jsonl/index.ts

export function parseLine(line: string) {
  try {
    const obj = JSON.parse(line)
    if (typeof obj.id === 'string' && obj.val !== undefined) {
      return [{ cardId: obj.id, value: obj.val }]
    }
  } catch {
    // 不是 JSON 行
  }
  return []
}

export function detect(rawBytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(rawBytes.slice(0, 500))
  const lines = head.split('\n').filter(Boolean)
  if (lines.length < 3) return false
  const matches = lines.filter(l => {
    try { const o = JSON.parse(l); return o.id && o.val !== undefined }
    catch { return false }
  })
  return matches.length >= lines.length * 0.5
}
```

---

## 接口规范

### parseLine

```typescript
function parseLine(line: string): Array<{
  cardId: string                            // 对应卡片注册的 ID
  value: number | boolean | string | Uint8Array  // 数据值
}>
```

| 规则 | 说明 |
|---|---|
| 输入 | 一行原始文本（已去除行尾的 `\n` `\r\n`） |
| 返回值 | 一条或多条 `{ cardId, value }`，空数组 = 此行无协议数据 |
| 一行为多条数据 | 可以——一条 `s128\n` 只匹配一个 cardId；一条 JSON `{"items": [...]}` 可以返回多条 |
| 数据类型 | number→通用数值卡，boolean→开关卡，string→文本卡，Uint8Array→二进制帧卡 |
| 无副作用 | 纯函数，不修改全局状态，不调用 DOM |

### detect（可选）

```typescript
function detect(rawBytes: Uint8Array): boolean
```

| 规则 | 说明 |
|---|---|
| 调用时机 | 用户打开串口但未手动选择协议时，按优先级遍历已安装插件 |
| 输入 | 开头接收到的原始字节（一般 ~200-500 字节） |
| 返回值 | `true` = 锁定此协议，终端提示；`false` = 继续下一个插件的 detect |
| 全未命中 | 回退原始 hex 模式 |
| 用户可覆盖 | 手动下拉框选择后跳过自动检测 |

---

## 工作流

```
MCU 发原始数据
  → Rust 读串口，按行分割
  → 前端 ProtocolParser（当前行）
    → 遍历已注册的协议插件
    → 调用 parseLine(line)
    → 收集 { cardId, value }[]
    → 写入 RingBuffer
    → 卡片消费：每个 cardId 的卡片用 OnData(value) 更新
```

---

## 开发检查清单

```
☐ plugin.json type 为 "protocol"
☐ entry 指向 index.ts
☐ index.ts 导出 parseLine 函数
☐ parseLine 是纯函数，无副作用
☐ 空行/不匹配行返回空数组 []
☐ 一行为多条数据时返回多个 { cardId, value }
☐ detect 函数可选用——提供则支持自动协议检测
```

---

## 相关

- `docs/插件开发/plugin.json规范.md` — plugin.json 完整字段参考
- `docs/插件开发/视图插件开发.md` — 视图插件开发指南
- memory `plugin-system.md` §协议插件 — 协议插件设计
