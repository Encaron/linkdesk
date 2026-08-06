/**
 * FilePathInput——文件/目录路径选择器。
 * E5#57d: text input + 📂 按钮 → Electron dialog.openFile/openDirectory。
 *
 * 壳侧实现——uiHint: "file" | "directory" 配置项自动走此控件。
 * 非 Electron 环境下 📂 按钮不可用——用户可手动输入路径。
 */

interface FilePathInputProps {
  value: string;
  onChange: (v: string) => void;
  /** "file" → openFile 对话框 / "directory" → openDirectory 对话框 */
  dialogType: "file" | "directory";
}

export default function FilePathInput({ value, onChange, dialogType }: FilePathInputProps) {
  const handleBrowse = async () => {
    const dialog = window.linkdesk?.dialog;
    if (!dialog) return;

    const opts = dialogType === "directory"
      ? { directory: true }
      : {
          filters: [{ name: "所有文件", extensions: ["*"] }],
        };

    try {
      const result = await dialog.open(opts);
      if (result && typeof result === "string") {
        onChange(result);
      } else if (result && typeof result === "object" && result.path) {
        // dialog.open 可能返回 { path: string } 或直接返回 string
        onChange(result.path);
      }
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
        placeholder={dialogType === "directory" ? "选择目录…" : "选择文件…"}
      />
      <button
        className="settings-action-btn"
        onClick={handleBrowse}
        title={dialogType === "directory" ? "浏览目录…" : "浏览文件…"}
      >…</button>
    </div>
  );
}
