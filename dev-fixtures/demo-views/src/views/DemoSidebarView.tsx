/**
 * DemoSidebarView——demo-views 插件 location:sidebar 容器内的视图（E6#15 spike）。
 *
 * 验证点：安装 bundle 后 parseContributions 走 pluginRoot 动态 import
 * `views/DemoSidebarView.bundle.js`（compile surface）→ 侧栏 section 渲染 + 共享 css 生效。
 * 视图契约 = 标准 React（sidebar section 挂载不传 isActive）；零 @src import。
 */
import "../styles/demo.css";

const SAMPLE_ITEMS = ["sidebar view renders", "bundle css applies", "unload removes link"];

export default function DemoSidebarView() {
  return (
    <div style={{ padding: 12, fontFamily: "var(--font-ui)", fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Demo Views Sidebar</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-secondary)", display: "grid", gap: 4 }}>
        {SAMPLE_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <span className="demo-views-pill">Sidebar css applied too.</span>
    </div>
  );
}
