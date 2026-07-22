/**
 * 终端视图插件。
 * Phase 4 Step B3+B5：从 src/components/views/TerminalView.tsx 迁移 + 串口工具栏。
 * 串口工具栏（COM/波特率/打开关闭）+ 接收区（CM6）+ 发送栏（Monaco）+ 侧栏设置。
 *
 * 设计依据：[V3-Phase4-终端插件化设计.md]
 */

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
import { EditorState, StateField, StateEffect, type Extension, RangeSet, Compartment } from "@codemirror/state";
import { search, RegExpCursor } from "@codemirror/search";
import Editor from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvent } from "@src/hooks/useTauriEvent";
import { RingBuffer } from "@src/core/RingBuffer";
// Phase 5.5c C4a：12 项设置切到 useTerminalSessions——每会话独立，侧栏写入主区读取
import { useSession, setActiveSessionId } from "./useTerminalSessions";
import ControlPanel from "./ControlPanel";
import { useSendData, type SendContext, type SendCallbacks } from "@src/core/useSendData";
import SearchBar from "@src/components/terminal/SearchBar";
import FilterMenu from "@src/components/terminal/FilterMenu";
import { HexToBytes } from "@src/core/DataConverter";
import { CUSTOM_EVENTS } from "@src/core/CoreEvents";
// Phase 5b：统一右键菜单——终端命令注册 + 共享 ContextMenu
import { registerCommand } from "@src/core/CommandRegistry";
import ContextMenu from "@src/components/shared/ContextMenu";
import { MenuId } from "@src/core/MenuRegistry";
import { v3ProtocolLanguage, v3ProtocolTheme } from "@src/languages/v3-protocol";
import "./TerminalView.css";

/* ---- 常量 ---- */
const SCROLL_AT_BOTTOM_TOLERANCE = 5;
const BACK_TO_BOTTOM_THRESHOLD = 30;
const SYSTEM_LOG_MAX_LINES = 50;
const CM6_MAX_DOC_LINES = 2000;
const CM6_TRIM_KEEP_LINES = 500;
const RING_BUFFER_CAPACITY = 512;
const PAUSED_BUFFER_MAX = 2000;
const SEND_HISTORY_MAX = 20;
const HEX_WARNING_MAX_CHARS = 5;
const HEX_PREVIEW_MAX_LEN = 80;
const MONACO_MAX_HEIGHT = 80;
const MONACO_MIN_HEIGHT = 32;
const MONACO_LINE_HEIGHT = 18;
const MONACO_PADDING = 16;

// Phase 5e：模块级变量——Tauri event handler 在 React 渲染周期外运行，
// 读取此变量获取最新 receiveMode。渲染时由组件函数体写入。
let _receiveMode: string = "text";

/* ---- CM6 主题（颜色走 CSS 变量，切主题自动响应） ---- */
const darkTheme: Extension = EditorView.theme(
  {
    "&": { background: "var(--bg-card)", color: "var(--text-primary)" },
    ".cm-gutters": { background: "var(--bg-window)", borderRight: "1px solid var(--separator)", color: "var(--text-muted)" },
    ".cm-activeLineGutter": { background: "var(--bg-card)" },
    ".cm-activeLine": { background: "rgba(255,255,255,0.04)" },
    ".cm-cursor": { borderLeftColor: "var(--text-primary)" },
    ".cm-selectionBackground": { background: "rgba(0,120,212,0.3)" },
    ".cm-selectionMatch": { background: "rgba(0,120,212,0.15)" },
    ".cm-searchMatch": { background: "rgba(255,255,0,0.2)", outline: "1px solid rgba(255,255,0,0.4)" },
    ".cm-line-sent": { color: "var(--sent-echo)" },
    ".cm-line-system": { color: "var(--system-log)" },
    ".cm-timestamp": { color: "var(--cm-timestamp, var(--text-muted))" },
    ".cm-search-match": { background: "rgba(255, 200, 0, 0.25)" },
    ".cm-search-current": { background: "rgba(255, 140, 0, 0.45)", outline: "1px solid rgba(255, 140, 0, 0.6)" },
  },
  { dark: true }
);

/* ---- 三色行装饰系统 ---- */

const addLineDeco = StateEffect.define<{ from: number; cls: string }>();
const addTimestampMark = StateEffect.define<{ from: number; to: number }>();
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

/* ---- 时间戳前缀灰色装饰 ---- */

