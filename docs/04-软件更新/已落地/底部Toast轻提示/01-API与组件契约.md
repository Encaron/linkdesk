# 01-API 与组件契约 —— 轻 Toast（TransientToast）

> **为什么存在**：轻 Toast 是**壳层通用能力**，任何插件都能用；本档把「叫什么、长什么样、怎么组合、写在哪」一次定死，避免第三次长出第二张卡。
> **上游**：[00-README](00-README.md)（分工判据）、memory `notification-surface-single-panel` §2026-11-19 改判；**下游**：壳实现、插件作者文档、命名空间矩阵。

## 一、命名（先定名，防重名）

| 层 | 名字 | ⛔ 禁止 |
|---|---|---|
| 插件侧 API | `window.linkdesk.toasts` | ⛔ 顶层单数 `toast`（E6#72 删除的死面——`window.linkdesk.toast`，名字带历史包袱） |
| 方法 | `.show(options)` → `ToastHandle` | ⛔ `pushToast`（内部实现名，不对外） |
| 组件 | `TransientToast`（feature-folder `transient-toast/`） | ⛔ `ToastHost`（历史撞名两次） |
| store 字段 | `presentation: "panel" \| "toast"` | ⛔ 新建 `transientToastStore` |

**为什么另起 `toasts` 而不是复用 `notifications` 加参数**：作者的心智是**意图**（"轻提示一下" vs "留一条通知"），不是呈现实现。两个命名空间、同一后端。

## 二、API 正表

```ts
window.linkdesk.toasts.show({
  message: string,                       // 必填
  key?: string,                          // 去重键：同 key 更新而非新增（缺省=每次新条目）
  severity?: "info" | "success" | "warning",  // 缺省 info；⚠️ error 不接受（自动降级面板）
  action?: { title: string; command?: string; args?: unknown[]; onClick?: () => void },
  ttl?: number,                          // ms，缺省 3000，夹取 [1500, 10000]
  icon?: boolean                         // 缺省 true
}): Promise<ToastHandle>

interface ToastHandle {
  /** 更新同一条目文案（保持出现位置与剩余 ttl 重置） */
  update(message: string): Promise<void>;
  /** 立即关闭 */
  dismiss(): Promise<void>;
  /** 只读：实际落在了哪个面（"toast" | "panel"），用于排障与断言 */
  readonly presentation: "toast" | "panel";
}
```

**兼容与互操作**：`toasts.show` 内部调用同一个 `pushToast({ presentation:"toast", ... })`；
`ui.notifications.show` 保持原样（`presentation` 缺省 `"panel"`）。**两套 API 共用一个队列、去重键空间、severity 枚举、动作模型、无障碍实现**。

## 三、降级规则（客户端自动，不由调用方决定）

| 条件 | 结果 | 理由 |
|---|---|---|
| `severity === "error"` | → 面板 | 错误需要留存与诊断 |
| 带 `action` 且 action 数 > 1 | → 面板 | Toast 最多 1 个动作 |
| 视觉宽度 > **96 单位**（CJK 记 2、ASCII 记 1） | → 面板 | 超过 2 行；⛔ 不截断、⛔ 缩小字号 |
| `ttl` 显式 ≥ 8000 | → 面板 | 用户设置的时间说明"要看一会儿" |
| message 含换行 `\n` 且行数 > 2 | → 面板 | 同上 |
| 以上都不满足 | Toast | — |

**判定必须是纯函数**：`decidePresentation({message,severity,actionCount,ttl}) → "toast"|"panel"`，单测直测（见 04 任务清单 T3）。

## 四、组件解剖（anatomy）

```
┌ .TransientToast ────────────────────────────────┐  max-width 360 / min 240
│ [severity icon 14] [message 12.5px · ≤2 行] [动作] [×] │  padding 10 12 · gap 10
└─────────────────────────────────────────────────┘
```

