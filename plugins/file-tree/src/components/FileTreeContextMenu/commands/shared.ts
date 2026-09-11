/**
 * shared——命令组的共用件（E6#87a：438 行 commands.ts 二次拆分）。
 *
 * 只放被两个以上命令组用到的东西；单组私有件留在各自文件里。
 */
import i18n from "i18next";
import type { FileTreeModel } from "../../../services/FileTreeModel";
import { notifyFailure, errText, nameOf } from "../../../services/FileTreeNotify";

/** 菜单传入的 command args */
export interface FileMenuContext {
  uri: string;
  isDirectory: boolean;
}

/** 尚未实现的命令占位 handler */
export const placeholder = (id: string) => async () => {
  console.warn(`[file-tree] 命令 "${id}" 尚未实现`);
};

/**
 * E6#73m K2：刷新目录——`getChildren` 读磁盘，目录刚被移走 / 权限没了都会抛。
 * 老写法 `.catch(console.error)` 对用户等于没有（池渲染进程零全局拒绝兜底）。
 * 统一走 FileTreeNotify 那一个出口，措辞与 FileTreeDnD 的 refreshDirSafe 一致。
 */
export async function refreshDirSafe(model: FileTreeModel, dir: string): Promise<void> {
  try {
    model.refresh(dir);
    const item = model.findClosest(dir);
    if (item && model.isExpanded(item.uri)) await model.getChildren(item);
  } catch (e) {
    notifyFailure(i18n.t("刷新"), [{ name: nameOf(dir), detail: errText(e) }]);
  }
}
