/**
 * E5.8 Phase 12 #172——layoutTokens 运行时行高桥（F2）单测。
 *
 * 行高基准 TREE_ITEM_HEIGHT（22→26，⑥ 拍板）+ getScaledTreeItemHeight 按 `app.uiFontScale`
 * 缩放。与 CSS 侧 `calc(26px * var(--ui-scale))` 精确一致——step 5 的 scale 值（85/90/…/150）
 * 全部干净整除，无取整漂移。DnD 落点/键盘滚动/虚拟化三消费方共用同一函数。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { TREE_ITEM_HEIGHT, getScaledTreeItemHeight, setUiFontScale } from "../utils/layoutTokens";

describe("layoutTokens 运行时行高桥", () => {
  beforeEach(() => {
    setUiFontScale(100); // 恢复基准——防测试间缓存泄漏
  });

  it("基准行高 26px（⑥ 拍板 22→26）", () => {
    expect(TREE_ITEM_HEIGHT).toBe(26);
  });

  it("scale 100（默认）→ 26px，与 CSS calc(26px * 1.0) 一致", () => {
    setUiFontScale(100);
    expect(getScaledTreeItemHeight()).toBe(26);
  });

  it("scale 125 → 32.5px，与 CSS calc(26px * 1.25) 一致", () => {
    setUiFontScale(125);
    expect(getScaledTreeItemHeight()).toBe(32.5);
  });
});
