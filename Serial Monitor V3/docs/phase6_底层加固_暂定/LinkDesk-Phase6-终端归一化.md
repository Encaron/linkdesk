# Phase 6b — 终端归一化

> 2026-07-22。从 [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) §二 6b 展开。
>
> **目标：** 终端从"验证产物"变成"正确参考实现"。
> Phase 1-4 终端代码的任务是证明基础设施能跑——"先让它跑起来"的写法规避必须在此处拆掉。
> Phase 7 文件树、主题浏览器、语言选择器全以终端为模板来写——模板本身必须干净。

---

## 一、为什么终端需要拆干净

### 1.1 终端的历史角色

| Phase | 终端干什么 | 代码质量 |
|------|------|:--:|
| Phase 1-2 | 证明 React + CM6 + Monaco + Rust 串口全链路能跑 | "先跑起来" |
| Phase 3 | 验证标签页 + 分屏 + keep-alive | 稳定性优先 |
| Phase 4 | 验证插件系统 + 视图注册 + 生命周期 | 加 plugin.json |
| Phase 5 | 验证 ConfigurationService + 命令系统 | 迁移到新配置 |

**Phase 1-4 的代码是"证明这条路能走"——不是"这条路该怎么走"。**

### 1.2 具体问题清单

| # | 问题 | 位置 | 为什么是问题 |
|:--:|------|------|------|
| 1 | `SerialContext` 在 `src/core/` | `SerialContext.tsx` | 核心不知道串口是什么——SerialContext 是终端插件的实现细节 |
| 2 | `portOpen` / `portName` 术语 | 遍布 Rust+TS | 核心只知道"数据源"——端口是串口的实现 |
| 3 | 裸 `listen()` | `index.tsx` | B11 教训——Tauri 事件要用 generation counter 模式 |
| 4 | `let _receiveMode` 模块变量 | `index.tsx` | 多标签页时互相覆盖 |
| 5 | `let _activeSessionId` 模块变量 | `index.tsx` | 同上 |
| 6 | 命令路由到"最后 mount 的 TerminalView" | `index.tsx` | E3 bug——Ctrl+Shift+P 命令作用到错误的标签页 |

### 1.3 对标 VS Code

VS Code 源码 `src/vs/workbench/contrib/terminal/` ——终端代码全在 `contrib/` 下，不在 `platform/` 或 `workbench/common/` 里。`ITerminalService` 接口是终端专属的——不是 `IWorkbenchService` 的一部分。

LinkDesk 对应：终端代码全在 `plugins/terminal/`，不在 `src/core/`。SerialContext 是终端插件的内部模块。

---

## 二、逐项执行

### 2.1 SerialContext 迁出 core/

**当前：** `src/core/SerialContext.tsx`（~150 行）

**目标：** `plugins/terminal/SerialContext.tsx`

**影响范围：**
```
SerialContext.tsx 当前被谁 import：
  plugins/terminal/index.tsx       → 改为相对路径 import
  plugins/terminal/ControlPanel.tsx → 同上
  plugins/terminal/sidebar.tsx     → 同上
  App.tsx（状态栏 TX/RX 计数）      → App.tsx 不应 import SerialContext！
                                     → 状态栏 TX/RX 通过 CoreEvents 获取
```

**App.tsx 的解耦：**
```
改前：
  App.tsx import { useSerialContext } from "@src/core/SerialContext"
  → 状态栏直接读 serialContext.txCount / rxCount

改后：
  SerialContext 内部 emit CoreEvents.onDidChangeSourceState
  → App.tsx 订阅 CoreEvents → 状态栏显示
  → 核心不知道"串口"——只知道"有数据源状态变化了"
```

**迁移步骤：**
1. `cp src/core/SerialContext.tsx plugins/terminal/SerialContext.tsx`
2. `SerialContext` 加 `emit(CoreEvents.onDidChangeSourceState, { ... })`
3. `App.tsx` 状态栏改为订阅 CoreEvents
4. 更新终端插件内 3 个 import
5. 删 `src/core/SerialContext.tsx`
6. `npx tsc --noEmit` → 零错误

### 2.2 术语迁移——portOpen → sourceOpen

**改什么：**

| 旧名 | 新名 | 层级 |
|------|------|------|
| Tauri 命令 `open_port` | `open_source` | Rust |
| Tauri 命令 `close_port` | `close_source` | Rust |
| Rust 函数 `open_port_inner()` | `open_source_inner()` | Rust |
| Rust 类型 `PortState` | `SourceState` | Rust |
| TS `invoke("open_port", ...)` | `invoke("open_source", ...)` | TS |
| TS `invoke("close_port", ...)` | `invoke("close_source", ...)` | TS |
| TS `portName` 参数 | `sourceName` | TS |
| Tauri 事件 `port-state-changed` | `source-state-changed` | Rust+TS |
| TS 类型 `PortState` | `SourceState` | TS |

**不改什么：**
- Rust `serialport` crate 内部的 `port_name` 字段——那是第三方库的 API，改不了
- `list_ports` 命令名——`ports` 在这里是"可用数据源列表"，语义正确。但如果想彻底一致 → `list_sources`

**为什么现在做：**
Phase 7 多 WebView 之后，源打开/关闭会出现在 IPC 协议里——越晚迁移，IPC 消息名里带 "port" 就越别扭。现在改只是重命名——不改逻辑、不改变量类型。

