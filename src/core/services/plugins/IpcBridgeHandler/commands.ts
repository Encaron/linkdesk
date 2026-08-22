/**
 * IpcBridgeHandler 命令域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10c）。
 * commands:execute/executeResult/register/registerShell/unregister 五 channel verbatim。
 * 依赖方向：commands → CommandRegistry + utils/CancellationToken；被聚合器委派。
 */

import {
  executeCommand, resolvePoolExecution, registerPoolCommandMetadata,
  registerShellLocalCommand, unregisterPoolCommands,
} from "../../../registry/commands/CommandRegistry";
import type { CancellationToken } from "../../../utils/CancellationToken"; // E5.7#97：commands:execute 槽位窄化

/** commands:* 五 channel 处理器 */
export async function handleCommandsChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    case "commands:execute": {
      // 池侧固定按旧槽位传 undefined 占位（E5.7#63.8 token 剥离后 handler 合同只剩 realArgs——
      // 壳侧 executeCommand(id, token, ...realArgs) 的 token 槽位保留为未来取消语义入口）
      const [commandId, token, ...rest] = args;
      return executeCommand(commandId as string, token as CancellationToken | undefined, ...rest);
    }
    case "commands:executeResult": {
      // E5.7 Bug C：壳→池占位命令执行回传——resolve 壳侧 pending（已超时则静默丢弃）
      const [requestId, payload] = args as [string, { result?: unknown; error?: string }];
      resolvePoolExecution(requestId, payload);
      break;
    }
    case "commands:register": {
      // E5.7 Bug C 补全：池侧 registerCommand 元数据回传——title/category/when 同步进壳注册表
      // （命令面板可见性 + 动态 toggle 标题）；runtime 命令以占位条目登记，执行走转发桥。
      const [commandId, meta] = args as [string, { title?: string; category?: string; when?: string } | null];
      registerPoolCommandMetadata(commandId, meta ?? {});
      break;
    }
    case "commands:registerShell": {
      // E5.7#56：壳侧插件入口注册命令（双进程执行——壳 glob loader 侧半程真注册，
      // handler 存壳 preload 页面世界代理，执行走 _executeShellLocal 桥）
      const [commandId, meta] = args as [string, { title?: string; category?: string; when?: string } | null];
      registerShellLocalCommand(commandId, meta ?? {});
      break;
    }
    case "commands:unregister": {
      // E5.7 Bug C 补全：池侧 unregisterCommands 回传——移除运行时命令条目（loader 元数据保留）
      const [pluginId] = args as [string];
      unregisterPoolCommands(pluginId);
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
