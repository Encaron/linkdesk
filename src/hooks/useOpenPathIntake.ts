/**
 * useOpenPathIntake——命令行/文件关联 intake 消费（E6#46b）。
 *
 * 壳级功能不进插件（B79 教训：卸载所有插件后，命令行打开仍须可用）⇒ 挂 App 顶层。
 * 链路：主进程 launch-args 路由（文件半）→ preload IpcRelay 缓冲回放（硬约束 20）→
 * 本 hook → fileAssociation.getPluginFor(ext) → `tab:create`（判重靠 `reduceCreateTab` 的**身份去重**，
 *  editor 的 identityField = filePath ⇒ 同文件聚焦、新文件新建）。
 *
 * 类型缺额走 resolveFallbackTabType()（T7：壳不写死插件 id——查「当前激活的 text-fallback 挂牌者」，
 * 无挂牌者 ⇒ welcome 提示页；原 DEFAULT_TAB_TYPE="editor" 常量已退役）。
 * 文件夹不走本 hook：主进程路由层已把文件夹分去开新窗（#47a/#47b）。
 *
 * 与文件树双击同形（FoldersView.doOpenFile）：pinned:true = pin 模式。
 */
import { useEffect } from "react";
import { shellEvents } from "../core/react/events/ShellEvents";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";
import { resolveFallbackTabType } from "../core/services/files/FileAssociationService";
import { normalizePath } from "../core/utils/path/pathUtils";

/** 取路径末段为标签名——normalizePath 统一分隔符后切（intake 路径来自 OS，Windows 反斜杠为主） */
function basenameOf(filePath: string): string {
  const normalized = normalizePath(filePath);
  return normalized.split("/").pop() || normalized;
}

/**
 * E6#46b 焦点优先级：本会话已经过 intake 成功打开过文件 = 用户有「显式打开文件」的意图。
 * 消费方 = `releaseNotesOnLaunch`（首启自动弹不得抢焦点盖在用户的文件上）。
 * 会话级单调标记——只置 true，不复位（发行说明自动弹只在启动期跑一次，够用）。
 */
let _hasOpenedFiles = false;

export function hasOpenedFilesThisSession(): boolean {
  return _hasOpenedFiles;
}

/** 测试辅助：复位/预置单调标记（同 `__resetReleaseNotesLaunchForTest` 既有先例） */
export function __setFilesOpenedForTest(v: boolean): void {
  _hasOpenedFiles = v;
}

export function useOpenPathIntake(ready: boolean): void {
  useEffect(() => {
    // 🔴 ready 门：标签页恢复（restoreLayout）会把 tabState 整体替换——开文件若跑在它之前，标签被抹掉
    //（2026-09-13 真机实证）。IpcRelay 在 preload 端着缓冲，等 ready 期间的文件不丢（硬约束 20 的用法）。
    if (!ready) return;
    // ⚠️ onOpenPath 是壳内私有扩展，不在插件契约 LinkDeskAPI 上 ⇒ 必须经 getShellExposed() 取
    //（useReleaseNotes 的 getProductInfo 同款，不能直接 window.linkdesk.shell）。
    const lk = getShellExposed();
    if (!lk?.shell?.onOpenPath) return; // 非壳环境（预览页/单测）——不挂

    const openOne = async (filePath: string): Promise<void> => {
      // 防御性存在校验——主进程分类与投递之间文件可能被删（02 设计文档 §三.2）。
      // 丢失与 launch-args 同口径：console.warn 静默丢弃，不弹窗（启动路径失败不打扰用户）。
      if (lk.filesystem?.exists) {
        const ok = await lk.filesystem.exists(filePath).catch(() => false);
        if (!ok) {
          console.warn(`[intake] 文件不存在，已跳过打开: ${filePath}`);
          return;
        }
      }
      const name = basenameOf(filePath);
      const dot = name.lastIndexOf(".");
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
      // 兜底链修复（2026-10-07）：空扩展名（无后缀 / 点开头）也**照样问宿主**——主进程
      // resolveOpenTarget("") 直落角色兜底（服务层用例 ⑥）。旧写法 `ext ? … : ""` 把这类文件
      // 短路进渲染层兜底 = welcome（J3 判据：入口恒调宿主面）。
      const pluginId = await lk.fileAssociation.getPluginFor(ext);
      _hasOpenedFiles = true;
      shellEvents.emit("tab:create", {
        type: pluginId || resolveFallbackTabType(),
        opts: { filePath, sourceId: filePath, label: name, pinned: true },
      });
    };

    return lk.shell.onOpenPath((paths) => {
      // 批内顺序处理——同批多文件按入参序开标签（对标 VS Code `code a.txt b.txt`），不并发抢序
      void (async () => {
        for (const p of paths) await openOne(p);
      })();
    });
  }, [ready]);
}
