# 01 — 串口 isOpen bit 外推——执行草案

> 对应清单任务：**E5.8#47**。2026-08-17 落盘。
> **一句话：壳不认识串口——把 `isOpen` bit 从壳镜像链外推回插件 SerialContext 自管，壳只留机制不留业务状态。**
> 性质：**纯删除（壳侧）+ 一行新增（插件侧）**——不是建新机制，是不一致的修正。

---

## 一、任务定位

`serial-system` 通道串口插件自己也用（[index.tsx:522](e:\linkdesk\linkdesk\plugins\user\serial-monitor\src\index.tsx) 追加系统消息）——壳只删**自己的**监听，插件那个保留。

## 二、为什么是「不一致」不是「机制缺口」

### 2.1 通用 API 已存在（实锤）

`contextKey.set` 是插件可用的通用 API，且被插件深度使用：

| 处 | 内容 |
|:--|:--|
| [linkdesk-api.ts:266-269](e:\linkdesk\linkdesk\src\core\api\linkdesk-api.ts) | `contextKey: { set(key, value); _getValue?(key) }` 类型定义 |
| [preload-pool.ts:660-666](e:\linkdesk\linkdesk\electron\preload-pool.ts) | `contextKey.set` 实现——`ipcRenderer.invoke(IPC.contextKey.set)` + 本地 `_contextKeyStore` 缓存 + `IPC.contextKey.changed` 回播 |
| 使用方 | file-tree（~15 键）、marketplace（6 键）、serial-monitor（`serialSessionFocus`） |

### 2.2 串口真值本来就在插件侧

- 插件 `SerialContext._sharedState.isOpen` 是**真值源**——所有打开/关闭/换端口/F5 恢复都经 `_setState` 单一咽喉。
- 插件已自管两把钥匙：`pluginState` 的 `<port>:isOpen`（壳侧栏/状态栏读）+ `serialSessionFocus` contextKey。
- 壳在 App.tsx 维护的 `isOpen` 是一份**镜像**——靠 `serial-system` 消息正则（`/已打开/` `/Port closed|关闭/`）+ AppInitializer `getStatus()` 查询两路喂食。这是 E5.7 Bug C 症状 4 当时"补刀"出来的第二轨道。

### 2.3 壳不打开串口、壳不认识串口

`isOpen` 是**串口的业务状态**，不是壳的能力。壳维护镜像 = 硬约束 #9「核心无知」的违例一分——壳开始"知道串口开着"。

> **对标 dsh：** dsh 的 agent loop 是插件。LinkDesk 的串口 bit 也应是插件——壳不留业务状态，只留机制（serial.onSystem 推送、contextKey 求值）。

---

## 三、现状全链（改动前）

```
[主进程 serial 机制——保留，是机制]
serial.onSystem 推送串口系统消息（已打开/Port closed/...）
        │
        ├──→ 插件 SerialContext（真值自管）
        │       _setState isOpen 变化
        │         → pluginState: serial-monitor.<port>:isOpen   （壳侧栏/状态栏读，保留）
        │         → contextKey:   serialSessionFocus             （插件另一把钥匙，保留）
        │
        └──→ 壳镜像链（#47 全部删除）
               App.tsx:714  useIpcEvent("serial-system") ──正则──> setIsOpen(63)
               AppInitializer:162  getSerialStatus() ────────────> serialState.isOpen
                    └─> App.tsx:301  ContextKeyService.setValue("sourceOpen", isOpen)
                          └─> serial-monitor plugin.json when 子句：
                              activeEditor=='serial-monitor' && sourceOpen（togglePause 命令）
```

**消费端就一个：** serial-monitor plugin.json 的 `togglePause` 命令 when 子句用 `sourceOpen`。命令属于串口插件自己——真值却由壳喂，跨了所有权边界。

---

## 四、目标全链（改动后）

```
[主进程 serial 机制——不变]
serial.onSystem 推送系统消息
        │
        ├──→ 插件 SerialContext（真值自管，新增一行）
        │       _setState isOpen 变化
        │         → pluginState: <port>:isOpen            （保留）
        │         → contextKey:   serialSessionFocus       （保留）
        │         → contextKey:   sourceOpen               【新增——插件自管】
        │
        └──→ 壳：零串口业务状态。只剩机制（serial.onSystem 通道本身）。
```

壳删 App.tsx 镜像、AppInitializer 串口查询、initCoreKeys 串口键、CoreEvents 死发射器。`sourceOpen` 由插件在 `_setState` isOpen 变化处写入——同一条咽喉覆盖所有路径。

