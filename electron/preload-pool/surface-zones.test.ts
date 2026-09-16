/**
 * E5.8#62 审计#3 回归守卫——surface-zones 收敛判据。
 *
 * 原判据硬编码 found===ZONE_SELECTORS.length（5）判全量挂载 → 脱出窗（仅 titlebar+main 2 zone）
 * 每切 zones 主题 15×200ms 重试风暴 + 永不归零静默放弃。新判据以「本窗实际 zone 集」为准：
 * 命中 >0 连续 2 轮稳定 = 收敛；命中 0（react mount 竞态）轮询封顶；found 增长重置稳定计数（迟挂 zone 不遗漏）。
 *
 * jsdom 无真实布局——getBoundingClientRect 全零 → 负偏移断言 "0px 0px"（确定性）。
 * fake timers 驱动 200ms 重试轮；vi.getTimerCount() 归零 = 已收敛不再调度（风暴守卫）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { measureSurfaceZones, queryVisibleZone, ZONE_SELECTORS } from "./surface-zones";

/** zone key → 真实类名。**从 ZONE_SELECTORS 现取，不手抄**——选择器改名（如 `.titlebar` →
    `.ldk-titlebar`，E6#109j-a）时测试自己跟上，不会「测试绿而实机量测全 0」的假绿。 */
function zoneClassOf(key: string): string {
  const sel = ZONE_SELECTORS.find((z) => z.key === key)?.selector;
  return sel?.replace(/^\./, "") ?? key;
}

/** 构建 zones 模式 DOM——documentElement 打 zones 标记 + 挂指定 class 的 zone 元素（选择器与 ZONE_SELECTORS 一致）。
    E5.8#127：zone 挂真实 .pool-body（grid 容器）内——换边触发测试需改其 grid-template（React inline style 写点）。 */
function setupZones(...keys: string[]): void {
  const root = document.documentElement;
  root.style.setProperty("--surface-bg-zones", "1");
  document.body.innerHTML = '<div class="ldk-pool-body" style="grid-template-columns: auto auto 1fr auto"></div>';
  const body = document.querySelector(".ldk-pool-body")!;
  for (const key of keys) {
    const el = document.createElement("div");
    el.className = zoneClassOf(key);
    body.appendChild(el);
  }
}

function zonePos(key: string): string {
  return document.documentElement.style.getPropertyValue(`--surface-${key}-bg-position`);
}

