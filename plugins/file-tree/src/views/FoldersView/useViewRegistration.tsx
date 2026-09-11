/**
 * useViewRegistration——FOLDERS 动态标题 + SEARCH 视图注册（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E3.6 TB6：FOLDERS view 动态标题 = 工作区文件夹名。
 * E36#ROLE：role 字段保证始终 sectionViews——title 可安全为空，不再需要 " " 占位。
 * E4V#35：多根时标题走 workspace name。
 * E4V#56+P2：pinnedContent——sticky scroll 已移除（E4V#57 放弃）。
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import SearchView from "../SearchView";

const lk = window.linkdesk;

export function useViewRegistration() {
  const { t } = useTranslation();

  useEffect(() => {
    const updateTitle = async () => {
      const folders = await lk.workspace.getFolders();
      // E4V#35f: 单根→根名，多根→"工作区"（对标 VS Code WORKSPACE）
      const title = folders.length === 1 ? folders[0].name : (folders.length > 1 ? t("工作区") : "");
      // E5.7#98：getView 是 IPC invoke（异步）——补 await。定向前为 undefined 恒真（同步用异步 API），
      // render 恒 ()=>null；await 后 existing.render 仍随 IPC 序列化剥函数 → 兜底行为不变，仅类型诚实
      // E5.8#41.9.2：getView 复合寻址——(pluginId, viewId) 精确查（#41.8 §4 方案 A，IPC 链带 pluginId）
      const existing = await window.linkdesk?.viewContainer?.getView("file-tree", "folders");
      window.linkdesk?.viewContainer?.registerView("file-tree", "explorer", {
        id: "folders",
        title,
        render: existing?.render ?? (() => null),
        minHeight: 180,
        // E4V#20f: 工具栏迁移到 header actions——对标 VS Code ▶ FOLDERS [+][🔄][⊟]
        actions: (
          <>
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
          </>
        ),
      });
    };
    updateTitle();
    const unsub = lk.workspace.onDidChangeFolders(updateTitle);
    return unsub;
  }, [t]);

  /** E4V#37b: 注册 SEARCH view——和 FOLDERS 同容器，始终可见 */
  useEffect(() => {
    window.linkdesk?.viewContainer?.registerView("file-tree", "explorer", {
      id: "search",
      title: t("搜索"),
      order: 1,
      render: () => <SearchView />,
    });
  }, [t]);
}
