/**
 * Toolbar——文件树工具栏（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E4V#20f：对标 VS Code ▶ FOLDERS [+][🔄][⊟]。
 * E5.6#11：工具栏从 header actions (ReactNode→不可 IPC 序列化) 迁移到组件内自渲染。
 */
import { useTranslation } from "react-i18next";

const lk = window.linkdesk;

export default function Toolbar() {
  const { t } = useTranslation();
  return (
    <div className="file-tree-toolbar">
      <button className="file-tree-toolbar-btn" title={t("新建文件")} onClick={() => lk.commands.executeCommand("explorer.newFile")}>
        <span className="codicon codicon-new-file" />
      </button>
      <button className="file-tree-toolbar-btn" title={t("新建文件夹")} onClick={() => lk.commands.executeCommand("explorer.newFolder")}>
        <span className="codicon codicon-new-folder" />
      </button>
      <button className="file-tree-toolbar-btn" title={t("刷新")} onClick={() => lk.commands.executeCommand("explorer.refresh")}>
        <span className="codicon codicon-refresh" />
      </button>
      <button className="file-tree-toolbar-btn" title={t("收起全部")} onClick={() => lk.commands.executeCommand("explorer.collapseAll")}>
        <span className="codicon codicon-collapse-all" />
      </button>
    </div>
  );
}
