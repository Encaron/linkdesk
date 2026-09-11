/**
 * 非 TS 语言的语言服务器发现与启动（E6#87c 拆自 EditorView.tsx 的初始化步骤 5）。
 *
 * LangDefRegistry 在壳侧注册、经 linkdesk.langDef IPC 查询——编辑器无需自己 sync。
 *
 * ⚠️ 返回 `false` 的语义是**整个初始化收工**（原实现里那处 `return` 退出的是外层 async IIFE，
 * 编辑器连创建都不会发生）——不是「LSP 没起来，接着建编辑器」。
 */
import type { MutableRefObject } from "react";
import i18n from "i18next";
import { getLspClient, getLspState, onLspStateChange as subscribeLspState, startLspClient } from "../../services/lsp-bridge";
import type { LspState } from "../../services/lsp-bridge";

const lk = window.linkdesk;

export async function attachLanguageSupport(args: {
  filePath: string;
  disposed: () => boolean;
  onLspStateRef: MutableRefObject<((state: LspState | null) => void) | undefined>;
  lspUnsubRef: MutableRefObject<(() => void) | null>;
}): Promise<boolean> {
  const { filePath, disposed, onLspStateRef, lspUnsubRef } = args;

  const ext = "." + (lk.path.normalize(filePath).split(".").pop() ?? "");
  const langDef = await lk.langDef.get(ext);
  console.error(`[editor:debug] filePath=${filePath} ext=${ext} langDef=${langDef?.id ?? "null"} hasLsp=${!!langDef?.lsp} hasClient=${!!getLspClient(langDef?.id ?? "")}`);
  // E6#73m K4：语言服务器状态订阅——「启动中 / 不可用」要有一处看得见的地方。
  // 订阅在调用 start 之前挂上：start 内部是**同步**置 starting 的，晚了这一档就漏了。
  onLspStateRef.current?.(getLspState(langDef?.id ?? "") ?? null);
  if (langDef?.lsp) {
    const langId = langDef.id;
    lspUnsubRef.current = subscribeLspState((id, st) => {
      if (id === langId) onLspStateRef.current?.(st);
    });
    // 已经订阅好了（可能 start 早已完成）——补一次当前档位
    onLspStateRef.current?.(getLspState(langId) ?? null);
    // 订阅晚于 unmount（异步段中途被 dispose）→ 立刻退订，别留悬挂回调
    if (disposed()) { lspUnsubRef.current?.(); lspUnsubRef.current = null; return false; }
  }
  if (langDef?.lsp && !getLspClient(langDef.id)) {
    const workspaceRoot = (await lk.workspace.getFolders())[0]?.uri || lk.path.normalize(filePath).replace(/\/[^/]+$/, "");
    startLspClient(langDef.id, langDef.lsp.command, langDef.lsp.args, workspaceRoot)
      .catch((err) => {
        // E5.8#24.6：LSP 启动失败不再静默 console.warn——用户可见 toast
        // （回归 #24：pyright 被删 → 跳转静默消失，用户无感。现在打开 .py 即报错，F12 不灵有因可循）
        // E6#73h（D3）：整句走 i18n（此前硬编码中文——英文界面下这条链路全中文）
        const msg = i18n.t("{{lang}} 语言支持启动失败：{{detail}}", {
          lang: langDef.id,
          detail: (err as Error).message ?? String(err),
        });
        console.error(`[editor] ${msg}`);
        lk.notifications.show(msg, { type: "error" }).catch(() => {});
      });
  }
  return true;
}
