# E5#96+ OverlayPortal 行为归一化——平台能力升级

> 2026-08-06。E5#96a-g 已完成（归一化 portal 位置——5 个 overlay 统一到 body）。
> 本轮（E5#96h-p）归一化 **portal 行为**——点击外部检测 / ESC 关闭 / 焦点陷阱 / z-index 统一进组件。
> 
> 原则：不改消费方原有行为。新 prop 全可选，兼容现有 5 个 overlay。

---

## 一、问题——为什么当前不够

当前 OverlayPortal 只是 `createPortal` 换了个名字。5 个 overlay 各写各的"外部点击检测"和"ESC 关闭"：

| 组件 | 外部点击检测 | ESC 关闭 | 焦点陷阱 |
|:--|:--|:--|:--|
| ContextMenu | `menuRef.contains` + `subRef.contains` | keydown handler | 无 |
| SelectBox | `containerRef.contains` + `dropdownRef.contains` | 靠 mousedown 间接 | 无 |
| ColorPicker | overlay `onClick={onClose}` | keydown handler | 无 |
| ConfirmDialog | backdrop `onClick` | 自己的 keydown | 无 |
| ToastContainer | 无 | 无 | 无 |

**这不是归一化。** 4 种写法做同一件事。未来第 6 个、第 10 个 overlay 出现时，又会有人写第 5 种、第 6 种——其中一种有 bug。

## 二、方案——OverlayPortal 自带行为

```typescript
<OverlayPortal 
  onClose={() => setOpen(false)}   // 声明：外部点击/Esc → 关闭
  triggerRef={btnRef}              // 声明：点击这个元素不算"外部"
  trapFocus={true}                 // 声明：Tab 在 overlay 内循环
  zIndex="var(--z-dropdown)"       // 声明：叠层
>
  <Dropdown />
</OverlayPortal>
```

**一次写对 → 6 个 overlay 全删各自的手写检测 → 第 7 个 overlay 天然免疫。**

### 两阶段策略

| 阶段 | 内容 | 粒度 |
|:--|:--|:--|
| **阶段 1 (96h-l)** | 升级 OverlayPortal——不加任何消费方改动 | 纯增量 |
| **阶段 2 (96m-p)** | 迁移消费方——删各自的手写检测 | 有风险 |

只有阶段 2 验证无误，整个升级才算完成。阶段 1 可独立验证——新 prop 全可选，不改消费方时零副作用。

---

## 三、执行清单

### 第 1 步：升级 OverlayPortal（纯增量，零风险）

> 📖 **涉及文件：** `src/components/shared/OverlayPortal.tsx`

#### E5#96h 加 prop 类型 + contentRef

```typescript
interface OverlayPortalProps {
  children: React.ReactNode;
  /** 外部点击 / Escape → 关闭回调。不传则无外部关闭行为（如 ToastContainer） */
  onClose?: () => void;
  /** 点击此 ref 指向的元素不算"外部"（如触发按钮） */
  triggerRef?: React.RefObject<HTMLElement>;
  /** Tab/Shift+Tab 在 overlay 内循环 */
  trapFocus?: boolean;
  /** 叠层 token */
  zIndex?: string;
}
```
| +8 行

#### E5#96i 内部 mousedown listener

- 只在 `onClose` 传了时注册
- 捕获阶段（`true`）——早于 React 合成事件
- `contentRef` 自身 + `triggerRef?.current` → 判断"内部"
- 内部点击 → 不调 onClose。外部点击 → 调 onClose

| +12 行

#### E5#96j 内部 keydown Escape listener

- 只在 `onClose` 传了时注册
- `e.key === "Escape"` → `onClose()`

| +8 行

#### E5#96k trapFocus——焦点循环

- 只在 `trapFocus === true` 时注册
- Tab → 最后一个可聚焦元素 → 跳回第一个。Shift+Tab → 第一个 → 跳回最后一个

| +15 行

#### E5#96l zIndex prop

- 透传到 wrapper div 的 inline style
- wrapper div 是 `position: relative` 的透明容器（不影响布局，只承载 z-index）

| +3 行

验证：现有 5 个 overlay 不改任何代码 → 行为完全不变。`npm run check` 零新增。

---

### 第 2 步：迁移消费方（删代码，有风险但可控）

#### E5#96m SelectBox——删外部检测

**删：**
- `containerRef.contains` + `dropdownRef.contains` 双重 mousedown handler（~10 行）
- keydown Escape handler（~5 行）
- `dropdownRef`（仅保留 `containerRef` 给 `getBoundingClientRect` 定位用）

**加：**
```tsx
<OverlayPortal
  onClose={() => setOpen(false)}
  triggerRef={containerRef as React.RefObject<HTMLElement>}
>
  <div className="selectbox-dropdown" ...>
```

**涉及文件：** `src/components/shared/SelectBox.tsx` | −15 / +3 行

#### E5#96n ColorPicker——删 overlay onClick + Escape

**删：**
- keydown Escape handler（~5 行）
- overlay `onClick={onClose}` → 改回纯遮罩（无交互）

