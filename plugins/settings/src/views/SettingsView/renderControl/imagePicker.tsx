/**
 * 背景图选择控件（uiHint "image"）——E6#87d 自 renderControl.tsx 逐字搬出。
 *
 * E5.8#50.11：背景图选择——对话框选图（图像扩展名过滤）→ appearance.importImage 拷贝入库
 * （受控来源——用户任选路径不能 file:// 直读）→ 受控路径持久化。
 * E5.8#87 清除语义定案：三态并存——「清除图片」= 回主题（空，presence 门控回落主题图）；
 * 「无背景」= 绝对无图（显式 __none__，盖掉主题/mix 图）。路径区显示友好态文案（跟随主题/无背景）。
 */

import { useState } from "react";
import { Button } from "@linkdesk/ui";

// E5.8#87：显式「无」哨兵——字符串契约（__none__ 与壳 ThemeEngine.CONFIG_NONE_SENTINEL 同字面量，
// 插件不能 import @src/core，对标 "followTheme" 哨兵契约）
const CONFIG_NONE_SENTINEL = "__none__";

export function BackgroundImagePicker({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const handlePick = async () => {
    setBusy(true);
    try {
      const picked = await window.linkdesk?.dialog?.open({
        title: t("选择图片…"),
        filters: [{ name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (!picked) return; // 取消——不动值
      const controlled = await window.linkdesk?.appearance?.importImage(picked);
      if (controlled) onChange(controlled);
    } catch (e) {
      console.error("[settings] 导入背景图失败:", e);
    } finally {
      setBusy(false);
    }
  };
  // E5.8#87：路径区友好态——空 = 跟随主题；__none__ = 无背景；否则显示受控路径
  const display = value === CONFIG_NONE_SENTINEL ? t("无背景") : value === "" ? t("跟随主题") : value;
  return (
    <div className="settings-image-picker">
      <Button onClick={handlePick} disabled={busy}>
        {t("选择图片…")}
      </Button>
      {value !== CONFIG_NONE_SENTINEL && (
        <Button onClick={() => onChange(CONFIG_NONE_SENTINEL)}>
          {t("无背景")}
        </Button>
      )}
      {value !== "" && (
        <Button onClick={() => onChange("")}>
          {t("清除图片")}
        </Button>
      )}
      <span className="settings-image-path" title={display}>
        {display}
      </span>
    </div>
  );
}
