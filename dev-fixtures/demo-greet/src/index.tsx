/**
 * demo-greet——E6 1.2-5 装卸更演示 fixture（虚构插件，非真实运行时插件）。
 * 主标签视图最小形态：default 导出 React 组件，壳以 { isActive } 渲染。
 * 版本文案显式可见——段 A 证挂载；段 B 证更新后 bundle 模块缓存需重启换新
 * （1.2-5 实机走通 v1.0.0 → v2.0.0 → v3.0.0：check/stage/commit + 失败保旧版 + 重启稳定）。
 */

export default function DemoGreet({ isActive: _isActive }: { isActive: boolean }) {
  // isActive = 单聚焦（E5.8#30.15），≠「是否可见」——分屏下非聚焦 pane 仍显示，视图必须始终渲染内容
  // （可见性由壳 display 控制，keep-alive）；isActive 只用于 gate 焦点敏感副作用，禁止整块 blank。
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "var(--text)" }}>Demo Greet — bundle view mounted</h2>
      <p style={{ color: "var(--text-muted)" }}>version 3.0.0 · E6 安装/更新演示 fixture</p>
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
