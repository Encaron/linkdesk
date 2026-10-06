/**
 * ObjectEditor——`type:"object"` / `type:"array"` 配置项的键值对编辑器。
 *
 * 2026-10-06《分段预览色块边缘串色》案 · 尾巴 T2：自官方设置插件整件上移
 * （原 `SettingsView/ObjectEditor.tsx` ＋ `SettingsView-objectEditor.css`）。
 * 判据 A：`object` / `array` 是**宿主 type 词表**里的形态——任何渲染方都得画得出来；
 * 住在**可替换**插件的私有件里 ⇒ 换一只设置插件，这两类键就变成裸 `<span>`（GUI 退化）。
 *
 * 🔴 文案一律 props 注入（`addLabel` / `deleteLabel` / `onLabel` / `offLabel`）——本件⛔ 不 `useTranslation`：
 *   共享层只说结构，人话由调用方给（与 `StringListEditor` 同款口径，先例 `SourceBadge`）。
 * 🔴 `newKeyBase` 是**写进用户配置的数据键名**，不是 UI 文案——**故意不走 i18n**：
 *   一旦有人给它补了译文，新增行的键名就会被写成译文，损坏用户配置（B-i18n-1）。
 *   默认 `newKey`；调用方按自己的数据约定传（官方设置插件传 `newPattern`，与迁移前逐字一致）。
 */

import "./ObjectEditor.css";

function ObjectEditor({
  value,
  onChange,
  addLabel,
  deleteLabel,
  onLabel,
  offLabel,
  newKeyBase = "newKey",
}: {
  value: Record<string, unknown>;
  onChange: (newValue: Record<string, unknown>) => void;
  /** 加行按钮文案（调用方的人话） */
  addLabel: string;
  /** 删行按钮的 title／aria-label */
  deleteLabel: string;
  /** 布尔值开关的 title／aria-label——真值态 */
  onLabel: string;
  /** 布尔值开关的 title／aria-label——假值态 */
  offLabel: string;
  /** 新增行的键名基（数据键名，⛔ 不翻译）——与已有键冲突时依次追加 1、2… */
  newKeyBase?: string;
}) {
  const entries = Object.entries(value);

  const handleToggle = (k: string, v: boolean) => {
    onChange({ ...value, [k]: v });
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const newObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      newObj[k === oldKey ? newKey : k] = v;
    }
    onChange(newObj);
  };

  const handleValueChange = (k: string, v: string) => {
    onChange({ ...value, [k]: v });
  };

  const handleDelete = (k: string) => {
    const rest: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key !== k) rest[key] = v;
    }
    onChange(rest);
  };

  const handleAdd = () => {
    // 键名去重：基名被占则 newKey1 / newKey2 …（迁移前逐字一致的规则）
    let candidate = newKeyBase;
    let i = 1;
    while (candidate in value) {
      candidate = `${newKeyBase}${i}`;
      i++;
    }
    onChange({ ...value, [candidate]: true });
  };

  return (
    <div className="ldk-object-editor">
      {entries.map(([k, v]) => (
        <div key={k} className="ldk-object-editor__row">
          <input
            className="ldk-input ldk-object-editor__key"
            type="text"
            defaultValue={k}
            onBlur={(e) => handleKeyChange(k, e.target.value)}
            spellCheck={false}
          />
          <span className="ldk-object-editor__colon">:</span>
          {typeof v === "boolean" ? (
            <button
              className={`ldk-object-editor__toggle ${v ? "ldk-object-editor__toggle--on" : ""}`}
              onClick={() => handleToggle(k, !v)}
              data-hint={v ? onLabel : offLabel}
              aria-label={v ? onLabel : offLabel}
            >
              <span className={`codicon ${v ? "codicon-check" : "codicon-close"}`} />
            </button>
          ) : typeof v === "number" ? (
            <input
              className="ldk-input ldk-object-editor__value"
              type="number"
              defaultValue={v}
              onBlur={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
            />
          ) : (
            <input
              className="ldk-input ldk-object-editor__value"
              type="text"
              defaultValue={String(v)}
              onBlur={(e) => handleValueChange(k, e.target.value)}
              spellCheck={false}
            />
          )}
          <button
            className="ldk-object-editor__delete"
            onClick={() => handleDelete(k)}
            data-hint={deleteLabel}
            aria-label={deleteLabel}
          >
            <span className="codicon codicon-trash" />
          </button>
        </div>
      ))}
      <button className="ldk-object-editor__add" onClick={handleAdd}>
        <span className="codicon codicon-add" />
        <span>{addLabel}</span>
      </button>
    </div>
  );
}

export default ObjectEditor;
