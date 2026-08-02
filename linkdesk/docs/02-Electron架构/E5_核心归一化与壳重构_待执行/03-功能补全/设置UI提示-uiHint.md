# 设置 UI 提示——uiHint

> 2026-08-03。**E5 新增任务。** `type: "string"` 是类型，不是"怎么编辑"。加 `uiHint` 声明编辑控件。
> 执行清单任务：E5#57

---

## 一、前因

`editor.fontFamily` 是 type: "string"——SettingsView 渲染成 `<input type="text">`。用户手打 `"Consolas, 'Courier New', monospace"`——全靠记忆。

## 二、方案

```typescript
// plugin.schema.json——ConfigurationProperty 加字段
"uiHint": {
  "type": "string",
  "enum": ["fontFamily", "fontSize", "color", "file", "directory"],
  "description": "设置编辑器渲染提示。SettingsView 按提示选择控件。不认识的 hint 降级回 type 默认渲染——不抛错。"
}
```

```typescript
// SettingsView.tsx renderControl
function renderControl(key, schema, val, onChange) {
  const hint = schema.uiHint;

  // 🔥 uiHint 驱动——优先于 type
  if (hint === "fontFamily") return <FontFamilySelect value={val} onChange={onChange} />;
  if (hint === "fontSize")   return <input type="number" min={8} max={72} step={1} value={val} onChange={...} />;
  if (hint === "color")      return <ColorPicker value={val} onChange={onChange} />;
  if (hint === "file")       return <FilePathInput value={val} onChange={onChange} dialog="openFile" />;
  if (hint === "directory")  return <FilePathInput value={val} onChange={onChange} dialog="openDirectory" />;

  // 无 hint → 按 type + enum 推断
  if (schema.enum)   return <SelectBox options={...} />;
  switch (schema.type) {
    case "boolean":  return <Toggle ... />;
    case "number":   return <input type="number" ... />;
    case "object":
    case "array":    return <ObjectEditor ... />;
    default:         return <input type="text" ... />;
  }
}
```

### FontFamilySelect——等宽字体过滤在壳侧

```typescript
// SettingsView.tsx——壳侧实现
function FontFamilySelect({ value, onChange }) {
  const monoFonts = useSystemMonospaceFonts();  // document.fonts → 测等宽 → 过滤

  return (
    <SelectBox
      options={monoFonts.map(f => ({ value: f, label: f }))}
      value={value}
      onChange={onChange}
    />
  );
}

// 等宽检测——用 Canvas 测单个字符宽度
function isMonospace(fontName: string): boolean {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `16px "${fontName}"`;
  const w1 = ctx.measureText("i").width;
  const w2 = ctx.measureText("W").width;
  return Math.abs(w1 - w2) < 0.5;
}
```

---

## 三、实现步骤

### E5#57a plugin.schema.json 加 uiHint（~8 行）

### E5#57b SettingsView renderControl 加 hint 分支（~20 行）

### E5#57c FontFamilySelect 组件（~30 行）

### E5#57d FilePathInput 组件（~20 行——调 Electron dialog API）

### E5#57e 首批配置项声明 uiHint

- `editor.fontFamily` → `uiHint: "fontFamily"`
- 将来 `editor.colorDecorators`（如果加了）→ `uiHint: "color"`
- 将来 `terminal.shell.windows` → `uiHint: "file"`

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#57