---

## 五、执行步骤

### Step 1 插件侧（唯一新增）—— SerialContext.tsx `_setState` isOpen-change 块

[SerialContext.tsx:83-95](e:\linkdesk\linkdesk\plugins\user\serial-monitor\src\services\SerialContext.tsx) 现有 isOpen 变化块，块首加一行：

```ts
if (next.isOpen !== _sharedState.isOpen) {
  // E5.8#47：sourceOpen contextKey 归插件自管——壳不再镜像串口 bit（硬约束 #9 核心无知）
  window.linkdesk?.contextKey?.set("sourceOpen", next.isOpen).catch(() => {});
  window.linkdesk?.pluginState?.set("serial-monitor", _scopeKey("isOpen", next.sourceName), next.isOpen)
    .catch(() => {});
  ...
}
```

**覆盖所有路径**（全部经 `_setState` 咽喉）：

| 路径 | 触发 |
|:--|:--|
| toggleOpen / openPort | open → getStatus → mergeStatus → `_setState(isOpen: true)` |
| closePort / toggleOpen 关闭 | `_setState(isOpen: false)` |
| setSourceName / setBaudRate（转端口） | close+open → 两次 isOpen 翻转 |
| **F5 恢复** | `_initOnce` → getStatus → mergeStatus → `_setState`（恢复 open 也写 sourceOpen） |

### Step 2 壳侧删除—— App.tsx（6 处）

| 位置 | 内容 |
|:--|:--|
| 行 63 | `const [isOpen, setIsOpen] = useState(false);` |
| 行 253 | initAll deps 的 `getSerialStatus: () => linkdesk().serial.getStatus(),` |
| 行 266-268 | `if (result.serialState?.isOpen) { setIsOpen(true); }` 块 |
| 行 298-303 | `// sourceOpen——数据源开关时更新` 注释块 + `useEffect(() => { ContextKeyService.setValue("sourceOpen", isOpen); }, [isOpen]);` |
| 行 702-720 | serial 注释块 + `useIpcEvent<string>("serial-system", (payload) => {...})` |
| 行 7 | `import { useIpcEvent } from "./hooks/useIpcEvent";`（714 是 App.tsx 唯一使用点，删完变死 import） |

### Step 3 壳侧删除—— AppInitializer.ts（6 处）

| 位置 | 内容 |
|:--|:--|
| 行 45 | InitDeps 的 `getSerialStatus: () => Promise<{ isOpen; portName; baudRate }>` |
| 行 54-58 | `SerialState` interface |
| 行 68 | InitResult 的 `serialState: SerialState \| null` |
| 行 87 | `const serialState` 局部变量 |
| 行 162-173 | Step 6 串口查询（`await initDeps.getSerialStatus()`） |
| 行 191 | return 对象里的 `serialState,` |

### Step 4 壳侧删除—— ContextKeyService.ts initCoreKeys

[ContextKeyService.ts:412-418](e:\linkdesk\linkdesk\src\core\registry\ContextKeyService.ts)：

| 行 | 内容 |
|:--|:--|
| 416 | `sourceOpen: false` — 删 |
| 417 | `sourceName: ""` — 删 |

> ⚠️ **窗口差异验证：** 删初始值后 `sourceOpen` 在插件首次 set 前是 `undefined`。when 子句 `&& sourceOpen` 对 undefined 求值 falsy——与改动前 `false` **行为完全一致**，无启动窗口差异。零风险。

### Step 5 壳侧删除—— CoreEvents.ts 死发射器

[CoreEvents.ts:68](e:\linkdesk\linkdesk\src\core\react\CoreEvents.ts)：`onDidChangeSourceState: new Emitter<{ isOpen: boolean; sourceName: string | null }>()`——**全仓零消费**（grep 已实锤，只剩定义本身），连同其所有事件常量一起删。

### Step 6 收尾

1. **grep 清零**（shell src/ 范围）：
   - `sourceOpen` → 零命中（serial plugin.json when 子句是插件侧声明，保留）
   - `serialState|getSerialStatus|onDidChangeSourceState` → 零命中
   - `serial-system` → 只剩 [serial-monitor/index.tsx:522](e:\linkdesk\linkdesk\plugins\user\serial-monitor\src\index.tsx)（插件自己的系统消息追加，**保留**）+ 主进程机制
