/**
 * E5.8#50.29/50.31：per-surface 切片坐标锚定（⑭ 影像分区）。
 *
 * 职责：切片模式（--surface-bg-zones: 1 影像分区，壳广播注入）下，量测本窗 zone 表面
 * 真实像素 rect → 写 `--surface-bg-size`（= 窗口尺寸）+ `--surface-<zone>-bg-position`
 * （负偏移，相邻 zone 拼回连续图）；#50.31 ResizeObserver 监听窗口 resize / 布局变化
 * （侧栏折叠、脱出窗缩放）→ 重算重写。
 *
 * E5.8#117：全景镜像分支已删除——panorama 镜像机制整体废除（cp114 证据：主表面 ::before
 * backdrop-filter 能直接采样兄弟 .background-layer，镜像切片多余；#117 用户三连投诉根治）。
 * 本模块只管 zones 影像分区切片量测。
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
    无害（panel 不渲染）；重新显示 → ResizeObserver 重算真实偏移（收敛判据沿用 #62）。
    E5.8#126：`.side-panel` DOM 有多个匹配（keep-alive 非活动容器 display:none / 折叠占位 /
    空态占位 + 右侧栏同款类）——querySelector 取首个可能命中 display:none 占位 → rect 全 0 →
    token 恒 0 0（衣袖重复根因）。量测一律走 queryVisibleZone 选可见元素（见下）。
    E6#109j-a：`titlebar` 的选择器随宿主容器类名一起前缀化（`.titlebar` → `.ldk-titlebar`，硬约束 23）
    ——导出供单测直引，测试的 fixture DOM 由本表派生（不手抄类名，改名即同步）。 */
export const ZONE_SELECTORS: ReadonlyArray<{ key: string; selector: string }> = [
  { key: "titlebar", selector: ".ldk-titlebar" },
  { key: "icon-bar", selector: ".icon-bar" },
  { key: "side-panel", selector: ".side-panel" },
  { key: "main-zone", selector: ".main-zone" },
  { key: "panel-zone", selector: ".panel-zone" },
  { key: "status-bar", selector: ".status-bar" },
];

/**
 * E5.8#126：选「可见」zone 元素——querySelector(selector) 返回文档顺序第一个，可能是
 * display:none 占位（keep-alive 非活动容器 / 折叠态 / 侧栏隐藏 / 右侧栏同款 .side-panel 类），
 * 其 rect 全 0 → 切片坐标恒 0 0 → 侧栏显示图左上角，与相邻 zone 显示的图区域重叠（衣袖重复根因）。
 * offsetParent !== null = 元素及祖先均非 display:none（zone 均 position:relative，可见必非 null）——
 * 折叠态落到折叠占位（正确窄条坐标）、侧栏隐藏自然落到右侧栏（swap 对边语义）。
 * 导出供单测直引（bug 根因守卫）。
 */
export function queryVisibleZone(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null) return el;
  }
  return null;
}

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

/** 切片模式活跃 = zones 模式（--surface-bg-zones: 1，⑭ 影像分区）。量测写 size+负偏移——
    切片同用窗口坐标系。`--${k}` 注入惯例——SURFACE_ZERO 恒写标记 "0"，非切片主题自动清。
    E5.8#117：--surface-bg-mirror 全景镜像已删除（cp114 证据：::before backdrop-filter 直接采样
    .background-layer，镜像机制整体废除）——本模块只管 zones 影像分区切片。 */
