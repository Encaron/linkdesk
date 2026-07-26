/**
 * 延迟激活测试插件 — #44 activationEvents 验证。
 *
 * 行为：
 *   1. 启动时不加载（activationEvents 声明了 onCommand）
 *   2. Ctrl+Shift+P → "延迟激活插件——输出 Hello" → 执行
 *   3. 插件被激活 → 此模块 import → registerCommand 替换 placeholder
 *   4. 再次执行命令 → Hello toast 弹出
 *
 * 验证方式：
 *   - 第一次执行命令：控制台无"Hello" toast（激活阶段，handler 是 placeholder）
 *   - 第二次执行命令：弹出 toast "Hello from activationTest!"
 *   - 或者：日志中出现 "⚡ 延迟激活" 后，命令面板再次执行即可
 */

import { registerCommand } from "@src/core/CommandRegistry";
import { pushToast } from "@src/core/toast";

// 🔥 模块级注册——import() 时立即执行，不等组件 mount。
// 这样 activatePlugin → loadViewPlugin → import() → 此文件运行 → registerCommand 替换 placeholder。
registerCommand("activation-test", {
  id: "activationTest.hello",
  title: "延迟激活插件——输出 Hello",
  handler: async () => {
    pushToast({ message: "Hello from activationTest! 🎉 插件已延迟激活", severity: "info" });
  },
});

// 最小视图组件——占位，证明插件有 entry 且视图已注册
const ActivationTestView: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  if (!isActive) return null;
  return <div style={{ padding: 20 }}>✅ 延迟激活测试插件已加载</div>;
};

export default ActivationTestView;