describe("surface-zones 收敛判据（E5.8#62 审计#3）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // E5.8#126：jsdom 无布局引擎——offsetParent 对无定位祖先的可见元素也返回 null（真实浏览器返回
    // body）。统一 mock 模拟真实可见性语义：自身/祖先 display:none → null；可见 → body（非 null）。
    // queryVisibleZone 以「offsetParent !== null」判可见——真实浏览器语义正确，此 mock 让 jsdom 可测。
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
      const HIDDEN = '[style*="display: none"], [style*="display:none"]';
      return this.matches(HIDDEN) || this.closest(HIDDEN) ? null : document.body;
    });
    // 清上一测试的残留 timer + 模块级计数器（zones 关 → cancelRetry）
    document.documentElement.style.removeProperty("--surface-bg-zones");
    measureSurfaceZones();
    vi.clearAllTimers();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("脱出窗 2 zone——量测收敛不风暴（原 found<5 会 15×200ms 重试风暴）", () => {
    setupZones("titlebar", "main-zone");
    measureSurfaceZones();
    expect(zonePos("titlebar")).toBe("0px 0px");
    expect(zonePos("main-zone")).toBe("0px 0px");
    expect(zonePos("status-bar")).toBe(""); // 本窗不存在的 zone 不写
    // 收敛后不再调度——推完 3s timer 归零（旧实现 found<5 满 15 轮才停）
    vi.advanceTimersByTime(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("主窗 5 zone——全量量测后收敛", () => {
    setupZones("titlebar", "icon-bar", "side-panel", "main-zone", "status-bar");
    measureSurfaceZones();
    expect(zonePos("status-bar")).toBe("0px 0px");
    expect(zonePos("icon-bar")).toBe("0px 0px");
    expect(zonePos("side-panel")).toBe("0px 0px");
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("迟挂载 zone——命中数增长重置稳定计数，不提前收敛漏收", () => {
    setupZones("titlebar", "main-zone");
    measureSurfaceZones();
    vi.advanceTimersByTime(200); // 第 2 轮：仍 2 → stable=1（未收敛）
    // 迟挂 status-bar——found 增长 → 重置稳定计数继续轮询
    const sb = document.createElement("div");
    sb.className = "ldk-status-bar";
    document.body.appendChild(sb);
    vi.advanceTimersByTime(200); // 第 3 轮：found=3 > 2 → 量测命中迟挂 zone
    expect(zonePos("status-bar")).toBe("0px 0px");
    vi.advanceTimersByTime(600); // 收敛——不再调度
    expect(vi.getTimerCount()).toBe(0);
  });

  it("zones 模式但 0 zone——轮询封顶后静默放弃（不无限风暴）", () => {
    setupZones(); // 无任何 zone（空布局/选择器失配）
    measureSurfaceZones();
    vi.advanceTimersByTime(4000); // 超过 15×200ms 封顶
    expect(vi.getTimerCount()).toBe(0);
  });

  it("E5.8 Phase 11.15（R6 防回归）——退出 zones 自清全部量测键（size + 每 zone 位置）", () => {
    setupZones("titlebar", "main-zone");
    measureSurfaceZones();
    expect(zonePos("titlebar")).toBe("0px 0px");
    expect(document.documentElement.style.getPropertyValue("--surface-bg-size")).not.toBe("");
    // 退出 zones——壳引擎不再写/广播坐标键，池侧唯一所有者对称自清（残留会拉大纹理/错位）
    document.documentElement.style.removeProperty("--surface-bg-zones");
    measureSurfaceZones();
    expect(zonePos("titlebar")).toBe("");
    expect(zonePos("main-zone")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--surface-bg-size")).toBe("");
  });

  it("E5.8#126 多 .side-panel——跳过 display:none 占位选可见（衣袖重复根因守卫）", () => {
    document.body.innerHTML = '<div class="ldk-pool-body"></div>';
    const body = document.querySelector(".ldk-pool-body")!;
    // keep-alive 非活动容器/折叠占位在文档前（display:none）——querySelector('.side-panel') 原会选中它
    const hidden = document.createElement("div");
    hidden.className = "ldk-side-panel";
    hidden.style.display = "none";
    const visible = document.createElement("div");
    visible.className = "ldk-side-panel";
    body.appendChild(hidden);
    body.appendChild(visible);
    expect(queryVisibleZone(".ldk-side-panel")).toBe(visible);
    // 量测全走可见选择——隐藏占位在前不干扰，写出 token（jsdom rect 全 0 → 0px 0px 确定性）
    document.documentElement.style.setProperty("--surface-bg-zones", "1");
    measureSurfaceZones();
    expect(zonePos("side-panel")).toBe("0px 0px");
  });

  it("E5.8#127 换边触发——量测命中补挂布局观察器 + pool-body grid-template 变化 → MutationObserver → setTimeout 重算（尺寸不变 ResizeObserver 盲区）", async () => {
    setupZones("titlebar", "side-panel", "main-zone");
    // 本测试是本文件首个触碰布局观察器的用例——measureSurfaceZones 命中（found>0）幂等补挂
    // （首广播可能早于 .pool-body 挂载，events.ts 挂载失败后靠量测命中补挂——#127 补挂守卫）
    measureSurfaceZones(); // 收敛——写 size + token + 补挂 ensureSurfaceLayoutObserver
    expect(document.documentElement.style.getPropertyValue("--surface-bg-size")).not.toBe("");
    document.documentElement.style.removeProperty("--surface-bg-size"); // 清——验证下面重算写回
    // 换边：React 写新 grid-template（位置平移，zone 尺寸不变——ResizeObserver 不触发）
    const body = document.querySelector<HTMLElement>(".ldk-pool-body")!;
    body.style.gridTemplateColumns = "auto 1fr auto auto";
    await vi.advanceTimersByTimeAsync(16); // flush MutationObserver microtask + setTimeout 合并回调
    expect(document.documentElement.style.getPropertyValue("--surface-bg-size")).not.toBe(""); // 已重算写回
  });
});
