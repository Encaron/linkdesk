/**
 * demo-views——E6#15 spike fixture（虚构插件，非真实运行时插件）入口。
 *
 * 验证目标：多表面 .linkdesk-plugin 安装后（dev 运行时安装，非 glob 源码加载）
 *   - entry 默认导出组件 → index.bundle.js → 主标签页（tabBar 单例）渲染
 *   - 共享 css（../styles/demo.css）→ index.bundle.css → loader <link> 注入 → 规则生效
 * 零 @src import（插件独立铁律）；UI 文案无中文字面量（硬约束 2 面向 demo 自持）。
 */
import "./styles/demo.css";

export default function DemoViews({ isActive }: { isActive: boolean }) {
  // isActive = 单聚焦——视图始终渲染内容；demo 无焦点敏感副作用，仅用于消除未用告警
  void isActive;
  return (
    <div
      style={{
        padding: 24,
        fontFamily: "var(--font-ui)",
        fontSize: "var(--font-size-md)",
        color: "var(--text-primary)",
        background: "var(--bg-window)",
        height: "100%",
      }}
    >
      <h2 style={{ margin: 0, marginBottom: 8, fontSize: "var(--font-size-xl)", color: "var(--text-primary)" }}>
        Demo Views
      </h2>
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>
        E6#15 multi-surface fixture — installed at runtime. Sidebar section has a demo view.
      </p>
      <span className="demo-views-pill">Entry css applied via injected bundle link.</span>
    </div>
  );
}
