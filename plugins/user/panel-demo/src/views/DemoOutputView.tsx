/**
 * DemoOutputView——panel-demo 插件「输出」视图。E5.7#63.7 底部面板验证载体。
 *
 * 模拟 VS Code Output panel：等宽字体日志流 + 时间戳 + 三级着色（info/warn/error），
 * 播放/暂停自动追加 + 清空。验证点：
 *   - 池侧 PluginComponent 按 renderPath 动态加载（零静态表——侧栏同款 glob 查找）
 *   - 视图切换 keep-alive：切到「待办」再回来，日志与运行状态不丢
 *   - isActive 门控 interval——非活跃标签不追加（硬约束 14 同款守卫语义）
 *
 * 视图契约 = { isActive: boolean }，之外是标准 React 自由发挥。插件零 @src import
 * （插件独立铁律）——只 import react / react-i18next / 本插件 css。
 */

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "../styles/DemoViews.css";

type LogLevel = "info" | "warn" | "error";

interface LogLine {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

/** 日志行序号——模块级纯计数器（key 唯一即可，无渲染语义） */
let logSeq = 0;

/** 生成一条日志行。text 是演示数据（输出面板的内容 = 数据，不属 UI 文字铁律范围） */
function makeLine(level: LogLevel, text: string): LogLine {
  logSeq += 1;
  return {
    id: logSeq,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    level,
    text,
  };
}

/** 自动追加的演示日志池——循环随机取一条，模拟真实输出流 */
const LOG_POOL: Array<{ level: LogLevel; text: string }> = [
  { level: "info", text: "壳推送布局快照——pool 被动渲染（#63.7 全量推送）" },
  { level: "info", text: "面板高度已持久化——重启后恢复（LayoutService \"layout\" key）" },
  { level: "info", text: "视图标签切换事件已回壳（panel:viewSelected）" },
  { level: "warn", text: "演示警告：拖拽高度超出钳制区间——已回弹至 min/max 界" },
  { level: "info", text: "待办视图 keep-alive 生效——切走再回来状态不丢" },
  { level: "error", text: "演示错误：模拟运行时报错——不阻断面板本体" },
  { level: "info", text: "握手完成——LinkDesk Panel Demo 在线" },
];

export default function DemoOutputView({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>(() => [
    makeLine("info", "panel-demo 插件已加载——location:\"panel\" 容器注册成功"),
    makeLine("info", "输出视图就绪——点击「暂停」停止自动追加，切换标签验证 keep-alive"),
    makeLine("warn", "提示：顶部 4px 分隔线可拖拽调整面板高度（120–600，重启恢复）"),
  ]);
  const [running, setRunning] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动追加——仅活跃标签 + 运行中（isActive 守卫：切走即停，硬约束 14 同款语义）
  useEffect(() => {
    if (!isActive || !running) return;
    const timer = window.setInterval(() => {
      const next = LOG_POOL[Math.floor(Math.random() * LOG_POOL.length)];
      setLines((prev) => [...prev, makeLine(next.level, next.text)].slice(-200));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [isActive, running]);

  // 新行滚到底——输出面板语义（不劫持用户上翻：仅 lines 变化时滚）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // E5.8#36.5：视图动作区命令注册——titleActions 声明 command 的执行真相源（池侧注册表，
  // 池 executeCommand 优先命中，无壳 IPC 往返）。handler 闭包仅引用稳定值（setLines/makeLine）
  // 无陈旧闭包；registerCommand 幂等（Map.set 覆盖）——StrictMode 双挂载安全。
  // when:"false" = 纯程序化命令不进命令面板（titleActions 专属）。
  useEffect(() => {
    const api = window.linkdesk?.commands;
    api?.registerCommand?.(
      "panel-demo.addLog",
      (args?: { level?: LogLevel; text?: string }) => {
        const level = (args?.level as LogLevel) ?? "info";
        const text = args?.text ?? `动作区命令——追加 ${level} 日志`;
        setLines((prev) => [...prev, makeLine(level, text)].slice(-200));
      },
      { when: "false" },
    );
    api?.registerCommand?.(
      "panel-demo.clearLog",
      () => setLines([]),
      { when: "false" },
    );
  }, []);

  return (
    <div className="demo-output">
      <div className="demo-toolbar">
        <button
          className="demo-icon-btn"
          title={running ? t("暂停") : t("继续")}
          aria-label={running ? t("暂停") : t("继续")}
          onClick={() => setRunning((r) => !r)}
        >
          <span className={`codicon ${running ? "codicon-pause" : "codicon-play"}`} />
        </button>
        <button
          className="demo-icon-btn"
          title={t("清空输出")}
          aria-label={t("清空输出")}
          onClick={() => setLines([])}
        >
          <span className="codicon codicon-clear-all" />
        </button>
        <span className="demo-toolbar-hint">
          {running ? t("自动追加演示日志") : t("已暂停——点击继续")}
        </span>
      </div>
      <div className="demo-log" ref={scrollRef} role="log" aria-live="polite">
        {lines.map((l) => (
          <div key={l.id} className={`demo-log-line ${l.level}`}>
            <span className="demo-log-time">{l.time}</span>
            <span className="demo-log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
