/**
 * executePoolCommand——池内命令执行。E5.7#6 从 TitleBarZone 提取（#5 建），IconBarZone 复用。
 *
 * 池侧注册表优先（池内插件视图注册的命令），fallback 壳 IPC（commands:execute → 壳 CommandRegistry）。
 * 池不 import @src/core——命令注册表是壳的，池只通过 window.linkdesk.commands 发请求。
 */
export function executePoolCommand(command: string): void {
  if (!command) return;
  const cmd = window.linkdesk?.commands;
  if (!cmd) return;
  Promise.resolve(cmd.executeCommand(command)).catch((e) => {
    console.error(`[pool] 命令执行失败: ${command}`, e);
  });
}
