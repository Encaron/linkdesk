/**
 * execute——拖放的写操作执行（E6#87a 从 FileTreeDnD.ts 拆出）。
 */
// E6#73m K2：失败出口——写操作的异常必须有用户可见的那一头（本插件唯一出口，别处别再开第二条）
import i18n from "i18next";
import { joinPath, normalizePath } from "../../utils/pathUtils";
import { notifyFailure, errText, type FailureItem } from "../FileTreeNotify";

const lk = window.linkdesk;

/**
 * 🔥 拖放安全检查——归一化入口。
 * OS 拖入和树内拖拽两分支都调此函数，三个检查只写一处。
 * 对标 VS Code FileDragAndDrop。
 */
export async function executeSafeDrop(
  sources: { path: string; name: string }[],
  targetDir: string,
  operation: "copy" | "move",
): Promise<void> {
  // E4V#34e: explorer.enableDragAndDrop 配置开关
  if ((await lk.configuration.get("explorer.enableDragAndDrop") ?? true) === false) return;
  // E4V#34h1: explorer.confirmDragAndDrop——移动/复制前弹确认框
  if (await lk.configuration.get("explorer.confirmDragAndDrop") ?? true) {
    const names = sources.map((s) => `"${s.name}"`).join(", ");
    const targetName = targetDir.split("/").pop() ?? targetDir;
    const confirmed = await window.linkdesk?.dialog?.confirm?.(`确定${operation === "move" ? "移动" : "复制"} ${names} 到 "${targetName}"？`);
    if (!confirmed) return;
  }
  const t = normalizePath(targetDir);
  // E6#73m K2：**逐项**兜住——老写法首项抛错即整批中止（后面的源连试都没试），而异常还会沿
  // `onDrop`（React 不 await）悬空成静默失败。现在失败收进 failures、循环继续，收尾一次报清。
  const failures: FailureItem[] = [];
  for (const src of sources) {
    const s = normalizePath(src.path);
    const dest = joinPath(t, src.name);
    if (t.startsWith(s + "/")) continue;  // 祖先→后代——防递归嵌套
    if (s === t) continue;                // 自己→自己——防 sub→sub/sub
    if (s === dest) continue;             // 同路径——无操作
    try {
      await lk.filesystem.copy(src.path, dest);
      if (operation === "move") await lk.filesystem.remove(src.path);
    } catch (e) {
      // 复制成了、删原件没成 = 移动没完成，但目标处已有一份——照实报失败，不粉饰
      failures.push({ name: src.name, detail: errText(e) });
    }
  }
  notifyFailure(i18n.t(operation === "move" ? "移动" : "复制"), failures);
}
