/**
 * executePoolCommand——池内命令执行。E5.7#6 从 TitleBarZone 提取（#5 建），IconBarZone 复用。
 *
 * 池侧注册表优先（池内插件视图注册的命令），fallback 壳 IPC（commands:execute → 壳 CommandRegistry）。
 * 池不 import @src/core——命令注册表是壳的，池只通过 window.linkdesk.commands 发请求。
 *
 * ## `...args` 与那个**必须显式传**的 `undefined`（E6#57.13 补）
 *
 * 壳侧 `executeCommand(id, token, ...realArgs)` 的第二个位置是 **CancellationToken 占位槽**
 * （`IpcBridgeHandler` 收到后 `const [commandId, token, ...rest] = args`，剥掉 token 才转 `handler(...rest)`）。
 * 池 preload 的 `commands.executeCommand` 也照这个形状剥（`args[0] === undefined` 时 `slice(1)`）——
 * **两个进程都指望这个占位**，所以本函数**恒补一个 `undefined`** 再拼真实入参。
 *
 * 🔴 漏了它会怎样：`executeCommand("update.releaseNotesSelect", "0.1.54")` 里 `"0.1.54"` 会被
 * 吃进 token 槽 ⇒ 壳侧 handler 收到空数组 ⇒ **静默失效**（不报错、不抛异常，就是没反应）——
 * 这类 bug 只能靠读这一行注释避免。
 *
 * ⚠️ 对既有零入参调用方**逐字节等价**：补 `undefined` 后池侧剥空、壳侧 `rest` 也仍为空数组
 * （`[id, undefined]` → token 被剥 → `rest = []`），所以 TitleBarZone / IconBarZone / StatusBarZone 零影响。
 */
export function executePoolCommand(command: string, ...args: unknown[]): void {
  if (!command) return;
  const cmd = window.linkdesk?.commands;
  if (!cmd) return;
  // 第二实参 = token 占位槽（见头注 🔴 段）——不是多余的空值
  Promise.resolve(cmd.executeCommand(command, undefined, ...args)).catch((e) => {
    console.error(`[pool] 命令执行失败: ${command}`, e);
  });
}
