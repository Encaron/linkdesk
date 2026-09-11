/**
 * files 命令组——新建 / 刷新 / 重命名 / 删除（E6#87a 二次拆分）。
 */
import { dirname, joinPath } from "../../../utils/pathUtils";
import i18n from "i18next";
import { notifyFailure, errText, nameOf, type FailureItem } from "../../../services/FileTreeNotify";
import { h } from "../host-bridge";
import { refreshDirSafe, type FileMenuContext } from "./shared";

const lk = window.linkdesk;

/** E4V#34 fix: 无 context（MenuBar 调用）→回退到 focused item/根目录 */
function resolveDirUri(ctx?: FileMenuContext): string {
  const hd = h();
  if (!hd) return "";
  const model = hd.getModel();
  if (ctx?.isDirectory) return ctx.uri;
  if (ctx) return dirname(ctx.uri);
  // MenuBar 调用——无右键菜单 context→用 focused/selected item
  const focusedUri = hd.getFocusedUri();
  if (focusedUri) {
    const focused = model.findClosest(focusedUri);
    return focused?.isDirectory ? focused.uri : dirname(focusedUri);
  }
  return model.roots[0]?.uri ?? "";
}

/** E4V#34j: explorer.incrementalNaming——"smart"=编号（默认），"disabled"=不编号 */
async function nextName(dirUri: string, base: string): Promise<string> {
  const naming = await lk.configuration.get("explorer.incrementalNaming") ?? "smart";
  let name = base;
  if (naming === "disabled") return name;
  const probe = (n: string) => joinPath(dirUri, n);
  for (let i = 1; i < 100; i++) {
    if (!await lk.filesystem.exists(probe(name))) break;
    name = `${base}-${i}`;
  }
  return name;
}

export function registerFileCommands(): void {
  lk.commands.registerCommand("explorer.newFile", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const dirUri = resolveDirUri(args[0] as FileMenuContext | undefined);
    if (!dirUri) return;
    const name = await nextName(dirUri, "新建文件");
    await lk.filesystem.writeTextFile(joinPath(dirUri, name), "");
    await model.refresh(dirUri);
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  });

  lk.commands.registerCommand("explorer.newFolder", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const dirUri = resolveDirUri(args[0] as FileMenuContext | undefined);
    if (!dirUri) return;
    const name = await nextName(dirUri, "新建文件夹");
    await lk.filesystem.createDir(joinPath(dirUri, name));
    await model.refresh(dirUri);
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  });

  lk.commands.registerCommand("explorer.refresh", async () => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    await model.refresh();
    for (const uri of model.getExpandedUris()) {
      const item = model.findClosest(uri);
      if (item) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
    }
  });

  lk.commands.registerCommand("explorer.collapseAll", async () => {
    h()?.getModel().collapseAll();
  });

  // ── E4V#27: F2 行内重命名 ──
  lk.commands.registerCommand("explorer.rename", async () => {
    h()?.startRename();
  });

  // ── E4V#24: delete ──
  lk.commands.registerCommand("explorer.delete", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const ctx = args[0] as FileMenuContext | undefined;
    const selection = hd.getSelection();
    const focused = hd.getFocusedUri();
    const uris: string[] = selection.length > 0 ? selection : ctx ? [ctx.uri] : focused ? [focused] : [];
    if (uris.length === 0) return;
    const confirmDelete = await lk.configuration.get("explorer.confirmDelete") ?? true;
    if (confirmDelete) {
      const nameList = uris.map((u) => `"${u.split("/").pop() ?? u}"`).join(", ");
      const confirmed = await window.linkdesk?.dialog?.confirm?.(`确定删除 ${nameList}？`);
      if (!confirmed) return;
    }
    const parentUris = new Set<string>();
    // E6#73m K2：逐项兜住——删整个目录是长任务且**会失败**（占用/只读/权限），老写法首项抛错
    // 就整批中止、且异常沿命令 handler 悬空 ⇒ 用户看到「树没刷新，也没报错」。
    const failures: FailureItem[] = [];
    for (const uri of uris) {
      try {
        await lk.filesystem.remove(uri);
        lk.events.emit("file:deleted", { filePath: uri });
        parentUris.add(dirname(uri));
      } catch (e) {
        failures.push({ name: nameOf(uri), detail: errText(e) });
      }
    }
    // 失败项**不进 parentUris**——它们还在盘上，刷新那层只会白跑（真删掉的照常刷）
    notifyFailure(i18n.t("删除"), failures);
    for (const parentUri of parentUris) {
      await refreshDirSafe(model, parentUri);
    }
  });
}
