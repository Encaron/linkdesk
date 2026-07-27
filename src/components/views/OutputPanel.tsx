/**
 * OutputPanel — 输出面板 UI，对标 VS Code Output 面板。
 * E3f #54：频道选择器 + 日志列表（等宽字体/按 severity 着色/自动滚动）+ 清空/导出。
 *
 * 数据源：src/core/LogChannel.ts——createLogChannel / getLogChannels / onDidChangeLogChannel。
 * 位置：壳级视图——通过 "查看 → 输出" 或插件调 channel.show() 打开。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  getLogChannels,
  onDidChangeLogChannel,
  onDidRequestShowChannel,
  type LogChannel,
} from "../../core/LogChannel";
import SelectBox from "../shared/SelectBox";
import "./OutputPanel.css";

interface OutputPanelProps {
  isActive: boolean;
  /** channel.show() 携带的初始频道 ID */
  initialChannelId?: string;
}

function OutputPanel({ isActive: _isActive, initialChannelId }: OutputPanelProps) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<LogChannel[]>(() => getLogChannels());
  const [selectedId, setSelectedId] = useState<string>("");
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const timeOrigin = useRef(performance.timeOrigin);

  // 订阅频道变更 + show() 请求
  useEffect(() => {
    const sub1 = onDidChangeLogChannel.event(() => {
      setChannels([...getLogChannels()]);
    });
    const sub2 = onDidRequestShowChannel.event((channelId: string) => {
      setSelectedId(channelId);
    });
    return () => {
      sub1();
      sub2();
    };
  }, []);

  // 初始选中第一个频道
  useEffect(() => {
    const all = getLogChannels();
    if (!selectedId && all.length > 0) {
      setSelectedId(all[0].id);
    }
  }, [selectedId, channels.length]);

  // 响应 initialChannelId prop 变更
  useEffect(() => {
    if (initialChannelId) setSelectedId(initialChannelId);
  }, [initialChannelId]);

  const channel = channels.find((c) => c.id === selectedId);

  // 新日志自动滚到底（用户手动上滚后暂停自动滚动）
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [channel?.entries.length]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    // 距底部 < 40px → 恢复自动滚动
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  const handleClear = useCallback(() => {
    channel?.clear();
  }, [channel]);

  const handleExport = useCallback(() => {
    if (!channel || channel.entries.length === 0) return;
    const text = channel.entries
      .map((e) => {
        const time = new Date(timeOrigin.current + e.timestamp).toISOString();
        return `[${time}] [${e.severity ?? "info"}] ${e.message}`;
      })
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${channel.id}-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [channel]);

  const formatTime = (ts: number) => {
    const d = new Date(timeOrigin.current + ts);
    return d.toLocaleTimeString();
  };

  const channelOptions = channels.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="output-panel">
      {/* ── 头部工具栏 ── */}
      <div className="output-panel-header">
        <span className="output-panel-title">{t("输出")}</span>
        <div className="output-channel-select">
          <SelectBox
            options={channelOptions}
            value={selectedId}
            onChange={setSelectedId}
            placeholder={t("选择频道...")}
          />
        </div>
        <div className="output-panel-actions">
          <button className="output-btn" onClick={handleClear} title={t("清空")}>
            {t("清空")}
          </button>
          <button className="output-btn" onClick={handleExport} title={t("导出")}>
            {t("导出")}
          </button>
        </div>
      </div>

      {/* ── 日志列表 ── */}
      <div className="output-panel-list" ref={listRef} onScroll={handleScroll}>
        {!channel || channel.entries.length === 0 ? (
          <div className="output-empty">{t("暂无日志输出")}</div>
        ) : (
          channel.entries.map((e, i) => (
            <div key={i} className={`output-line severity-${e.severity ?? "info"}`}>
              <span className="output-time">{formatTime(e.timestamp)}</span>
              <span className={`output-severity output-sev-${e.severity ?? "info"}`}>
                [{e.severity ?? "info"}]
              </span>
              <span className="output-message">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default OutputPanel;
