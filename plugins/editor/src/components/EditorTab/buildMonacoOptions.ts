/**
 * E4V#40q——从 ConfigurationService 读取编辑器配置，构建 Monaco IEditorOptions（E6#87c 拆自 EditorTab.tsx）。
 * 配置键（editor.fontSize 等）→ Monaco 选项（fontSize 等）。
 * 嵌套键（editor.minimap.enabled）→ 嵌套对象（minimap: { enabled }）。
 */
const lk = window.linkdesk;

export async function buildMonacoOptions(): Promise<Record<string, unknown>> {
  const [
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimapEnabled, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guidesIndentation, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHintsEnabled, quickSuggestions, showWords, showSnippets,
  ] = await Promise.all([
    lk.configuration.get("editor.fontSize"),
    lk.configuration.get("editor.fontFamily"),
    lk.configuration.get("editor.fontWeight"),
    lk.configuration.get("editor.lineHeight"),
    lk.configuration.get("editor.tabSize"),
    lk.configuration.get("editor.insertSpaces"),
    lk.configuration.get("editor.detectIndentation"),
    lk.configuration.get("editor.wordWrap"),
    lk.configuration.get("editor.lineNumbers"),
    lk.configuration.get("editor.minimap.enabled"),
    lk.configuration.get("editor.renderWhitespace"),
    lk.configuration.get("editor.cursorStyle"),
    lk.configuration.get("editor.cursorBlinking"),
    lk.configuration.get("editor.mouseWheelZoom"),
    lk.configuration.get("editor.smoothScrolling"),
    lk.configuration.get("editor.autoClosingBrackets"),
    lk.configuration.get("editor.bracketPairColorization"),
    lk.configuration.get("editor.guides.indentation"),
    lk.configuration.get("editor.linkedEditing"),
    lk.configuration.get("editor.occurrencesHighlight"),
    lk.configuration.get("editor.selectionHighlight"),
    lk.configuration.get("editor.parameterHints.enabled"),
    lk.configuration.get("editor.quickSuggestions"),
    lk.configuration.get("editor.suggest.showWords"),
    lk.configuration.get("editor.suggest.showSnippets"),
  ]);
  return {
    theme: document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs",
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimap: { enabled: minimapEnabled }, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guides: { indentation: guidesIndentation }, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHints: { enabled: parameterHintsEnabled }, quickSuggestions,
    suggest: { showWords, showSnippets },
  };
}
