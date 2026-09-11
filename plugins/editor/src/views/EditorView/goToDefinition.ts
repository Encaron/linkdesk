/**
 * F12 + Ctrl+Click 跳转到定义（E6#87c 拆自 EditorView.tsx 的初始化步骤 12）。
 *
 * standalone Monaco 归一化导航通道：TS worker（fileName/textSpan）与 LSP（uri/range）
 * 两套形状，在此收敛成同一条「算出目标 → 本文件内揭示 / 跨文件开标签页」的路径。
 *
 * bootstrapMonaco() 覆盖 IEditorService.openEditor() → F12/Ctrl+Click 自动走壳标签页；
 * 本文件负责的是「定出目标位置」这一段。
 */
import type { MutableRefObject } from "react";
import i18n from "i18next";
import { fileUriToPath, setPendingReveal } from "../../services/navigation-bridge";
import { getLspClient, takeBlockedNotice } from "../../services/lsp-bridge";
import type { Monaco, MonacoEditor, TabsApi } from "./types";

const lk = window.linkdesk;

export function registerGoToDefinition(args: {
  monaco: Monaco;
  editor: MonacoEditor;
  tabsRef: MutableRefObject<TabsApi | undefined>;
}): void {
  const { monaco, editor, tabsRef } = args;

  // E5.7#98：TS worker（fileName/textSpan）与 LSP（uri/range）两套形状——联合类型 + 分支 cast。
  // monaco 0.55 TS 语言服务正源 = 顶层 monaco.typescript 命名空间（languages.typescript 是 deprecated 类型墓碑，
  // 运行时 editor.main.js 仍挂别名——同一对象）。顶层路径有完整类型，免 cast。
  interface TsDef { fileName: string; textSpan: { start: number } }
  interface LspDef { uri: string; range: { start: { line: number; character: number } } }
  const goToDefinitionAt = async (pos: { lineNumber: number; column: number }) => {
    const m = editor.getModel();
    if (!m) return;
    try {
      const langId = m.getLanguageId();
      let defs: (TsDef | LspDef)[] | undefined;
      const isTS = langId === "typescript" || langId === "javascript" || langId === "tsx" || langId === "jsx";

      if (isTS) {
        const worker = await monaco.typescript.getTypeScriptWorker();
        const tsClient = await worker(m.uri);
        // 库签名此处丢失精度（DefinitionInfo 解析成 any）——按 TsDef 结构窄化（E5.7#98）
        defs = (await tsClient.getDefinitionAtPosition(m.uri.toString(), m.getOffsetAt(pos))) as TsDef[] | undefined;
      } else {
        const lspClient = getLspClient(langId);
        if (lspClient) {
          const result = await lspClient.sendRequest("textDocument/definition", {
            textDocument: { uri: m.uri.toString() },
            position: { line: pos.lineNumber - 1, character: pos.column - 1 },
          });
          defs = result ? ((Array.isArray(result) ? result : [result]) as LspDef[]) : undefined;
        } else {
          // E6#73m K4：老写法这里**什么都不做**——启动期（1~15 秒）按 F12 或 Ctrl+点击
          // 完全静默，用户只会以为「跳转坏了」。现在出声；每轮启动只响一次（连按不刷屏）。
          // 无 LSP 的语言（该语言本来就没配语言服务器）不开腔——那不是故障。
          const blocked = takeBlockedNotice(langId);
          if (blocked) {
            void lk.notifications.show(
              blocked === "starting"
                ? i18n.t("语言服务器正在启动——请稍候再试")
                : i18n.t("语言支持不可用——无法跳转到定义"),
              { type: blocked === "starting" ? "info" : "warning", source: "editor" },
            ).catch(() => {});
          }
          return;
        }
      }

      if (!defs || defs.length === 0) return;
      const def = defs[0];

      let targetPath: string;
      let targetLine: number;
      let targetCol: number;
      if (isTS) {
        const tsDef = def as TsDef;
        targetPath = fileUriToPath(tsDef.fileName);
        const targetPos = m.getPositionAt(tsDef.textSpan.start);
        targetLine = targetPos.lineNumber;
        targetCol = targetPos.column;
      } else {
        const lspDef = def as LspDef;
        targetPath = fileUriToPath(lspDef.uri);
        targetLine = lspDef.range.start.line + 1;
        targetCol = lspDef.range.start.character + 1;
      }

      const currentPath = fileUriToPath(m.uri.toString());
      if (targetPath === currentPath) {
        editor.setPosition({ lineNumber: targetLine, column: targetCol });
        editor.revealPositionInCenter({ lineNumber: targetLine, column: targetCol });
        return;
      }

      // 跨文件：暂存位置 → createTab → mount/isActive effect consume → reveal
      const label = lk.path.normalize(targetPath).split("/").pop() || targetPath;
      setPendingReveal(targetPath, targetLine, targetCol);
      tabsRef.current?.create("editor", {
        filePath: targetPath, sourceId: targetPath, label, pinned: false,
      });
      // 已 active 的 editor 不会触发 isActive effect → 走事件通道
      lk.events.emit("editor:revealRequested", { filePath: targetPath });
    } catch (err) {
      // E5.8#24.6：不再静默吞错（原 `catch {}`）——跳转链路任何异常显性报错：
      // 协议诊断面 console.error + 用户可见 toast。杜绝「跳转没了却毫无动静」。
      // 无定义路径在 defs 空时正常 return（行 253），不落此 catch——此分支只接真异常。
      // E6#73h（D3）：同上——i18n（冒号也统一成全角，与其余通知一致）
      const msg = i18n.t("跳转到定义失败：{{detail}}", { detail: (err as Error).message ?? String(err) });
      console.error(`[editor] ${msg}`);
      lk.notifications.show(msg, { type: "error" }).catch(() => {});
    }
  };

  editor.addAction({
    id: "linkdesk.goToDefinition",
    label: "Go to Definition",
    keybindings: [monaco.KeyCode.F12],
    run: () => { const pos = editor.getPosition(); if (pos) goToDefinitionAt(pos); },
  });
  editor.onMouseDown(async (e) => {
    if (!e.event.ctrlKey && !e.event.metaKey) return;
    const pos = e.target.position;
    if (!pos) return;
    e.event.preventDefault();
    goToDefinitionAt(pos);
  });
}
