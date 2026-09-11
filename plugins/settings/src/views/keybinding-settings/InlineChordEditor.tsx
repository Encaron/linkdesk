/**
 * 行内 chord 编辑器——第一键 / 第二键双框 + 冲突 ⚠ + 确定/取消。
 * E6#87d 自 KeybindingSettingsView.tsx 的行内编辑单元格逐字搬出（只搬家，零逻辑变更）。
 */

import { useTranslation } from "react-i18next";
import type { KeybindingEditor } from "./useKeybindingEditor";

export default function InlineChordEditor({ editor }: { editor: KeybindingEditor }) {
  const { t } = useTranslation();
  const { firstKey, secondKey, activeField, setActiveField, firstConflict, secondConflict, confirmEdit, cancelEdit } = editor;

  return (
    <div className="keybindings-inline-edit">
      {/* 第一键 */}
      <span
        className={`keybindings-chord-field ${activeField === "first" ? "active" : ""}`}
        tabIndex={0}
        onFocus={() => setActiveField("first")}
      >
        {firstKey || (activeField === "first" ? t("按下快捷键…") : "")}
      </span>
      {/* 第二键——第一键未填时灰显 */}
      <span
        className={`keybindings-chord-field ${activeField === "second" && firstKey ? "active" : firstKey ? "" : "dimmed"}`}
        tabIndex={firstKey ? 0 : -1}
        onFocus={() => firstKey && setActiveField("second")}
      >
        {secondKey || (firstKey && !secondKey && activeField === "second" ? t("可选") : "")}
      </span>
      {/* 冲突提示 */}
      {(secondConflict?.length ?? 0) > 0 && (
        <span className="keybindings-inline-conflict" title={secondConflict?.map(b => b.command).join(t("、"))}>
          ⚠
        </span>
      )}
      {(!secondKey || !secondConflict) && firstConflict && firstConflict.length > 0 && (
        <span className="keybindings-inline-conflict" title={firstConflict.map(b => b.command).join(t("、"))}>
          ⚠
        </span>
      )}
      <button className="keybindings-inline-btn confirm" onClick={confirmEdit} disabled={!firstKey} title={t("确定")}>
        <span className="codicon codicon-check" />
      </button>
      <button className="keybindings-inline-btn cancel" onClick={cancelEdit} title={t("取消")}>
        <span className="codicon codicon-close" />
      </button>
    </div>
  );
}
