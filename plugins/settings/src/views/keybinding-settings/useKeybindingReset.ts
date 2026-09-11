/**
 * 「重置为默认」——E6#87d 自 KeybindingSettingsView.tsx 的行内编辑状态机里逐字搬出（只搬家，零逻辑变更）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { KeybindingRow } from "./types";

function lk() {
  return window.linkdesk;
}

export function useKeybindingReset() {
  const { t } = useTranslation();

  // E3f #59-G + E5.5#7-p2：重置为默认——走 linkdesk.dialog.confirm 替代动态 import DialogService
  const handleResetDefault = useCallback(async (row: KeybindingRow) => {
    const confirmed = await lk().dialog?.confirm?.(
      t("确定要将「{{key}}」重置为默认值吗？", { key: row.title })
    );
    if (!confirmed) return;
    const kb = lk().keybindings;
    if (!kb) return;
    await kb.resetKeybindingToDefault(row.command);
    await kb.saveUserKeybindings();
  }, [t]);

  return handleResetDefault;
}
