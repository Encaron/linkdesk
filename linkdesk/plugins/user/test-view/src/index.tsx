/**
 * E36#12 临时测试插件——验证跨插件注册 view。
 * 不声明 viewsContainers（不拥有容器），只往 explorer 注册一个 view。
 * 验证后删除整个 test-view/ 目录。
 */

import { ViewContainerService } from "@src/core/ViewContainerService";

// ── 声明式命令——同走 registerView 一条路径 ──
// 模块级调用：loader import 此文件时自动执行。
// 对标 activate() 中的命令式注册——loader 解析完 contributions 后 import 入口文件，
// 模块级代码 = activate 时机。

ViewContainerService.registerView("test-view", "explorer", {
  id: "test-hello",
  title: "E36#12 测试",
  render: TestHelloView,
  order: 50,
});

function TestHelloView() {
  return (
    <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-primary)" }}>
      ✅ 跨插件注册成功！来自 test-view 插件
    </div>
  );
}

export default function TestViewEntry() {
  // 无主区视图——此插件仅为侧栏贡献 view
  return null;
}
