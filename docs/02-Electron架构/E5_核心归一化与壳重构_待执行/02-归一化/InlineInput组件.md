# InlineInput 归一化——共享行内编辑组件

> 2026-08-02。**E5 第 2 层第 8 轮。** 全项目所有行内编辑用一个组件——FileTree rename / 串口会话 / 设置 / 快捷键。
> 执行清单任务：E5#18、E5#19

---

## 一、前因——碎片化的 input

### 1.1 当前全项目原生 `<input>` 分布

| 位置 | 文件 | 行号 | 用途 |
|------|------|:--:|------|
| 文件树重命名 | `FileTreeNode.tsx` | 177 | F2 重命名 inline 编辑 |
| 串口会话重命名 | `SessionListItem.tsx` | 80 | 双击重命名会话 |
| 串口创建会话 | `SessionListView.tsx` | 154 | 输入新会话名 |
| 串口快捷发送 | `index.tsx` | 1257,1264 | 名称+内容输入 |
| 串口搜索 | `SearchBar.tsx` | 51 | Ctrl+F 接收区搜索 |
| 串口设置 | `SerialSettingsView.tsx` | 122 | 定时循环间隔 |
| 串口关键字过滤 | `FilterMenu.tsx` | 41 | 过滤关键字 |
| 设置搜索 | `SettingsView.tsx` | 205 | 搜索设置项 |
| 设置值编辑 | `SettingsView.tsx` | 432,442,452 | 文本/数字/颜色 |
| 快捷键搜索 | `KeybindingSettingsView.tsx` | 210 | 搜索快捷键 |

**共 10+ 处原生 `<input>`，各自写 CSS——无统一外观、行为、退出清理逻辑。**

### 1.2 目标

```tsx
// 一个组件，所有场景
<InlineInput
  size="compact"        // 22px 文件树行内 / "normal" 32px 设置
  width={200}           // 可选，默认 fill
  selectMode="nameOnly" // "all" | "nameOnly"（文件去扩展名）
  value="hello.ts"
  onConfirm={(v) => renameFile(v)}
  onCancel={() => cancelRename()}
  autoFocus
/>
```

---

## 二、设计方案

### 2.1 InlineInput 组件 API

```typescript
// src/components/shared/InlineInput.tsx

export interface InlineInputProps {
  /** 尺寸——compact=22px 文件树行内 / normal=32px 设置/串口 */
  size: "compact" | "normal";
  
  /** 当前值 */
  value: string;
  
  /** 确认回调——Enter 或 blur 时调用 */
  onConfirm: (value: string) => void;
  
  /** 取消回调——Esc 时调用 */
  onCancel: () => void;
  
  /** 选中模式——all=全选 / nameOnly=只选文件名（去扩展名） */
  selectMode?: "all" | "nameOnly";
  
  /** 宽度——默认 fill（撑满父容器） */
  width?: number;
  
  /** 自动 focus */
  autoFocus?: boolean;
  
  /** placeholder */
  placeholder?: string;
  
  /** 输入类型 */
  type?: "text" | "number";
  
  /** 数字类型的 min/max */
  min?: number;
  max?: number;
}
```

### 2.2 核心逻辑

```typescript
export function InlineInput({
  size, value, onConfirm, onCancel, selectMode = "all",
  width, autoFocus, placeholder, type = "text", min, max,
}: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isActive, setIsActive] = useState(true);

  // 🔥 两阶段聚焦——对标 E4V#27 模式
  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    // 第一阶段：ref 绑定到 DOM
    inputRef.current.focus();
    
    // 第二阶段：选文本
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      if (selectMode === "nameOnly") {
        // 只选文件名——去扩展名
        const dotIndex = value.lastIndexOf(".");
        if (dotIndex > 0) {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    });
  }, [autoFocus]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 退出清理——useEffect 解耦（对标 E4V#27 教训）
  useEffect(() => {
    if (!isActive) {
      ContextKeyService.setValue("inputFocus", false);
      // requestAnimationFrame 延迟——等 React 卸载 input 后再做
      requestAnimationFrame(() => {
        // 恢复全局快捷键——由调用方传入 ref
      });
    }
  }, [isActive]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setIsActive(false);
      onConfirm(localValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsActive(false);
      onCancel();
    }
  };

  const handleBlur = () => {
    // blur 时确认——除非已处理过
    if (isActive) {
      setIsActive(false);
      onConfirm(localValue);
    }
  };

  // 🔥 聚焦时设 context key——阻止全局快捷键
  const handleFocus = () => {
    ContextKeyService.setValue("inputFocus", true);
  };

  return (
    <input
      ref={inputRef}
      className={`inline-input inline-input--${size}`}
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(type === "number" ? e.target.value.replace(/\D/g, "") : e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      autoComplete="off"
      spellCheck={false}
    />
  );
}
```

### 2.3 CSS 变量系统

