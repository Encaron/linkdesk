/**
 * E4V#40m DiffEditor——Monaco 并排对比。
 *
 * 接收两个文件路径，独立加载后渲染 Monaco createDiffEditor。
 * 入口：index.tsx 中 sourceId 含 "|||" → 拆出双路径 → 渲染 DiffEditor。
 */
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorModel } from "../services/EditorModel";
import { syncMonacoTheme, subscribeThemeSync } from "../services/theme-sync";
// E5.7#98：diff editor/monaco ref 具体类型——替代 useRef<any>
import type { editor as MonacoEditorApi } from "monaco-editor";
type MonacoNs = typeof import("monaco-editor");

interface DiffEditorProps {
  originalPath: string;
  modifiedPath: string;
  isActive: boolean;
}

const DiffEditor: React.FC<DiffEditorProps> = ({ originalPath, modifiedPath, isActive }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<MonacoEditorApi.IDiffEditor | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const themeSyncUnsubRef = useRef<(() => void) | null>(null);
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
        themeSyncUnsubRef.current = subscribeThemeSync(monacoRef);

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
          theme: document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs",
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
      themeSyncUnsubRef.current?.();
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

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {loading && (
        <div className="editor-loading" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-window)" }}>
          {t("加载对比…")}
        </div>
      )}
      {error && (
        <div className="editor-error" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-window)" }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default DiffEditor;