- **图标**：severity 语义色，`aria-hidden`（语义由文案承载）。
- **文本**：`-webkit-line-clamp:2`；**超 2 行不截断**——按 §三 整条降级到面板，所以 Toast 内永远不需要省略号。
- **动作**：最多 1 个，文本按钮（accent 色），不抢主色。
- **关闭 ×**：**常驻占位**（`width` 固定，`opacity 0→1` 仅 hover 变化）——⛔ 不得 hover 时才占位（历史 bug：× 顶出把文字推走、鼠标一动又弹回、拖选被破坏）。
- **stack**：底部居中，`gap 8`，最多 3 条；**新条目贴底**，老的向上让位；`pointer-events:none` 于容器、条目本身 `auto`。

## 五、位置（三条历史约束之一）

```
┌──────────────────────────── 应用窗口 ─────────────────────────────┐
│                                                                    │
│                    [ TransientToast 栈 ]   ← 底部居中              │
│                                                                    │
│  状态栏 ▸                                    铃铛面板（右下，留存） │
└────────────────────────────────────────────────────────────────────┘
```

- 轻 Toast：**底部居中**，距状态栏 `12px`（读 `--statusbar-height` token，缺则任务里补）。
- 铃铛面板：右下（`right:7px; bottom:calc(22px*scale+7px)`）——**两者水平不重叠**。
- ⛔ 右下角；⛔ 与面板同角落（这是 10-01 被删的直接原因）。

## 六、组合与复用（它是新组件，怎么拼）

| 件 | 职责 | 复用 |
|---|---|---|
| `decidePresentation` | 纯函数路由 | 单测、面板侧也可用 |
| `TransientToast` | 单条渲染（图标/文本/动作/关闭） | 不感知业务 |
| `TransientToastStack` | 队列布局、堆叠上限、hover 暂停 | 只读 store 快照 |
| store（`toast.ts`） | 条目生命周期、去重、TTL、动作派发 | **与面板共用** |

⛔ 组件内不得出现业务文案；⛔ 不得为某个插件定制样式（severity 已够表达）。
✅ 任何插件、壳自身、将来的权限系统都用同一个 `toasts.show`。

## 七、归一化硬约束（对应 00 工程规范）

1. **无硬编码**：颜色/圆角/间距/字号全部取 `src/index.css` token；TTL、堆叠上限、文本阈值集中为常量（`TOAST_TTL_* / TOAST_MAX_STACK / TOAST_MAX_VISUAL_LEN`），⛔ 散落魔法数。
2. **无死代码**：不复用已删的 `ToastHost` 与其通道；新组件落地时同笔删除遗留引用。
3. **高内聚低耦合**：路由纯函数 / 单条组件 / 栈容器 / store 四件单一职责，依赖单向（组件 → store，store 不引 React）。
4. **文件目录**：`src/pool/floating/transient-toast/`（feature-folder：`TransientToast.tsx` / `TransientToastStack.tsx` / `transient-toast.css` / `index.ts`）。🔴 **落点订正（2026-11-20 落码实查）**：立档时写的是 `src/components/shell/`，但壳窗口 DOM 自 E5.7#9 起空壳化（`App.tsx` 无可见 DOM、池 WCV 满窗覆盖）——`components/` 里的组件渲染在壳进程**用户看不见**；且 `components/shared/` 是经 `@linkdesk/ui` 分发给插件 import 的共享件，本组件插件无权渲染（§〇 判定）。故按池侧浮层先例落 `pool/floating/`（与 QuickPick/DialogHost/FloatingPanelHost 同族）——**状态与裁决仍全在壳**（store/routing/handler），本条「归一化约束」语义不变。
5. **文件上限**：照仓内判据，超限即拆。
6. **AI 友好**：字段谁写谁读在 §二/§六 一眼可见；`handle.presentation` 可断言，排障不用猜。

## 八、与旧规则的关系（给后来的 AI）

`toast.ts` 文件头与 memory 里「不许再建第二呈现面」已被 **2026-11-19 用户授权改判**：
- 仍禁止：**第二个 store / 同名组件 / 右下同角落**；
- 已允许：**同一 store 的第二种呈现模式**（本节定义）。
改判不是回滚：old 两次失败的三条根因在 §一/§五/§六 逐条被约束。
