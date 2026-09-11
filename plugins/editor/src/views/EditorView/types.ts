/**
 * EditorView 的形状声明（E6#87c 拆自 EditorView.tsx）。
 */
import type { editor as MonacoEditorApi } from "monaco-editor";
import type { LspState } from "../../services/lsp-bridge";

/** monaco 命名空间（bootstrapMonaco 补丁后由 getMonaco 取回） */
export type Monaco = typeof import("monaco-editor");
/** 独立编辑器实例 */
export type MonacoEditor = MonacoEditorApi.IStandaloneCodeEditor;
/** 壳标签页 API（window.linkdesk.tabs） */
export type TabsApi = typeof window.linkdesk.tabs;

export interface EditorViewProps {
  value: string;
  language: string;
  filePath: string;
  isActive: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  readOnly?: boolean;
  /** E4V#40q——Monaco 编辑器选项，从 ConfigurationService 读取后合并到 monaco.editor.create() */
  options?: Record<string, unknown>;
  /** E4V#40j——光标位置变更，EditorStatusBar 消费 */
  onCursorChange?: (lineNumber: number, column: number) => void;
  /** E4V#40j——editor 创建完成后回传缩进/EOL 设置 */
  onEditorMount?: (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => void;
  /** E6#73m K4——语言服务器状态（null = 本语言无 LSP）。EditorStatusBar 消费。 */
  onLspStateChange?: (state: LspState | null) => void;
}

export interface EditorViewHandle {
  layout(): void;
  /** E5.7 fix（2026-08-16）：点击标签补焦——EditorTab tab:focusRequested 订阅调用 */
  focus(): void;
  dispose(): void;
  /** E4V#40q——运行时更新编辑器选项，无需重建 editor */
  updateOptions(opts: Record<string, unknown>): void;
  /** E5.8#0d.9——外部文件变更重载：整体替换 Monaco model 内容（setValue 重置 undo 栈，VS Code reload 同款语义）。
   *  React `value` prop 仅 init 读取——重载必须经此通道推给 Monaco。 */
  setValue(v: string): void;
}