const timestampMarkField = StateField.define<RangeSet<Decoration>>({
  create() { return RangeSet.empty; },
  update(marks, tr) {
    let updated = marks.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearAllDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(addTimestampMark)) {
        const d = Decoration.mark({ class: "cm-timestamp" });
        updated = updated.update({ add: [d.range(e.value.from, e.value.to)] });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---- 搜索高亮装饰系统 ---- */

const setSearchDecos = StateEffect.define<{ matches: { from: number; to: number }[]; current: number }>();
const clearSearchDecos = StateEffect.define();

const searchDecoField = StateField.define<RangeSet<Decoration>>({
  create() { return RangeSet.empty; },
  update(decos, tr) {
    let updated = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearSearchDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(setSearchDecos)) {
        updated = RangeSet.empty;
        const marks: { from: number; to: number; value: Decoration }[] = [];
        e.value.matches.forEach((m, i) => {
          const isCurrent = i === e.value.current - 1;
          marks.push({
            from: m.from, to: m.to,
            value: Decoration.mark({ class: isCurrent ? "cm-search-current" : "cm-search-match" }),
          });
        });
        updated = updated.update({ add: marks });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---- 智能滚底插件 ---- */

class ScrollTracker implements PluginValue {
  private atBottom = true;

  constructor(view: EditorView) {
    view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      this.atBottom = dom.scrollHeight - dom.scrollTop - dom.clientHeight < SCROLL_AT_BOTTOM_TOLERANCE;
    }, { passive: true });
  }

  update(update: ViewUpdate) {
    if (update.docChanged && this.atBottom) {
      const view = update.view;
      requestAnimationFrame(() => {
        const pos = view.state.doc.length;
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "end" }) });
      });
    }
  }
}

const scrollTracker = ViewPlugin.fromClass(ScrollTracker);

/* ---- 终端视图 ---- */

interface TerminalViewProps {
  isActive: boolean;
  sourceId?: string;
}

