/**
 * DemoSidebarView——panel-demo 插件「侧栏演示」视图。E5.8#36.6 验证载体。
 *
 * 验证点：侧栏 section header 右侧动作区（与面板 #36.5 同一 ViewTitleActions 渲染器、
 * 同一 contributes.views[].titleActions 声明面）——声明 → 壳序列化 SidebarViewMeta.titleActions
 * → PoolSectionStack 注入 SidebarSection actions 槽 → 图标/下拉点击执行池侧注册命令。
 *
 * 与 DemoOutputView 独立：本视图注册自己的 panel-demo.sidebarAddLog / sidebarClearLog
 * （when:"false" 纯程序化不进命令面板）——互不干扰、零壳改动、零跨插件耦合（插件独立铁律）。
 *
 * 视图契约 = { isActive: boolean }，之外是标准 React 自由发挥。插件零 @src import。
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "../styles/DemoViews.css";

type LogLevel = "info" | "warn" | "error";

interface LogLine {
  id: number;
  level: LogLevel;
  text: string;
}

/** 日志行序号——模块级纯计数器（key 唯一即可，无渲染语义） */
let sidebarLogSeq = 0;

/** 追加的演示日志池——模拟真实输出流（输出面板内容 = 数据，不属 UI 文字铁律范围） */
const SIDEBAR_POOL: Array<{ level: LogLevel; text: string }> = [
  { level: "info", text: "侧栏动作区——从 section header 追加演示日志（titleActions 声明）" },
  { level: "info", text: "与面板输出同款动作区——同一渲染器同一声明面，零壳改动" },
  { level: "warn", text: "演示警告：切换视图后再次点击，动作区命令照常执行" },
  { level: "error", text: "演示错误：titleActions 声明即用——插件独立铁律" },
];

export default function DemoSidebarView() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);

  // E5.8#36.6：侧栏动作区命令注册——titleActions 声明 command 的执行真相源（池侧注册表）。
  // handler 闭包仅引用稳定值（setLines / SIDEBAR_POOL / sidebarLogSeq）；registerCommand 幂等
  // （Map.set 覆盖）——StrictMode 双挂载安全。when:"false" = 纯程序化命令不进命令面板。
  useEffect(() => {
    const api = window.linkdesk?.commands;
    api?.registerCommand?.(
      "panel-demo.sidebarAddLog",
      (args?: { level?: LogLevel }) => {
        const level = (args?.level as LogLevel) ?? "info";
        const next = SIDEBAR_POOL[Math.floor(Math.random() * SIDEBAR_POOL.length)];
        sidebarLogSeq += 1;
        setLines((prev) => [...prev, { id: sidebarLogSeq, level, text: next.text }].slice(-20));
      },
      { when: "false" },
    );
    api?.registerCommand?.(
      "panel-demo.sidebarClearLog",
      () => setLines([]),
      { when: "false" },
    );
  }, []);

  return (
    <div className="demo-output">
      <div className="demo-toolbar">
        <span className="demo-toolbar-hint">
          {t("侧栏动作区演示——点击 header 右侧图标追加/清空日志")}
        </span>
      </div>
      <div className="demo-log" role="log" aria-live="polite">
        {lines.length === 0 && (
          <div className="demo-log-empty">{t("暂无日志输出")}</div>
        )}
        {lines.map((l) => (
          <div key={l.id} className={`demo-log-line ${l.level}`}>
            <span className="demo-log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
