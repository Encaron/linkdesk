/**
 * E36#12 测试 view——跨插件注册到 explorer 容器。
 */
export default function TestHelloView() {
  return (
    <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-primary)" }}>
      ✅ 跨插件注册成功！来自 test-view 插件
    </div>
  );
}
