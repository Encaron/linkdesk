/**
 * 串口监视器视图插件。
 * Phase 4 Step B3+B5：从 src/components/views/TerminalView.tsx 迁移 + 串口工具栏。
 * 串口工具栏（COM/波特率/打开关闭）+ 接收区（CM6）+ 发送栏（CM6）+ 侧栏设置。
 *
 * 设计依据：[V3-Phase4-串口监视器插件化设计.md]
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
import { useIpcEvent } from "@src/hooks/useIpcEvent";
// E5.8#28：serial 推流载荷契约化（@linkdesk/contracts，零 @src/core）——useIpcEvent 泛型窄化用
// E5.8#30.16（P8）：PoolTab——beforeClose handler 接收的标签页快照类型（契约导出，第三方插件同路径）
import type { SerialDataPayload, SerialSystemPayload, PoolTab } from "@linkdesk/contracts";
// E5.6#11.5h：RingBuffer 内联到 utils/——池插件零 @src/core 依赖
import { RingBuffer } from "./utils/RingBuffer";
// E5.8#29：端口键控过滤（S12/S13 收敛）——payload.portName 按会话口过滤，取代 portOpenRef 全局门控 + 正则挖口名
import { matchesPort } from "./utils/portFilter";
// Phase 5.5c C4a：12 项设置切到 useSerialSessions——每会话独立，侧栏写入主区读取
// E5.8#30.14（P4）：getSessionById——unmount 快照前判会话是否仍存在（会话已删则不写，防快照泄漏）
import { useSession, setActiveSessionId, getActiveSessionId, getSessionById } from "./hooks/useSerialSessions";
// E5.8#30.12（P6）：per-port TX/RX——接收区工具栏每标签页计数（状态栏全局计数已删）
// E5.8#30.16（P8）：getOpenPorts（本会话口是否开）+ closePortFromModule（关串口咽喉）——beforeClose handler 用
import { usePortStats, getOpenPorts, closePortFromModule } from "./services/SerialContext";
// E5.8#30.16（P8）：handler 非 React 环境（模块顶层注册）——用全局 i18n 实例 t()（与 useTranslation 同源）
import i18n from "i18next";
import ControlPanel from "./components/ControlPanel";
import { useSendData, formatTimestamp, type SendContext, type SendCallbacks } from "./utils/useSendData";
import SearchBar from "./components/SearchBar";
import SelectBox from "@src/components/shared/select-box/SelectBox";

// Phase 5b：统一右键菜单——串口监视器命令注册 + 共享 ContextMenu
// E5.6#11.5h：命令注册走 lk.commands（池侧 registerCommand API），MenuId 用字符串字面量
import ContextMenu from "@src/components/shared/context-menu/ContextMenu";
import "./styles/SerialMonitorView.css";

// E5.7#98：浏览器原生 File System Access API 最小面定型（TS DOM lib 未收录，实验性）——
// 替代 (window as any).showSaveFilePicker。API 缺失时返回 undefined → 调用方抛错 → catch 走 Blob 兜底。
interface SaveFilePickerHandle {
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}
type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFilePickerHandle>;
};
const _saveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker?.bind(window);

// E5#116: 右键菜单注册——模块顶层 IPC，单/多 WebView 统一通路。
// ipcRenderer.invoke → main → 壳 IpcBridgeHandler → registerMenuItems → 壳的 _menus。
// 模块顶层执行 → preload 运行在页面 JS 之前 → window.linkdesk 此时已就绪。
// 🔥 E5.6#16.7k-fix：加 label 属性。壳 IpcBridgeHandler 的 getCommands() 查不到
// 池侧 _poolCommands 的命令→title=undefined。有 label 时 ContextMenu t(item.label) 正常显示。
window.linkdesk?.menu?.registerItems?.("editorContext", "serial-monitor", [
  { command: "serial-monitor.copy", group: "clipboard", label: "复制" },
  { command: "serial-monitor.selectAll", group: "selection", label: "全选" },
  { command: "serial-monitor.clear", group: "edit", label: "清空" },
]);
window.linkdesk?.menu?.registerItems?.("quickSendContext", "serial-monitor", [
  { command: "serial-monitor.quickSendEdit", group: "edit", label: "编辑" },
  { command: "serial-monitor.quickSendDelete", group: "danger", label: "删除" },
]);

// E5.8#30.16（P8）：通用「beforeClose 可取消」通道——插件注册自己的关闭前 handler（壳重建的通用通道，非串口业务）。
// 串口逻辑：关开着串口的标签页 → 强确认「会话正在使用 {{port}}，将断开连接」（与 #30.13 P9 共用同一 key）→
// 确认后先关串口再允许关（防数据丢失）；取消则标签页/串口双保留。防循环：handler 内 closePort 走
// closePortFromModule（只关串口，不再触发关闭确认链）；防重入由壳 GroupTabBar closingRef 兜底（确认后 closePort 恰好一次）。
// plugin.json `tabBehavior.invokeBeforeClose: "close_port"` 保留作声明信号（schema 兼容，壳不再消费其命令名）。
window.linkdesk?.pool?.registerBeforeClose?.("serial-monitor", async (tab: PoolTab): Promise<boolean> => {
  const session = getSessionById(tab.sourceId ?? tab.id);
  if (!session || !session.port) return true; // 无会话/未选口——放行
  if (!getOpenPorts().has(session.port)) return true; // 本会话口没开着——放行（关标签页不影响串口）
  // 开着串口——按「关闭时提示」配置决定是否弹确认（P9 统一提示体系，默认开）
  let promptOnClose = true;
  try {
    promptOnClose = (await window.linkdesk?.configuration?.get?.("serial-monitor.confirmOnClose")) !== false;
  } catch { /* 读配置失败按默认开——宁多提示勿静默断口 */ }
  if (promptOnClose) {
    const confirmed = await window.linkdesk?.dialog?.confirm?.(
      i18n.t("会话正在使用 {{port}}，将断开连接", { port: session.port })
    );
    if (!confirmed) return false; // 取消——标签页/串口双保留
  }
  // 确认（或配置关闭提示）——关串口恰好一次，走灯写入咽喉（#30.9，归一性）
  await closePortFromModule(session.port);
  return true; // 允许关
});

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
const SEND_EDITOR_MAX_HEIGHT = 80;
const SEND_EDITOR_MIN_HEIGHT = 32;
// E5.7 Bug C 补全：发送模式字面量提为常量——规避自定义 ESLint 规则
// （BinaryExpression > Literal 小写字面量全量拦截）+ 单点真相源
const SEND_MODE_TEXT = "text";
const SEND_MODE_HEX = "hex";