2. **真机验证**（见 §七）
3. `npm run check` 全绿 → commit

> **commit 策略：一个 commit。** 壳删 + 插件加必须原子落地——分两次提交则中间态 `sourceOpen` 失效（壳镜像删了、插件还没写）。

---

## 六、机制为什么成立（contextKey.set 全链）

```
插件 set sourceOpen
  → ipcRenderer.invoke(IPC.contextKey.set)     （preload-pool.ts:660）
  → 主进程 ContextKeyService.setValue          （壳侧真值更新）
  → IPC.contextKey.changed 广播回池              （preload-pool.ts:257 缓存 _contextKeyStore）
  → 两个消费面都吃到新值：
      壳命令面板/menu when 子句    → 读 ContextKeyService
      池侧菜单 when 子句            → 读 _contextKeyStore（_getValue 缓存）
```

serial-monitor plugin.json 的 `activeEditor=='serial-monitor' && sourceOpen` when 子句在两个消费面都满足。**改动前后行为完全一致**——只是写 sourceOpen 的动作从壳搬到插件，真值源归一。

---

## 七、验收清单

- [ ] `npm run check` 全绿（tsc×2 / eslint `--max-warnings 0` / vitest / grid / pool-css）
- [ ] shell grep `serialState|getSerialStatus|onDidChangeSourceState` 零命中
- [ ] App.tsx 无 `useIpcEvent` 残留 import（无其他使用点）
- [ ] **真机——命令面板翻转**：串口打开 → `togglePause` 命令可用；关闭 → 不可用（when 子句随 sourceOpen 翻转）
- [ ] **真机——F5 恢复**：串口开着刷新 → 状态恢复 → `togglePause` 仍可用（F5 路径经 `_initOnce→getStatus→mergeStatus→_setState` 写 sourceOpen）
- [ ] 壳零串口业务状态注释确认（不再有"壳只认 isOpen 一个 bit"措辞）

---

## 八、风险与边界

| 项 | 评估 |
|:--|:--|
| 启动窗口 | sourceOpen 启动期 undefined→falsy，与 false 等价——零风险（§五 Step 4 已论证） |
| 插件未装 | serial-monitor 未装时 sourceOpen 永不 set——但 when 子句属于该插件自己的命令，插件没了命令也没了，无影响 |
| 插件禁用 | 同上——命令注册随插件禁用消失 |
| 竞态 | 一次性迁移同一 commit 原子落地，无壳/插件并发写窗口 |
| 主进程机制 | **不动**——serial.onSystem/onData/onStats/getStatus 保留（插件还要用） |

**边界（本任务不碰，标注去向）：**
- `editorHasSelection`(414) / `editorCount`(415) 也是死键但**非串口**——归 E5.8#6.6 静态卫生，本任务不顺手处理（保持单任务原子性）
- 多串口 Phase 6 会把 sourceOpen 语义扩为 `openPorts.size > 0`（when 子句仍"任一端口开"）——本任务保持单口语义，Phase 6 再扩
- pluginState 的 `<port>:isOpen` 同步**保留**——壳侧栏/状态栏另一个消费面，与 contextKey 不同路

---

## 九、不做（out of scope）

- ❌ 不建任何新 API / 新 IPC 通道——`contextKey.set` 已存在
- ❌ 不改主进程 serial 机制
- ❌ 不动 `serialSessionFocus` contextKey（另一把钥匙，独立消费面）
- ❌ 不动 pluginState isOpen/sourceName 同步（壳侧栏/状态栏消费面）
- ❌ 不删 CoreEvents 其他 emitter

---

## 十、关联

- **历史同款：** E5.7#45.6 已删 `sourceName` contextKey（池化后壳不再知道端口名）。本任务把 `isOpen` 也删掉——同一条收敛线：**壳的串口业务状态逐键外推，直到壳只留机制**。
- **硬约束 #9：** 壳删除串口 bit 镜像 = 壳更"不知道串口"一分——核心无知更进一步。
- **dsh 收敛：** 串口 isOpen 外推 = "壳半业务外推"系列第一个实例；#48/#49（外观）、#50（装配清单）沿同一条哲学线。
- **验证了 dsh 深潜结论：** 通用 API 壳先行建设（新铁律，2026-08-17）让外推零成本——机制早就备好了，只剩把业务状态搬走。

---

> **← 上一层：** `README.md`（Phase 10 开工说明）
> **→ 下一任务：** E5.8#48（外观 factoryRole 摸底 + 拍板）
