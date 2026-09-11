/**
 * 编辑器运行环境的一次性就绪（E6#87c 拆自 EditorView.tsx 的初始化步骤 1–5）。
 *
 * 顺序不能动：等容器有尺寸 → 打 VS Code 服务层补丁（导航桥同时挂上）→ 取 monaco →
 * 主题同步 → TS 智能。`getMonaco` 必须在 `bootstrapMonaco` 之后——补丁没打完就取会拿到
 * 未配置 workers 的实例（E5.8#24.8 护栏）。
 *
 * @returns 就绪的 monaco + 主题订阅退订句柄；中途被 dispose → null（调用方直接收工）
 *   🔴 退订句柄**回传给调用方存**，不在这里写 ref——cleanup 要读的那个 ref 必须由 effect 体自己写，
 *   否则 ESLint 的 `exhaustive-deps` 会判「ref 可能在 cleanup 前被换掉」（它只看本 effect 体有没有写）。
 */
import type { MutableRefObject } from "react";
import { bootstrapMonaco, getMonaco } from "../../services/monaco-bootstrap";
import { setupTypeScriptEnv, scanWorkspaceForTypeScript } from "../../services/ts-intelligence";
import { syncMonacoTheme, subscribeThemeSync } from "../../services/theme-sync";
import type { Monaco, TabsApi } from "./types";

const lk = window.linkdesk;

export async function bootstrapEditorEnv(args: {
  container: HTMLElement;
  disposed: () => boolean;
  monacoRef: MutableRefObject<Monaco | null>;
  tabsRef: MutableRefObject<TabsApi | undefined>;
}): Promise<{ monaco: Monaco; themeSyncUnsub: () => void } | null> {
  const { container, disposed, monacoRef, tabsRef } = args;

  // E5#11i：WebView 初始 0×0→等 bounds（resize event 触发 layout）
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    await new Promise<void>((r) => { let n = 0; const id = setInterval(() => { if ((container.clientWidth > 0 && container.clientHeight > 0) || ++n > 100) { clearInterval(id); r(); } }, 30); });
  }
  if (disposed()) return null;

  // 1. 全局一次性补丁 VS Code 服务层 + 导航桥（幂等，并发共享同一 promise）
  await bootstrapMonaco(async (modelRef, _options) => {
    const targetPath = modelRef.object.textEditorModel.uri.fsPath;
    const label = lk.path.normalize(targetPath).split("/").pop() || targetPath;
    tabsRef.current?.create("editor", {
      filePath: targetPath,
      sourceId: targetPath,
      label,
      pinned: false,
    });
    return undefined;
  });
  if (disposed()) return null;

  // 2. 取 monaco（E5.8#24.8 护栏：getMonaco 保证补丁完成 + 已配置好 workers）
  const monaco = await getMonaco();

  // 3. 主题同步——先设 monacoRef，再注册订阅，确保回调中 ref 已就位
  syncMonacoTheme(monaco);
  monacoRef.current = monaco;
  const themeSyncUnsub = subscribeThemeSync(monacoRef);

  // 4. TS compilerOptions + 影子 model 扫描
  setupTypeScriptEnv(monaco);
  scanWorkspaceForTypeScript(monaco);

  return { monaco, themeSyncUnsub };
}
