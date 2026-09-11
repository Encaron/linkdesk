/**
 * 串口监视器常量群——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 * 缓存容量 / 模式 / 编辑器高度——跨接收区、发送栏、命令桥共享的单点真相源。
 */

export const SCROLL_AT_BOTTOM_TOLERANCE = 5;
export const BACK_TO_BOTTOM_THRESHOLD = 30;
export const SYSTEM_LOG_MAX_LINES = 50;
export const CM6_MAX_DOC_LINES = 2000;
export const CM6_TRIM_KEEP_LINES = 500;
export const RING_BUFFER_CAPACITY = 512;
export const PAUSED_BUFFER_MAX = 2000;
export const SEND_HISTORY_MAX = 20;
export const HEX_WARNING_MAX_CHARS = 5;
export const SEND_EDITOR_MAX_HEIGHT = 80;
export const SEND_EDITOR_MIN_HEIGHT = 32;
// E5.7 Bug C 补全：发送模式字面量提为常量——规避自定义 ESLint 规则
// （BinaryExpression > Literal 小写字面量全量拦截）+ 单点真相源
export const SEND_MODE_TEXT = "text";
export const SEND_MODE_HEX = "hex";
