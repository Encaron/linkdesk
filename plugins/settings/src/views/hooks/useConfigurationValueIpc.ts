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

/** 多键只读配置值——SettingRow actionDisabledAll 消费（混搭复位按钮「6 来源全跟随主题 → 置灰」）。
 *  键集稳定串为 effect 依赖（keys 数组每渲染新 identity）；空键集返回空对象不订阅。 */
export function useConfigurationValuesIpc(keys: string[]): Record<string, unknown> {
  const keySet = keys.join("\u0000");
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    const list = keySet ? keySet.split("\u0000") : [];
    if (list.length === 0) return;
    Promise.all(list.map(async (k) => [k, await lk().get(k)] as const)).then((pairs) => {
      if (!cancelled) setValues(Object.fromEntries(pairs));
    }).catch(() => {});
    const unsubs = list.map((k) =>
      lk().onChange(k, () => {
        lk().get(k).then((v) => {
          if (!cancelled) setValues((prev) => ({ ...prev, [k]: v }));
        }).catch(() => {});
      })
    );
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [keySet]);

  return values;
}
