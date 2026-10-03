/**
 * 只读文本展示件（M4 `AI#38.12` · P-2 拍板 A）——**通用原语**，与 Toggle/SelectBox 同层级
 * （`@linkdesk/ui` 单实例供给，任何插件可 import）。
 *
 * 用途一（原有）：设置页 `renderHint: "readonly"` 的状态行 · 多行只读明细（如 AI 接入的开放范围）。
 * 用途二（本案 3.2 升级）：**状态行值活起来**——声明 `statusCommand` 即进入轮询模式，
 * 值来自运行时命令而不是静态 prop（原设置插件本地件 `ReadOnlyStatus` 整件退场，行为上移到这里）。
 *
 * 🔴 就是文字——不做可点、不做悬停花活（用户拍板「控件形态尽量基础」）。升级只加"值从哪来"，
 * 不加任何交互面。
 *
 * 值来源优先级：`statusCommand` 存在 ⇒ **轮询值优先**（`value` 被取代；未读到之前不渲染，
 * 不拿静态值冒充实时读数）；否则用 `value`。（执行句柄 `runCommand` 由使用方注入——
 * 共享件不引宿主内核。）
 */
import { useStatusPolling, type RunStatusCommand } from "./useStatusPolling";
import "./ReadOnlyText.css";

interface ReadOnlyTextProps {
  /** 展示文本（多行用 \n 分隔）；声明 `statusCommand` 时被轮询值取代 */
  value?: string;
  /** true = 多行块（明细清单；pre-wrap 保留换行）；缺省 = 单行（状态值，等宽字体） */
  multiline?: boolean;
  /** 轮询的命令 id——存在即进入轮询模式（值来自命令，不来自配置存储/静态 prop） */
  statusCommand?: string;
  /** 命令执行句柄（使用方注入，如 `window.linkdesk.commands.executeCommand`） */
  runCommand?: RunStatusCommand;
  /** 轮询间隔（毫秒），缺省 3000；仅 `statusCommand` 存在时生效 */
  intervalMs?: number;
}

function ReadOnlyText({ value, multiline, statusCommand, runCommand, intervalMs }: ReadOnlyTextProps) {
  // hooks 必须无条件调用：未声明 statusCommand 时传 undefined ⇒ 内部不建表、直接返回 null
  const polled = useStatusPolling(statusCommand, runCommand, intervalMs);
  const text = statusCommand ? polled : value;
  if (!text) return null; // 空值不占位（数据源还没就绪 / 命令读不到时的缺省形态）
  // 轮询值含换行 ⇒ 自动多行（照抄原 ReadOnlyStatus 行为；静态值的多行仍由调用方显式声明，行为不变）
  const isMultiline = multiline || (!!statusCommand && text.includes("\n"));
  return <span className={`ldk-readonly-text${isMultiline ? " multiline" : ""}`}>{text}</span>;
}

export default ReadOnlyText;