function TerminalView({ isActive, sourceId }: TerminalViewProps) {
  const { t } = useTranslation();

  // C1 修复：用 sourceId 绑定 per-tab session，而非读全局 activeSession。
  // sourceId = tab.id = session.id（MainContent 传入）。
  // session/update 响应式——底层 _sessions 变更 → listener 通知 → tick 重渲染。
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // 标签页获得焦点 → 侧栏活跃会话跟随切换
  // 对标 sidebar.tsx handleSelectSession 的反向链路：sidebar 点会话 → focusTab，
  // 这里是 tab 激活 → setActiveSessionId。两条链路对称。
  useEffect(() => {
    if (isActive && sourceId) {
      setActiveSessionId(sourceId);
    }
  }, [isActive, sourceId]);

  // 12 项收发设置——从活跃会话读取，null-safe 默认值
  const timestampFormat = activeSession?.timestampFormat ?? "HH:mm:ss:fff";
  const showEcho = activeSession?.showEcho ?? true;
  const showLineNumbers = activeSession?.showLineNumbers ?? true;
  const separateSystemLog = activeSession?.separateSystemLog ?? true;
  const lineEnding = activeSession?.lineEnding ?? "\\r\\n";
  const autoRepeat = activeSession?.autoRepeat ?? false;
  const repeatInterval = activeSession?.repeatInterval ?? 1000;
  const autoClear = activeSession?.autoClear ?? false;
  const receiveMode = activeSession?.receiveMode ?? "text";
  const receiveCoding = activeSession?.receiveCoding ?? "UTF-8";
  const sendMode = activeSession?.sendMode ?? "text";
  const sendCoding = activeSession?.sendCoding ?? "UTF-8";

  /* ---- 状态 ---- */
  const [paused, setPaused] = useState(false);
  const pausedBuffer = useRef<string[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [systemLog, setSystemLog] = useState<string[]>([]);
  // Phase 5.5c C4a：quickSends 从会话读取——per-session，不再走 ConfigurationService
  const quickSends = activeSession?.quickSends ?? { AT: "AT\r\n" };
  const [qsAdding, setQsAdding] = useState(false);
  const [qsEditing, setQsEditing] = useState<string | null>(null);
  const [qsName, setQsName] = useState("");
  const [qsContent, setQsContent] = useState("");
  const [qsCtxMenu, setQsCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);

  const saveQuickSends = useCallback((updated: Record<string, string>) => {
    // Phase 5.5c C4a：写入会话——唯一入口 QuickSendBar（§3.12 硬规则）
    // C1：updateSession 已绑定 sourceId，无需传 id 参数
    updateSession({ quickSends: updated });
  }, [updateSession]);

  const handleSaveQuickSend = () => {
    if (!qsName.trim() || !qsContent.trim()) return;
    const name = qsName.trim();
    if (qsEditing && qsEditing !== name) {
      const updated = { ...quickSends };
      delete updated[qsEditing];
      updated[name] = qsContent.trim();
      saveQuickSends(updated);
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else if (qsEditing) {
      saveQuickSends({ ...quickSends, [name]: qsContent.trim() });
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else {
      saveQuickSends({ ...quickSends, [name]: qsContent.trim() });
      appendLine(t("---- 快捷发送「{{name}}」已添加 ----", { name }), "system");
    }
    setQsName("");
    setQsContent("");
    setQsAdding(false);
    setQsEditing(null);
  };

  const handleDeleteQuickSend = (key: string) => {
    const updated = { ...quickSends };
    delete updated[key];
    saveQuickSends(updated);
    appendLine(t("---- 快捷发送「{{name}}」已删除 ----", { name: key }), "system");
    setQsCtxMenu(null);
  };

  const handleQuickSendCtxMenu = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    setQsCtxMenu({ key, x: e.clientX, y: e.clientY });
  };
  const [sendValue, setSendValue] = useState("");
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchCase, setSearchCase] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchMatchesRef = useRef<{ from: number; to: number }[]>([]);
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "protocol" | "plain">("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterPopupOpen, setFilterPopupOpen] = useState(false);
  const filterModeRef = useRef(filterMode);
  const filterKeywordRef = useRef(filterKeyword);
  filterModeRef.current = filterMode;
  filterKeywordRef.current = filterKeyword;
  const [hexWarning, setHexWarning] = useState("");
  const monacoRef = useRef<any>(null);

  /* ---- CM6 ---- */
  const cmContainer = useRef<HTMLDivElement>(null);
  const cmView = useRef<EditorView | null>(null);
  const lineNumberCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!cmContainer.current) return;
    const view = new EditorView({
      doc: "",
      extensions: [
        lineNumberCompartment.current.of(showLineNumbers ? lineNumbers() : []),
        darkTheme,
        lineDecoField,
        timestampMarkField,
        searchDecoField,
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
      setShowBackToBottom(dom.scrollHeight - dom.scrollTop - dom.clientHeight >= BACK_TO_BOTTOM_THRESHOLD);
    });

    view.dom.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    });

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 动态切换行号
  useEffect(() => {
    const view = cmView.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumberCompartment.current.reconfigure(
        showLineNumbers ? lineNumbers() : []
      ),
    });
  }, [showLineNumbers]);

  /* ---- 追加一行（带颜色） ---- */
  const appendLine = useCallback((text: string, color: "received" | "sent" | "system") => {
    if (color === "sent" && !showEcho) return;

    if (color === "system" && separateSystemLog) {
      setSystemLog((prev) => {
        const next = [...prev, text];
        if (next.length > SYSTEM_LOG_MAX_LINES) next.shift();
        return next;
      });
      return;
    }

    const view = cmView.current;
    if (!view) return;

    const doc = view.state.doc;
    const from = doc.length;
    const pre = doc.length > 0 ? "\n" : "";
    const lineStart = from + pre.length;
    const effects: any[] = [addLineDeco.of({ from: lineStart, cls: `cm-line-${color}` })];

    if (color === "received") {
      const arrowIdx = text.indexOf(" -> ");
      if (arrowIdx !== -1) {
        effects.push(addTimestampMark.of({ from: lineStart, to: lineStart + arrowIdx + 4 }));
      }
    } else if (color === "sent") {
      const dashIdx = text.indexOf(" ---- ");
      if (dashIdx !== -1) {
        effects.push(addTimestampMark.of({ from: lineStart, to: lineStart + dashIdx + 5 }));
      }
    }

    view.dispatch({ changes: { from, insert: pre + text }, effects });
    if (view.state.doc.lines > CM6_MAX_DOC_LINES) {
      const line = view.state.doc.line(CM6_TRIM_KEEP_LINES);
      view.dispatch({ changes: { from: 0, to: line.from } });
    }
  }, [timestampFormat, showEcho, separateSystemLog]);

  // C4a 迁移恢复：设置变更时打印系统消息。
  // 旧代码通过 onDidChangeConfiguration 订阅实现，C4a 切到 session 后删除。
  // 现用 prevRef 比较实现——每次提交后检查变更，对标旧行为。
  const prevSettingsRef = useRef<{
    showEcho: boolean | null; showLineNumbers: boolean | null; separateSystemLog: boolean | null;
    timestampFormat: string | null; autoRepeat: boolean | null; repeatInterval: number | null;
    cmReady: boolean;
  }>({ showEcho: null, showLineNumbers: null, separateSystemLog: null, timestampFormat: null, autoRepeat: null, repeatInterval: null, cmReady: false });

  useEffect(() => {
    if (!cmView.current) { prevSettingsRef.current.cmReady = false; return; }
    const p = prevSettingsRef.current;
    const init = !p.cmReady;
    const cmp = <T,>(prev: T | null, cur: T, msg: string) => { if (prev !== null && prev !== cur) appendLine(msg, "system"); };

    cmp(p.showEcho, showEcho, t("---- {{name}}：{{value}} ----", { name: t("消息回显"), value: showEcho ? t("开") : t("关") }));
    cmp(p.showLineNumbers, showLineNumbers, t("---- {{name}}：{{value}} ----", { name: t("行号显示"), value: showLineNumbers ? t("开") : t("关") }));
    cmp(p.separateSystemLog, separateSystemLog, t("---- {{name}}：{{value}} ----", { name: t("系统消息独立显示"), value: separateSystemLog ? t("开") : t("关") }));
    cmp(p.timestampFormat, timestampFormat, t("---- {{name}}：{{value}} ----", { name: t("时间戳"), value: timestampFormat === "无" ? t("关") : timestampFormat }));
    if (!init) {
      cmp(p.autoRepeat, autoRepeat,
        autoRepeat
          ? t("---- 定时发送：开（每 {{interval}} ms）----", { interval: repeatInterval })
          : t("---- 定时发送：关 ----"));
    }

    prevSettingsRef.current = { showEcho, showLineNumbers, separateSystemLog, timestampFormat, autoRepeat, repeatInterval, cmReady: true };
  }, [cmView, appendLine, showEcho, showLineNumbers, separateSystemLog, timestampFormat, autoRepeat, repeatInterval, t]);

  // ⚠️ 独立 RingBuffer 多消费者
  const ringBuffer = useRef(new RingBuffer<{ text: string; type: "received" | "sent" | "system" }>(RING_BUFFER_CAPACITY));
  const tsFormatRef = useRef(timestampFormat);
  tsFormatRef.current = timestampFormat;
  const portOpenRef = useRef(true);
  // C1：per-tab session 绑定——Tauri event handler 用 ref 读取当前 tab 的 session ID
  const sessionIdRef = useRef(sourceId);
  sessionIdRef.current = sourceId;

  // Phase 5e：模块级变量——Tauri event handler 在 React 渲染周期外运行，
  // 用模块变量传递最新 prefs 值，避免 useRef/闭包的任何时序问题。
  // 对标 tsFormatRef 已验证的模式：渲染时写，事件回调时读。
  _receiveMode = receiveMode;

  /** 文本转十六进制显示——Phase 5e receiveMode="hex" */
  const toHexDisplay = (text: string): string => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  };

  useTauriEvent<string>("serial-data", (payload) => {
    // C1：用当前 tab 的 session ID 判断——per-tab 绑定，非全局 activeSession
    if (!sessionIdRef.current) return;
    if (!portOpenRef.current) return;
    const fmt = tsFormatRef.current;
    const displayText = _receiveMode === "hex"
      ? toHexDisplay(payload)
      : payload;
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} -> ${displayText}` : displayText,
      type: "received",
    });
  });

  useTauriEvent<string>("serial-system", (payload) => {
    const fmt = tsFormatRef.current;
    if (/Port opened|已打开/.test(payload)) {
      portOpenRef.current = true;
      pausedBuffer.current = [];
      setPausedCount(0);
      setPaused(false);
    }
    if (/Port closed|关闭/.test(payload)) {
      portOpenRef.current = false;
      ringBuffer.current.drainAll();
    }
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} ${payload}` : payload,
      type: "system",
    });
  });

  /* ---- rAF 消费 ---- */
  useEffect(() => {
    let rafId = 0;
    const drain = () => {
      const items = ringBuffer.current.drainAll();
      for (const item of items) {
        if (!item.text || !item.text.trim()) continue;
        if (item.type !== "system") {
          const fm = filterModeRef.current;
          if (fm === "protocol" && !item.text.includes("[")) continue;
          if (fm === "plain" && item.text.includes("[")) continue;
          const kw = filterKeywordRef.current;
          if (kw && !item.text.toLowerCase().includes(kw.toLowerCase())) continue;
        }
        if (paused) {
          const wasFull = pausedBuffer.current.length >= PAUSED_BUFFER_MAX;
          pausedBuffer.current.push(item.text);
          if (pausedBuffer.current.length > PAUSED_BUFFER_MAX) pausedBuffer.current.shift();
          setPausedCount(pausedBuffer.current.length);
          if (!wasFull && pausedBuffer.current.length >= 2000) {
            appendLine(t("⚠ 暂停缓冲已满（2000 条），最早的数据已被丢弃"), "system");
          }
        } else {
          appendLine(item.text, item.type);
        }
      }
      rafId = requestAnimationFrame(drain);
    };
    rafId = requestAnimationFrame(drain);
    return () => { cancelAnimationFrame(rafId); };
  }, [appendLine, paused]);

  /* ---- 工具栏 ---- */
  const handlePause = () => {
    const wasPaused = paused;
    setPaused(!wasPaused);
    if (wasPaused) {
      const count = pausedBuffer.current.length;
      for (const text of pausedBuffer.current) appendLine(text, "received");
      pausedBuffer.current = [];
      setPausedCount(0);
      if (count > 0)
        appendLine(t("---- 继续显示：补回暂停期间的 {{count}} 条数据 ----", { count }), "system");
      else
        appendLine(t("---- 继续显示 ----"), "system");
    } else {
      appendLine(t("---- 暂停显示：界面已冻结，后台照常接收 ----"), "system");
    }
  };

  const handleClear = () => {
    const view = cmView.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length },
      effects: clearAllDecos.of(null as any),
    });
  };

  const handleExport = async () => {
    const view = cmView.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const filename = `serial-log-${Date.now()}.txt`;
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      appendLine(t("---- 日志已导出至 {{filename}} ----", { filename }), "system");
    } catch {
      const blob = new Blob([text], { type: "text/plain;charset=UTF-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  /* ---- 发送（useSendData 管道） ---- */

  const sendCtxRef = useRef<SendContext>({
    sendMode: sendMode,
    sendCoding: sendCoding,
    lineEnding: lineEnding,
    timestampFormat: timestampFormat,
  });
  // 保持 ctx ref 同步
  sendCtxRef.current = {
    sendMode: sendMode,
    sendCoding: sendCoding,
    lineEnding: lineEnding,
    timestampFormat: timestampFormat,
  };

  const recordHistory = useCallback((text: string) => {
    setSendHistory((prev) => {
      const filtered = prev.filter((h) => h !== text);
      return [text, ...filtered].slice(0, SEND_HISTORY_MAX);
    });
  }, []);

  const sendCallbacksRef = useRef<SendCallbacks>({
    onEcho: (text: string) => appendLine(text, "sent"),
    onHistory: recordHistory,
    onError: (msg: string) => appendLine(msg, "system"),
  });
  sendCallbacksRef.current = {
    onEcho: (text: string) => appendLine(text, "sent"),
    onHistory: recordHistory,
    onError: (msg: string) => appendLine(msg, "system"),
  };

  const { performSend } = useSendData(sendCtxRef, sendCallbacksRef);

  /* ---- HEX 自动格式化 ---- */
  const autoFormatHex = useCallback((raw: string): { formatted: string; warning: string } => {
    const valid = raw.replace(/[^A-Fa-f0-9 ]/g, "");
    const invalid = raw.split("").filter((c) => !/[A-Fa-f0-9 ]/.test(c) && c !== "");

    const hex = valid.replace(/\s/g, "").toUpperCase();
    let formatted = "";
    for (let i = 0; i < hex.length; i++) {
      if (i > 0 && i % 2 === 0) formatted += " ";
      formatted += hex[i];
    }

    const warning = invalid.length > 0
      ? t("⚠ HEX 输入包含无效字符: {{chars}}", { chars: [...new Set(invalid)].slice(0, HEX_WARNING_MAX_CHARS).join(" ") })
      : "";

    return { formatted, warning };
  }, []);

  const handleSend = useCallback(async () => {
    if (!sendValue.trim()) return;
    await performSend(sendValue.trim(), { showHexPreview: true });
    if (autoClear) setSendValue("");
  }, [sendValue, performSend, autoClear]);

  const prevHexWarningRef = useRef("");
  const handleSendChange = useCallback((v: string | undefined) => {
    const raw = v ?? "";
    if (sendMode === "hex") {
      const { formatted, warning } = autoFormatHex(raw);
      setSendValue(formatted);
      setHexWarning(warning);
      if (warning && warning !== prevHexWarningRef.current) {
        appendLine(warning, "system");
      }
      prevHexWarningRef.current = warning;
    } else {
      setSendValue(raw);
      setHexWarning("");
      prevHexWarningRef.current = "";
    }
  }, [sendMode, autoFormatHex, appendLine]);

  const handleQuickSend = async (text: string) => {
    await performSend(text, { ending: "\r\n", prefix: "> " });
  };

  const handleHistorySelect = (text: string) => {
    setSendValue(text);
    setShowHistory(false);
    monacoRef.current?.focus();
  };

  /* ---- 定时发送 ---- */
  const sendValueRef = useRef(sendValue);
  sendValueRef.current = sendValue;

  useEffect(() => {
    if (!autoRepeat || repeatInterval <= 0) return;
    const timer = setInterval(async () => {
      const text = sendValueRef.current.trim();
      if (!text) return;
      await performSend(text, { silent: true, noHistory: true });
    }, repeatInterval);
    return () => clearInterval(timer);
  }, [autoRepeat, repeatInterval, performSend]);

  /* ── Phase 5b：注册终端命令真实 handler（覆盖 loader 的 placeholder）── */

  // 用 ref 桥接——命令 handler 闭包需要访问最新的 cmView / paused 等
  // Phase 5.5c C4a：值 ref 从 activeSession 别名同步（替代 useConfiguration 返回值）
  const sendModeRef = useRef(sendMode);
  sendModeRef.current = sendMode;
  const showEchoRef = useRef(showEcho);
  showEchoRef.current = showEcho;
  const showLineNumbersRef = useRef(showLineNumbers);
  showLineNumbersRef.current = showLineNumbers;

  // C1：setter ref——updateSession 已绑定 sourceId，无需传 id 参数（单一入口 §3.12）
  const setSendModeRef = useRef((v: string) => {
    updateSession({ sendMode: v });
  });
  const setShowEchoRef = useRef((v: boolean) => {
    updateSession({ showEcho: v });
  });
  const setShowLineNumbersRef = useRef((v: boolean) => {
    updateSession({ showLineNumbers: v });
  });

  const terminalCmdRef = useRef<{
    cmView: typeof cmView;
    paused: boolean;
    quickSends: Record<string, string>;
    setPaused: (v: boolean | ((p: boolean) => boolean)) => void;
    setSendValue: (v: string) => void;
    setQsEditing: (key: string | null) => void;
    setQsName: (v: string) => void;
    setQsContent: (v: string) => void;
    setQsAdding: (v: boolean) => void;
    handleDeleteQuickSend: (key: string) => void;
  }>({ cmView, paused, quickSends, setPaused, setSendValue, setQsEditing, setQsName, setQsContent, setQsAdding, handleDeleteQuickSend });
  terminalCmdRef.current = { cmView, paused, quickSends, setPaused, setSendValue, setQsEditing, setQsName, setQsContent, setQsAdding, handleDeleteQuickSend };

  useEffect(() => {
    registerCommand("terminal", {
      id: "terminal.copy",
      title: "复制",
      category: "终端",
      handler: async () => {
        const view = terminalCmdRef.current.cmView.current;
        if (!view) return;
        // Bug fix：右键菜单打开时 CM6 失去焦点 → selection 不渲染 → clipboard 读不到。
        // 先 focus 恢复焦点，再读 selection。
        view.focus();
        const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        if (sel) navigator.clipboard.writeText(sel);
      },
    });
    registerCommand("terminal", {
      id: "terminal.selectAll",
      title: "全选",
      category: "终端",
      handler: async () => {
        const view = terminalCmdRef.current.cmView.current;
        if (!view) return;
        // Bug fix：右键菜单打开后 CM6 失焦 → dispatch selection 生效但不高亮。
        // 先 focus 恢复焦点，selection 高亮正常显示。
        view.focus();
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      },
    });
    registerCommand("terminal", {
      id: "terminal.clear",
      title: "清空接收区",
      category: "终端",
      handler: async () => {
        const view = terminalCmdRef.current.cmView.current;
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length },
            effects: clearAllDecos.of(null as any),
          });
        }
      },
    });
    registerCommand("terminal", {
      id: "terminal.togglePause",
      title: "暂停接收",
      category: "终端",
      handler: async () => {
        terminalCmdRef.current.setPaused((p) => !p);
      },
    });
    registerCommand("terminal", {
      id: "terminal.quickSendFill",
      title: "回填到发送区",
      category: "终端",
      handler: async (_token, ...args) => {
        const ctx = args[0] as { quickSendName?: string } | undefined;
        if (ctx?.quickSendName) {
          terminalCmdRef.current.setSendValue(terminalCmdRef.current.quickSends[ctx.quickSendName] ?? "");
        }
      },
    });
    registerCommand("terminal", {
      id: "terminal.quickSendEdit",
      title: "编辑",
      category: "终端",
      handler: async (_token, ...args) => {
        const ctx = args[0] as { quickSendName?: string } | undefined;
        if (ctx?.quickSendName) {
          const key = ctx.quickSendName;
          terminalCmdRef.current.setQsEditing(key);
          terminalCmdRef.current.setQsName(key);
          terminalCmdRef.current.setQsContent(terminalCmdRef.current.quickSends[key] ?? "");
          terminalCmdRef.current.setQsAdding(true);
        }
      },
    });
    registerCommand("terminal", {
      id: "terminal.quickSendDelete",
      title: "删除",
      category: "终端",
      handler: async (_token, ...args) => {
        const ctx = args[0] as { quickSendName?: string } | undefined;
        if (ctx?.quickSendName) {
          terminalCmdRef.current.handleDeleteQuickSend(ctx.quickSendName);
        }
      },
    });
    registerCommand("terminal", {
      id: "terminal.clearSend",
      title: "清空发送区",
      category: "终端",
      handler: async () => {
        terminalCmdRef.current.setSendValue("");
      },
    });
    registerCommand("terminal", {
      id: "terminal.exportLog",
      title: "导出日志",
      category: "终端",
      handler: async () => {
        const view = terminalCmdRef.current.cmView.current;
        if (!view) return;
        const text = view.state.doc.toString();
        const filename = `serial-log-${Date.now()}.txt`;
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
        } catch {
          // 用户取消保存——静默
        }
      },
    });
    registerCommand("terminal", {
      id: "terminal.toggleSendMode",
      title: "切换到 HEX 发送",
      category: "终端",
      handler: async () => {
        // Phase 5f：直连 ConfigurationService——通过 ref 读取/写入避免闭包过期
        setSendModeRef.current(sendModeRef.current === "hex" ? "text" : "hex");
      },
    });
    registerCommand("terminal", {
      id: "terminal.toggleEcho",
      title: "关闭消息回显",
      category: "终端",
      handler: async () => {
        setShowEchoRef.current(!showEchoRef.current);
      },
    });
    registerCommand("terminal", {
      id: "terminal.toggleLineNumbers",
      title: "隐藏行号",
      category: "终端",
      handler: async () => {
        setShowLineNumbersRef.current(!showLineNumbersRef.current);
      },
    });
  }, []);

  // 动态更新暂停/继续标题（paused 变化时重新注册）
  useEffect(() => {
    registerCommand("terminal", {
      id: "terminal.togglePause",
      title: paused ? "继续接收" : "暂停接收",
      category: "终端",
      handler: async () => {
        terminalCmdRef.current.setPaused((p) => !p);
      },
    });
  }, [paused]);

  // 动态更新发送模式标题
  useEffect(() => {
    registerCommand("terminal", {
      id: "terminal.toggleSendMode",
      title: sendMode === "hex" ? "切换到文本发送" : "切换到 HEX 发送",
      category: "终端",
      handler: async () => {
        setSendModeRef.current(sendModeRef.current === "hex" ? "text" : "hex");
      },
    });
  }, [sendMode]);

  // 动态更新回显标题
  useEffect(() => {
    registerCommand("terminal", {
      id: "terminal.toggleEcho",
      title: showEcho ? "关闭消息回显" : "开启消息回显",
      category: "终端",
      handler: async () => {
        setShowEchoRef.current(!showEchoRef.current);
      },
    });
  }, [showEcho]);

  // 动态更新行号标题
  useEffect(() => {
    registerCommand("terminal", {
      id: "terminal.toggleLineNumbers",
      title: showLineNumbers ? "隐藏行号" : "显示行号",
      category: "终端",
      handler: async () => {
        setShowLineNumbersRef.current(!showLineNumbersRef.current);
      },
    });
  }, [showLineNumbers]);

  /* ---- 搜索 ---- */
  const runSearch = useCallback((query: string, caseSensitive: boolean) => {
    const view = cmView.current;
    if (!view) return;
    if (!query) {
      view.dispatch({ effects: clearSearchDecos.of(null as any) });
      setSearchCount(0);
      setSearchIdx(0);
      searchMatchesRef.current = [];
      return;
    }
    const matches: { from: number; to: number }[] = [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cursor = new RegExpCursor(view.state.doc, escaped, { ignoreCase: !caseSensitive });
    while (!cursor.next().done) {
      matches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    searchMatchesRef.current = matches;
    const idx = matches.length > 0 ? 1 : 0;
    setSearchCount(matches.length);
    setSearchIdx(idx);
    view.dispatch({ effects: setSearchDecos.of({ matches, current: idx }) });
    if (matches.length > 0) {
      view.dispatch({
        selection: { anchor: matches[0].from, head: matches[0].to },
        effects: EditorView.scrollIntoView(matches[0].from, { y: "center" }),
      });
    }
  }, []);

  const navigateSearch = useCallback((delta: 1 | -1) => {
    const view = cmView.current;
    if (!view) return;
    const matches = searchMatchesRef.current;
    if (matches.length === 0) return;
    let newIdx = searchIdx + delta;
    if (newIdx < 1) newIdx = matches.length;
    if (newIdx > matches.length) newIdx = 1;
    setSearchIdx(newIdx);
    const m = matches[newIdx - 1];
    view.dispatch({ effects: setSearchDecos.of({ matches, current: newIdx }) });
    view.dispatch({
      selection: { anchor: m.from, head: m.to },
      effects: EditorView.scrollIntoView(m.from, { y: "center" }),
    });
  }, [searchIdx]);

  const openSearch = useCallback(() => setSearchVisible(true), []);
  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchText("");
    cmView.current?.dispatch({ effects: clearSearchDecos.of(null as any) });
    setSearchCount(0);
    setSearchIdx(0);
    searchMatchesRef.current = [];
  }, []);

  /* ---- Monaco 挂载 ---- */
  const beforeMount = useCallback((monaco: any) => {
    monaco.languages.register({ id: "v3-protocol" });
    monaco.languages.setMonarchTokensProvider("v3-protocol", v3ProtocolLanguage);
    monaco.editor.defineTheme("v3-protocol-dark", v3ProtocolTheme);
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    monacoRef.current = editor;
    editor.onKeyDown((e: any) => {
      if (e.keyCode === 3 /* Enter */) {
        if (!e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          handleSend();
        }
      }
      if (e.keyCode === 38 /* ArrowUp */) {
        const model = editor.getModel();
        if (!model) return;
        const line = model.getLineContent(1);
        if (!line.trim()) {
          e.preventDefault();
          e.stopPropagation();
          setShowHistory(true);
        }
      }
    });
  }, [handleSend]);

  // Phase 3 keep-alive: 从 display:none 变为 flex 后修复 CM6/Monaco 布局
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      cmView.current?.requestMeasure();
      monacoRef.current?.layout();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // 终端保底清空：TabBar 最后一个终端 [×] → 清空接收区
  useEffect(() => {
    const handler = () => {
      const view = cmView.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length },
        });
      }
    };
    window.addEventListener("v3-clear-terminal", handler);
    return () => window.removeEventListener("v3-clear-terminal", handler);
  }, []);

  // C4b Bug 7：无活跃会话时，终端内容 CSS 隐藏 + 占位 overlay。
  // 注意：不能 return 早期退出——CM6 的 useEffect 在 mount 时运行，如果 cmContainer
  // div 不在 DOM 中，cmView.current 永远是 null，之后创建会话也无法初始化。
  return (
    <div className="terminal-view">
      <ControlPanel sourceId={sourceId} />

      {!activeSession && (
        <div className="terminal-placeholder">
          <span className="terminal-placeholder-icon">▸</span>
          <p className="terminal-placeholder-title">{t("会话已失效")}</p>
          <p className="terminal-placeholder-hint">{t("请在侧栏选择一个终端会话，或新建一个以开始使用")}</p>
        </div>
      )}

      <div className={`terminal-body${activeSession ? "" : " hidden"}`}>

      {/* 工具栏 */}
      <div className="terminal-toolbar">
        <button className={`toolbar-btn${paused ? " active" : ""}`} onClick={handlePause} title={t("暂停接收")}>
          {paused ? "▶ " + t("继续接收") : "⏸ " + t("暂停接收")}
        </button>
        <button className="toolbar-btn" onClick={() => window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_PALETTE))} title={t("命令面板")}>
          ▸ {t("命令面板")}
        </button>
        <button className="toolbar-btn" onClick={handleExport} title={t("导出日志")}>
          {t("导出日志")}
        </button>
        <button className="toolbar-btn" onClick={handleClear} title={t("清空接收区")}>
          {t("清空接收区")}
        </button>
        <div className="filter-btn-wrapper">
          <button
            className={`toolbar-btn${(filterMode !== "all" || filterKeyword !== "") ? " active" : ""}`}
            onClick={() => {
              if (filterMode !== "all" || filterKeyword !== "") {
                setFilterMode("all");
                setFilterKeyword("");
              } else {
                setFilterPopupOpen(!filterPopupOpen);
              }
            }}
            title={filterMode !== "all" || filterKeyword !== "" ? t("点击清除筛选") : t("筛选")}
          >
            📡 {t("筛选")}
          </button>
          <FilterMenu
            open={filterPopupOpen}
            filterMode={filterMode}
            filterKeyword={filterKeyword}
            onClose={() => setFilterPopupOpen(false)}
            onModeChange={setFilterMode}
            onKeywordChange={setFilterKeyword}
          />
        </div>

        <button className={`toolbar-btn${searchVisible ? " active" : ""}`} onClick={() => searchVisible ? closeSearch() : openSearch()}>
          🔍 {t("搜索")}
        </button>
      </div>

      <SearchBar
        visible={searchVisible}
        text={searchText}
        caseSensitive={searchCase}
        matchCount={searchCount}
        matchIndex={searchIdx}
        onTextChange={(v) => { setSearchText(v); runSearch(v, searchCase); }}
        onCaseToggle={(cs) => { setSearchCase(cs); runSearch(searchText, cs); }}
        onNavigate={navigateSearch}
        onClose={closeSearch}
        onOpen={openSearch}
      />

      {/* 系统消息区 */}
      {separateSystemLog && systemLog.length > 0 && (
        <div className="system-log-area">
          {systemLog.slice(-2).map((msg, i) => (
            <div key={i} className="system-log-line">{msg}</div>
          ))}
        </div>
      )}

      {/* CM6 接收区 */}
      <div className="cm-wrapper">
        <div ref={cmContainer} className="cm-container" />
        {paused && (
          <div className="paused-banner">
            {t("⏸ 已暂停 · {{count}} 条缓冲", { count: pausedCount })}
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

      {/* Phase 5b：接收区右键菜单——共享 ContextMenu */}
      {ctxMenu && (
        <ContextMenu
          menuId={MenuId.EditorContext}
          anchor={{ x: ctxMenu.x, y: ctxMenu.y }}
          context={{}}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* 快捷发送条 */}
      <div className="quick-send-bar">
        {Object.entries(quickSends).map(([name, content]) => (
          <button
            key={name}
            className="quick-send-pill"
            onClick={() => handleQuickSend(content)}
            onContextMenu={(e) => handleQuickSendCtxMenu(name, e)}
            title={content}
          >
            {name}
          </button>
        ))}
        {qsAdding ? (
          <div className="quick-send-add-form">
            <input
              className="input qs-input"
              placeholder={t("名称")}
              value={qsName}
              onChange={(e) => setQsName(e.target.value)}
              autoFocus
            />
            <input
              className="input qs-input"
              placeholder={t("发送内容")}
              value={qsContent}
              onChange={(e) => setQsContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveQuickSend(); if (e.key === "Escape") { setQsAdding(false); setQsEditing(null); } }}
            />
            <button className="toolbar-btn" onClick={handleSaveQuickSend}>{qsEditing ? "✎" : "✓"}</button>
            <button className="toolbar-btn" onClick={() => { setQsAdding(false); setQsEditing(null); }}>✕</button>
          </div>
        ) : (
          <button className="quick-send-add" title={t("添加快捷发送")} onClick={() => setQsAdding(true)}>
            + {t("添加")}
          </button>
        )}
      </div>

      {/* Phase 5b：快捷发送右键菜单——共享 ContextMenu */}
      {qsCtxMenu && (
        <ContextMenu
          menuId={MenuId.QuickSendContext}
          anchor={{ x: qsCtxMenu.x, y: qsCtxMenu.y }}
          context={{ quickSendName: qsCtxMenu.key }}
          onClose={() => setQsCtxMenu(null)}
        />
      )}

      {/* 发送区 */}
      <div className="sender-area">
        {hexWarning && (
          <div className="hex-warning">{hexWarning}</div>
        )}
        <div className="monaco-wrapper">
          <span className="monaco-prefix">&gt;</span>
          <Editor
            height={`${Math.min(MONACO_MAX_HEIGHT, Math.max(MONACO_MIN_HEIGHT, MONACO_PADDING + MONACO_LINE_HEIGHT * (sendValue.split('\n').length)))}px`}
            language="v3-protocol"
            value={sendValue}
            onChange={handleSendChange}
            theme="v3-protocol-dark"
            beforeMount={beforeMount}
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
          <div className="history-wrapper">
            <button
              className={`toolbar-btn${showHistory ? " active" : ""}`}
              onClick={() => setShowHistory(!showHistory)}
              title={t("发送历史")}
              disabled={sendHistory.length === 0}
            >
              ▼
            </button>
            {showHistory && sendHistory.length > 0 && (
              <div className="history-dropdown">
                {sendHistory.map((h, i) => (
                  <div
                    key={i}
                    className="history-item"
                    onClick={() => handleHistorySelect(h)}
                  >
                    {h}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="toolbar-btn" onClick={() => setSendValue("")}>
            {t("清空发送区")}
          </button>
          <button className="send-btn" onClick={handleSend}>
            {t("发送")}
          </button>
        </div>
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