**加：**
```tsx
<OverlayPortal onClose={onClose}>
```

**涉及文件：** `src/components/shared/ColorPicker.tsx` | −5 / +1 行

#### E5#96o ConfirmDialog——keydown 走 OverlayPortal

**删：**
- `handleKeyDown` 中的 Escape 分支（~3 行）
- 保留 Enter 确认 + 自身 backdrop onClick（产品逻辑）

**加：**
```tsx
<OverlayPortal onClose={handleCancel}>
```

**涉及文件：** `src/components/shared/ConfirmDialog.tsx` | −3 / +1 行

#### E5#96p ContextMenu——部分迁移

**改：**
- keydown Escape → 走 OverlayPortal `onClose`

**不改：**
- mousedown 检测——涉及子菜单 `subRef` + hover 计时器，迁移风险大于收益
- 键盘导航（↑↓ Enter）——ContextMenu 专属逻辑

**涉及文件：** `src/components/shared/ContextMenu.tsx` | −4 / +1 行

### 最后验证

#### E5#96q 逐一验证

- SelectBox：点触发 → 打开 → 点选项 → 选中生效 / 外部点击 → 关闭
- ColorPicker：打开 → Esc → 关闭 / 外部点击 → 关闭
- ConfirmDialog：弹出 → Esc → 关闭（取消）/ Enter → 确认
- ContextMenu：右键 → 菜单正常 / Esc → 关闭 / 子菜单 hover 正常
- ToastContainer：行为不变

---

## 四、可能遇到的 Bug 与防线

### Bug 1：triggerRef 时序——首次渲染 ref 为 null

**根因：** OverlayPortal mount 时 `triggerRef.current` 可能为 null（React ref 在第一次 render 后才赋值）。

**症状：** 点击 trigger 按钮被误判为"外部"→ overlay 闪烁（开→关）。

**🔥 防线：** 不缓存 `triggerRef.current`——每次 mousedown 回调内实时读：
```typescript
const clickedTrigger = triggerRef?.current?.contains(event.target as Node);
```
mousedown 在 `requestAnimationFrame` 之后触发——此时 DOM 已挂载，ref 肯定就位。

### Bug 2：两个 overlay 同时开——ESC 全关

**根因：** 多个 OverlayPortal 各自注册 keydown Escape listener——按键事件冒泡到 window，每个 handler 都执行。

**症状：** ContextMenu 开着 → 弹出 ConfirmDialog → 按 ESC → 两个都关了。

**🔥 防线：** 暂时接受。对标 VS Code——ESC 逐层关闭是 overlay 栈管理，需要全局计数器，E5 不做。实际影响极小——ConfirmDialog 和 ContextMenu 极少同时出现。

### Bug 3：SelectBox toggle 竞态

**根因：** mousedown（外部检测）和 onClick（toggle）在同一个事件循环的不同阶段。

**症状：** 先触发 mousedown → onClose → setOpen(false)。然后 onClick 也触发 setOpen(true)。但 React 批量更新后可能顺序错乱。

**🔥 防线：** 
1. mousedown 在捕获阶段注册——不 stopPropagation，不 preventDefault
2. onClick 在冒泡阶段正常执行
3. 如果 `onClose` 把 state 关了，onClick 会重新打开——但这是同事件循环，React 批量更新合并成最后一次 setState
4. **验证点：** 点击 trigger → overlay 正常 toggle（开→关、关→开），不闪烁

### Bug 4：trapFocus 焦点不在 overlay 内

**根因：** overlay 首次渲染时焦点还在外部元素（如 trigger 按钮）。

**症状：** 第一次 Tab → 焦点跳到 overlay 外部。

**🔥 防线：** trapFocus 激活时，自动 focus overlay 内第一个可聚焦元素（`autofocus` 或 tabIndex）。如果 overlay 内没有可聚焦元素 → 设置 `contentRef.current.tabIndex = -1` 并 focus 它。

---

## 五、涉及文件

| 文件 | 变动 |
|:--|:--|
| `src/components/shared/OverlayPortal.tsx` | +46 行——prop 类型 + mousedown + Escape + trapFocus + zIndex |
| `src/components/shared/SelectBox.tsx` | −15 / +3 行——删外部检测 + keydown，传 onClose/triggerRef |
| `src/components/shared/ColorPicker.tsx` | −5 / +1 行——删 keydown Escape，传 onClose |
| `src/components/shared/ConfirmDialog.tsx` | −3 / +1 行——删 Escape 分支，传 onClose |
| `src/components/shared/ContextMenu.tsx` | −4 / +1 行——Escape 走 OverlayPortal |
| `src/components/shared/SelectBox.css` | 可能需调整——dropdown 不再需要 `position: absolute` |
| **合计** | +46 / −27 / +6 = 净 +25 行，删 27 行重复代码 |

---

> **← 执行清单：** [`E5-收尾执行清单.md`](../E5-收尾执行清单.md) § E5#96
> **← 原有专题文档：** [`架构债/OverlayPortal通用悬浮层.md`](../../架构债/OverlayPortal通用悬浮层.md)
