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
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { RingBuffer } from "../../core/RingBuffer";
import { useTerminalPrefs, type TerminalPrefs } from "../../core/TerminalPrefsContext";
import PreferenceService from "../../core/PreferenceService";
import SearchBar from "../terminal/SearchBar";
import FilterMenu from "../terminal/FilterMenu";
import CommandPalette from "../terminal/CommandPalette";
import ReceiveContextMenu from "../terminal/ReceiveContextMenu";
import { HexToBytes } from "../../core/DataConverter";
import { v3ProtocolLanguage, v3ProtocolTheme } from "../../languages/v3-protocol";
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

/* ---- 搜索高亮装饰系统（自建，不依赖 CM6 原生 search panel） ---- */

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

/* ---- 智能滚底插件（对标 V2：追加前检查位置，追加后滚底） ---- */

class ScrollTracker implements PluginValue {
  private atBottom = true;

  constructor(view: EditorView) {
    // 用户手动滚轮/拖拽滚动条 → 记录是否在底部
    view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      this.atBottom = dom.scrollHeight - dom.scrollTop - dom.clientHeight < SCROLL_AT_BOTTOM_TOLERANCE;
    }, { passive: true });
  }

  update(update: ViewUpdate) {
    if (update.docChanged && this.atBottom) {
      const view = update.view;
      // 用 CM6 内置 scrollIntoView 滚到底（比手动 dispatch 更可靠）
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
}

function TerminalView({ isActive }: TerminalViewProps) {
  const { t } = useTranslation();
  const { prefs, setPrefs } = useTerminalPrefs();

  /* ---- 状态 ---- */
  const [paused, setPaused] = useState(false);
  const pausedBuffer = useRef<string[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [systemLog, setSystemLog] = useState<string[]>([]);
  const [quickSends, setQuickSends] = useState<Record<string, string>>(() => {
    try {
      return PreferenceService.loadPrefs().quickSends;
    } catch {
      return { AT: "AT\r\n" };
    }
  });
  const [qsAdding, setQsAdding] = useState(false);
  const [qsEditing, setQsEditing] = useState<string | null>(null); // 正在编辑的 key
  const [qsName, setQsName] = useState("");
  const [qsContent, setQsContent] = useState("");
  const [qsCtxMenu, setQsCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);

  const saveQuickSends = useCallback((updated: Record<string, string>) => {
    setQuickSends(updated);
    try {
      const prefs = PreferenceService.loadPrefs();
      prefs.quickSends = updated;
      PreferenceService.savePrefs(prefs).catch(() => {});
    } catch {
      // 静默
    }
  }, []);

  const handleSaveQuickSend = () => {
    if (!qsName.trim() || !qsContent.trim()) return;
    const name = qsName.trim();
    if (qsEditing && qsEditing !== name) {
      // 改名：删旧 key，加新 key
      const updated = { ...quickSends };
      delete updated[qsEditing];
      updated[name] = qsContent.trim();
      saveQuickSends(updated);
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else if (qsEditing) {
      // 只改内容
      saveQuickSends({ ...quickSends, [name]: qsContent.trim() });
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else {
      // 新增
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
  const [paletteOpen, setPaletteOpen] = useState(false);
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
        lineNumberCompartment.current.of(prefs.showLineNumbers ? lineNumbers() : []),
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

    // 右键菜单
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
        prefs.showLineNumbers ? lineNumbers() : []
      ),
    });
  }, [prefs.showLineNumbers]);

  /* ---- 追加一行（带颜色） ---- */
  const appendLine = useCallback((text: string, color: "received" | "sent" | "system") => {
    // 消息回显关闭时不显示发送回显
    if (color === "sent" && !prefs.showEcho) return;

    // 系统消息独立显示 → 走系统日志区，不写 CM6
    if (color === "system" && prefs.separateSystemLog) {
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

    // 时间戳前缀灰色（received: " -> " 分隔，sent/system: " ---- " 分隔）
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
  }, [prefs.timestampFormat, prefs.showEcho, prefs.separateSystemLog]);

  // 设置变更时打印系统消息（对标 V2 各 CheckBox/ComboBox Changed 事件）
  const prevPrefsRef = useRef<TerminalPrefs | null>(null);
  useEffect(() => {
    // CM6 未就绪时跳过——避免启动时误触发
    if (!cmView.current) return;
    const prev = prevPrefsRef.current;
    if (!prev) { prevPrefsRef.current = { ...prefs }; return; } // 首次跳过

    if (prev.showEcho !== prefs.showEcho)
      appendLine(t("---- {{name}}：{{value}} ----", { name: t("消息回显"), value: prefs.showEcho ? t("开") : t("关") }), "system");
    if (prev.showLineNumbers !== prefs.showLineNumbers)
      appendLine(t("---- {{name}}：{{value}} ----", { name: t("行号显示"), value: prefs.showLineNumbers ? t("开") : t("关") }), "system");
    if (prev.separateSystemLog !== prefs.separateSystemLog)
      appendLine(t("---- {{name}}：{{value}} ----", { name: t("系统消息独立显示"), value: prefs.separateSystemLog ? t("开") : t("关") }), "system");
    if (prev.timestampFormat !== prefs.timestampFormat)
      appendLine(t("---- {{name}}：{{value}} ----", { name: t("时间戳"), value: prefs.timestampFormat === "无" ? t("关") : prefs.timestampFormat }), "system");
    if (prev.autoRepeat !== prefs.autoRepeat)
      appendLine(prefs.autoRepeat
        ? t("---- 定时发送：开（每 {{interval}} ms）----", { interval: prefs.repeatInterval })
        : t("---- 定时发送：关 ----"), "system");

    prevPrefsRef.current = { ...prefs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  // ⚠️ 独立 RingBuffer 多消费者——不是 Pub/Sub。
  // 串口数据是"流"不是"事件"——每个标签页需要完整历史，不是只收订阅后的数据。
  // Phase 4 后每个 workspace 内多个卡片可能需要 Pub/Sub——升级路径在设计文档 §5.3。
  const ringBuffer = useRef(new RingBuffer<{ text: string; type: "received" | "sent" | "system" }>(RING_BUFFER_CAPACITY));
  const tsFormatRef = useRef(prefs.timestampFormat);
  tsFormatRef.current = prefs.timestampFormat;
  const portOpenRef = useRef(true); // 默认 true——串口可能在标签页创建之前就已打开

  // Tauri 事件 → RingBuffer（generation counter 在 hook 内部）
  useTauriEvent<string>("serial-data", (payload) => {
    if (!portOpenRef.current) return; // 串口已关闭，丢弃残留数据
    const fmt = tsFormatRef.current;
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} -> ${payload}` : payload,
      type: "received",
    });
  });

  useTauriEvent<string>("serial-system", (payload) => {
    const fmt = tsFormatRef.current;
    // 串口打开 → 重置暂停状态
    if (/Port opened|已打开/.test(payload)) {
      portOpenRef.current = true;
      pausedBuffer.current = [];
      setPausedCount(0);
      setPaused(false);
    }
    // 串口关闭 → 拒收后续数据 + 清空残留
    if (/Port closed|关闭/.test(payload)) {
      portOpenRef.current = false;
      ringBuffer.current.drainAll();
    }
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} ${payload}` : payload,
      type: "system",
    });
  });

  /* ---- rAF 消费（依赖 appendLine/paused，可重跑） ---- */
  useEffect(() => {
    let rafId = 0;
    const drain = () => {
      const items = ringBuffer.current.drainAll();
      for (const item of items) {
        if (!item.text || !item.text.trim()) continue; // 跳过空行
        // 协议筛选 + 实时过滤（ref 读取，不重启 rAF）
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
    // 副作用放在 setState 外面——React 18 StrictMode 会双重调用函数式更新器
    if (wasPaused) {
      // 恢复
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
      // 降级：Blob 下载
      const blob = new Blob([text], { type: "text/plain;charset=UTF-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  /* ---- 发送 ---- */
  const recordHistory = useCallback((text: string) => {
    setSendHistory((prev) => {
      // 去重：相同内容移到最前
      const filtered = prev.filter((h) => h !== text);
      return [text, ...filtered].slice(0, SEND_HISTORY_MAX);
    });
  }, []);

  /* ---- HEX 自动格式化 ---- */
  const autoFormatHex = useCallback((raw: string): { formatted: string; warning: string } => {
    // 过滤非法字符
    const valid = raw.replace(/[^A-Fa-f0-9 ]/g, "");
    const invalid = raw.split("").filter((c) => !/[A-Fa-f0-9 ]/.test(c) && c !== "");

    // 去空格后取纯 hex 字符
    const hex = valid.replace(/\s/g, "").toUpperCase();
    // 每两个字符后插空格
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

  /* ---- 统一发送逻辑（handleSend / handleQuickSend / 自动发送 共用） ---- */
  const performSend = useCallback(async (text: string, opts?: {
    ending?: string;      // 换行符（默认 prefs.lineEnding）
    prefix?: string;      // echo 前缀（快捷发送用 "> "）
    silent?: boolean;     // 失败不报错（自动发送用）
    showHexPreview?: boolean; // 第二行 HEX 预览
    noHistory?: boolean;  // 不记录发送历史
  }) => {
    if (!text.trim()) return;
    if (!opts?.noHistory) recordHistory(text.trim());
    try {
      if (prefs.sendMode === "hex") {
        const bytes = Array.from(HexToBytes(text));
        await invoke("send_data", { data: bytes });
        appendLine(`${formatTimestamp(prefs.timestampFormat)} ${t("---- 已发送 HEX 消息 ({{bytes}} 字节) ----", { bytes: bytes.length })}`, "sent");
        if (opts?.showHexPreview) {
          const preview = text.length > HEX_PREVIEW_MAX_LEN ? text.substring(0, HEX_PREVIEW_MAX_LEN) + "..." : text;
          appendLine("    " + preview, "sent");
        }
      } else {
        const ending = (opts?.ending ?? prefs.lineEnding).replace(/\\r/g, "\r").replace(/\\n/g, "\n");
        await invoke("send_text", { text: text + ending, encoding: prefs.sendCoding });
        const safeText = text.replace(/\r\n/g, "\\r\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
        const displayText = (opts?.prefix ?? "") + safeText;
        appendLine(`${formatTimestamp(prefs.timestampFormat)} ${t("---- 已发送 {{encoding}} 编码消息: \"{{text}}\" ----", { encoding: prefs.sendCoding.toLowerCase(), text: displayText })}`, "sent");
      }
    } catch (e: any) {
      if (!opts?.silent) appendLine(t("发送失败：{{error}}", { error: e?.message || String(e) }), "system");
    }
  }, [appendLine, recordHistory, prefs.sendMode, prefs.sendCoding, prefs.lineEnding, prefs.timestampFormat]);

  const handleSend = useCallback(async () => {
    if (!sendValue.trim()) return;
    await performSend(sendValue.trim(), { showHexPreview: true });
    if (prefs.autoClear) setSendValue("");
  }, [sendValue, performSend, prefs.autoClear]);

  // HEX 模式 onChange：自动格式化
  const prevHexWarningRef = useRef("");
  const handleSendChange = useCallback((v: string | undefined) => {
    const raw = v ?? "";
    if (prefs.sendMode === "hex") {
      const { formatted, warning } = autoFormatHex(raw);
      setSendValue(formatted);
      setHexWarning(warning);
      // 无效字符变化时写入系统日志
      if (warning && warning !== prevHexWarningRef.current) {
        appendLine(warning, "system");
      }
      prevHexWarningRef.current = warning;
    } else {
      setSendValue(raw);
      setHexWarning("");
      prevHexWarningRef.current = "";
    }
  }, [prefs.sendMode, autoFormatHex, appendLine]);

  const handleQuickSend = async (text: string) => {
    await performSend(text, { ending: "\r\n", prefix: "> " });
  };

  const handleHistorySelect = (text: string) => {
    setSendValue(text);
    setShowHistory(false);
    // 焦点回到 Monaco
    monacoRef.current?.focus();
  };

  /* ---- 定时发送 ---- */
  const sendValueRef = useRef(sendValue);
  sendValueRef.current = sendValue;

  useEffect(() => {
    if (!prefs.autoRepeat || prefs.repeatInterval <= 0) return;
    const timer = setInterval(async () => {
      const text = sendValueRef.current.trim();
      if (!text) return;
      await performSend(text, { silent: true, noHistory: true });
    }, prefs.repeatInterval);
    return () => clearInterval(timer);
  }, [prefs.autoRepeat, prefs.repeatInterval, performSend]);

  /* ---- 右键菜单 ---- */
  const handleCtxMenuAction = useCallback((action: string) => {
    setCtxMenu(null);
    const view = cmView.current;
    if (!view) return;
    switch (action) {
      case "copy": {
        const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        if (sel) navigator.clipboard.writeText(sel);
        break;
      }
      case "selectAll":
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        break;
      case "clear":
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length },
          effects: clearAllDecos.of(null as any),
        });
        break;
      case "pause":
        setPaused((p) => !p);
        break;
    }
  }, []);

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
    // 收集所有匹配位置
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
    // 派发搜索高亮装饰
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

  /* ---- Command Palette ---- */
  const paletteCommands = [
    { id: "clear", label: t("清空接收区"), action: handleClear },
    { id: "clearSend", label: t("清空发送区"), action: () => setSendValue("") },
    { id: "pause", label: paused ? t("继续接收") : t("暂停接收"), action: handlePause },
    { id: "export", label: t("导出日志"), action: handleExport },
    { id: "hex", label: prefs.sendMode === "hex" ? t("切换到文本发送") : t("切换到 HEX 发送"),
      action: () => setPrefs({ ...prefs, sendMode: prefs.sendMode === "hex" ? "text" : "hex" }) },
    { id: "echo", label: prefs.showEcho ? t("关闭消息回显") : t("开启消息回显"),
      action: () => setPrefs({ ...prefs, showEcho: !prefs.showEcho }) },
    { id: "lineNum", label: prefs.showLineNumbers ? t("隐藏行号") : t("显示行号"),
      action: () => setPrefs({ ...prefs, showLineNumbers: !prefs.showLineNumbers }) },
  ];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  return (
    <div className="terminal-view">
      <CommandPalette
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
      />

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

      {/* 系统消息区（对标 V2 lbSystemLog：固定 36px，独立显示开启时出现） */}
      {prefs.separateSystemLog && systemLog.length > 0 && (
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

      {/* 右键菜单 */}
      {ctxMenu && (
        <ReceiveContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          paused={paused}
          onClose={() => setCtxMenu(null)}
          onCopy={() => handleCtxMenuAction("copy")}
          onSelectAll={() => handleCtxMenuAction("selectAll")}
          onClear={() => handleCtxMenuAction("clear")}
          onTogglePause={() => handleCtxMenuAction("pause")}
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

      {/* 快捷发送右键菜单 */}
      {qsCtxMenu && (
        <>
          <div className="ctx-overlay" onClick={() => setQsCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setQsCtxMenu(null); }} />
          <div className="ctx-menu" style={{ left: qsCtxMenu.x, top: qsCtxMenu.y }}>
            <div className="ctx-item" onClick={() => { setSendValue(quickSends[qsCtxMenu.key]); setQsCtxMenu(null); }}>
              {t("回填到发送区")}
            </div>
            <div className="ctx-item" onClick={() => {
              const key = qsCtxMenu.key;
              setQsEditing(key);
              setQsName(key);
              setQsContent(quickSends[key]);
              setQsAdding(true);
              setQsCtxMenu(null);
            }}>
              {t("编辑")}
            </div>
            <div className="ctx-divider" />
            <div className="ctx-item ctx-item-danger" onClick={() => handleDeleteQuickSend(qsCtxMenu.key)}>
              {t("删除")}
            </div>
          </div>
        </>
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
