/**
 * 首次配置——主区视图（E6#73p）。一张「本机就绪报告」。
 *
 * 它同时是本插件的**第二个触发器**：状态栏在装上那一刻把配置跑了（用户什么都没点），
 * 而本视图既能把结果摊开给用户看，也能在配置没成时让用户手动补一次。
 * 两条路都走 `runFirstRunSetup()`——服务内部 `_inflight` 合并，不会写两遍盘、发两条通知。
 *
 * 诚实边界：本视图**不重发通知**。配置那一刻的声音由 `setup.ts` 统一发（唯一出口）；
 * 视图里点「重新配置」走 `force: true`，那次会出声——因为那确实是用户刚要求的一次真配置。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { runFirstRunSetup, type SetupConfig } from "../services/setup";
import "../styles/setup.css";

/** 视图快照——`config` 为 null 且 `error` 为空 = 还在读 */
interface Snapshot {
  config: SetupConfig | null;
  configPath: string;
  error: string;
}

/** 「已复制」反馈的存续时长——够看见，又不至于一直挂着像个常驻状态 */
const COPIED_FEEDBACK_MS = 1200;

const lk = () => window.linkdesk;

export default function SetupView() {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(""); // 刚复制的那一行（行键），空 = 无反馈
  const copiedTimer = useRef<number | null>(null);

  const load = useCallback(async (force: boolean) => {
    setBusy(true);
    const r = await runFirstRunSetup(force ? { force: true } : undefined);
    setSnap(
      r.ok
        ? { config: r.config, configPath: r.configPath, error: "" }
        : { config: null, configPath: r.configPath, error: r.error },
    );
    setBusy(false);
  }, []);

  useEffect(() => {
    // 挂载即读（已配置则安静返回，不会因为「用户点开看了一眼」就再配置一次）
    void load(false);
  }, [load]);

  // 卸载清定时器——池崩溃重建时不许留一个对已卸载组件 setState 的回调
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = useCallback(
    async (rowKey: string, text: string) => {
      try {
        await lk()?.clipboard?.writeText(text);
      } catch {
        return; // 剪贴板不可用（预览环境）——静默，不给假成功反馈
      }
      setCopied(rowKey);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(""), COPIED_FEEDBACK_MS);
    },
    [],
  );

  const configured = !!snap?.config;
  const stateIcon = !snap ? "codicon-loading codicon-modifier-spin" : configured ? "codicon-check" : "codicon-warning";
  const stateColor = !snap
    ? "var(--text-muted)"
    : configured
      ? "var(--success)"
      : "var(--error)";
  const subtitle = !snap
    ? t("正在检查本机…")
    : configured
      ? t("已在本机写好配置档案")
      : t("本机尚未配置：{{error}}", { error: snap.error });

  /** 一行只读信息——长路径截断 + 悬停看全 + 点击复制（三点齐全才算「可复制」） */
  const row = (key: string, label: string, value: string) => {
    const isCopied = copied === key;
    return (
      <div className="frs-row" key={key}>
        <span className="frs-row-label">{label}</span>
        <button
          className="frs-path"
          title={value}
          aria-label={t("复制{{label}}：{{value}}", { label, value })}
          onClick={() => void copy(key, value)}
        >
          <span className="frs-path-text">{value}</span>
          {/* 图标**常显**——只在悬停才出现的复制按钮 = 找不到的复制按钮；
              复制成功后换成对勾做瞬时反馈（不靠换颜色，形状本身就变了）。 */}
          <span
            className={`codicon ${isCopied ? "codicon-check" : "codicon-copy"} frs-copy-icon${isCopied ? " is-copied" : ""}`}
          />
        </button>
        {isCopied && <span className="frs-copied">{t("已复制")}</span>}
      </div>
    );
  };

  return (
    <div className="frs-view">
      <section className="frs-card">
        <header className="frs-card-head">
          <span className={`codicon ${stateIcon} frs-state-icon`} style={{ color: stateColor }} />
          <div className="frs-head-text">
            <h2 className="frs-title">{t("首次配置")}</h2>
            <p className="frs-subtitle">{subtitle}</p>
          </div>
          <button className="frs-btn" disabled={busy} onClick={() => void load(true)}>
            {busy ? t("配置中…") : t("重新配置")}
          </button>
        </header>

        {snap?.config && (
          <div className="frs-rows">
            {row("config", t("配置文件"), snap.configPath)}
            {row("data", t("数据目录"), snap.config.dirs.data)}
            {row("time", t("配置时间"), new Date(snap.config.configuredAt).toLocaleString())}
          </div>
        )}

        {snap && !snap.config && (
          <p className="frs-empty">{t("配置没做成——点上面的「重新配置」再试一次。")}</p>
        )}
      </section>
    </div>
  );
}
