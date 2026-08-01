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
import { getWorkspaceFolders, onDidChangeFolders } from "@src/core/WorkspaceService";
import { listDir, readBinaryFile } from "@src/core/FileService";
import { EncodingService } from "@src/core/encoding/EncodingService";
import { normalizePath } from "@src/core/pathUtils";

/** 最多创建 500 个影子 model——大项目不卡 */
const MAX_SHADOW_MODELS = 500;
/** 忽略的目录名 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build"]);

let _envInitialized = false;
let _monaco: any = null;
let _scanPromise: Promise<void> | null = null;

// 🔥 工作区文件夹变更 → 重新扫描（影子 model 过期、新文件夹加入）
// onDidChangeFolders 本身已是 Event<T>（函数），直接调用，不 .event()
onDidChangeFolders(() => {
  if (!_monaco) return;
  _scanPromise = null; // 允许重新扫描
  scanWorkspaceForTypeScript(_monaco);
});

/**
 * 设置 TypeScript 编译器选项 + 诊断。
 * beforeMount 中调用——idempotent，全局只跑一次。
 */
export function setupTypeScriptEnv(monaco: any): void {
  if (_envInitialized) return;
  _envInitialized = true;
  _monaco = monaco;

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

  console.log("[ts-intel] setupTypeScriptEnv——compilerOptions 已设置");

  // 🔥 立即启动扫描——工作区文件夹已打开，扫描完再开文件时影子 model 已在场
  const folders = getWorkspaceFolders();
  console.log("[ts-intel] 工作区文件夹:", folders.length, folders.map(f => f.uri));
  scanWorkspaceForTypeScript(monaco);
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
    return;
  }

  for (const entry of entries) {
    if (count.n >= MAX_SHADOW_MODELS) break;
    const fullPath = normalizePath(entry.path);

    if (entry.isDirectory) {
      const name = fullPath.split("/").pop() || "";
      if (SKIP_DIRS.has(name)) continue;
      await scanDir(monaco, fullPath, count);
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      // 🔥 用 Uri.file——和 EditorView beforeMount 中预创建的 model 同款（file:/// 协议）
      const uri = monaco.Uri.file(fullPath);
      if (monaco.editor.getModel(uri)) {
        console.log("[ts-intel] 跳过——已有 model:", fullPath);
        continue;
      }

      try {
        const buffer = await readBinaryFile(fullPath);
        const content = EncodingService.decode(buffer, EncodingService.detect(buffer));
        monaco.editor.createModel(content, "typescript", uri);
        count.n++;
        console.log("[ts-intel] 影子 model #" + count.n + ":", uri.toString());
      } catch (e) {
        console.warn("[ts-intel] 读取失败:", fullPath, e);
      }
    }
  }
}

/**
 * 扫描工作区——创建 TS 影子 model。
 * 首次调用启动扫描，后续调用返回已有 Promise（不重复扫描）。
 */
export function scanWorkspaceForTypeScript(monaco: any): Promise<void> {
  if (_scanPromise) {
    console.log("[ts-intel] 扫描已在运行中，复用已有 Promise");
    return _scanPromise;
  }
  console.log("[ts-intel] 开始扫描工作区...");
  _scanPromise = (async () => {
    const folders = getWorkspaceFolders();
    const count = { n: 0 };
    for (const folder of folders) {
      if (count.n >= MAX_SHADOW_MODELS) break;
      await scanDir(monaco, normalizePath(folder.uri), count);
    }
    console.log("[ts-intel] 扫描完成——影子 model 总数:", count.n);
  })().catch((err) => {
    console.warn("[ts-intel] 工作区扫描失败:", err);
  });
  return _scanPromise;
}
