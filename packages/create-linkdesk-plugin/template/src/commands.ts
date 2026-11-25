/**
 * 命令注册样板——给你的插件一条「非鼠标路径」（命令面板 / 快捷键 / AI 都从这里走）。
 *
 * 规范与发布前检查清单：作者面文档 `21-command-ification-spec.md`。
 *
 * ## 注册时机（重要，别改错地方）
 *
 * `index.tsx` **顶层**调用本文件的 `registerPluginCommands()`。命令 handler 要能**无视图**执行：
 * 用户没打开你的视图时（比如 AI 直接调命令），壳会现场加载入口文件——顶层副作用就是唯一注册时机。
 * ⛔ 别把注册挪进组件 `useEffect`：视图不开就永远注册不上，「AI 够得着」就成了空话。
 *
 * ## 单一真相源
 *
 * 命令的显示名 / 说明 / 参数结构写在 `plugin.json` 的 `contributes.commands[]`（命令索引与
 * AI 选命令读的是那边）；这里只注册 handler，**不写 meta**——两处各写一份文案迟早分叉。
 * 改命令名/参数时：`plugin.json` 与本文件**同笔改**。
 */

import type { AsyncCommandMeta } from "@linkdesk/plugin-sdk/runtime";
import { pluginError } from "@linkdesk/plugin-sdk/runtime";

/** hello 命令的参数——形状同时写在 plugin.json 那条声明的 params 里 */
export interface HelloArgs {
  /** 向谁问好（可省——省略就向 world 问好） */
  name?: string;
}

/**
 * 注册本插件的命令。返回注册条数（0 = 命令面不可用——测试环境没有 window.linkdesk）。
 * 新命令照这个样子加：一个 id（`<你的插件 id>.<动作名>`）＋ 一个 handler ＋ plugin.json 里一条声明。
 */
export function registerPluginCommands(): number {
  const reg = window.linkdesk?.commands?.registerCommand;
  if (!reg) return 0;

  reg("{{pluginName}}.hello", async (args?: HelloArgs) => {
    const name = args?.name?.trim() || "world";
    // handler 的返回值就是调用方拿到的读数——写成「结构化的事实」，
    // AI / CLI 靠它判断做没做成（别只 return true）。
    return { message: `Hello, ${name}!`, plugin: "{{pluginName}}" };
  });

  // 长任务样板（契约：meta.async）——壳自动把这条命令包成 op：exec 立即回 {pending, opId}，
  // handler 在后台跑；调用方用 opStatus 查 running|done|failed|expired。⛔ 自建状态机、⛔ 调 runAsync（无此 API）。
  reg("{{pluginName}}.longTask", async () => {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { message: "长任务完成", waitedMs: Date.now() - started };
  }, { async: true } satisfies AsyncCommandMeta);

  // 写命令样板：后置状态 + 版本冲突 + 幂等键（第三个参数 idempotencyKey 由宿主消费，插件不自建重放）。
  let savedGreeting = { text: "", stateVersion: 0 };
  reg(
    "{{pluginName}}.saveGreeting",
    async (text: string, expectedVersion?: number) => {
      if (expectedVersion !== undefined && expectedVersion !== savedGreeting.stateVersion) {
        return pluginError({
          code: "ECONFLICT",
          message: "状态版本不一致，未写入",
          hint: "重新读状态后再试",
          details: { stateVersion: savedGreeting.stateVersion },
        });
      }
      savedGreeting = { text, stateVersion: savedGreeting.stateVersion + 1 };
      return { message: "已保存", savedText: savedGreeting.text, stateVersion: savedGreeting.stateVersion };
    },
  );

  return 3;
}
