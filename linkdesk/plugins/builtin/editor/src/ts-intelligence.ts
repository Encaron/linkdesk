/**
 * E4V#40h TypeScript 跨文件智能提示——Monaco 内置 TS worker 接线。
 *
 * Monaco 自带 TypeScript 编译服务——只需：
 *   1. setCompilerOptions（target/module/jsx/strict）
 *   2. 创建工作区 TS 文件的"影子 model"（不挂编辑器，TS worker 后台解析 import）
 *   3. 跨文件补全/Ctrl+Click 跳转/类型红色波浪线/C-. 快捷修复——全是 Monaco 自带
 *
 * E4V#40i（诊断+快捷修复）也在此文件——`setDiagnosticsOptions` 打开红波浪线。
 */
import { getWorkspaceFolders } from "@src/core/WorkspaceService";
import { listDir, readBinaryFile } from "@src/core/FileService";
import { EncodingService } from "@src/core/encoding/EncodingService";
import { normalizePath } from "@src/core/pathUtils";

/** 最多创建 500 个影子 model——大项目不卡 */
const MAX_SHADOW_MODELS = 500;
/** 忽略的目录名 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build"]);

let _envInitialized = false;
let _scanPromise: Promise<void> | null = null;

/**
 * 设置 TypeScript 编译器选项 + 诊断。
 * beforeMount 中调用——idempotent，全局只跑一次。
 */
export function setupTypeScriptEnv(monaco: any): void {
  if (_envInitialized) return;
  _envInitialized = true;

  const ts = monaco.languages.typescript;
  ts.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: true,
  });

  // E4V#40i：打开语义+语法诊断——红色波浪线 + C-. 快捷修复
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

/** 递归扫描一个目录——创建 TS 影子 model */
async function scanDir(
  monaco: any,
  dirPath: string,
  count: { n: number },
): Promise<void> {
  if (count.n >= MAX_SHADOW_MODELS) return;

  let entries;
  try {
    entries = await listDir(dirPath);
  } catch {
    return; // 权限不足等——静默跳过
  }

  for (const entry of entries) {
    if (count.n >= MAX_SHADOW_MODELS) break;
    const fullPath = normalizePath(entry.path);

    if (entry.isDirectory) {
      const name = fullPath.split("/").pop() || "";
      if (SKIP_DIRS.has(name)) continue;
      await scanDir(monaco, fullPath, count);
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      const uri = monaco.Uri.file(fullPath);
      if (monaco.editor.getModel(uri)) continue; // 已存在

      try {
        const buffer = await readBinaryFile(fullPath);
        const content = EncodingService.decode(buffer, EncodingService.detect(buffer));
        monaco.editor.createModel(content, "typescript", uri);
        count.n++;
      } catch {
        // 读不到的文件静默跳过
      }
    }
  }
}

/**
 * 扫描工作区——创建 TS 影子 model。
 * 首次打开 TS 文件时 fire-and-forget——不阻塞编辑器渲染。
 * monaco 全局只跑一次（后续调用直接返回已有 Promise）。
 */
export function scanWorkspaceForTypeScript(monaco: any): void {
  if (_scanPromise) return;
  _scanPromise = (async () => {
    const folders = getWorkspaceFolders();
    const count = { n: 0 };
    for (const folder of folders) {
      if (count.n >= MAX_SHADOW_MODELS) break;
      await scanDir(monaco, normalizePath(folder.uri), count);
    }
  })().catch((err) => {
    console.warn("[ts-intelligence] 工作区扫描失败:", err);
  });
}
