/**
 * dev 宿主 mock 注入锚点（E6#23.5c 位置定案）。
 *
 * 纯浏览器 dev 没有真实 preload → `window.linkdesk` 不存在。现役注入体 = **throw-on-call 兜底**：
 * 任何未 mock 的 API 调用抛「仅在生产环境可用」而非静默 `undefined`/`TypeError`——防「dev 正常、
 * 装进 LinkDesk 才炸」的反向落差（E6#27b 精神，先落行为、后补方法表）。
 *
 * 🔵 承接锚：真方法默认值表 = E6#27（generate-contract.mjs 第二输出目标，第 2.3 轮）——
 * 届时替换本文件注入体（代理内填充生成的方法），`injectDevMockApi()` 签名与调用点不变。
 */
export function injectDevMockApi(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>).linkdesk) return;

  // path 跟踪代理：window.linkdesk.configuration.get() → 报「configuration.get 未 mock」
  const makeNs = (path: string[]): unknown =>
    new Proxy(function () {
      /* placeholder: 调用时走 apply trap */
    } as unknown as () => unknown, {
      apply(): never {
        const dotted = path.join(".") || "(根)";
        throw new Error(
          `[dev] window.linkdesk${dotted ? "." + dotted : ""} 未 mock——该 API 仅在生产环境可用` +
            `（build → 装进 LinkDesk 走真实 IPC）。E6#27 生成 mock 落地前，UI 骨架开发请先不调真实 API。`,
        );
      },
      get(_target, prop): unknown {
        if (prop === "then") return undefined; // 防 Promise.resolve(proxy) 探测无限递归
        return makeNs([...path, String(prop)]);
      },
    });

  (window as unknown as Record<string, unknown>).linkdesk = makeNs([]);
}
