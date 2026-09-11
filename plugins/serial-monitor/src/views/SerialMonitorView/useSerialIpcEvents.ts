/**
 * 串口 IPC 订阅——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * serial-data（本口数据 → RingBuffer 双形态）/ serial-system（本口状态 + 全局错误 →
 * 暂停复位 / 打开即发初始化序列 / 连接状态广播 / 关闭落盘）。
 */

import { useRef } from "react";
import { useIpcEvent } from "../../hooks/useIpcEvent";
import type { SerialDataPayload, SerialSystemPayload } from "@linkdesk/contracts";
import { matchesPort } from "../../utils/portFilter";
import { formatTimestamp } from "../../utils/useSendData";
import type { RingBuffer } from "../../utils/RingBuffer";
import type { ReceiveItem } from "../../types";

import type { SerialSettings } from "./settings";
import type { SendOptions } from "../../utils/useSendData";

export interface SerialIpcEventsOptions {
  sourceId?: string;
  settings: SerialSettings;
  ringBuffer: React.MutableRefObject<RingBuffer<ReceiveItem>>;
  performSend: (text: string, opts?: SendOptions) => Promise<void>;
  saveReceiveToFile: () => void | Promise<void>;
  pausedBuffer: React.MutableRefObject<ReceiveItem[]>;
  setPaused: (v: boolean) => void;
  setPausedCount: (v: number) => void;
}

/** 文本转十六进制显示——Phase 5e receiveMode="hex" */
function toHexDisplay(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

export function useSerialIpcEvents(o: SerialIpcEventsOptions): void {
  const { sourceId, settings, ringBuffer, performSend, saveReceiveToFile, pausedBuffer, setPaused, setPausedCount } = o;

  const tsFormatRef = useRef(settings.timestampFormat);
  tsFormatRef.current = settings.timestampFormat;
  // E5.8#29（S13）：portOpenRef 全局门控已删除——数据接收改由 serial-data handler 的
  // matchesPort 键控过滤接管（本会话口 ∈ 匹配才收），不再需要「打开才置 true」的全局位。
  // C1：per-tab session 绑定——IPC event handler 用 ref 读取当前 tab 的 session ID
  const sessionIdRef = useRef(sourceId);
  sessionIdRef.current = sourceId;

  useIpcEvent<SerialDataPayload>("serial-data", (payload) => {
    // C1：用当前 tab 的 session ID 判断——per-tab 绑定，非全局 activeSession
    if (!sessionIdRef.current) return;
    // E5.8#29（S13）：portFilter 键控过滤取代 portOpenRef 全局门控——payload.portName 匹配本会话口才收。
    // 本会话口 = activeSession.port；无 key（旧数据/单口）→ 收（三态过滤兜底）；不匹配（他口数据）→ 滤
    if (!matchesPort(payload.portName, settings.port || null)) return;
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

  useIpcEvent<SerialSystemPayload>("serial-system", async (payload) => {
    const fmt = tsFormatRef.current;
    // E5.8#29（S12）：删正则挖口名 hack——payload.portName 直接路由（#28 契约已带路由键）。
    // string 载荷容错保留（IPC 载荷运行时无编译期兜底）
    const msg = typeof payload === "string" ? payload : payload.message;
    // E5.8#30.11（P1）：type 分类路由——status 按口过滤（他口开/关/波特率完全不显示），
    // error 全局显示（D8 拒绝/驱动错误/拔线，他口也显示）。审视 ①：来源端打 type 标签，不做文案关键词判断。
    const type = typeof payload === "string" ? "status" : (payload.type ?? "status");
    const myPort = settings.port || null;
    // E5.8#29：portFilter 三态过滤（无 key→收 / 不匹配→滤 / 匹配→收）——与旧 isMyPort 逻辑等价
    const isMyPort = matchesPort(payload.portName, myPort);
    // P1 接收区补全：#29 旧行为「他口系统消息只显示文本不激活」已废除——他口状态消息完全不显示；
    // 此 return 后 status 消息必为本口，error 全局继续。{@link 8955db36} 只改了 lastError 路由漏了此处。
    if (type !== "error" && !isMyPort) {
      return;
    }

    if (/已打开/.test(msg)) {
      pausedBuffer.current = [];
      setPausedCount(0);
      setPaused(false);
      // E5.8#30.21：打开即发初始化序列——归一化复用 quickSends（不新建平行概念），打开时按序自动发送（per-COM 记忆）。
      // 复用 handleQuickSend 同款 performSend 路径（ending/prefix 一致）；performSend 内部 try/catch，逐条 await 串行不丢序
      if (settings.sendInitOnOpen) {
        for (const content of Object.values(settings.quickSends ?? {})) {
          if (content.trim()) await performSend(content, { ending: "\r\n", prefix: "> " });
        }
      }
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
      ringBuffer.current.drainAll();
      // E5.8#30.20：端口关闭 → 自动保存接收区（落盘策略①，防数据丢失——此时 CM6 已含最新已渲染数据）
      saveReceiveToFile();
      // E3j #78：断开用缓存的信息（端口已关无法查）
      window.linkdesk?.events?.emit("serial:disconnected", lastPortInfoRef.current ?? {});
    }
    ringBuffer.current.write({
      text: fmt !== "无" ? `${formatTimestamp(fmt)} ${msg}` : msg,
      type: "system",
    });
  });
}
