/**
 * useSendData — 发送管道 hook。
 * Phase 4 Step B7：从 TerminalView.performSend 提取。
 * 解码 → 编码 → invoke → 回显 → 历史，五步独立管道。
 * onEcho / onHistory / onError 由调用方注入——终端和卡片共用同一份发送逻辑。
 *
 * 设计依据：[[phase4-design-decisions]] 第 10 条。
 */

import { useCallback } from "react";
// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => window.linkdesk;
import { HexToBytes } from "../pipeline/DataConverter";

/* ── 类型 ── */

export interface SendOptions {
  /** 换行符（默认 "\\r\\n"） */
  ending?: string;
  /** echo 前缀（快捷发送用 "> "） */
  prefix?: string;
  /** 失败不报错（自动发送用） */
  silent?: boolean;
  /** 第二行 HEX 预览 */
  showHexPreview?: boolean;
  /** 不记录发送历史 */
  noHistory?: boolean;
}

export interface SendContext {
  /** 发送模式 */
  sendMode: "text" | "hex";
  /** 发送编码 */
  sendCoding: string;
  /** 换行符 */
  lineEnding: string;
  /** 时间戳格式 */
  timestampFormat: string;
}

export interface SendCallbacks {
  /** 回显——发送成功后追加到接收区。color = "sent" */
  onEcho: (text: string) => void;
  /** 记录发送历史 */
  onHistory: (text: string) => void;
  /** 发送失败 */
  onError: (message: string) => void;
}

const HEX_PREVIEW_MAX_LEN = 80;

export function formatTimestamp(format: string): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const fff = String(d.getMilliseconds()).padStart(3, "0");
  if (format === "HH:mm:ss:fff") return `${hh}:${mm}:${ss}:${fff}`;
  return `${hh}:${mm}:${ss}`;
}

/**
 * 创建 sendData 函数——一次调用完成"编码→invoke→回显→历史"全链路。
 * 返回稳定的 performSend 引用（ctx/callbacks 通过 ref 读取，不触发重渲染）。
 */
export function useSendData(
  ctxRef: React.MutableRefObject<SendContext>,
  callbacksRef: React.MutableRefObject<SendCallbacks>,
) {
  const performSend = useCallback(async (text: string, opts?: SendOptions) => {
    if (!text.trim()) return;

    const ctx = ctxRef.current;
    const cb = callbacksRef.current;

    if (!opts?.noHistory) {
      cb.onHistory(text.trim());
    }

    try {
      if (ctx.sendMode === "hex") {
        const bytes = Array.from(HexToBytes(text));
        await linkdesk().serial.sendData(bytes);
        cb.onEcho(
          `${formatTimestamp(ctx.timestampFormat)} ---- 已发送 HEX 消息 (${bytes.length} 字节) ----`
        );
        if (opts?.showHexPreview) {
          const preview = text.length > HEX_PREVIEW_MAX_LEN
            ? text.substring(0, HEX_PREVIEW_MAX_LEN) + "..."
            : text;
          cb.onEcho("    " + preview);
        }
      } else {
        const ending = (opts?.ending ?? ctx.lineEnding)
          .replace(/\\r/g, "\r")
          .replace(/\\n/g, "\n");
        await linkdesk().serial.sendText(text + ending, ctx.sendCoding);
        const safeText = text
          .replace(/\r\n/g, "\\r\\n")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");
        const displayText = (opts?.prefix ?? "") + safeText;
        cb.onEcho(
          `${formatTimestamp(ctx.timestampFormat)} ---- 已发送 ${ctx.sendCoding.toLowerCase()} 编码消息: "${displayText}" ----`
        );
      }
    } catch (e) {
      if (!opts?.silent) {
        cb.onError(`发送失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [ctxRef, callbacksRef]); // E5.7#99：refs 稳定——零重跑，满足规则

  return { performSend };
}
