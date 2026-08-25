/**
 * useBaselineSeedsIpc——外观覆盖键 → 主题/混搭基准种子值集只读 hook。
 * E5.8#88：「已修改」徽标语义精化——播种值/恰与主题同值 = 🎨 主题，真偏离基线 = ✏️ 用户。
 * 基准源 = 壳侧 getThemeBaseTokens 无覆盖纯基线（theme.getBaselineSeeds API，键=配置 key，插件侧零映射）。
 * 一次性拉取 + onDidChangeConfiguration 全量重拉（120ms 去抖，对齐 useUserOverridesIpc 同款）。
 * 无活动配方 → API 返 null → 空集（徽标退化为 presence 派生——同 #87 行为，无回归）。
 * 依赖方向：hooks/useUserOverridesIpc 的 lk 守卫同款。
 */

import { useState, useEffect } from "react";

/** 只读基准种子集——SettingRow 徽标消费（value-vs-baseline 判定） */
export function useBaselineSeedsIpc(): Record<string, unknown> {
  const [seeds, setSeeds] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      // theme 命名空间可缺（preload 未就绪 / 老版本契约）——守卫静默降级空集
      window.linkdesk?.theme?.getBaselineSeeds?.()
        .then((s) => { if (!cancelled) setSeeds(s ?? {}); })
        .catch(() => {});
    };

    refresh();
    const unsub = window.linkdesk?.configuration?.onDidChangeConfiguration(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    });

    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
  }, []);

  return seeds;
}
