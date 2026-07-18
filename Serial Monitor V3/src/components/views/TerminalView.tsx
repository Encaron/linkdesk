import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  EditorView,
  lineNumbers,
  keymap,
  Decoration,
  ViewPlugin,
  ViewUpdate,
  type PluginValue,
} from "@codemirror/view";
import { EditorState, StateField, StateEffect, type Extension, RangeSet } from "@codemirror/state";
import { search, openSearchPanel, closeSearchPanel } from "@codemirror/search";
import Editor from "@monaco-editor/react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { RingBuffer } from "../../core/RingBuffer";
import { useTerminalPrefs } from "../../core/TerminalPrefsContext";
import "./TerminalView.css";

/* ---- CM6 深色主题 ---- */
const darkTheme: Extension = EditorView.theme(
  {
    "&": { background: "#252528", color: "#D4D4D4" },
    ".cm-gutters": { background: "#1E1E22", borderRight: "1px solid #474747", color: "#6A6A6A" },
    ".cm-activeLineGutter": { background: "#2D2D2D" },
    ".cm-activeLine": { background: "rgba(255,255,255,0.04)" },
    ".cm-cursor": { borderLeftColor: "#D4D4D4" },
    ".cm-selectionBackground": { background: "rgba(0,120,212,0.3)" },
    ".cm-selectionMatch": { background: "rgba(0,120,212,0.15)" },
    ".cm-searchMatch": { background: "rgba(255,255,0,0.2)", outline: "1px solid rgba(255,255,0,0.4)" },
    ".cm-line-sent": { color: "#0E639C" },
    ".cm-line-system": { color: "#6A6A6A" },
  },
  { dark: true }
);

/* ---- 三色行装饰系统 ---- */

const addLineDeco = StateEffect.define<{ from: number; cls: string }>();
const clearAllDecos = StateEffect.define();

