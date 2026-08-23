/**
 * E5.8#50.29/50.31：per-surface 切片坐标锚定（⑭ 影像分区）。
 *
 * 职责：zones 模式（--surface-bg-zones: 1，壳广播注入）下，量测本窗 5 zone 表面真实像素
 * rect → 写 `--surface-bg-size`（= 窗口尺寸）+ `--surface-<zone>-bg-position`（负偏移，
 * 相邻 zone 拼回连续图）；#50.31 ResizeObserver 监听窗口 resize / 布局变化（侧栏折叠、
 * 脱出窗缩放）→ 重算重写。
 *
 * 放 preload-pool 因：壳 ThemeEngine 单实例广播全窗、无法知每窗像素尺寸；zone rect 只
 * 存在于渲染层 DOM（壳侧无布局像素坐标）。引擎保持纯函数承诺（不订阅事件/不碰 DOM）。
 * 依赖方向：events → surface-zones（theme:changed 注入后按标记门控调用）。零反向依赖。
 */

/** 5 个表面 zone——选择器与 #50.7 表面选择器一致（.side-panel = 侧栏内层，动态宽 resize.size） */
const ZONE_SELECTORS: ReadonlyArray<{ key: string; selector: string }> = [
  { key: "titlebar", selector: ".titlebar" },
  { key: "icon-bar", selector: ".icon-bar" },
  { key: "side-panel", selector: ".side-panel" },
  { key: "main-zone", selector: ".main-zone" },
  { key: "status-bar", selector: ".status-bar" },
];

/** zones 模式活跃 = 文档根内联样式里有 `--surface-bg-zones: 1`（壳 applyTheme 广播注入）。
    `--${k}` 注入惯例——SURFACE_ZERO 恒写 zones: "0"，非 zones 主题自动清标记。 */
function isZonesMode(root: HTMLElement): boolean {
  return root.style.getPropertyValue("--surface-bg-zones") === "1";
}

/** 重测量试上限——React 挂载晚于 theme:changed 时轮询等 zone 出现（200ms × 15 = 3s 兜底） */
const MAX_RETRY = 15;

let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function cancelRetry(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _retryCount = 0;
}

/** 量测本窗 5 zone rect → 写 size + 每 zone 负偏移。幂等；无 zones 门控直接跳过。 */
export function measureSurfaceZones(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!isZonesMode(root)) {
    cancelRetry();
    return;
  }

  let found = 0;
  try {
    // 背景图尺寸 = 窗口尺寸——图以窗口为坐标系，每 zone 负偏移拉回正确区域
    root.style.setProperty("--surface-bg-size", `${window.innerWidth}px ${window.innerHeight}px`);
    for (const { key, selector } of ZONE_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el) continue;
      found++;
      const rect = el.getBoundingClientRect();
      root.style.setProperty(
        `--surface-${key}-bg-position`,
        `${Math.round(-rect.left)}px ${Math.round(-rect.top)}px`
      );
      // 自愈观察——迟挂载的 zone 在量测命中时补挂 ResizeObserver（幂等）
      _observer?.observe(el);
    }
  } catch (e) {
    console.error("[preload-pool] surface-zones 量测失败:", e);
  }

  // zone 未全挂载 → 定时重试（react mount 竞态兜底）
  if (found < ZONE_SELECTORS.length && _retryCount < MAX_RETRY && !_retryTimer) {
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _retryCount++;
      measureSurfaceZones();
    }, 200);
  } else if (found === ZONE_SELECTORS.length) {
    _retryCount = 0;
  }
}

let _observer: ResizeObserver | null = null;

/** #50.31：窗口 resize / 布局变化 → 重算切片坐标。单例——池生命周期只挂一次。
    监听 documentElement（窗口 resize）+ 各 zone 元素（侧栏折叠等布局变化）。 */
export function ensureSurfaceZonesObserver(): void {
  if (typeof ResizeObserver === "undefined" || _observer) return;
  _observer = new ResizeObserver(() => measureSurfaceZones());
  _observer.observe(document.documentElement);
  for (const { selector } of ZONE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) _observer.observe(el);
  }
}
