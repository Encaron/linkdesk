/**
 * E5.8#50.29/50.31：per-surface 切片坐标锚定（⑭ 影像分区）。
 *
 * 职责：zones 模式（--surface-bg-zones: 1，壳广播注入）下，量测本窗 zone 表面真实像素
 * rect → 写 `--surface-bg-size`（= 窗口尺寸）+ `--surface-<zone>-bg-position`（负偏移，
 * 相邻 zone 拼回连续图）；#50.31 ResizeObserver 监听窗口 resize / 布局变化（侧栏折叠、
 * 脱出窗缩放）→ 重算重写。
 *
 * E5.8 Phase 11.15（R3 根治）：`--surface-bg-size`/`--surface-<zone>-bg-position` 是本模块
 * 唯一所有（写/清同源）——壳引擎 SURFACE_ZERO 不再包含这两组键，每次重应用不再覆盖量测值；
 * 退出 zones 模式对称自清（见 clearZoneMeasurements）。
 *
 * 放 preload-pool 因：壳 ThemeEngine 单实例广播全窗、无法知每窗像素尺寸；zone rect 只
 * 存在于渲染层 DOM（壳侧无布局像素坐标）。引擎保持纯函数承诺（不订阅事件/不碰 DOM）。
 * 依赖方向：events → surface-zones（theme:changed 注入后按标记门控调用）。零反向依赖。
 */

/** 6 个表面 zone——选择器与 #50.7 表面选择器一致（.side-panel = 侧栏内层，动态宽 resize.size）。
    E5.8#73：补 `.panel-zone`（痛点 11 底部面板无切片——CSS 消费面 + 量测面双缺口补齐）。
    panel 显隐（Ctrl+J）时 display:none → getBoundingClientRect 全 0 → 写 0px 0px 偏移，
    无害（panel 不渲染）；重新显示 → ResizeObserver 重算真实偏移（收敛判据沿用 #62）。 */
const ZONE_SELECTORS: ReadonlyArray<{ key: string; selector: string }> = [
  { key: "titlebar", selector: ".titlebar" },
  { key: "icon-bar", selector: ".icon-bar" },
  { key: "side-panel", selector: ".side-panel" },
  { key: "main-zone", selector: ".main-zone" },
  { key: "panel-zone", selector: ".panel-zone" },
  { key: "status-bar", selector: ".status-bar" },
];

/** E5.8 Phase 11.15（R3 根治）：本模块量测写入的全部键——写/清同源（对称所有权）。
    壳引擎 SURFACE_ZERO 已移除这两组键，池侧是唯一所有者：量测写、退出 zones 自清，
    否则残留量测值会把纹理拉成整窗大小/负偏移错位（zones→纹理主题切换回归）。 */
const ZONE_MEASURED_KEYS: readonly string[] = [
  "surface-bg-size",
  ...ZONE_SELECTORS.map(({ key }) => `surface-${key}-bg-position`),
];

/** zones 退出自清——removeProperty 掉本模块量测写入的全部键（写/清同源防漂移） */
function clearZoneMeasurements(root: HTMLElement): void {
  for (const key of ZONE_MEASURED_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

/** zones 模式活跃 = 文档根内联样式里有 `--surface-bg-zones: 1`（壳 applyTheme 广播注入）。
    `--${k}` 注入惯例——SURFACE_ZERO 恒写 zones: "0"，非 zones 主题自动清标记。 */
function isZonesMode(root: HTMLElement): boolean {
  return root.style.getPropertyValue("--surface-bg-zones") === "1";
}

/** 重测量试上限——React 挂载晚于 theme:changed 时轮询等 zone 出现（200ms × 15 = 3s 兜底；命中 0 的空窗口封顶） */
const MAX_RETRY = 15;

let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
// E5.8#62 审计#3：收敛判据——以「本窗实际 zone 集」为准，不再硬编码全 zone 数。
// 连续重试间的命中数比较：命中 >0 且连续 2 轮不增长 = 本窗 zone 集已量测完整（收敛）；
// 命中 0（React mount 竞态——zone 尚未挂载）继续轮询。
let _lastFound = -1;
let _stableRounds = 0;

function cancelRetry(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _retryCount = 0;
  _lastFound = -1;
  _stableRounds = 0;
}

/** 量测本窗 zone rect → 写 size + 每 zone 负偏移。幂等；无 zones 门控直接跳过。 */
export function measureSurfaceZones(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!isZonesMode(root)) {
    cancelRetry();
    // E5.8 Phase 11.15（R3/R6）：退出 zones 自清——壳引擎不再写/广播 size+position，
    // 池侧是唯一所有者，对称清掉上次量测值（zones→纹理主题切换防残留）。
    clearZoneMeasurements(root);
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

  // E5.8#62 审计#3：收敛判据改「本窗实际 zone 集」——原硬编码 found===ZONE_SELECTORS.length（5）判全量挂载
  // → 脱出窗仅 titlebar+main 2 zone，found 恒 <5 → 每切 zones 主题 15×200ms 重试风暴 + 永不归零静默放弃。
  // 新判据：命中 >0 且连续 2 轮不增长 = 本窗 zone 集已量测完整，停止；命中 0（zone 尚未挂载——react
  // mount 竞态）继续轮询，MAX_RETRY 封顶防空窗口无限风暴；zone 两波挂载（found 增长）重置稳定计数，
  // 不提前收敛漏收迟挂 zone（两波间隔 < 2 轮重试 ≈400ms，固定壳表面同帧挂载，迟挂竞态窗口足够）。
  if (found > 0) {
    if (found === _lastFound) {
      _stableRounds++;
      if (_stableRounds >= 2) {
        cancelRetry(); // 收敛——本窗全部存在的 zone 已量测，无新 zone 会再出现
        return;
      }
    } else {
      _stableRounds = 0;
    }
  }
  _lastFound = found;
  if (_retryCount >= MAX_RETRY) {
    cancelRetry(); // 兜底封顶——zones 模式但始终无 zone（空布局/选择器失配）静默放弃，不再风暴
    return;
  }
  if (!_retryTimer) {
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _retryCount++;
      measureSurfaceZones();
    }, 200);
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