// E2b #11：命令路由用 sourceId → Map 分发。
// 每个 SerialMonitorView 挂载时注册自己的 ActiveCmd，命令 handler 通过活跃 session ID 查找。
// 消灭了"最后一个 mount 的 SerialMonitorView 接收所有命令"的问题。
interface ActiveCmd {
  cmView: { current: EditorView | null };
  paused: boolean; quickSends: Record<string, string>;
  sendMode: string; showEcho: boolean; showLineNumbers: boolean; separateSystemLog: boolean; autoRepeat: boolean; autoClear: boolean;
  setPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  setSendValue: (v: string) => void;
  setSendMode: (v: string) => void;
  setShowEcho: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setSeparateSystemLog: (v: boolean) => void;
  setAutoRepeat: (v: boolean) => void;
  setAutoClear: (v: boolean) => void;
  setQsEditing: (v: string | null) => void; setQsName: (v: string) => void;
  setQsContent: (v: string) => void; setQsAdding: (v: boolean) => void;
  handleDeleteQuickSend: (key: string) => void;
}
const _cmdMap = new Map<string, ActiveCmd>();
function getActiveCmd(): ActiveCmd | null {
  const id = getActiveSessionId();
  return id ? (_cmdMap.get(id) ?? null) : null;
}

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

/* ---- E5.8#30.14（P4）：合屏迁移快照——跨组 remount 前存档，mount 后恢复 ---- */
// 方向 c（P4 拍板）：不走会话级持久化（太重）也不走跨组 keep-alive（违背 B22）。
// 只快照接收区内容（CM6 行 + RingBuffer），连接状态靠 _initOnce 自动恢复。
// 生命周期：unmount cleanup 写（会话仍在才写，会话已删不写防泄漏）→ 下次 mount 读 + 立即删。

type LineType = "received" | "sent" | "system";

/** E5.8#30.19a：接收区行——received 双形态（text=ASCII 栏 / hex=HEX 栏），sent/system 仅 text */
interface ReceiveItem {
  text: string;
  hex?: string;
  type: LineType;
}

interface ReceiveSnapshot {
  lines: { text: string; type: LineType }[];
  hexLines: { text: string; type: LineType }[];
  ring: ReceiveItem[];
}

/** key = sourceId（会话 id）。同一会话跨组移动共享——合并写入，mount 即删。 */
const _receiveSnapshots = new Map<string, ReceiveSnapshot>();

/** 提取 CM6 每行文本 + 行色——lineDecoField 行装饰的 cls（cm-line-<color>）映射回类型。 */
function snapshotCmLines(view: EditorView): { text: string; type: LineType }[] {
  const doc = view.state.doc;
  const decos = view.state.field(lineDecoField);
  const typeAt = new Map<number, LineType>();
  decos.between(0, doc.length, (from, _to, deco) => {
    const cls = deco.spec?.class as string | undefined;
    if (cls === "cm-line-received") typeAt.set(from, "received");
    else if (cls === "cm-line-sent") typeAt.set(from, "sent");
    else if (cls === "cm-line-system") typeAt.set(from, "system");
  });
  const lines: { text: string; type: LineType }[] = [];
  doc.forEachLine((line) => {
    lines.push({ text: line.text, type: typeAt.get(line.from) ?? "received" });
  });
  return lines;
}

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

/** E5.8#30.19b：不可见字符 → 可见符号（Unicode Control Pictures，␀-␟/␡/␉/␊/␍）。
 *  渲染时转义，原始数据不动（导出/过滤/快照仍走原始文本）。 */
function escapeInvisible(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code === 0x09) return "␉"; // TAB
    if (code === 0x0A) return "␊"; // LF
    if (code === 0x0D) return "␍"; // CR
    if (code === 0x7F) return "␡"; // DEL
    return String.fromCharCode(0x2400 + code); // 其余 C0 控制符
  });
}

/* ---- 串口监视器视图 ---- */

interface SerialMonitorViewProps {
  isActive: boolean;
  sourceId?: string;
}

