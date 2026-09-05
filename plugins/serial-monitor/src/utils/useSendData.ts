/**
 * useSendData — 发送管道 hook + 时间戳格式化 + HEX 转换。
 * E5.6#11.5h 从 @src/core/react/useSendData + @src/core/pipeline/DataConverter 内联。
 *
 * 解码 → 编码 → invoke → 回显 → 历史，五步独立管道。
 * onEcho / onHistory / onError 由调用方注入。
 */

import { useCallback } from "react";

/* ── HEX 转换（从 @src/core/pipeline/DataConverter 内联）── */

/** HEX 字符串 → 字节数组（过滤非法字符后每两个字符解析一个字节） */
export function hexToBytes(str: string): Uint8Array {
  const cleaned = str.replace(/[^A-Fa-f0-9]/g, "");
  const len = Math.ceil(cleaned.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const hex = cleaned.substring(i * 2, i * 2 + 2);
    bytes[i] = parseInt(hex || "0", 16);
  }
  return bytes;
}

/* ── 时间戳格式化 ── */

export function formatTimestamp(format: string): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const fff = String(d.getMilliseconds()).padStart(3, "0");
  if (format === "HH:mm:ss:fff") return `${hh}:${mm}:${ss}:${fff}`;
  return `${hh}:${mm}:${ss}`;
}

/* ── 类型 ── */

export interface SendOptions {
  ending?: string;
  prefix?: string;
  silent?: boolean;
  showHexPreview?: boolean;
  noHistory?: boolean;
}

export interface SendContext {
  sendMode: "text" | "hex";
  sendCoding: string;
  lineEnding: string;
  timestampFormat: string;
  /** E5.8#29：会话口——sendData/sendText 定向 portName（多口下各会话各发各的口；空串 → undefined 走 D2 缺省唯一口语义） */
  port: string;
}

export interface SendCallbacks {
  onEcho: (text: string) => void;
  onHistory: (text: string) => void;
  onError: (message: string) => void;
}

const HEX_PREVIEW_MAX_LEN = 80;

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
        const bytes = Array.from(hexToBytes(text));
        await window.linkdesk.serial.sendData(bytes, ctx.port || undefined);
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
        await window.linkdesk.serial.sendText(text + ending, ctx.sendCoding, ctx.port || undefined);
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
