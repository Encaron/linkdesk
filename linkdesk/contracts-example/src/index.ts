/**
 * @linkdesk/contracts 消费形态验收示例。
 *
 * 第三方插件作者的完整类型消费路径：
 *   npm i -D @linkdesk/contracts
 *   import type { LinkDeskAPI } from "@linkdesk/contracts"
 *
 * 全程零 @src/core 依赖——壳内部实现细节对插件作者不可见。
 * 类型真相源 = 壳契约生成器产物（contracts/linkdesk.d.ts），漂移即编译错误。
 *
 * 本目录用 `file:../contracts` 本地引用包根（与 npm 发布版同源同内容，
 * 同一 d.ts 双端一致）。tarball 真包路径验收见 E5.8#22.6 执行注。
 */
import type { LinkDeskAPI } from "@linkdesk/contracts";

// window.linkdesk 由 d.ts 内置 declare global 注入类型，无需手写 global.d.ts
const api: LinkDeskAPI = window.linkdesk;

export async function init(): Promise<void> {
  // 配置读写——异步面，T 由调用方显式指定（E5.8#20 契约泛型模式）
  const fontSize = await api.configuration.get<number>("editor.fontSize");
  if (fontSize !== undefined) {
    await api.configuration.set("editor.fontSize", fontSize + 1);
  }

  // 命令注册——池内 handler + meta 显示面同步（title/category 进命令面板）
  api.commands.registerCommand(
    "example.sayHello",
    async () => {
      await api.notifications.show("Hello from @linkdesk/contracts example", {
        type: "info",
      });
    },
    { title: "示例：打招呼", category: "示例" }
  );

  // 确认弹窗 + 通知
  const ok = await api.dialog.confirm("继续下一步？");
  if (ok) {
    await api.notifications.show("已确认", { type: "info" });
  }

  // 事件订阅——返回 unsubscribe 函数（壳 hook 内部已封装 generation counter）
  const unsub = api.events.on<unknown>("example.evt", () => {
    /* no-op */
  });
  unsub();
}