function SerialMonitorView({ isActive, sourceId: propSourceId }: SerialMonitorViewProps) {
  const { t } = useTranslation();

  // E5#84 → E5.7#98：sourceId 单通道——pool 经 props 传入（PluginComponent sourceId）。
  // 原 IPC 优先通道（pluginRequest.handle("openSession")）随 E5.7#43 整删（preload-pool
  // 不再暴露 pluginRequest），死 no-op 代码摘除。
  const sourceId = propSourceId;

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
  // E5.8#30.19a：HEX+ASCII 双栏——接收区双 CM6 并排渲染（per-COM 记忆，随会话联动）
  const hexAsciiDualPane = activeSession?.hexAsciiDualPane ?? false;
  // E5.8#30.19b：不可见字符转义——`\n`/`\r`/`\t` 等显示为可见符号（per-COM 记忆，随会话联动）
  const escapeInvisibleChars = activeSession?.escapeInvisibleChars ?? false;

  // E5.8#30.12（P6）：per-tab TX/RX——接收区工具栏计数（本会话口，非活动口也实时）
  const { txBytes, rxBytes, isOpen: portIsOpen } = usePortStats(activeSession?.port ?? null);

  /* ---- 状态 ---- */
  const [paused, setPaused] = useState(false);
  // E5.8#30.19a：暂停缓冲存完整 ReceiveItem——恢复时 ASCII/HEX 双栏都能补齐
  const pausedBuffer = useRef<ReceiveItem[]>([]);
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
  const filterModeRef = useRef(filterMode);
  const filterKeywordRef = useRef(filterKeyword);
  filterModeRef.current = filterMode;
  filterKeywordRef.current = filterKeyword;
  const [hexWarning, setHexWarning] = useState("");
  const sendEditorRef = useRef<EditorView | null>(null);
  const sendEditorContainer = useRef<HTMLDivElement>(null);

  /* ---- CM6 ---- */
  const cmContainer = useRef<HTMLDivElement>(null);
  const cmView = useRef<EditorView | null>(null);
  const lineNumberCompartment = useRef(new Compartment());
  // E5.8#30.19a：HEX 栏 CM6——第二个 EditorView 常驻挂载（keep-alive，CSS 显隐），随主栏同步追加
  const hexContainer = useRef<HTMLDivElement>(null);
  const hexView = useRef<EditorView | null>(null);
  const hexLineNumberCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!cmContainer.current) return;
    // E5.8#30.19a：主栏 + HEX 栏共用扩展骨架（行色/时间戳/智能滚底/只读）——两栏同一 monospace 排版 → 逐行对齐
    const makeExtensions = (lineComp: Compartment) => [
      lineComp.of(showLineNumbers ? lineNumbers() : []),
      darkTheme,
      lineDecoField,
      timestampMarkField,
      scrollTracker,
      EditorState.readOnly.of(true),
      keymap.of([]),
    ];
    const view = new EditorView({
      doc: "",
      extensions: [
        ...makeExtensions(lineNumberCompartment.current),
        searchDecoField,
        search({ top: true }),
      ],
      parent: cmContainer.current,
    });
    cmView.current = view;

    // E5.8#30.19a：HEX 栏 CM6——常驻挂载（keep-alive，CSS 显隐），随主栏同步追加。无 search（搜索走主栏）。
    if (hexContainer.current) {
      const hex = new EditorView({
        doc: "",
        extensions: makeExtensions(hexLineNumberCompartment.current),
        parent: hexContainer.current,
      });
      hexView.current = hex;
      hex.dom.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      });
    }

	  // E5.5#9-fix：WebView 初始 bounds 为 0×0——CM6 mount 早于 setBounds 导致 auto-height。
	  // ResizeObserver 监听容器尺寸变化→触发 CM6 重测。也覆盖窗口缩放/分屏等 resize。
	  const ro = new ResizeObserver(() => {
	    view.requestMeasure();
	    hexView.current?.requestMeasure();
	  });
	  ro.observe(cmContainer.current);
    if (hexContainer.current) ro.observe(hexContainer.current);

	  view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      setShowBackToBottom(dom.scrollHeight - dom.scrollTop - dom.clientHeight >= BACK_TO_BOTTOM_THRESHOLD);
    });

    view.dom.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    });

    return () => {
			ro.disconnect();
      // E5.8#30.14（P4）：合屏迁移 remount 前快照 CM6 行——本 effect cleanup 先跑、view 此刻仍存活。
      // 会话已删的 tab 不写（removeSession 后不会再有该会话的 remount，写 = _receiveSnapshots 泄漏）；
      // 双栏任一有内容都写（hexLines 一并存档，mount 时随双栏开关恢复）。RingBuffer 快照由下方独立 effect 合并。
      if (sourceId && getSessionById(sourceId)) {
        const lines = snapshotCmLines(view);
        const hexLines = hexView.current ? snapshotCmLines(hexView.current) : [];
        if (lines.length > 0 || hexLines.length > 0) {
          const prev = _receiveSnapshots.get(sourceId);
          _receiveSnapshots.set(sourceId, { lines, hexLines, ring: prev?.ring ?? [] });
        }
      }
      view.destroy();
      hexView.current?.destroy();
      hexView.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 动态切换行号——主栏 + HEX 栏双 compartment 同步
  useEffect(() => {
    const exts = showLineNumbers ? lineNumbers() : [];
    cmView.current?.dispatch({ effects: lineNumberCompartment.current.reconfigure(exts) });
    hexView.current?.dispatch({ effects: hexLineNumberCompartment.current.reconfigure(exts) });
  }, [showLineNumbers]);

  /* ---- 追加一行（带颜色）——核心 CM6 写入，主栏 / HEX 栏共用（E5.8#30.19a 抽取） ---- */
  const appendToView = useCallback((view: EditorView | null, text: string, color: LineType) => {
    if (!view) return;

    const doc = view.state.doc;
    const from = doc.length;
    const pre = doc.length > 0 ? "\n" : "";
    const lineStart = from + pre.length;
    const effects = [addLineDeco.of({ from: lineStart, cls: `cm-line-${color}` })];

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
  }, []);

  /* ---- 主栏追加（带颜色）——路由：sent 回显开关 / system 独立日志 ---- */
  const appendLine = useCallback((text: string, color: LineType) => {
    if (color === "sent" && !showEcho) return;

    if (color === "system" && separateSystemLog) {
      setSystemLog((prev) => {
        const next = [...prev, text];
        if (next.length > SYSTEM_LOG_MAX_LINES) next.shift();
        return next;
      });
      return;
    }

    appendToView(cmView.current, text, color);
  }, [showEcho, separateSystemLog, appendToView]);

  /* ---- HEX 栏追加——路由与主栏一致：received 用 hex 形态，sent/system 镜像原文本（双栏逐行对齐） ---- */
  const appendHexLine = useCallback((item: ReceiveItem) => {
    if (item.type === "sent" && !showEcho) return;
    if (item.type === "system" && separateSystemLog) return; // system 行已进 React 独立日志，HEX 栏不镜像
    appendToView(hexView.current, item.hex ?? item.text, item.type);
  }, [showEcho, separateSystemLog, appendToView]);

  /* ---- 渲染一行（单栏/双栏合一）——received 按 receiveMode 选形态；双栏时同步 HEX 栏 ---- */
  /* E5.8#30.19b：转义只在渲染时应用（received 文本形态）——原始数据不动，导出/过滤/快照不受影响 */
  const renderLine = useCallback((item: ReceiveItem) => {
    if (item.type === "received" && receiveModeRef.current === SEND_MODE_HEX && item.hex != null) {
      appendLine(item.hex, item.type);
    } else {
      const text = item.type === "received" && escapeRef.current ? escapeInvisible(item.text) : item.text;
      appendLine(text, item.type);
    }
    if (dualPaneRef.current) appendHexLine(item);
  }, [appendLine, appendHexLine]);

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

  // ⚠️ 独立 RingBuffer 多消费者（E5.8#30.19a：ReceiveItem 携带 hex 形态，双栏消费）
  const ringBuffer = useRef(new RingBuffer<ReceiveItem>(RING_BUFFER_CAPACITY));
  const tsFormatRef = useRef(timestampFormat);
  tsFormatRef.current = timestampFormat;
  // E5.8#29（S13）：portOpenRef 全局门控已删除——数据接收改由 serial-data handler 的
  // matchesPort 键控过滤接管（本会话口 ∈ 匹配才收），不再需要「打开才置 true」的全局位。
  // C1：per-tab session 绑定——IPC event handler 用 ref 读取当前 tab 的 session ID
  const sessionIdRef = useRef(sourceId);
  sessionIdRef.current = sourceId;

  // E4：per-instance ref——IPC event handler 读取当前实例的接收模式。
  // 对标 tsFormatRef 已验证的模式：渲染时写，事件回调时读。
  const receiveModeRef = useRef(receiveMode);
  receiveModeRef.current = receiveMode;

  // E5.8#30.19a：双栏开关 ref——rAF 消费循环读取（渲染时写，事件/消费时读，对标 tsFormatRef 已验证模式）
  const dualPaneRef = useRef(hexAsciiDualPane);
  dualPaneRef.current = hexAsciiDualPane;
  // E5.8#30.19b：转义开关 ref——renderLine 渲染时读（渲染时转义，原始数据不动）
  const escapeRef = useRef(escapeInvisibleChars);
  escapeRef.current = escapeInvisibleChars;

  // E5：tab close / plugin uninstall → disconnect serial。
  // 已通过 tabBehavior.invokeBeforeClose 在 TabBar 层处理——确认关闭后、closeTab 前 invoke。
  // 此机制比 useEffect cleanup 更可靠（cleanup 在 unmount 时可能因 React 批处理不可靠）。

  // E5.8#30.14（P4）：mount 恢复——跨组 remount 时从 _receiveSnapshots 读回接收区历史。
  // CM6 逐行 appendLine 重放（行色 + 时间戳 mark 由 appendLine 复用运行时路径重算，零新逻辑）；
  // E5.8#30.19a：双栏开 → 同步重放 hexLines 到 HEX 栏（直接 appendToView，零新逻辑）；
  // RingBuffer 逐条 write 回填（后续 data 连续衔接）。平时无快照 → 直接 no-op。
  // deps 含 appendLine 是保险：设置变更触发重跑时快照已删 → 空 return，无害。
  useEffect(() => {
    if (!sourceId) return;
    const snap = _receiveSnapshots.get(sourceId);
    if (!snap) return;
    _receiveSnapshots.delete(sourceId);
    for (const it of snap.lines) appendLine(it.text, it.type);
    if (dualPaneRef.current && hexView.current) {
      for (const it of snap.hexLines) appendToView(hexView.current, it.text, it.type);
    }
    for (const it of snap.ring) ringBuffer.current.write(it);
  }, [sourceId, appendLine, appendToView]);

  // E5.8#30.14（P4）：unmount 快照 RingBuffer——与 CM6 快照（CM6 effect cleanup）合并为同一份。
  // React cleanup 逆序执行：本 effect 后声明 → cleanup 先跑，CM6 view 仍存活，
  // 故 CM6 cleanup 读 prev 时能合并到本 effect 已写入的 ring，两份不互相覆盖。
  useEffect(() => {
    // useRef 持有 RingBuffer 实例、从不重赋——局部引用等价于 current，且避开
    // exhaustive-deps 对「ref 值可能在 cleanup 时变化」的保守告警（DOM ref 才需防）。
    const rb = ringBuffer.current;
    return () => {
      if (!sourceId || !getSessionById(sourceId)) return;
      const ring = rb.drainAll();
      if (ring.length === 0) return;
      const prev = _receiveSnapshots.get(sourceId);
      _receiveSnapshots.set(sourceId, { lines: prev?.lines ?? [], hexLines: prev?.hexLines ?? [], ring });
    };
  }, [sourceId]);

  /** 文本转十六进制显示——Phase 5e receiveMode="hex" */
  const toHexDisplay = (text: string): string => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  };

  useIpcEvent<SerialDataPayload>("serial-data", (payload) => {
    // C1：用当前 tab 的 session ID 判断——per-tab 绑定，非全局 activeSession
    if (!sessionIdRef.current) return;
    // E5.8#29（S13）：portFilter 键控过滤取代 portOpenRef 全局门控——payload.portName 匹配本会话口才收。
    // 本会话口 = activeSession.port；无 key（旧数据/单口）→ 收（三态过滤兜底）；不匹配（他口数据）→ 滤
    if (!matchesPort(payload.portName, activeSession?.port ?? null)) return;
    const fmt = tsFormatRef.current;
    // string 容错保留——IPC 载荷运行时无编译期兜底（#22.5 兜错配，生产静默不崩）
    const text = typeof payload === "string" ? payload : payload.text;
    // E5.8#30.19a：write 时同时算 ASCII 与 HEX 双形态（形态选择移到渲染时 renderLine 做）——
    // 单栏 receiveMode 选形态 / 双栏 ASCII 栏 + HEX 栏各取所需，一条数据双栏都对齐
    const prefix = fmt !== "无" ? `${formatTimestamp(fmt)} -> ` : "";
    ringBuffer.current.write({
      text: `${prefix}${text}`,
      hex: `${prefix}${toHexDisplay(text)}`,
      type: "received",
    });
  });

  // E3j #78：缓存最后一次连接状态——断开时 port 已关、getStatus 拿不到信息
  const lastPortInfoRef = useRef<{ portName: string; baudRate: number } | null>(null);

  useIpcEvent<SerialSystemPayload>("serial-system", (payload) => {
    const fmt = tsFormatRef.current;
    // E5.8#29（S12）：删正则挖口名 hack——payload.portName 直接路由（#28 契约已带路由键）。
    // string 载荷容错保留（IPC 载荷运行时无编译期兜底）
    const msg = typeof payload === "string" ? payload : payload.message;
    const myPort = activeSession?.port || null;
    // E5.8#29：portFilter 三态过滤（无 key→收 / 不匹配→滤 / 匹配→收）——与旧 isMyPort 逻辑等价
    const isMyPort = matchesPort(payload.portName, myPort);

    if (/已打开/.test(msg)) {
      if (!isMyPort) {
        // 不是这个标签页的端口——只显示系统消息文本，不激活数据接收
        ringBuffer.current.write({
          text: fmt !== "无" ? `${formatTimestamp(fmt)} ${msg}` : msg,
          type: "system",
        });
        return;
      }
      pausedBuffer.current = [];
      setPausedCount(0);
      setPaused(false);
      // E3j #78：连接状态推到大厅 events 频道——结构化数据、消费者无需解析
      // E5.8#29：payload.portName 定向取该口（原正则解析）；无口名容错取数组第一口
      const statusFetch = payload.portName
        ? window.linkdesk?.serial?.getStatus?.(payload.portName)
        : window.linkdesk?.serial?.getStatus?.()?.then((xs) => xs[0]);
      statusFetch?.then((status) => {
        if (status) {
          lastPortInfoRef.current = { portName: status.portName ?? "", baudRate: status.baudRate ?? 0 };
          window.linkdesk?.events?.emit("serial:connected", lastPortInfoRef.current);
        }
      });
    }
    if (/关闭/.test(msg)) {
      if (!isMyPort) {
        ringBuffer.current.write({
          text: fmt !== "无" ? `${formatTimestamp(fmt)} ${msg}` : msg,
          type: "system",
        });
        return;
      }
      ringBuffer.current.drainAll();
      // E3j #78：断开用缓存的信息（端口已关无法查）
      window.linkdesk?.events?.emit("serial:disconnected", lastPortInfoRef.current ?? {});
    }
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} ${msg}` : msg,
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
          // E5.8#30.19a：整条 ReceiveItem 入缓冲——恢复时双栏都能补齐
          pausedBuffer.current.push(item);
          if (pausedBuffer.current.length > PAUSED_BUFFER_MAX) pausedBuffer.current.shift();
          setPausedCount(pausedBuffer.current.length);
          if (!wasFull && pausedBuffer.current.length >= 2000) {
            appendLine(t("⚠ 暂停缓冲已满（2000 条），最早的数据已被丢弃"), "system");
          }
        } else {
          // E5.8#30.19a：renderLine 合一——单栏按 receiveMode 选形态，双栏同步 HEX 栏
          renderLine(item);
        }
      }
      rafId = requestAnimationFrame(drain);
    };
    rafId = requestAnimationFrame(drain);
    return () => { cancelAnimationFrame(rafId); };
  }, [renderLine, appendLine, paused, t]);

  /* ---- 工具栏 ---- */
  const handlePause = () => {
    const wasPaused = paused;
    setPaused(!wasPaused);
    if (wasPaused) {
      const count = pausedBuffer.current.length;
      // E5.8#30.19a：恢复走 renderLine——单栏形态选择 + 双栏同步一致
      for (const item of pausedBuffer.current) renderLine(item);
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
    // E5.8#30.19a：主栏 + HEX 栏同步清空（双栏保持逐行对齐，任一边残留都会错位）
    for (const view of [cmView.current, hexView.current]) {
      if (!view) continue;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length },
        effects: clearAllDecos.of(undefined),
      });
    }
  };

  const handleExport = async () => {
    const view = cmView.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const filename = `serial-log-${Date.now()}.txt`;
    try {
      const handle = await _saveFilePicker?.({
        suggestedName: filename,
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
      });
      if (!handle) throw new Error("File System Access API 不可用");
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
    port: activeSession?.port ?? "",
  });
  // 保持 ctx ref 同步
  sendCtxRef.current = {
    sendMode: sendMode,
    sendCoding: sendCoding,
    lineEnding: lineEnding,
    timestampFormat: timestampFormat,
    // E5.8#29：会话口——发送定向本标签页的口（多口下各会话各发各的）
    port: activeSession?.port ?? "",
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
  }, [t]);

  /* ---- 发送区 CM6 ref 桥接——避免 updateListener 闭包过期 ---- */
  const sendModeRef = useRef(sendMode);
  sendModeRef.current = sendMode;
  const appendLineRef = useRef(appendLine);
  appendLineRef.current = appendLine;
  const autoFormatHexRef = useRef(autoFormatHex);
  autoFormatHexRef.current = autoFormatHex;
  const prevHexWarningRef = useRef("");
  const hexFormattingRef = useRef(false);

  // G7 改进：从 CM6 editor 直接读取，避免 state 延迟导致读到旧值
  const handleSend = useCallback(async () => {
    const text = (sendEditorRef.current?.state.doc.toString() ?? "").trim();
    if (!text) return;
    await performSend(text, { showHexPreview: true });
    if (autoClear) {
      sendEditorRef.current?.dispatch({
        changes: { from: 0, to: sendEditorRef.current.state.doc.length, insert: "" },
      });
    }
  }, [performSend, autoClear]);

  /** 外部更新发送区文本（清空按钮、历史选择、命令系统）——同步 state + CM6 */
  const updateSendValue = useCallback((text: string) => {
    setSendValue(text);
    const editor = sendEditorRef.current;
    if (editor) {
      const cur = editor.state.doc.toString();
      if (cur !== text) {
        hexFormattingRef.current = true; // 跳过 updateListener 重复处理
        editor.dispatch({ changes: { from: 0, to: cur.length, insert: text } });
        hexFormattingRef.current = false;
      }
    }
  }, []);

  const handleQuickSend = async (text: string) => {
    await performSend(text, { ending: "\r\n", prefix: "> " });
  };

  const handleHistorySelect = (text: string) => {
    updateSendValue(text);
    setShowHistory(false);
    sendEditorRef.current?.focus();
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

  // E2b #11：按 sourceId 注册到 _cmdMap——不依赖 isActive 竞态
  if (sourceId) {
    _cmdMap.set(sourceId, {
      cmView, paused, quickSends,
      sendMode, showEcho, showLineNumbers, separateSystemLog, autoRepeat, autoClear,
      setPaused, setSendValue: updateSendValue,
      setSendMode: (v: string) => { updateSession({ sendMode: v }); },
      setShowEcho: (v: boolean) => { updateSession({ showEcho: v }); },
      setShowLineNumbers: (v: boolean) => { updateSession({ showLineNumbers: v }); },
      setSeparateSystemLog: (v: boolean) => { updateSession({ separateSystemLog: v }); },
      setAutoRepeat: (v: boolean) => { updateSession({ autoRepeat: v }); },
      setAutoClear: (v: boolean) => { updateSession({ autoClear: v }); },
      setQsEditing, setQsName, setQsContent, setQsAdding,
      handleDeleteQuickSend,
    });
  }

  // E5#64：handler 注册——不依赖 sourceId（portOpenRef 已随 #29 删除，闭包经 useIpcEvent 的 callbackRef 拿最新 activeSession）
  useEffect(() => {
    // E5#64 → E5.7#98：invokeBeforeClose 否决回路随 E5.7#43 停用（requestToPlugin 链已删，
    // preload-pool 不再暴露 pluginRequest）——原 api.handle 注册是死 no-op，摘除。
    // 恢复时走未来池侧 requests 命名空间任务（viewRegistry.ts:79 同注）。
    // E5#74e test: p2p 组件级测试——收到就写 CM6
    const p2p = window.linkdesk?.p2p;
    if (p2p) {
      p2p.on("test-p2p", (d) => {
        // E5.7#99：appendLineRef 桥——appendLine 入 deps 会重复注册 p2p.on（API 无 unsubscribe）
        appendLineRef.current(`[P2P-TEST] ${JSON.stringify(d)}`, "system");
      });
    }
  }, []);

  // E2b #11：卸载时从 _cmdMap 清理——防止 sourceId 复用时的残留
  useEffect(() => {
    return () => {
      if (sourceId) _cmdMap.delete(sourceId);
    };
  }, [sourceId]);

  useEffect(() => {
    const lk = window.linkdesk;
    const reg = lk?.commands?.registerCommand;
    if (!reg) return;

    // E5.7 Bug C 补全：meta 恢复 E5.6 语义——title/category 同步壳注册表（命令面板/右键菜单
    // 显示 i18n 标题），toggle 命令的最终动态标题由下方 per-state effect 重注册覆盖。
    const cat = t("串口监视器");

    // E3j #79：发送能力——工作台卡片等插件通过命令系统发数据到串口。
    // when:"false" = 纯程序化命令——不进命令面板，仅供插件 API 调用（E5.6 同款）。
    reg("serial-monitor.send", async (sendMode: "text" | "hex", data: string, portName?: string) => {
      if (!data) return;
      const s = lk?.serial;
      if (!s) return;
      // E5.8#30.8（P2）：显式传口——程序化命令调用方可传第三参定向指定口；
      // 不传走 D2 缺省唯一口语义（兼容旧调用方/工作台卡片无口上下文场景）
      if (sendMode === SEND_MODE_HEX) {
        const bytes = data.split(/[\s,]+/).filter(Boolean).map((h: string) => parseInt(h, 16));
        await s.sendData(bytes, portName);
      } else {
        await s.sendText(data, "utf-8", portName);
      }
    }, { title: t("发送"), category: cat, when: "false" });
    reg("serial-monitor.copy", async () => {
      const view = getActiveCmd()!.cmView.current;
      if (!view) return;
      view.focus();
      const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
      if (sel) navigator.clipboard.writeText(sel);
    }, { title: t("复制"), category: cat });
    reg("serial-monitor.selectAll", async () => {
      const view = getActiveCmd()!.cmView.current;
      if (!view) return;
      view.focus();
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    }, { title: t("全选"), category: cat });
    reg("serial-monitor.clear", async () => {
      const view = getActiveCmd()!.cmView.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length },
          effects: clearAllDecos.of(undefined),
        });
      }
    }, { title: t("清空接收区"), category: cat });
    reg("serial-monitor.togglePause", async () => {
      getActiveCmd()!.setPaused((p) => !p);
    }, { title: t("暂停接收"), category: cat });
    reg("serial-monitor.quickSendFill", async (...args) => {
      const ctx = args[0] as { quickSendName?: string } | undefined;
      if (ctx?.quickSendName) {
        getActiveCmd()!.setSendValue(getActiveCmd()!.quickSends[ctx.quickSendName] ?? "");
      }
    }, { title: t("回填到发送区"), category: cat });
    reg("serial-monitor.quickSendEdit", async (...args) => {
      const ctx = args[0] as { quickSendName?: string } | undefined;
      if (ctx?.quickSendName) {
        const key = ctx.quickSendName;
        getActiveCmd()!.setQsEditing(key);
        getActiveCmd()!.setQsName(key);
        getActiveCmd()!.setQsContent(getActiveCmd()!.quickSends[key] ?? "");
        getActiveCmd()!.setQsAdding(true);
      }
    }, { title: t("编辑"), category: cat });
    reg("serial-monitor.quickSendDelete", async (...args) => {
      const ctx = args[0] as { quickSendName?: string } | undefined;
      if (ctx?.quickSendName) {
        getActiveCmd()!.handleDeleteQuickSend(ctx.quickSendName);
      }
    }, { title: t("删除"), category: cat });
    reg("serial-monitor.clearSend", async () => {
      getActiveCmd()!.setSendValue("");
    }, { title: t("清空发送区"), category: cat });
    reg("serial-monitor.exportLog", async () => {
      const view = getActiveCmd()!.cmView.current;
      if (!view) return;
      const text = view.state.doc.toString();
      const filename = `serial-log-${Date.now()}.txt`;
      try {
        const handle = await _saveFilePicker?.({
          suggestedName: filename,
          types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
        });
        if (!handle) throw new Error("File System Access API 不可用");
const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      } catch {
        // 用户取消保存——静默
      }
    }, { title: t("导出日志"), category: cat });
    reg("serial-monitor.toggleSendMode", async () => {
      getActiveCmd()!.setSendMode(getActiveCmd()!.sendMode === SEND_MODE_HEX ? SEND_MODE_TEXT : SEND_MODE_HEX);
    }, { title: t("切换到 HEX 发送"), category: cat });
    reg("serial-monitor.toggleEcho", async () => {
      getActiveCmd()!.setShowEcho(!getActiveCmd()!.showEcho);
    }, { title: t("关闭消息回显"), category: cat });
    reg("serial-monitor.toggleLineNumbers", async () => {
      getActiveCmd()!.setShowLineNumbers(!getActiveCmd()!.showLineNumbers);
    }, { title: t("隐藏行号"), category: cat });
    reg("serial-monitor.toggleSystemLog", async () => {
      getActiveCmd()!.setSeparateSystemLog(!getActiveCmd()!.separateSystemLog);
    }, { title: t("关闭系统消息独立显示"), category: cat });
    reg("serial-monitor.toggleAutoRepeat", async () => {
      getActiveCmd()!.setAutoRepeat(!getActiveCmd()!.autoRepeat);
    }, { title: t("关闭自动重发"), category: cat });
    reg("serial-monitor.toggleAutoClear", async () => {
      getActiveCmd()!.setAutoClear(!getActiveCmd()!.autoClear);
    }, { title: t("关闭自动清屏"), category: cat });

    // #36k2：最后一个串口监视器标签页关闭时清理命令注册
    return () => {
      if (_cmdMap.size <= 1) {
        lk?.commands?.unregisterCommands?.("serial-monitor");
      }
    };
  }, [t]);

  // E5.7 Bug C 补全：meta 恢复 E5.6 动态标题语义——registerCommand(id, handler, meta)
  // 重注册覆盖壳注册表 title，命令面板标题随状态翻转（暂停/继续、开启/关闭）。
  // handler 重注册保留：状态变化后闭包仍经 getActiveCmd() 现取，无过期闭包风险。
  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.togglePause",
      async () => {
        getActiveCmd()!.setPaused((p) => !p);
      },
      { title: paused ? t("继续接收") : t("暂停接收"), category: t("串口监视器") },
    );
  }, [paused, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleSendMode",
      async () => {
        getActiveCmd()!.setSendMode(getActiveCmd()!.sendMode === SEND_MODE_HEX ? SEND_MODE_TEXT : SEND_MODE_HEX);
      },
      { title: sendMode === SEND_MODE_HEX ? t("切换到文本发送") : t("切换到 HEX 发送"), category: t("串口监视器") },
    );
  }, [sendMode, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleEcho",
      async () => {
        getActiveCmd()!.setShowEcho(!getActiveCmd()!.showEcho);
      },
      { title: showEcho ? t("关闭消息回显") : t("开启消息回显"), category: t("串口监视器") },
    );
  }, [showEcho, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleLineNumbers",
      async () => {
        getActiveCmd()!.setShowLineNumbers(!getActiveCmd()!.showLineNumbers);
      },
      { title: showLineNumbers ? t("隐藏行号") : t("显示行号"), category: t("串口监视器") },
    );
  }, [showLineNumbers, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleSystemLog",
      async () => {
        getActiveCmd()!.setSeparateSystemLog(!getActiveCmd()!.separateSystemLog);
      },
      { title: separateSystemLog ? t("关闭系统消息独立显示") : t("开启系统消息独立显示"), category: t("串口监视器") },
    );
  }, [separateSystemLog, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleAutoRepeat",
      async () => {
        getActiveCmd()!.setAutoRepeat(!getActiveCmd()!.autoRepeat);
      },
      { title: autoRepeat ? t("关闭自动重发") : t("开启自动重发"), category: t("串口监视器") },
    );
  }, [autoRepeat, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleAutoClear",
      async () => {
        getActiveCmd()!.setAutoClear(!getActiveCmd()!.autoClear);
      },
      { title: autoClear ? t("关闭自动清屏") : t("开启自动清屏"), category: t("串口监视器") },
    );
  }, [autoClear, t]);

  /* ---- 搜索 ---- */
  const runSearch = useCallback((query: string, caseSensitive: boolean) => {
    const view = cmView.current;
    if (!view) return;
    if (!query) {
      view.dispatch({ effects: clearSearchDecos.of(undefined) });
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
    cmView.current?.dispatch({ effects: clearSearchDecos.of(undefined) });
    setSearchCount(0);
    setSearchIdx(0);
    searchMatchesRef.current = [];
  }, []);

  /* ---- CM6 发送编辑器 ---- */
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    if (!sendEditorContainer.current) return;

    const sendKeymap = keymap.of([
      {
        key: "Enter",
        preventDefault: true,
        run: () => {
          // preventDefault 阻止插入换行 → handleSend 从 editor doc 读取文本发送
          handleSendRef.current();
          return true;
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          const line = view.state.doc.line(1);
          if (!line.text.trim()) {
            setShowHistory(true);
            return true;
          }
          return false;
        },
      },
    ]);

    const sendUpdateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (hexFormattingRef.current) return; // 格式化事务→跳过

      const newValue = update.state.doc.toString();

      if (sendModeRef.current === SEND_MODE_HEX) {
        const { formatted, warning } = autoFormatHexRef.current(newValue);
        if (warning && warning !== prevHexWarningRef.current) {
          appendLineRef.current(warning, "system");
        }
        prevHexWarningRef.current = warning;
        setHexWarning(warning);

        if (formatted !== newValue) {
          hexFormattingRef.current = true;
          update.view.dispatch({
            changes: { from: 0, to: update.state.doc.length, insert: formatted },
          });
          hexFormattingRef.current = false;
          return;
        }
      } else {
        setHexWarning("");
        prevHexWarningRef.current = "";
      }
      setSendValue(newValue);
    });

    // 发送区专用主题——与 darkTheme 对齐，关键差异：cursor 用 borderLeft 简写
    // 确保宽度/样式/颜色齐全；不含 { dark: true } 避免 CM6 内置暗色主题注入冲突。
    const sendTheme = EditorView.theme({
      "&": {
        background: "var(--bg-card)",
        color: "var(--text-primary)",
      },
      ".cm-cursor, .cm-cursor-primary": {
        borderLeft: "2px solid var(--text-primary)",
        marginLeft: "-1px",
      },
      ".cm-activeLine": {
        background: "rgba(255,255,255,0.04)",
      },
      ".cm-selectionBackground": {
        background: "rgba(0,120,212,0.3)",
      },
    });

    const view = new EditorView({
      doc: sendValue,
      extensions: [
        sendTheme,
        sendKeymap,
        sendUpdateListener,
        EditorView.updateListener.of((update) => {
          // 自动调节高度
          if (update.docChanged || update.viewportChanged) {
            const ch = update.view.contentHeight;
            const h = Math.min(SEND_EDITOR_MAX_HEIGHT, Math.max(SEND_EDITOR_MIN_HEIGHT, ch));
            if (sendEditorContainer.current) {
              sendEditorContainer.current.style.height = `${h}px`;
            }
          }
        }),
      ],
      parent: sendEditorContainer.current,
    });

    sendEditorRef.current = view;

    // 自动调节初始高度
    requestAnimationFrame(() => {
      view.requestMeasure();
    });

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 3 keep-alive: 从 display:none 变为 flex 后修复 CM6 布局
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      cmView.current?.requestMeasure();
      sendEditorRef.current?.requestMeasure();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // C4b Bug 7：无活跃会话时，串口监视器内容 CSS 隐藏 + 占位 overlay。
  // 注意：不能 return 早期退出——CM6 的 useEffect 在 mount 时运行，如果 cmContainer
  // div 不在 DOM 中，cmView.current 永远是 null，之后创建会话也无法初始化。
  return (
    <div className="serial-monitor-view">
      <ControlPanel sourceId={sourceId} />

      {!activeSession && (
        <div className="serial-monitor-placeholder">
          <span className="codicon codicon-info serial-monitor-placeholder-icon" />
          <p className="serial-monitor-placeholder-title">{t("会话已失效")}</p>
          <p className="serial-monitor-placeholder-hint">{t("请在侧栏选择一个串口监视器会话，或新建一个以开始使用")}</p>
        </div>
      )}

      <div className={`serial-monitor-body${activeSession ? "" : " hidden"}`}>

      {/* 工具栏 */}
      <div className="serial-monitor-toolbar">
        <button className={`toolbar-btn${paused ? " active" : ""}`} onClick={handlePause} title={t("暂停接收")}>
          <span className={`codicon ${paused ? "codicon-debug-start" : "codicon-debug-pause"}`} />
          {paused ? t("继续接收") : t("暂停接收")}
        </button>

        <button className="toolbar-btn" onClick={handleExport} title={t("导出日志")}>
          <span className="codicon codicon-export" />
          {t("导出日志")}
        </button>
        <button className="toolbar-btn" onClick={handleClear} title={t("清空接收区")}>
          <span className="codicon codicon-clear-all" />
          {t("清空接收区")}
        </button>
        <SelectBox
          value={filterMode}
          options={[
            { value: "all", label: t("全部") },
            { value: "protocol", label: t("仅协议消息") },
            { value: "plain", label: t("仅普通文本") },
          ]}
          onChange={(v) => setFilterMode(v as "all" | "protocol" | "plain")}
        />
        <input
          className="input filter-keyword-input"
          placeholder={t("关键字过滤…")}
          value={filterKeyword}
          onChange={(e) => setFilterKeyword(e.target.value)}
          style={{ width: 110 }}
        />

        <button className={`toolbar-btn${searchVisible ? " active" : ""}`} onClick={() => searchVisible ? closeSearch() : openSearch()}>
          <span className="codicon codicon-search" />
          {t("搜索")}
        </button>

        {/* E5.8#30.12（P6）：per-tab TX/RX 计数——归位接收区工具栏（状态栏已删全局计数） */}
        <span className={`receive-stats${portIsOpen ? "" : " muted"}`}>
          {portIsOpen ? `TX:${txBytes}  RX:${rxBytes}` : "TX:--  RX:--"}
        </span>
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

      {/* CM6 接收区——E5.8#30.19a：双栏开关 → 并排 HEX/ASCII 两栏（.cm-pane 常驻挂载，CSS 显隐） */}
      <div className={`cm-wrapper${hexAsciiDualPane ? " dual" : ""}`}>
        <div className="cm-pane">
          <div ref={cmContainer} className="cm-container" />
        </div>
        <div className="cm-pane cm-hex-pane">
          <div ref={hexContainer} className="cm-container" />
        </div>
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
          menuId={"editorContext"}
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
            <button className="toolbar-btn" onClick={handleSaveQuickSend}>{qsEditing ? <span className="codicon codicon-edit" /> : <span className="codicon codicon-check" />}</button>
            <button className="toolbar-btn" onClick={() => { setQsAdding(false); setQsEditing(null); }}><span className="codicon codicon-close" /></button>
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
          menuId={"quickSendContext"}
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
        <div className="send-editor-wrapper">
          <span className="send-editor-prefix">→</span>
          <div ref={sendEditorContainer} className="send-editor-cm" />
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
          <button className="toolbar-btn" onClick={() => updateSendValue("")}>
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

export default SerialMonitorView;
