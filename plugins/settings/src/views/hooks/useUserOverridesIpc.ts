/**
 * useUserOverridesIpc——用户配置覆盖集（原始 user scope，非合并生效值）只读 hook。
 * E5.8#87：来源徽标 presence 派生——徽标判定「无 override = 🎨，有 = ✏️」需要知道配置是否被
 * 显式写过（getUserSettings 返回原始覆盖，区别于 get 的合并值——「清除 = 写空串」仍是有覆盖）。
 * getUserSettings 一次性拉取 + onDidChangeConfiguration 全量重拉（120ms 去抖合并滑杆突发，
 * 对齐 #89 滑杆节流先例）——重置删 key 事件推的是生效值非 undefined，无法增量判断存在性，故全量重拉。
 * 依赖方向：hooks/useConfigurationValueIpc 的 lk 守卫同款。
 */

import { useState, useEffect } from "react";

function lk() {
  const cfg = window.linkdesk?.configuration;
  if (!cfg) {
    throw new Error("[useUserOverridesIpc] window.linkdesk.configuration 不可用——preload 未就绪？");
  }
  return cfg;
}

/** 只读用户覆盖集——SettingRow 徽标消费（presence 派生） */
export function useUserOverridesIpc(): Record<string, unknown> {
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      lk().getUserSettings().then((s) => {
        if (!cancelled) setOverrides(s ?? {});
      }).catch(() => {});
    };

    refresh();
    const unsub = lk().onDidChangeConfiguration(() => {
      // 去抖——滑杆每 tick set 会连发 config:changed；重拉只在停歇后发生
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    });

    return () => { cancelled = true; clearTimeout(timer); unsub(); };
  }, []);

  return overrides;
}
