# 设置 object 类型编辑器

> 2026-08-02。**E5 第 3 层第 10 轮。** `files.exclude` 等 object 配置项在设置 UI 可编辑。
> 执行清单任务：E5#21

---

## 一、前因

### 1.1 当前症状

**`SettingsView.tsx` `renderControl()` switch——只处理 boolean/string/number（L420-460）：**

```typescript
function renderControl(key: string, schema: ConfigSchema, val: unknown, onChange: ...) {
  switch (schema.type) {
    case "boolean": return <Toggle ... />;
    case "string":  return <input type="text" ... />;
    case "number":  return <input type="number" ... />;
    default:        return <span>{String(val)}</span>;  // ← object 走这里 → "[object Object]"
  }
}
```

`files.exclude`（type: "object"）在设置 UI 显示为 `[object Object]`——纯文本，不可编辑。

### 1.2 目标

对标 VS Code 的 settings object widget——键值对编辑器，支持添加/删除行、每行切换 boolean 值。

```
files.exclude
  ├── **/node_modules    [✓]  ← toggle
  ├── **/.git            [✓]
  ├── *.log              [✓]  ← 新增行
  └── [+ 添加模式]
```

---

## 二、设计方案

### 2.1 ObjectEditor 组件

```typescript
// src/components/views/SettingsView.tsx——新增 object case

case "object": {
  const obj = (typeof val === "object" && val !== null && !Array.isArray(val)) ? val as Record<string, unknown> : {};
  return <ObjectEditor value={obj} onChange={(newObj) => onChange(key, newObj)} />;
}
case "array": {
  const arr = Array.isArray(val) ? val : [];
  // array 转 object 编辑——key 是数字索引
  const obj: Record<string, unknown> = {};
  arr.forEach((item, i) => { obj[String(i)] = item; });
  return <ObjectEditor value={obj} onChange={(newObj) => {
    const newArr = Object.values(newObj);
    onChange(key, newArr);
  }} />;
}
```

### 2.2 ObjectEditor 实现

```typescript
function ObjectEditor({ value, onChange }: {
  value: Record<string, unknown>;
  onChange: (newValue: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(value);

  const handleToggle = (k: string, v: boolean) => {
    onChange({ ...value, [k]: v });
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
    const newObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      newObj[k === oldKey ? newKey : k] = v;
    }
    onChange(newObj);
  };

  const handleDelete = (k: string) => {
    const { [k]: _, ...rest } = value;
    onChange(rest);
  };

  const handleAdd = () => {
    const newKey = "newPattern";
    let candidate = newKey;
    let i = 1;
    while (candidate in value) {
      candidate = `${newKey}${i}`;
      i++;
    }
    onChange({ ...value, [candidate]: true });
  };

  return (
    <div className="object-editor">
      {entries.map(([k, v]) => (
        <div key={k} className="object-editor-row">
          <input
            className="input object-editor-key"
            type="text"
            value={k}
            onChange={(e) => handleKeyChange(k, e.target.value)}
          />
          <span className="object-editor-colon">:</span>
          {typeof v === "boolean" ? (
            <button
              className={`toggle object-editor-value ${v ? "toggle--on" : ""}`}
              onClick={() => handleToggle(k, !v)}
            >
              {v ? "✓" : "✗"}
            </button>
          ) : (
            <input
              className="input object-editor-value"
              type="text"
              value={String(v)}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          )}
          <button className="object-editor-delete" onClick={() => handleDelete(k)} title="删除">
            ×
          </button>
        </div>
      ))}
      <button className="object-editor-add" onClick={handleAdd}>
        + 添加模式
      </button>
    </div>
  );
}
```

---

## 三、实现步骤

### E5#21a renderControl 加 object case（~5 行）

**文件：** `src/components/views/SettingsView.tsx` L420-460

**内容：** switch 中加 `case "object":` → 渲染 `<ObjectEditor>`。

### E5#21b ObjectEditor 组件——键值对编辑（~50 行）

**内容：** 每行一个 key input + value toggle/input + 删除按钮。底部"添加模式"按钮。

### E5#21c 样式（~20 行）

**文件：** `src/components/views/SettingsView.css`

**内容：** `.object-editor-row` flex 排列、`.object-editor-key` 等宽、`.object-editor-delete` 悬停变红。

---

## 🔴 预测 Bug

### Bug E5-21a 🔴 object 值非 boolean——只支持 toggle

**触发条件：** 配置项 `{ "key": "stringValue" }` → toggle 按钮无意义。

**🔥 防线——全类型支持：** `typeof v === "boolean"` → toggle 按钮。`typeof v === "string"` → text input。`typeof v === "number"` → number input。`typeof v === "object"` → 递归嵌套 ObjectEditor。不做"暂显示"——现在就全覆盖。

---

## 四、完工标准

- [ ] `files.exclude` 在设置 UI 可编辑——添加/删除模式、toggle boolean 值
- [ ] 改 `files.exclude` → 文件树立即响应（E4V#8a 已接线 onDidChange 订阅）
- [ ] 非 boolean 值的 object → text input 编辑
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#21