const lineDecoField = StateField.define<RangeSet<Decoration>>({
  create() {
    return RangeSet.empty;
  },
  update(decos, tr) {
    let updated = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearAllDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(addLineDeco)) {
        const d = Decoration.line({ class: e.value.cls });
        updated = updated.update({ add: [d.range(e.value.from)] });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---- 智能滚底插件 ---- */

class ScrollTracker implements PluginValue {
  userScrolledUp = false;
  constructor(view: EditorView) {
    view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      this.userScrolledUp = dom.scrollHeight - dom.scrollTop - dom.clientHeight >= 30;
    });
  }
  update(update: ViewUpdate) {
    if (update.docChanged && !this.userScrolledUp) {
      requestAnimationFrame(() => {
        const pos = update.view.state.doc.length;
        update.view.dispatch({ effects: EditorView.scrollIntoView(pos) });
      });
    }
  }
}

const scrollTracker = ViewPlugin.fromClass(ScrollTracker);

/* ---- 终端视图 ---- */

function TerminalView() {
  const { t } = useTranslation();
  const { prefs } = useTerminalPrefs();

  /* ---- 状态 ---- */
  const [paused, setPaused] = useState(false);
  const pausedBuffer = useRef<string[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [systemLog, setSystemLog] = useState<string[]>([]);
  const [quickSends, _setQuickSends] = useState(["AT", "AT+CWLAP", "AT+CWJAP"]);
  const [sendValue, setSendValue] = useState("");
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  /* ---- CM6 ---- */
  const cmContainer = useRef<HTMLDivElement>(null);
  const cmView = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!cmContainer.current) return;
    const view = new EditorView({
      doc: "",
      extensions: [
        lineNumbers(),
        darkTheme,
        lineDecoField,
        scrollTracker,
        EditorState.readOnly.of(true),
        search({ top: true }),
        keymap.of([]),
      ],
      parent: cmContainer.current,
    });
    cmView.current = view;

    view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      setShowBackToBottom(dom.scrollHeight - dom.scrollTop - dom.clientHeight >= 30);
    });

    return () => {
      searchObserver.current?.disconnect();
      view.destroy();
    };
  }, []);

  /* ---- 追加一行（带颜色） ---- */
  const appendLine = useCallback((text: string, color: "received" | "sent" | "system") => {
    // 消息回显关闭时不显示发送回显
    if (color === "sent" && !prefs.showEcho) return;

    const view = cmView.current;
    if (!view) return;

    let display = text;
    if (color !== "system" && prefs.timestampFormat !== "无") {
      const ts = formatTimestamp(prefs.timestampFormat);
      display = ts + " " + text;
    }

    const doc = view.state.doc;
    const from = doc.length;
    const pre = doc.length > 0 ? "\n" : "";
    view.dispatch({
      changes: { from, insert: pre + display },
      effects: addLineDeco.of({ from: from + pre.length, cls: `cm-line-${color}` }),
    });
    if (view.state.doc.lines > 2000) {
      const line = view.state.doc.line(500);
      view.dispatch({ changes: { from: 0, to: line.from } });
    }
  }, [prefs.timestampFormat, prefs.showEcho]);

  /* ---- Tauri 事件监听 + rAF 消费 ---- */
  const ringBuffer = useRef(new RingBuffer<{ text: string; type: "received" | "sent" | "system" }>(512));

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<string>("serial-data", (event) => {
      ringBuffer.current.write({ text: event.payload, type: "received" });
    }).then((fn) => { unlisten = fn; }).catch(() => {});

    let rafId: number;
    const drain = () => {
      const items = ringBuffer.current.drainAll();
      for (const item of items) {
        if (paused) {
          pausedBuffer.current.push(item.text);
          if (pausedBuffer.current.length > 2000) pausedBuffer.current.shift();
          setPausedCount(pausedBuffer.current.length);
        } else {
          appendLine(item.text, item.type);
        }
      }
      rafId = requestAnimationFrame(drain);
    };
    rafId = requestAnimationFrame(drain);
    return () => { unlisten?.(); cancelAnimationFrame(rafId); };
  }, [appendLine, paused]);

  /* ---- 工具栏 ---- */
  const handlePause = () => {
    setPaused((p) => {
      if (p) {
        for (const text of pausedBuffer.current) appendLine(text, "received");
        pausedBuffer.current = [];
        setPausedCount(0);
      }
      return !p;
    });
  };

  const handleClear = () => {
    const view = cmView.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length },
      effects: clearAllDecos.of(undefined),
    });
  };

  const handleExport = async () => {
    const view = cmView.current;
    if (!view) return;
    const text = view.state.doc.toString();
    try {
      // WebView2 现代 API
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `serial-log-${Date.now()}.txt`,
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    } catch {
      // 降级：Blob 下载
      const blob = new Blob([text], { type: "text/plain;charset=UTF-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `serial-log-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  /* ---- 发送 ---- */
  const handleSend = useCallback(async () => {
    if (!sendValue.trim()) return;
    try {
      const ending = prefs.lineEnding.replace(/\\r/g, "\r").replace(/\\n/g, "\n");
      const bytes = Array.from(new TextEncoder().encode(sendValue + ending));
      await invoke("send_data", { data: bytes });
      appendLine(sendValue, "sent");
    } catch {
      appendLine("[错误] 发送失败", "system");
    }
    if (prefs.autoClear) setSendValue("");
  }, [sendValue, appendLine, prefs.lineEnding, prefs.autoClear]);

  const handleQuickSend = async (text: string) => {
    try {
      const bytes = Array.from(new TextEncoder().encode(text + "\r\n"));
      await invoke("send_data", { data: bytes });
      appendLine("> " + text, "sent");
    } catch {
      appendLine("[错误] 发送失败", "system");
    }
  };

  /* ---- 搜索 ---- */
  const searchObserver = useRef<MutationObserver | null>(null);

  const handleSearch = () => {
    const view = cmView.current;
    if (!view) return;
    if (searchOpen) {
      // 已经打开：关闭面板
      closeSearchPanel(view);
      if (searchObserver.current) {
        searchObserver.current.disconnect();
        searchObserver.current = null;
      }
      setSearchOpen(false);
      return;
    }
    openSearchPanel(view);
    setSearchOpen(true);

    // 监听 CM6 面板从 DOM 中移除（用户点 ✕ 或 Esc）
    requestAnimationFrame(() => {
      const panel = view.dom.querySelector(".cm-panels");
      if (!panel || !panel.parentNode) return;
      const observer = new MutationObserver(() => {
        if (!panel.parentNode) {
          setSearchOpen(false);
          observer.disconnect();
          searchObserver.current = null;
        }
      });
      observer.observe(panel.parentNode, { childList: true });
      searchObserver.current = observer;
    });
  };

  /* ---- Monaco 挂载 ---- */
  const handleEditorMount = useCallback(() => {}, []);

  return (
    <div className="terminal-view">
      {/* 工具栏 */}
      <div className="terminal-toolbar">
        <button className={`toolbar-btn${paused ? " active" : ""}`} onClick={handlePause} title={t("暂停接收")}>
          {paused ? "▶ " + t("继续接收") : "⏸ " + t("暂停接收")}
        </button>
        <button className="toolbar-btn" onClick={handleExport} title={t("导出日志")}>
          {t("导出日志")}
        </button>
        <button className="toolbar-btn" onClick={handleClear} title={t("清空接收区")}>
          {t("清空接收区")}
        </button>
        <button className={`toolbar-btn${searchOpen ? " active" : ""}`} onClick={handleSearch}>
          🔍 {t("搜索")}
        </button>
      </div>

      {/* 系统消息区（独立显示开启时） */}
      {prefs.separateSystemLog && !logCollapsed && systemLog.length > 0 && (
        <div className="system-log-area">
          <div className="system-log-header" onClick={() => setLogCollapsed(true)}>
            <span>{t("系统消息")} ({systemLog.length})</span>
            <button className="system-log-collapse">△ {t("收起")}</button>
          </div>
          <div className="system-log-messages">
            {systemLog.map((msg, i) => (
              <div key={i} className="system-log-line">{msg}</div>
            ))}
          </div>
        </div>
      )}
      {prefs.separateSystemLog && logCollapsed && (
        <div className="system-log-collapsed" onClick={() => setLogCollapsed(false)}>
          ▼ {t("系统消息")} ({systemLog.length})
        </div>
      )}

      {/* CM6 接收区 */}
      <div className="cm-wrapper">
        <div ref={cmContainer} className="cm-container" />
        {paused && (
          <div className="paused-banner">
            ⏸ 已暂停 · {pausedCount} 条缓冲
          </div>
        )}
        {showBackToBottom && (
          <button className="back-to-bottom" onClick={() => {
            const view = cmView.current;
            if (view) view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
            setShowBackToBottom(false);
          }}>
            ↓
          </button>
        )}
      </div>

      {/* 快捷发送条 */}
      <div className="quick-send-bar">
        {quickSends.map((qs) => (
          <button key={qs} className="quick-send-pill" onClick={() => handleQuickSend(qs)}>
            {qs}
          </button>
        ))}
        <button className="quick-send-add" title={t("添加快捷发送")}>+ {t("添加")}</button>
      </div>

      {/* 发送区 */}
      <div className="sender-area">
        <div className="monaco-wrapper">
          <span className="monaco-prefix">&gt;</span>
          <Editor
            height="32px"
            language="plaintext"
            value={sendValue}
            onChange={(v) => setSendValue(v ?? "")}
            theme="vs-dark"
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              lineNumbers: "off",
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              renderLineHighlight: "none",
              scrollBeyondLastLine: false,
              overviewRulerBorder: false,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: { vertical: "hidden", horizontal: "hidden" },
              wordWrap: "off",
              fontSize: 13,
              fontFamily: "'Sarasa Mono SC', Consolas, 'Courier New', monospace",
              padding: { top: 6, bottom: 0 },
            }}
          />
        </div>
        <div className="sender-actions">
          <button className="toolbar-btn" onClick={() => setSendValue("")}>
            {t("清空发送区")}
          </button>
          <button className="send-btn" onClick={handleSend}>
            {t("发送")}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(format: string): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const fff = String(d.getMilliseconds()).padStart(3, "0");
  if (format === "HH:mm:ss:fff") return `${hh}:${mm}:${ss}:${fff}`;
  return `${hh}:${mm}:${ss}`;
}

export default TerminalView;
