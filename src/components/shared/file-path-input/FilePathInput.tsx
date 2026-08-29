/**
 * FilePathInput——文件/目录路径选择器。
 * E5#57d: text input + 📂 按钮 → Electron dialog.openFile/openDirectory。
 *
 * 壳侧实现——uiHint: "file" | "directory" 配置项自动走此控件。
 * 非 Electron 环境下 📂 按钮不可用——用户可手动输入路径。
 */

import { useTranslation } from "react-i18next";
import Button from "../button/Button"; // E5.8#99：实心动作按钮——修「壳组件依赖 settings 插件 .settings-action-btn 样式」的倒置耦合

interface FilePathInputProps {
  value: string;
  onChange: (v: string) => void;
  /** "file" → openFile 对话框 / "directory" → openDirectory 对话框 */
  dialogType: "file" | "directory";
}

export default function FilePathInput({ value, onChange, dialogType }: FilePathInputProps) {
  const { t } = useTranslation();
  const handleBrowse = async () => {
    const dialog = window.linkdesk?.dialog;
    if (!dialog) return;

    const opts = dialogType === "directory"
      ? { directory: true }
      : {
          filters: [{ name: t("所有文件"), extensions: ["*"] }],
        };

    try {
      // E5.7#97：dialog.open 契约 = Promise<string | null>（主进程 dialog-handlers 直接返回路径）。
      // 原 { path } 对象分支是 any 时代的防御代码——契约不再允许该形状，死分支整删。
      const result = await dialog.open(opts);
      if (result) onChange(result);
    } catch {
      // 用户取消对话框——什么都不做
    }
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        className="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1 }}
        placeholder={dialogType === "directory" ? t("选择目录…") : t("选择文件…")}
      />
      <Button
        onClick={handleBrowse}
        title={dialogType === "directory" ? t("浏览目录…") : t("浏览文件…")}
      >…</Button>
    </div>
  );
}
