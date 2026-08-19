/**
 * useConfiguration IPC 版——多 WebView 兼容的配置 Hook。
 *
 * E5.5#7：替代 SettingsView 对 @src/core 的直接 import。
 * 在壳侧和插件 WebView 中都能工作——全走 window.linkdesk.configuration.* IPC。
 *
 * 壳侧：ipcRenderer.invoke → 主进程 → shell IpcBridgeHandler → ConfigurationService（多一跳 IPC，但正确）
 * 插件侧：ipcRenderer.invoke → 主进程 → shell IpcBridgeHandler → ConfigurationService（同路径）
 */

import { useState, useEffect, useCallback } from "react";
// E5.7#98：契约正源——get<T>/onChange<T> 泛型在 linkdesk-api 已归口（替代手写 any 形状）
import type { LinkDeskAPI } from "../api/linkdesk-api";

function lk(): NonNullable<LinkDeskAPI["configuration"]> {
  const cfg = window.linkdesk?.configuration;
  if (!cfg) {
    throw new Error("[useConfigurationIpc] window.linkdesk.configuration 不可用——preload 未就绪？");
  }
  return cfg;
}

/** 异步拉取初始值 + 订阅 onChange 驱动重渲染——useConfigurationIpc/useConfigurationValueIpc 共用（E5.8#1c 去重） */
function useSubscribedConfigValueIpc<T>(key: string): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // 异步获取初始值
    lk().get(key).then((v) => {
      if (!cancelled) setValue(v as T);
    }).catch(() => {});
    // 订阅变更
    const unsub = lk().onChange(key, (v: unknown) => {
      if (!cancelled) setValue(v as T);
    });
    return () => { cancelled = true; unsub(); };
  }, [key]);

  return value;
}

/**
 * 获取并订阅配置值——对标 VS Code workspace.getConfiguration().get(key)
 * IPC 版：异步初始化 + 订阅 onChange 保持同步
 */
export function useConfigurationIpc<T>(key: string): [T | undefined, (value: T) => Promise<void>] {
  const value = useSubscribedConfigValueIpc<T>(key);

  const setter = useCallback(
    async (newValue: T) => {
      await lk().set(key, newValue);
    },
    [key],
  );

  return [value, setter];
}

/**
 * 只读配置值——不需要 setter 时用。
 * 对标 useConfigurationValue 的 IPC 版。
 */
export function useConfigurationValueIpc<T>(key: string): T | undefined {
  return useSubscribedConfigValueIpc<T>(key);
}
