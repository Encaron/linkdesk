/**
 * useConfigurationValueIpc——只读配置值 hook（设置插件自包含版）。
 * E5.8#41.14：自 src/core/react/useConfigurationIpc 迁入设置插件——壳侧唯一消费方（SettingRow）
 * 已随集群迁移，壳侧文件删除（零消费死代码当场删）。全走 window.linkdesk.configuration.* IPC。
 * 与壳侧壳代码同款实现——契约泛型 get<T>/onChange<T> 在 linkdesk-api 归口，ambient window.linkdesk 直出。
 */

import { useState, useEffect } from "react";

function lk() {
  const cfg = window.linkdesk?.configuration;
  if (!cfg) {
    throw new Error("[useConfigurationValueIpc] window.linkdesk.configuration 不可用——preload 未就绪？");
  }
  return cfg;
}

/** 异步拉取初始值 + 订阅 onChange 驱动重渲染 */
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

/** 只读配置值——SettingRow 消费（当前值 + dependsOn 依赖值） */
export function useConfigurationValueIpc<T>(key: string): T | undefined {
  return useSubscribedConfigValueIpc<T>(key);
}