```css
/* src/components/shared/InlineInput.css */
.inline-input {
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-family: var(--font-ui);
  outline: none;
}
.inline-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.inline-input--compact {  /* 文件树行内 */
  height: 22px;
  font-size: 12px;
  padding: 0 4px;
}
.inline-input--normal {   /* 设置/串口 */
  height: 32px;
  font-size: 13px;
  padding: 0 8px;
}
```

---

## 三、实现步骤

### E5#18a InlineInput 组件（~70 行）

**文件：** 新建 `src/components/shared/InlineInput.tsx`

**内容：** 全部 props + 两阶段聚焦 + 退出清理 + Enter/Esc/Blur 三路径。

### E5#18b InlineInput 样式（~40 行）

**文件：** 新建 `src/components/shared/InlineInput.css`

**内容：** compact/normal 两种尺寸 + focus 环 + 颜色全部走 CSS 变量。

### E5#18c 退出清理——useEffect 模式（~15 行）

**内容：** `isActive` 状态 → false 时：
1. `setKeybindingCaptureActive(false)`——恢复全局快捷键
2. `inputFocus = false`——恢复 context key
3. `requestAnimationFrame` 延迟聚焦——等 React 卸载 input

### E5#18d 两阶段聚焦（~10 行）

**内容：** 对标 E4V#27——`focus()` → `requestAnimationFrame` → `setSelectionRange()` / `select()`

### E5#19 现有场景迁移

#### E5#19a FileTree rename（~10 行改动）

**文件：** `plugins/builtin/file-tree/src/FileTreeNode.tsx` L177

```diff
- <input ref={inputRef} className="file-tree-rename-input" value={renameValue}
-   onChange={...} onKeyDown={...} onBlur={...} onClick={...} />
+ <InlineInput size="compact" selectMode="nameOnly" value={renameValue}
+   onConfirm={...} onCancel={...} autoFocus />
```

#### E5#19b 串口会话内联编辑（~5 行 × 2）

**文件：** `SessionListItem.tsx` L80 + `SessionListView.tsx` L154

```diff
- <input ref={inputRef} className="session-inline-input" ... />
+ <InlineInput size="compact" value={editValue} onConfirm={...} onCancel={...} autoFocus />
```

#### E5#19c 设置搜索框（~5 行）

**文件：** `SettingsView.tsx` L205

```diff
- <input className="settings-search-input" type="text" placeholder={t("搜索设置")} ... />
+ <InlineInput size="normal" value={search} onConfirm={setSearch}
+   onCancel={() => setSearch("")} placeholder={t("搜索设置")} />
```

---

## 🔴 预测 Bug

### Bug E5-18a 🔴🔴 onBlur 和 onConfirm 竞态——Enter 触发两次 onConfirm

**历史：** E4V#27——FileTree rename: `handleRenameKeyDown` 中 Enter → `onRenameConfirm` → 状态变化 → 组件 re-render → input 从 DOM 移除 → `onBlur` → 又调一次 → 两次确认。

**E5 触发条件：** InlineInput 中 Enter → `setIsActive(false)` + `onConfirm(localValue)` → React 卸载 input → `onBlur` → `isActive` 已被设为 false（guard 生效）→ 不会重复调。

**🔥 防线——`isActive` guard：**
```typescript
const handleBlur = () => {
  if (isActive) {  // ← 🔥 Enter 已设 false，blur 进来时 guard 拦截
    setIsActive(false);
    onConfirm(localValue);
  }
};
```

**✅ 已有预防。** 对标 E4V#27 的教训——`handleBlur` 必须在 `onConfirm` 之前检查 `isActive`。

---

### Bug E5-18b 🔴 全局快捷键恢复失败——requestAnimationFrame 在组件已卸载时调用

**历史：** E4V#27——`finiRename` 中同步 `focus()` 另一个元素→当前 input 还在 DOM→触发 `onBlur`→链式反应。

**E5 触发条件：** `useEffect` cleanup 中 `requestAnimationFrame` 回调 → 如果 StrictMode 双重 mount → 第一个 effect 的 cleanup → `requestAnimationFrame` 在第二个 mount 之后执行 → 操作错误的 DOM。

**🔥 防线——`isActive` flag + cleanup 取消 rAF：**
```typescript
useEffect(() => {
  if (!isActive) {
    const raf = requestAnimationFrame(() => {
      ContextKeyService.setValue("inputFocus", false);
    });
    return () => cancelAnimationFrame(raf);  // ← StrictMode 第二个 mount 时取消第一个的 rAF
  }
}, [isActive]);
```

---

## 四、完工标准

- [ ] `InlineInput` 组件——compact/normal 两种尺寸 + selectMode + Enter/Esc/Blur
- [ ] 文件树 F2 重命名 → InlineInput compact + nameOnly
- [ ] 串口会话重命名/创建 → InlineInput compact
- [ ] 设置搜索框 → InlineInput normal
- [ ] 全局快捷键在 inline 编辑时禁用、退出后恢复
- [ ] `npm run check` 零错误
- [ ] vitest InlineInput.test.tsx

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#18–#19