### 2.3 useTauriEvent 归一化

**问题：** Phase 2.5 提取了 `useTauriEvent` hook（generation counter 模式），但终端插件里可能还有裸 `listen()`。

**B11 教训（memory `tauri-config-pitfall.md` + `v3-pitfalls.md`）：**
```
裸 listen() → 组件 unmount 但 cancel fn 没调用 → 旧 listener 残留
  → 再次 mount → 又一个 listener → 双份回调
    → 数据重复、状态混乱
```

**useTauriEvent 的 generation counter 模式：**
```typescript
// 正确的模式：
useTauriEvent("serial-data", (event) => {
  ringBuffer.write(event.payload);
  // generation counter 保证 unmount 后回调无效
});
```

**执行：**
```bash
grep -rn "listen(" plugins/terminal/
grep -rn "listen(" plugins/terminal/ --include="*.tsx" --include="*.ts"
```
- 逐条判断 → 改用 `useTauriEvent`
- 不在组件内的 listen（纯函数/模块级）→ 提取到最近的组件 useEffect

### 2.4 模块级可变状态消灭

**问题：**
```typescript
// ❌ 模块级可变状态——多个 TerminalView 实例共享
let _receiveMode: "text" | "hex" = "text";
let _activeSessionId: string = "";
```

**改法：**
```typescript
// ✅ 从 session 读——每个标签页独立
function TerminalView({ isActive, sourceId }: TerminalViewProps) {
  const session = useSession(sourceId);
  // receiveMode / activeSessionId = session 的属性
}
```

**执行：**
```bash
grep -rn "^let _" plugins/terminal/ --include="*.tsx" --include="*.ts"
```
- 每一个 `let` → 判断是常量（改为 `const`）还是可变状态（迁入 hook/session）
- 允许 `const`（编译时常量），不允许 `let`（运行时可变）

### 2.5 命令路由修复（E3）

**问题：** 当前命令（Ctrl+Shift+P → 复制/清空/切换模式）作用于"最后一个 mount 的 TerminalView"，因为 cmViewMap 的 key 不区分实例。

**改法：**
```typescript
// 改前：
const cmViewMap = new Map<string, EditorView>();  // key 是啥？可能是 tabId，可能不是

// 改后：
const cmViewMap = new Map<string, EditorView>();  // key = sourceId（保证唯一）
// 命令执行时：
const activeSession = getActiveSession();
const cmView = cmViewMap.get(activeSession.id);
```

**再加 WeakMap + dispose 清理：**
```typescript
// 组件 cleanup 时自动清理：
useEffect(() => {
  return () => {
    cmViewMap.delete(sourceId);  // unmount → 清空引用 → GC 可回收
  };
}, [sourceId]);
```

### 2.6 硬编码审计

**执行清单：**
```bash
# 1. 插件 ID 字面量
grep -rn '"terminal"' plugins/terminal/ --include="*.tsx" --include="*.ts"

# 2. 波特率硬编码
grep -rn '115200\|9600\|baudRate\|baud_rate' plugins/terminal/ --include="*.tsx" --include="*.ts"

# 3. COM 口假设
grep -rn 'COM[0-9]\|port_name' plugins/terminal/ --include="*.tsx" --include="*.ts"

# 4. 收到数据后的"串口"假设（如注释里的"串口数据"）
grep -rn '串口\|serial' plugins/terminal/ --include="*.tsx" --include="*.ts"
```

**判断标准：**
- 在 UI 显示文字里 → 走 `t()` 翻译
- 在注释里 → 改通用描述（"数据源"代替"串口"）  
- 在 plugin.json 声明里 → 合理（这是终端插件自身的描述）
- 在变量名里 → 改通用名（`dataSourceName` 代替 `portName`）

---

## 三、验证标准

```
所有步骤完成后：

1. tsc 零错误，vitest 全过
2. 终端正常收发——打开/关闭/切换 COM 口/HEX 模式/时间戳 全部不变
3. 两个终端标签页各设不同接收模式 → 互不干扰（6b-4）
4. 两个终端标签页 → 会话A 选中文字 → 切到会话B → Ctrl+Shift+P → 复制 → 是会话A 的内容（6b-5）
5. grep SerialContext src/core/ → 零结果
6. grep "portOpen\|portName\|PortState" src/ src-tauri/ → 零结果（排除 serialport crate 内部）
7. grep "listen(" plugins/terminal/ → 全部走 useTauriEvent
8. grep "^let _" plugins/terminal/ → 零结果
9. 硬编码审计 grep 结果 → 逐条处理完毕
```

---

## 四、相关文档

- [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) — 主设计文档
- [LinkDesk-Phase6-基础设施缺口.md](./LinkDesk-Phase6-基础设施缺口.md) — 6c FileService/WorkspaceService
- [Phase 5.5 修 Bug 执行计划](../phase5.5_交互对标/Bug审计与修复-2026-07-22/V3-Phase5.5-修Bug执行计划-2026-07-22.md) — E3 命令路由 bug 的原始记录
- [B11 教训](../phase5.5_交互对标/../../phase1_架构设计/../../) — Tauri listen() 必须用 generation counter（查 memory 系统 `tauri-config-pitfall.md`）
