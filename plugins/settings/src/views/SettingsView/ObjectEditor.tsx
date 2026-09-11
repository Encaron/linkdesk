/**
 * ObjectEditor——object/array 配置项键值对编辑器。
 * 自壳迁入（E5.8#41.14）：纯展示组件，零核心依赖。
 * 依赖方向：ObjectEditor → react-i18next；被 renderControl 消费。
 */

import { useTranslation } from "react-i18next";

function ObjectEditor({ value, onChange }: {
  value: Record<string, unknown>;
  onChange: (newValue: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
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
    const { [k]: _, ...rest } = value;
    onChange(rest);
  };

  const handleAdd = () => {
    // 这是写进用户配置的**数据键名**，不是 UI 文案——不过 t()（B-i18n-1：
    // 一旦有人补上 "newPattern" 译文，新增行的键名就会被写成译文，损坏用户配置）。
    const baseKey = "newPattern";
    let candidate = baseKey;
    let i = 1;
    while (candidate in value) {
      candidate = `${baseKey}${i}`;
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
            defaultValue={k}
            onBlur={(e) => handleKeyChange(k, e.target.value)}
            spellCheck={false}
          />
          <span className="object-editor-colon">:</span>
          {typeof v === "boolean" ? (
            <button
              className={`object-editor-toggle ${v ? "object-editor-toggle--on" : ""}`}
              onClick={() => handleToggle(k, !v)}
              title={v ? t("已启用") : t("已禁用")}
            >
              <span className={`codicon ${v ? "codicon-check" : "codicon-close"}`} />
            </button>
          ) : typeof v === "number" ? (
            <input
              className="input object-editor-value"
              type="number"
              defaultValue={v}
              onBlur={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
            />
          ) : (
            <input
              className="input object-editor-value"
              type="text"
              defaultValue={String(v)}
              onBlur={(e) => handleValueChange(k, e.target.value)}
              spellCheck={false}
            />
          )}
          <button
            className="object-editor-delete"
            onClick={() => handleDelete(k)}
            title={t("删除")}
          >
            <span className="codicon codicon-trash" />
          </button>
        </div>
      ))}
      <button className="object-editor-add" onClick={handleAdd}>
        <span className="codicon codicon-add" />
        <span>{t("添加模式")}</span>
      </button>
    </div>
  );
}

export default ObjectEditor;
