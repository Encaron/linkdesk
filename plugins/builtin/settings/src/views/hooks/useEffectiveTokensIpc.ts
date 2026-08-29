/**
 * useEffectiveTokensIpc——全量生效 token 集只读 hook（只读，不订阅单个键）。
 * E5.8#155：「跟随主题生效值徽标」数据源——跟随主题态下显示行实际生效值
 *（如 app.fontFamily 跟随主题 → 徽标「生效：‹font-ui 生效值›」；glassTint → 色块 + rgba）。
 * 源 = 壳侧 theme.getEffectiveTokens（计算样式合并集，键=token key，如 font-ui/glass-tint）。
 * 一次性拉取 + onDidChangeConfiguration 全量重拉（120ms 去抖，对齐 useBaselineSeedsIpc 同款）——
 * 主题/混搭/外观覆盖任一配置变 → 生效 token 变 → 徽标随新生效值刷新。
 * 依赖方向：hooks/useBaselineSeedsIpc 的 lk 守卫同款。
 */

import { useState, useEffect } from "react";

/** 只读生效 token 集——SettingRow 生效徽标消费 */
export function useEffectiveTokensIpc(): Record<string, string> {
  const [tokens, setTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      // theme 命名空间可缺（preload 未就绪 / 老版本契约）——守卫静默降级空集
      window.linkdesk?.theme?.getEffectiveTokens?.()
        .then((t) => { if (!cancelled) setTokens(t ?? {}); })
        .catch(() => {});
    };

    refresh();
    const unsub = window.linkdesk?.configuration?.onDidChangeConfiguration(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    });

    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
  }, []);

  return tokens;
}
