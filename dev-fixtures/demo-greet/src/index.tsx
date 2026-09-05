/**
 * demo-greet——E6 1.2-5 装卸更演示 fixture（虚构插件，非真实运行时插件）。
 * 主标签视图最小形态：default 导出 React 组件，壳以 { isActive } 渲染。
 * 版本文案显式可见——段 A 证挂载、段 B 证更新后模块缓存失效（v1.0.0 → v2.0.0 文字变化）。
 */

export default function DemoGreet({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "var(--text)" }}>Demo Greet — bundle view mounted</h2>
      <p style={{ color: "var(--text-muted)" }}>version 1.0.0 · E6 安装/更新演示 fixture</p>
      <p style={{ color: "var(--text-muted)" }}>Open a sub-tab to prove the plugin runtime bridge is live:</p>
      <button
        onClick={() => {
          void window.linkdesk.tabs.create("demo-greet.child");
        }}
      >
        open demo-greet.child
      </button>
    </div>
  );
}
