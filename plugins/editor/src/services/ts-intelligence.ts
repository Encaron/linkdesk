/**
 * E4V#40h TypeScript 跨文件智能提示——Monaco 内置 TS worker 接线。
 *
 * Monaco 自带 TypeScript 编译服务——只需：
 *   1. setCompilerOptions（target/module/jsx/strict）
 *   2. 创建工作区 TS 文件的"影子 model"（不挂编辑器，TS worker 后台解析 import）
 *   3. 跨文件补全/Ctrl+Click 跳转/类型红色波浪线/C-. 快捷修复——全是 Monaco 自带
 *
 * 🔥 扫描时机：monaco 初始化 + 工作区变更——不等到打开文件才扫。
 *   打开文件时影子 model 已在场，TS worker 可直接解析 import。
 *
 * E4V#40i（诊断+快捷修复）也在此文件——`setDiagnosticsOptions` 打开红波浪线。
 */
// E6#73m K5：非组件模块取 i18n 默认实例（同 lsp-bridge）
import i18n from "i18next";
// E5.6#11.5i：EncodingService → lk.encoding.*（async IPC）
const lk = window.linkdesk;

/** 影子 model 计数 + 是否触顶截断（K5：截断必须说出来） */
interface ScanCount { n: number; truncated: boolean }

// E5.7#98：Monaco 命名空间具体类型——替代 monaco: any。
// TS 语言服务正源 = 顶层 monaco.typescript（languages.typescript 是 deprecated 类型墓碑，
// 运行时 editor.main.js 仍挂别名——同一对象）。
type MonacoNs = typeof import("monaco-editor");

/** 最多创建 500 个影子 model——大项目不卡 */
const MAX_SHADOW_MODELS = 500;
/** 忽略的目录名 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build"]);

let _envInitialized = false;
let _monaco: MonacoNs | null = null;
let _scanPromise: Promise<void> | null = null;
let _workspaceUnsub: (() => void) | null = null;

/**
 * 设置 TypeScript 编译器选项 + 诊断。
 * beforeMount 中调用——idempotent，全局只跑一次。
 */
export function setupTypeScriptEnv(monaco: MonacoNs): void {
  if (_envInitialized) return;
  _envInitialized = true;
  _monaco = monaco;

  const ts = monaco.typescript;
  ts.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: true,
  });

  // E4V#40i：打开语义+语法诊断——红色波浪线 + C-. 快捷修复
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // E5.5#7 Bug B fix：工作区文件夹变更 → 重新扫描（影子 model 过期、新文件夹加入）。
  // 多 WebView 下 onDidChangeFolders 是隔离实例——壳侧文件夹变更不会触发编辑器。
  // workspace:changed 通过 IpcBridge.broadcast → plugin:push → events.on 正确跨越 WebView 边界。
  _workspaceUnsub = lk?.events?.on?.("workspace:changed", () => {
    if (!_monaco) return;
    _scanPromise = null; // 允许重新扫描
    scanWorkspaceForTypeScript(_monaco);
  }) ?? null;

  // console.log("[ts-intel] setupTypeScriptEnv——compilerOptions 已设置");

  // 🔥 立即启动扫描——工作区文件夹已打开，扫描完再开文件时影子 model 已在场
  scanWorkspaceForTypeScript(monaco);
}

/** 递归扫描一个目录——创建 TS 影子 model */
async function scanDir(
  monaco: MonacoNs,
  dirPath: string,
  count: ScanCount,
): Promise<void> {
  // E6#73m K5：走到这里说明**还有一个目录要进**（唯一调用点 = entry.isDirectory 分支 /
  // 工作区文件夹循环）——到了上限就是「有活没干完」，如实标记，别静默。
  if (count.n >= MAX_SHADOW_MODELS) { count.truncated = true; return; }

  let entries;
  try {
    entries = await lk.filesystem.listDir(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    // E6#73m K5：同目录里还有没走到的条目——剩下的是目录（可能含 TS）或 TS 文件才算截断，
    // 尾随的 README/图片之类不算（少报好过狼来了）。
    if (count.n >= MAX_SHADOW_MODELS) {
      const rest = lk.path.normalize(entry.path);
      if (entry.isDirectory || rest.endsWith(".ts") || rest.endsWith(".tsx")) count.truncated = true;
      break;
    }
    const fullPath = lk.path.normalize(entry.path);

    if (entry.isDirectory) {
      const name = fullPath.split("/").pop() || "";
      if (SKIP_DIRS.has(name)) continue;
      await scanDir(monaco, fullPath, count);
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      // 🔥 file:/// URI——和 EditorView path prop 同款。TS worker 模块解析拼 file:/// 路径，
      //    影子 model 也必须用 file:/// 才能匹配
      const uri = monaco.Uri.parse(`file:///${fullPath}`);
      if (monaco.editor.getModel(uri)) {
        // console.log("[ts-intel] 跳过——已有 model:", fullPath);
        continue;
      }

      try {
        const buffer = await lk.filesystem.readBinaryFile(fullPath);
        const enc = await lk.encoding.detect(buffer);
        const content = await lk.encoding.decode(buffer, enc);
        monaco.editor.createModel(content, "typescript", uri);
        count.n++;
        // console.log("[ts-intel] 影子 model #" + count.n + ":", uri.toString());
      } catch (e) {
        console.warn("[ts-intel] 读取失败:", fullPath, e);
      }
    }
  }
}

/** 清理工作区变更订阅——编辑器 WebView 销毁时调用。 */
export function disposeTypeScriptEnv(): void {
  _workspaceUnsub?.();
  _workspaceUnsub = null;
  _envInitialized = false;
  _monaco = null;
  _scanPromise = null;
}

/**
 * 扫描工作区——创建 TS 影子 model。
 * 首次调用启动扫描，后续调用返回已有 Promise（不重复扫描）。
 */
export function scanWorkspaceForTypeScript(monaco: MonacoNs): Promise<void> {
  if (_scanPromise) {
    // console.log("[ts-intel] 扫描已在运行中，复用已有 Promise");
    return _scanPromise;
  }
  // console.log("[ts-intel] 开始扫描工作区...");
  _scanPromise = (async () => {
    const folders = await lk.workspace.getFolders();
    const count: ScanCount = { n: 0, truncated: false };
    for (const folder of folders) {
      if (count.n >= MAX_SHADOW_MODELS) { count.truncated = true; break; }
      await scanDir(monaco, lk.path.normalize(folder.uri), count);
    }
    // console.log("[ts-intel] 扫描完成——影子 model 总数:", count.n);

    // E6#73m K5：截断此前是**完全静默**的——用户只会遇到「某些文件的 Ctrl+点击不灵」，
    // 却没有任何地方说得出为什么。超上限 = 能力降级，要出声（一次扫描一条，不按文件刷屏）。
    if (count.truncated) {
      void lk.notifications.show(
        i18n.t("工作区 TypeScript 文件超过 {{max}} 个——只加载了前 {{max}} 个，其余文件的跳转与补全可能不完整", { max: MAX_SHADOW_MODELS }),
        { type: "warning", source: "editor" },
      ).catch(() => {});
    }
  })().catch((err) => {
    // E6#73m K5：整轮扫描失败 = 跨文件能力全无，旧写法只写 console（用户看不到）
    console.warn("[ts-intel] 工作区扫描失败:", err);
    void lk.notifications.show(
      i18n.t("工作区扫描失败——跨文件跳转与补全可能不完整：{{detail}}", {
        detail: (err as Error).message ?? String(err),
      }),
      { type: "warning", source: "editor" },
    ).catch(() => {});
  });
  return _scanPromise;
}
