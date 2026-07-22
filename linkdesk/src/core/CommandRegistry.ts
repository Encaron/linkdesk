/**
 * 命令注册表——对标 VS Code CommandService。
 * Phase 5 柱子 1：插件注册命令 → 命令面板/右键菜单/快捷键三条消费路径。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：vscode.commands.registerCommand / executeCommand
 * VS Code 源码：src/vs/platform/commands/common/commands.ts — ICommandService
 *
 * 关键设计决策：
 * - handler 签名从第一天就用 async (token?: CancellationToken) => Promise<void>
 *   不等 Phase 7 任务系统——同步改异步签名的代价是改所有插件（V2.6 模式）
 * - 命令 ID 就是插件的公共 API——跨插件命令调用走 execute() 不走 hard import
 */

import type { CancellationToken } from "./CancellationToken";

/* ── 类型 ── */

export interface Command {
  /** 命令 ID——对标 VS Code command identifier。如 "terminal.clear" */
  id: string;
  /** 显示名称——命令面板 / 右键菜单 / 快捷键提示用 */
  title: string;
  /** 分组——命令面板里的分类（如 "终端" / "文件"） */
  category?: string;
  /** context key when 条件——Phase 5 实现（见 ContextKeyService） */
  when?: string;
  /** 异步处理器——从第一天就用 async 签名 */
  handler: (token?: CancellationToken, ...args: unknown[]) => Promise<void>;
}

const _commands = new Map<string, Command>();
const _pluginCommands = new Map<string, Set<string>>(); // pluginId → commandId[]

/* ── 注册 / 注销 ── */

/**
 * 注册命令。Phase 5 盲区 9（P1）：命令 ID 即插件公共 API——跨插件调用走 execute()。
 *
 * Phase 5d 关键设计：loader 先注册元数据（title/category/when），组件 mount 时重注册 handler。
 * 重注册时只替换 handler——不覆盖元数据。对标 VS Code：package.json 是元数据源头，
 * 运行时 extension activate 只提供实现。
 */
export function registerCommand(pluginId: string, command: Command): void {
  if (_commands.has(command.id)) {
    // 重注册：更新 handler + title（toggle 命令的 title 随状态变化动态更新）。
    // loader 先注册元数据 → 组件 mount 时重注册覆盖 handler → useEffect 按状态更新 title。
    const existing = _commands.get(command.id)!;
    existing.handler = command.handler;
    existing.title = command.title;
    return;
  }
  _commands.set(command.id, command);

  let pluginSet = _pluginCommands.get(pluginId);
  if (!pluginSet) {
    pluginSet = new Set();
    _pluginCommands.set(pluginId, pluginSet);
  }
  pluginSet.add(command.id);
}

/** 注销插件的所有命令——插件卸载时调用 */
export function unregisterPluginCommands(pluginId: string): void {
  const pluginSet = _pluginCommands.get(pluginId);
  if (pluginSet) {
    for (const cmdId of pluginSet) {
      _commands.delete(cmdId);
    }
    _pluginCommands.delete(pluginId);
  }
}

/* ── 执行 ── */

/**
 * 执行命令——对标 VS Code executeCommand。
 * Phase 5 盲区 8（P1）：包 try/catch 做错误隔离——一个 buggy 命令不崩命令面板。
 * Phase 6 activationEvents：如果命令所属插件还未加载 → 先触发激活再执行。
 */
export async function executeCommand(
  commandId: string,
  token?: CancellationToken,
  ...args: unknown[]
): Promise<void> {
  const cmd = _commands.get(commandId);
  if (!cmd) {
    console.warn(`[CommandRegistry] 命令 "${commandId}" 未注册`);
    return;
  }

  try {
    await cmd.handler(token, ...args);
  } catch (err) {
    console.error(`[CommandRegistry] 命令 "${commandId}" 执行出错:`, err);
    // Phase 5 盲区 8：错误隔离——toast 报告但不崩面板
    const msg = err instanceof Error ? err.message : String(err);
    // 动态 import toast 避免循环依赖
    import("./toast").then(({ pushToast }) => {
      pushToast({
        message: `命令 "${cmd.title}" 执行出错: ${msg}`,
        severity: "error",
        source: cmd.category ?? "命令系统",
      });
    });
  }
}

/** 同步执行（fire-and-forget）——不需要等待结果时用 */
export function executeCommandSync(
  commandId: string,
  token?: CancellationToken,
  ...args: unknown[]
): void {
  executeCommand(commandId, token, ...args).catch((err) => {
    console.error(`[CommandRegistry] 命令 "${commandId}" fire-and-forget 出错:`, err);
  });
}

/* ── 查询 ── */

/** 获取单个命令 */
export function getCommand(commandId: string): Command | undefined {
  return _commands.get(commandId);
}

/** 获取所有已注册命令——命令面板消费 */
export function getCommands(): Command[] {
  return Array.from(_commands.values());
}

/** 获取插件的所有命令 ID */
export function getPluginCommands(pluginId: string): string[] {
  return Array.from(_pluginCommands.get(pluginId) ?? []);
}

/** 清空注册表（测试用） */
export function clearCommands(): void {
  _commands.clear();
  _pluginCommands.clear();
}
