/**
 * BackgroundImagePicker——背景图选择控件（uiHint "image"）。E6#87d 自设置插件搬入
 * （判据 A：消费宿主声明的控件必须住在任何声明者与渲染者都取得到的层）。
 *
 * 原行为照抄（E5.8#50.11 / #87）：对话框选图（图像扩展名过滤）→ 拷入受控存储
 * （用户任选路径不可直读）→ 受控路径持久化。清除语义三态并存——「清除图片」= 回主题
 * （空，presence 门控回落主题图）；「无背景」= 绝对无图（显式 __none__，盖掉主题/mix 图）；
 * 路径区显示友好态文案（跟随主题/无背景）。
 *
 * 🔴 能力注入式（本案 02 E12）：共享件**不得**直接调 `window.linkdesk`——选图与入库两步由使用方
 * 经 props 注入（onPick / onImport）；清除/复位是纯值写入，留在件内。文案自持
 * （useTranslation，同 FontFamilySelect 先例）——三个键均在随包种子字典内。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../button/Button";
import { CONFIG_NONE_SENTINEL } from "../settings-hints/settingsHints";
import "./BackgroundImagePicker.css";

export interface BackgroundImagePickerProps {
  value: string;
  onChange: (value: unknown) => void;
  /** 打开图片选择对话框（标题/过滤器由使用方决定）；取消返回 null */
  onPick: () => Promise<string | null | undefined>;
  /** 把 onPick 给的路径拷入受控存储，返回受控路径；失败/取消返回 null */
  onImport: (pickedPath: string) => Promise<string | null | undefined>;
}

function BackgroundImagePicker({ value, onChange, onPick, onImport }: BackgroundImagePickerProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handlePick = async () => {
    setBusy(true);
    try {
      const picked = await onPick();
      if (!picked) return; // 取消——不动值
      const controlled = await onImport(picked);
      if (controlled) onChange(controlled);
    } catch (e) {
      // 保持现状（不动值）；console 行不受 audit-i18n 约束
      console.error("[linkdesk/ui] 导入背景图失败:", e);
    } finally {
      setBusy(false);
    }
  };

  const display = value === CONFIG_NONE_SENTINEL ? t("无背景") : value === "" ? t("跟随主题") : value;
  return (
    <div className="ldk-image-picker">
      <Button onClick={handlePick} disabled={busy}>
        {t("选择图片…")}
      </Button>
      {value !== CONFIG_NONE_SENTINEL && (
        <Button onClick={() => onChange(CONFIG_NONE_SENTINEL)}>{t("无背景")}</Button>
      )}
      {value !== "" && <Button onClick={() => onChange("")}>{t("清除图片")}</Button>}
      <span className="ldk-image-picker__path" data-hint={display} data-hint-delay="0">
        {display}
      </span>
    </div>
  );
}

export default BackgroundImagePicker;
