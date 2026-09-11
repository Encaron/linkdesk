/**
 * CM6 主题——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 * 颜色全走 CSS 变量，切主题自动响应。
 */

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/** 接收区（主栏 + HEX 栏共用）主题 */
export const darkTheme: Extension = EditorView.theme(
  {
    "&": { background: "var(--bg-card)", color: "var(--text-primary)" },
    ".cm-gutters": { background: "var(--bg-window)", borderRight: "1px solid var(--separator)", color: "var(--text-muted)" },
    ".cm-activeLineGutter": { background: "var(--bg-card)" },
    ".cm-activeLine": { background: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }, /* E5.8#128.8：rgba → 文字色 4% 合成 */
    ".cm-cursor": { borderLeftColor: "var(--text-primary)" },
    ".cm-selectionBackground": { background: "color-mix(in srgb, var(--accent) 30%, transparent)" }, /* E5.8#128.8：rgba 蓝 → accent 30% 合成 */
    ".cm-selectionMatch": { background: "color-mix(in srgb, var(--accent) 15%, transparent)" },
    ".cm-searchMatch": { background: "color-mix(in srgb, var(--warning) 20%, transparent)", outline: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)" },
    ".cm-line-sent": { color: "var(--sent-echo)" },
    ".cm-line-system": { color: "var(--system-log)" },
    ".cm-timestamp": { color: "var(--cm-timestamp, var(--text-muted))" },
    ".cm-search-match": { background: "color-mix(in srgb, var(--warning) 25%, transparent)" },
    ".cm-search-current": { background: "color-mix(in srgb, var(--warning) 45%, transparent)", outline: "1px solid color-mix(in srgb, var(--warning) 60%, transparent)" },
  },
  { dark: true }
);

/** 发送区专用主题——与 darkTheme 对齐，关键差异：cursor 用 borderLeft 简写
 *  确保宽度/样式/颜色齐全；不含 { dark: true } 避免 CM6 内置暗色主题注入冲突。 */
export const sendTheme: Extension = EditorView.theme({
  "&": {
    background: "var(--bg-card)",
    color: "var(--text-primary)",
  },
  ".cm-cursor, .cm-cursor-primary": {
    borderLeft: "2px solid var(--text-primary)",
    marginLeft: "-1px",
  },
  ".cm-activeLine": {
    background: "color-mix(in srgb, var(--text-primary) 4%, transparent)", /* E5.8#128.8：rgba → 文字色 4% 合成 */
  },
  ".cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 30%, transparent)", /* E5.8#128.8：rgba 蓝 → accent 30% 合成 */
  },
});