function isSurfaceSliceMode(root: HTMLElement): boolean {
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

/** 量测本窗 zone rect → 写 size + 每 zone 负偏移。幂等；无切片门控直接跳过。 */
export function measureSurfaceZones(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!isSurfaceSliceMode(root)) {
    cancelRetry();
    // E5.8 Phase 11.15（R3/R6）：退出切片自清——壳引擎不再写/广播 size+position，
    // 池侧是唯一所有者，对称清掉上次量测值（zones/mirror → 无切片主题切换防残留）。
    clearZoneMeasurements(root);
    return;
  }

  let found = 0;
  try {
    // 背景图尺寸 = 窗口尺寸——图以窗口为坐标系，每 zone 负偏移拉回正确区域
    root.style.setProperty("--surface-bg-size", `${window.innerWidth}px ${window.innerHeight}px`);
    for (const { key, selector } of ZONE_SELECTORS) {
      const el = queryVisibleZone(selector);
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
    // E5.8#127：DOM zone 已就绪——幂等补挂布局结构观察器。首广播可能早于 React mount（.pool-body
    // 未挂载），events.ts zoneSignature 分支挂载会静默放弃 → 换边永不触发；量测命中 = DOM 就绪信号。
    ensureSurfaceLayoutObserver();
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
    监听 documentElement（窗口 resize）+ 各 zone 可见元素（侧栏折叠/拖拽等尺寸变化）。
    E5.8#126：zone 元素改走 queryVisibleZone——observe display:none 占位只会浪费触发。 */
export function ensureSurfaceZonesObserver(): void {
  if (typeof ResizeObserver === "undefined" || _observer) return;
  _observer = new ResizeObserver(() => measureSurfaceZones());
  _observer.observe(document.documentElement);
  for (const { selector } of ZONE_SELECTORS) {
    const el = queryVisibleZone(selector);
    if (el) _observer.observe(el);
  }
}

// ── E5.8#127：布局结构变化重算（换边错乱根治）────────────────────────────
// 换边/面板显隐/edge/align 切换 = computePoolGrid 输出 grid-template 纯位置平移，zone 尺寸不变 →
// ResizeObserver（只监听尺寸）+ events.ts zoneSignature 三键（换边不变）双不触发 → token 陈旧。
// grid-template 由 React inline style 写在 .pool-body（grid 容器，index.css:350 display:grid）——
// MutationObserver 监听其 style 属性变化（grid 结构变化信号）→ 合并防抖 → 量测。
// 量测幂等 + 收敛判据 + MAX_RETRY 兜底防风暴；量测保证 React commit 后布局稳定再写（幂等重算）。
// 与 ResizeObserver（尺寸变化）、zoneSignature（切主题/换图）三条触发路径并存互补。
let _layoutObserver: MutationObserver | null = null;
let _layoutTimer: ReturnType<typeof setTimeout> | null = null;
// 单例观察的 pool-body 节点——首广播可能早于 React mount（.pool-body 未挂载），events.ts 挂载会
// 静默放弃；measureSurfaceZones 命中（DOM 就绪）后补挂。调用时若 .pool-body 节点已变（重建/换窗）
// → 重挂，避免观察已移除的旧节点（测试新 DOM 换边失聪）。
let _layoutObservedBody: HTMLElement | null = null;

// E5.8#127（实机修正）：防抖用 setTimeout 而非 requestAnimationFrame——rAF 在窗口被完全遮挡
// （occlusion，document.hidden）时永久暂停，后台布局变化（配置恢复等）token 永不收敛；setTimeout
// 后台节流到 ~1s 仍会触发 → 最终收敛。前台 setTimeout(0) ≈4ms 合并用户无感；CDP 实机验证同理
// （验证时窗口常被遮挡，rAF 链路会卡死验证）。
function scheduleLayoutMeasure(): void {
  if (_layoutTimer !== null) return;
  _layoutTimer = setTimeout(() => {
    _layoutTimer = null;
    measureSurfaceZones();
  }, 0);
}

/** #127：补布局结构触发——单例；每次调用校验观察目标仍是当前 .pool-body（变则重挂）。
    zones 未激活时量测幂等直返。 */
export function ensureSurfaceLayoutObserver(): void {
  if (typeof MutationObserver === "undefined") return;
  const body = document.querySelector<HTMLElement>(".pool-body");
  if (!body) return;
  if (_layoutObserver && _layoutObservedBody === body) return; // 已观察当前 pool-body
  if (_layoutObserver) _layoutObserver.disconnect();
  else _layoutObserver = new MutationObserver(scheduleLayoutMeasure);
  _layoutObservedBody = body;
  _layoutObserver.observe(body, { attributes: true, attributeFilter: ["style"] });
}
