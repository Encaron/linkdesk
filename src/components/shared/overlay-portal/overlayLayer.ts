/**
 * 浮层层级权威——「Esc 只关最上层浮层」的**唯一**判据来源（E6#73b ④）。
 *
 * ## 为什么是 DOM 计算，不是模块级栈
 *
 * 插件被**独立打包**：`@linkdesk/ui` 不在 plugin-sdk 的 `DEFAULT_EXTERNAL` 里
 * （见 `packages/plugin-sdk/src/vite-config.ts` 与 `scripts/build-pool-vendor.mjs` 的 MAP_KEYS——
 * 只有 react 系 + i18next 走 import-map），所以同一窗口里**每份 bundle 各持一份本模块副本**。
 * 模块级数组跨 bundle 不共享 ⇒ 各算各的栈 ⇒ 插件侧的浮层与壳侧浮层互相看不见。
 * **DOM 是跨 bundle 的真·单一真相**（同在池窗，同一份 document）。
 *
 * ## 排序规则
 *
 * 1. **有效 z-index**——表面自身有 z 就用自身；否则沿祖先找第一个非 `auto` 的 z
 *    （内联 z 是既有约定：`Z_INDEX` 常量表 → dialog 5000 / quickPick 4000 / contextMenu 3000 /
 *    overlay-root 2000 / floatingPanel 1500，浮层表面一律取这张表的 inline 值）。
 * 2. 同 z 按**文档序**——后挂载者在上（同一 portal root 内文档序即挂载序）。
 *
 * 规则与「用户眼睛看到的谁盖谁」同源：拿不准时以 z 表为准（`src/constants.ts`）。
 */

/**
 * 浮层**表面**标记属性——所有浮层根元素都带它：
 * OverlayPortal 包装盒（`open` 时）、池侧 Dialog / QuickPick / FloatingPanel 面板本体。
 * 纯行为标记，CSS 不使用（隔离地板用的是另一个属性 `data-overlay-wrapper`，两者别混）。
 */
export const OVERLAY_LAYER_ATTR = "data-overlay-layer";

/** 表面元素（含自身）的有效 z-index——自身 auto 则沿祖先找第一个非 auto 者，找不到按 0。 */
function effectiveZ(el: HTMLElement): number {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const z = getComputedStyle(cur).zIndex;
    if (z !== "auto" && z !== "") {
      const n = Number(z);
      if (!Number.isNaN(n)) return n;
    }
    cur = cur.parentElement;
  }
  return 0;
}

/**
 * 传进来的表面是不是当前最上层的那一个。
 * `el` 传 null（未挂载/无 ref）→ true——没有表面就没得比，闭自己的行为最保守。
 */
export function isTopmostOverlay(el: HTMLElement | null | undefined): boolean {
  if (!el || !el.isConnected) return true;
  const layers = Array.from(document.querySelectorAll<HTMLElement>(`[${OVERLAY_LAYER_ATTR}]`));
  if (layers.length <= 1) return true;
  const zs = layers.map(effectiveZ);
  const max = Math.max(...zs);
  return layers.indexOf(el) === zs.lastIndexOf(max);
}

/**
 * 同上一版，但接受**表面内部**的任意元素——沿祖先找到最近的标记表面再比。
 * 给「组件只持有内容 ref、包装盒归 OverlayPortal」的消费方用（如 ContextMenu 的 menuRef）。
 */
export function isTopmostOverlayFrom(inner: HTMLElement | null | undefined): boolean {
  return isTopmostOverlay(inner?.closest<HTMLElement>(`[${OVERLAY_LAYER_ATTR}]`) ?? null);
}
