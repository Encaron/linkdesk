/**
 * useConfiguration hook——对标 VS Code workspace.getConfiguration()。
 * React 组件订阅配置值，配置变更时自动重渲染。
 *
 * Phase 5 柱子 2 消费端：替代 TerminalPrefsContext / useState(app.theme)
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 */

import { useState, useEffect, useCallback } from "react";
import { getConfigurationValue, setConfigurationValue, onDidChangeConfiguration } from "../services/configuration/ConfigurationService";

/**
 * 获取并订阅配置值——对标 VS Code workspace.getConfiguration().get(key)
 *
 * @param key 配置键——如 "terminal.timestampFormat"
 * @returns [当前值, setter]
 *
 * 使用：
 *   const [format, setFormat] = useConfiguration("terminal.timestampFormat")
 *   // format = "HH:mm:ss:fff"
 *   // setFormat("无") → 更新 settings.json + 通知所有消费者
 */
/** 订阅配置值变更并驱动重渲染——useConfiguration/useConfigurationValue 共用（E5.8#1c 去重） */
function useSubscribedConfigValue<T>(key: string): T {
  const [value, setValue] = useState<T>(() => getConfigurationValue<T>(key));

  useEffect(() => {
    const unsubscribe = onDidChangeConfiguration((changedKey, newValue) => {
      if (changedKey === key) {
        setValue(newValue as T);
      }
    });
    return unsubscribe;
  }, [key]);

  return value;
}

export function useConfiguration<T>(key: string): [T, (value: T) => Promise<void>] {
  const value = useSubscribedConfigValue<T>(key);

  const setter = useCallback(
    async (newValue: T) => {
      await setConfigurationValue(key, newValue, "user");
    },
    [key]
  );

  return [value, setter];
}

/**
 * 只读配置值——不需要 setter 时用。
 * 对标 VS Code workspace.getConfiguration().get(key) 的只读用法。
 */
export function useConfigurationValue<T>(key: string): T {
  return useSubscribedConfigValue<T>(key);
}
