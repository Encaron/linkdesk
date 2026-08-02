/**
 * E4V#40m DiffEditor——Monaco 并排对比。
 *
 * 接收两个文件路径，独立加载后渲染 Monaco createDiffEditor。
 * 入口：index.tsx 中 sourceId 含 "|||" → 拆出双路径 → 渲染 DiffEditor。
 */
import React, { useState, useEffect, useRef } from "react";
import { EditorModel } from "./EditorModel";
import { syncMonacoTheme, subscribeThemeSync } from "./theme-sync";

interface DiffEditorProps {
  originalPath: string;
  modifiedPath: string;
  isActive: boolean;
}

const DiffEditor: React.FC<DiffEditorProps> = ({ originalPath, modifiedPath, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    (async () => {
      try {
        const [origModel, modModel] = await Promise.all([
          EditorModel.load(originalPath),
          EditorModel.load(modifiedPath),
        ]);
        if (disposed) return;

        const monaco = await import("monaco-editor");
        monacoRef.current = monaco;
        syncMonacoTheme(monaco);

        const origUri = monaco.Uri.file(origModel.filePath);
        const modUri = monaco.Uri.file(modModel.filePath);
        // 如果已有相同 URI 的 model（如文件已在编辑器标签页中打开），先 dispose 再创建
        const existingOrig = monaco.editor.getModel(origUri);
        const existingMod = monaco.editor.getModel(modUri);
        if (existingOrig) existingOrig.dispose();
        if (existingMod) existingMod.dispose();
        const origM = monaco.editor.createModel(origModel.getValue(), undefined, origUri);
        const modM = monaco.editor.createModel(modModel.getValue(), undefined, modUri);

        const diffEditor = monaco.editor.createDiffEditor(container, {
          theme: "linkdesk",
          originalEditable: false,
          readOnly: true,
        });
        diffEditor.setModel({ original: origM, modified: modM });
        diffEditorRef.current = diffEditor;
        setLoading(false);
      } catch (err) {
        if (disposed) return;
        setError(`对比失败: ${(err as Error).message}`);
        setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      diffEditorRef.current?.dispose();
    };
  }, [originalPath, modifiedPath]);

  // keep-alive
  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => diffEditorRef.current?.layout?.());
  }, [isActive]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => diffEditorRef.current?.layout?.());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 主题同步
  useEffect(() => {
    return subscribeThemeSync(monacoRef);
  }, []);

  return (
    <div style={{ height: "100%", position: "relative" }}>
      {loading && <div className="editor-loading">加载对比…</div>}
      {error && <div className="editor-error">{error}</div>}
      <div ref={containerRef} style={{ height: "100%", display: loading ? "none" : "block" }} />
    </div>
  );
};

export default DiffEditor;
