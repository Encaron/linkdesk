/**
 * IpcBridgeHandler 配置域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10b）。
 * config:get/set channel + getSchema/getConfigurationContributions/inspectConfiguration/getUserSettings 方法
 * + config 变更订阅（_configUnsub 属主）verbatim。
 * 依赖方向：configuration → ConfigurationService/ConfigurationRegistry（配置读写）+ linkdesk-api/shell（bridge 类型）；被聚合器委派。
 */

import {
  getConfigurationValue, setConfigurationValue, onDidChangeConfiguration,
  inspectConfiguration, getUserSettings,
} from "../../configuration/ConfigurationService";
import { getMergedSchema, getConfigurationContributions } from "../../../registry/ConfigurationRegistry";
import type { ShellAPI } from "../../../api/linkdesk-api/shell";

let _configUnsub: (() => void) | null = null;

/** 配置变更订阅——SettingsView 直调 setConfigurationValue 绕过 IPC proxy，需要此通道补齐 */
export function subscribeConfiguration(bridge: NonNullable<ShellAPI["bridge"]>): void {
  _configUnsub = onDidChangeConfiguration((key: string, value: unknown) => {
    bridge.notifyConfigChanged(key, value);
  });
}

export function unsubscribeConfiguration(): void {
  _configUnsub?.();
  _configUnsub = null;
}

/** config:get/config:set channel 处理器 */
export async function handleConfigChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    case "config:get":
      return getConfigurationValue(args[0] as string);
    case "config:set": {
      const [key, value] = args;
      await setConfigurationValue(key as string, value, "user");
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}

/** getSchema/getConfigurationContributions/inspectConfiguration/getUserSettings 方法处理器 */
export async function handleConfigurationMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "getSchema": {
      // 🔥 onApply 是函数——结构化克隆拒绝 → 返回前剥去
      const raw = getMergedSchema();
      const safe: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(raw)) {
        const { onApply: _onApply, ...rest } = prop as unknown as Record<string, unknown>;
        safe[key] = rest;
      }
      return safe;
    }
    // ── E5.5#7：设置页 IPC 化——跨进程查询配置注册表 ──
    case "getConfigurationContributions": {
      // Map 不可序列化 → 转为 entries
      // 🔥 onApply 是函数——结构化克隆拒绝 → 返回前剥去
      const contribs = getConfigurationContributions();
      return Array.from(contribs.entries()).map(([pluginId, contrib]) => {
        const safeProps: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(contrib.properties)) {
          const { onApply: _onApply, ...rest } = prop as unknown as Record<string, unknown>;
          safeProps[key] = rest;
        }
        return [pluginId, { title: contrib.title, properties: safeProps }];
      });
    }
    case "inspectConfiguration": {
      const [key] = args as [string];
      return inspectConfiguration(key);
    }
    case "getUserSettings":
      return getUserSettings();
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
