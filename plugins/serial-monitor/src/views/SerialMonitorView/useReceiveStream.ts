/**
 * 接收数据流（消费侧）——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 覆盖：暂停缓冲 + 过滤（模式/关键字）+ rAF 消费循环 + 暂停/继续动作。
 * IPC 订阅在 useSerialIpcEvents（写 RingBuffer）；本文件只读 RingBuffer。
 *
 * 生命周期：RingBuffer 实例由 useSerialMonitorView 持有并以参数传入——本 hook（消费 + 系统消息清空）
 * 与 useReceiveEditor（合屏快照读写）共用同一实例。
 */

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PAUSED_BUFFER_MAX } from "../../constants";
import type { ReceiveItem } from "../../types";
import type { SerialSettings } from "./settings";
import type { SendOptions } from "../../utils/useSendData";
import type { RingBuffer } from "../../utils/RingBuffer";
import { useSerialIpcEvents } from "./useSerialIpcEvents";

export interface ReceiveStreamOptions {
  sourceId?: string;
  settings: SerialSettings;
  renderLine: (item: ReceiveItem) => void;
  appendLine: (text: string, color: "received" | "sent" | "system") => void;
  ringBuffer: React.MutableRefObject<RingBuffer<ReceiveItem>>;
  performSend: (text: string, opts?: SendOptions) => Promise<void>;
  saveReceiveToFile: () => void | Promise<void>;
}

export function useReceiveStream(opts: ReceiveStreamOptions) {
  const { sourceId, settings, renderLine, appendLine, ringBuffer, performSend, saveReceiveToFile } = opts;
  const { t } = useTranslation();

  const [paused, setPaused] = useState(false);
  // E5.8#30.19a：暂停缓冲存完整 ReceiveItem——恢复时 ASCII/HEX 双栏都能补齐
  const pausedBuffer = useRef<ReceiveItem[]>([]);
  const [pausedCount, setPausedCount] = useState(0);

  const [filterMode, setFilterMode] = useState<"all" | "protocol" | "plain">("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const filterModeRef = useRef(filterMode);
  const filterKeywordRef = useRef(filterKeyword);
  filterModeRef.current = filterMode;
  filterKeywordRef.current = filterKeyword;

  // IPC 订阅——写 RingBuffer（本 hook 声明在前，与原文 handler 先于 rAF 循环一致）
  useSerialIpcEvents({
    sourceId, settings, ringBuffer, performSend, saveReceiveToFile,
    pausedBuffer, setPaused, setPausedCount,
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
  }, [renderLine, appendLine, paused, t, ringBuffer]);

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

  return {
    paused, setPaused, pausedCount, handlePause,
    filterMode, setFilterMode, filterKeyword, setFilterKeyword,
  };
}
