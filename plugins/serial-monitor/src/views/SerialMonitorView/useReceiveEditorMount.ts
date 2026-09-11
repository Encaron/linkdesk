/**
 * 接收区 CM6 挂载——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 🔴 CM6 生命周期：本 hook 是接收区两个 EditorView（主栏 + HEX 栏）的 mount/cleanup **唯一处**——
 *    创建/销毁与组件生命周期一致；compartment 重配置（行号）也留在这里，不外传 Compartment 句柄。
 *
 * 🔴 合屏快照写入紧贴 view.destroy()（本文件 cleanup 内）——顺序不可调换。
 */

import { useEffect } from "react";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { EditorState, type Compartment } from "@codemirror/state";
import { search } from "@codemirror/search";
import { darkTheme } from "../../cm6/theme";
import { lineDecoField, timestampMarkField } from "../../cm6/decorations";
import { searchDecoField } from "../../cm6/search";
import { scrollTracker } from "../../cm6/scroll";
import { getSessionById } from "../../hooks/useSerialSessions";
import { _receiveSnapshots, snapshotCmLines } from "../../services/receiveSnapshots";
import { BACK_TO_BOTTOM_THRESHOLD } from "../../constants";

export interface ReceiveEditorMountOptions {
  sourceId?: string;
  showLineNumbers: boolean;
  cmContainer: React.MutableRefObject<HTMLDivElement | null>;
  hexContainer: React.MutableRefObject<HTMLDivElement | null>;
  cmView: React.MutableRefObject<EditorView | null>;
  hexView: React.MutableRefObject<EditorView | null>;
  lineNumberCompartment: React.MutableRefObject<Compartment>;
  hexLineNumberCompartment: React.MutableRefObject<Compartment>;
  setCtxMenu: (v: { x: number; y: number } | null) => void;
  setShowBackToBottom: (v: boolean) => void;
}

export function useReceiveEditorMount(o: ReceiveEditorMountOptions): void {
  const {
    sourceId, showLineNumbers, cmContainer, hexContainer, cmView, hexView,
    lineNumberCompartment, hexLineNumberCompartment, setCtxMenu, setShowBackToBottom,
  } = o;

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
      // 双栏任一有内容都写（hexLines 一并存档，mount 时随双栏开关恢复）。RingBuffer 快照由 useReceiveSnapshots 合并。
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
  }, [showLineNumbers, cmView, hexView, lineNumberCompartment, hexLineNumberCompartment]);
}
