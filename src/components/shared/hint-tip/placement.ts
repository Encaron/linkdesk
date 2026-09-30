/**
 * HintTip 落点/尖角/指针归属——**纯函数**（04「悬停提示系统」件 1；2026-09-27 落点返工版；
 * 2026-09-30 补 `isPointerOnAnchor` 指针归属判据）。
 *
 * ── 为什么推翻初版判据（用户实机挑出的三处毛病，诊断全文见返工件 00-README §二）──
 * 初版把「贴不贴得下」判成**双轴整条 fits**，于是同一个机制长出三张脸：
 *   ① **副轴否决主轴**——✕ 在窗口最右缘：首选 top 主轴放不下、想翻 bottom，可 bottom 的**横向**
 *      也越界 ⇒ 唯一退路"翻面"被否 ⇒ 只剩夹紧 ⇒ 条被拉回来**铺在 ✕ 身上**
 *      （用户原话「直接盖在 × 的表面上」的真机制；⛔ 不是他猜的"居不了中所以坐标乱了"——本函数
 *      从头到尾没有居中那一步）；
 *   ② **边对齐不居中**——条与锚**左缘**对齐，而锚往往不是提示的中点（图标栏 42×42 命中框里的字形
 *      只有 24×24）⇒ 条看着"悬空"（用户「图标肯定比显示它的看不见的框小一点」的那个 15px 观感）；
 *   ③ **没有"绝不压锚"的硬保证**——夹紧是唯一兜底，而兜底方向正好是回锚。
 *
 * ── 现行几何约定（用户 2026-09-27 同日拍板「案 C：气泡」后的五条，改动前先读）──
 * ① **`GAP_PX = 6` 不许再放大**——条与锚的归属感全靠贴紧（尖角是"补足指向"的第二只手，见 ⑤）；
 * ② **主轴判可贴 · 副轴居中后夹紧**——主轴只问"那一侧够不够 条长 + GAP"，⛔ 副轴越界**不再**否决
 *    翻面；副轴一律先与锚**中心**对齐，再夹进视口；
 * ③ **绝不压锚**——落点若"离锚太近"（不只压住，连 GAP 都没保住：夹紧把条拉回锚上、尖角会插进锚里），
 *    先换**同一轴的对面**（top↔bottom / left↔right），对面也不行才退回**四面里空间最大**的一侧；
 *    ⛔ 次序不许颠倒（2026-09-30 标签栏现场：直接跳四面临 ⇒ 宽窗口里常选中"右"，条被甩到旁边轴上、
 *    横着压住下一个标签；案卷 04「标签提示落到右侧挡住下一个」）。两条都照 `HintCard` 保底：
 *    宁可换方位，也不盖住用户正指着的东西；
 * ④ **夹紧不裁字**——仍只吐 `top/left`，尺寸由调用方原样使用（保底②，⛔ 不靠截断文字换贴合）；
 * ⑤ **气泡尖角**——用户同日**改判**：初版那条拍板「不要小箭头，就是一个框型」**作废**，
 *    归属感从此由"贴紧 ＋ 尖角指向"共同承担。尖角指向锚的**副轴中心**（`computeTailOffset`）。
 *
 * ⛔ 本函数只管"条落在哪"，不管"长什么样"（样式在 `HintTip.css`、DOM 在 `HintTipRenderer.tsx`）。
 */

/** 锚与条的间距（见上 ①——不许放大） */
export const GAP_PX = 6;
/** 视口边缘夹紧余量（同 HintCard） */
export const EDGE_PX = 8;
/** 尖角边长（`rotate(45deg)` 的正方形——对角线 ≈11.3px，露出约半个指向锚） */
export const TAIL_SIZE_PX = 8;
/** 尖角**近端外缘**距条两端的最小距离（= `--radius-sm` 4px：尖角不许压在圆角上） */
export const TAIL_EDGE_INSET_PX = 4;

/** 四向首选方位——`top` 为缺省（贴锚上方），主轴放不下翻反面 */
export type TipPlacement = "top" | "bottom" | "left" | "right";

/** 锚矩形（只取本件用得到的四元组——`getBoundingClientRect()` 可直接喂） */
export interface TipAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 条的实测尺寸（先渲染再量——`max-content` 宽度不预知） */
export interface TipSize {
  width: number;
  height: number;
}

export interface TipPosition {
  top: number;
  left: number;
  /** 实际落点方位（可能与传入的 `placement` 不同——翻过面或被迫换边） */
  placement: TipPlacement;
}

/** 方位枚举的固定次序（并列时的裁决序——判据确定，单测可钉） */
const SIDES: readonly TipPlacement[] = ["top", "bottom", "left", "right"];

/** 主/反方位配对——翻面只在自己那条轴上翻（上下互翻、左右互翻），⛔ 不跨轴跳 */
const OPPOSITE: Record<TipPlacement, TipPlacement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** 上下（纵轴）方位——主轴/副轴、量与宽在这两条分支上分岔，一处判 */
function isVertical(placement: TipPlacement): boolean {
  return placement === "top" || placement === "bottom";
}

/** 按方位算出该方位的原始落点（主轴贴边保 GAP、副轴暂按锚左/上缘——居中在下面统一做） */
function rawPlacement(anchor: TipAnchorRect, tip: TipSize, placement: TipPlacement): { top: number; left: number } {
  switch (placement) {
    case "top":
      return { top: anchor.top - tip.height - GAP_PX, left: anchor.left };
    case "bottom":
      return { top: anchor.bottom + GAP_PX, left: anchor.left };
    case "left":
      return { top: anchor.top, left: anchor.left - tip.width - GAP_PX };
    case "right":
      return { top: anchor.top, left: anchor.right + GAP_PX };
  }
}

/** 各侧**可用空间**（锚到视口那一条边的距离）——判据的唯一输入之一 */
function spaceOn(anchor: TipAnchorRect, viewport: TipSize): Record<TipPlacement, number> {
  return {
    top: anchor.top,
    bottom: viewport.height - anchor.bottom,
    left: anchor.left,
    right: viewport.width - anchor.right,
  };
}

/** 某一侧**需要多少**（条在主轴上的长度 + GAP；⛔ 不含 EDGE_PX ——那是夹紧的余量，不是"贴不贴得下"） */
function needOn(tip: TipSize, side: TipPlacement): number {
  return (isVertical(side) ? tip.height : tip.width) + GAP_PX;
}

/** 四面里空间最大的一侧（主轴两边都不够、或夹紧要压锚时的兜底；并列按 `SIDES` 顺序取前） */
function roomiestSide(space: Record<TipPlacement, number>): TipPlacement {
  return SIDES.reduce((best, s) => (space[s] > space[best] ? s : best), SIDES[0]);
}

/** 夹紧到区间（`min > max` 时取 `min`——条自身比视口还大时的保底，照初版「宁可溢出尾端也不切头」） */
function clampInto(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * 「离锚太近」——**不只是压住**，连 `GAP_PX` 都没保住也算（夹紧把条拉回锚上、尖角会插进锚里）。
 * 做法是拿**外扩 `GAP_PX` 的锚矩形**与条做标准矩形相交判定：正常落点里主轴恰好相距 GAP（`>` 不成立 ⇒ 不触发），
 * 副轴本来就是要与锚同跨的（所以判据真正分辨的是**主轴**那一对）。
 */
function tooClose(pos: { top: number; left: number }, tip: TipSize, anchor: TipAnchorRect): boolean {
  return (
    pos.left < anchor.right + GAP_PX &&
    pos.left + tip.width > anchor.left - GAP_PX &&
    pos.top < anchor.bottom + GAP_PX &&
    pos.top + tip.height > anchor.top - GAP_PX
  );
}

/** 在**已定方位**上落一次：主轴贴边保 GAP ⇒ 副轴与锚中心对齐 ⇒ 两轴夹进视口 */
function placeOn(side: TipPlacement, anchor: TipAnchorRect, tip: TipSize, viewport: TipSize): { top: number; left: number } {
  const pos = rawPlacement(anchor, tip, side);
  if (isVertical(side)) pos.left = (anchor.left + anchor.right) / 2 - tip.width / 2;
  else pos.top = (anchor.top + anchor.bottom) / 2 - tip.height / 2;
  return {
    top: clampInto(pos.top, EDGE_PX, viewport.height - tip.height - EDGE_PX),
    left: clampInto(pos.left, EDGE_PX, viewport.width - tip.width - EDGE_PX),
  };
}

/**
 * 条的落点：首选方位够放 ⇒ 采用；不够 ⇒ 翻**主轴反面**；翻面也够不着 ⇒ 取空间最大的一侧；
 * 最后若"离锚太近"（夹紧把条拉回了锚上）⇒ 换空间最大的一侧重落一次。⛔ 任何一步都不裁字。
 *
 * @param anchor  锚矩形（视口坐标——本件用 `position: fixed`，与 `getBoundingClientRect()` 同系）
 * @param tip     条的**实测**尺寸（先渲染后量；本函数不估计）
 * @param viewport 视口尺寸（`innerWidth/innerHeight`）
 * @param placement 首选方位（`data-hint-placement` / 组件 `placement` 给的）
 */
export function computeTipPosition(anchor: TipAnchorRect, tip: TipSize, viewport: TipSize, placement: TipPlacement): TipPosition {
  const space = spaceOn(anchor, viewport);
  const opposite = OPPOSITE[placement];

  let side = placement;
  if (space[placement] < needOn(tip, placement)) {
    // 主轴首选那侧不够 ⇒ 先看反面（**只看主轴**——副轴越界交给夹紧，⛔ 不再否决翻面：这就是初版的病灶）
    side = space[opposite] >= needOn(tip, opposite) ? opposite : roomiestSide(space);
  }

  const pos = placeOn(side, anchor, tip, viewport);
  if (!tooClose(pos, tip, anchor)) return { ...pos, placement: side };

  // 夹紧把条拉回锚上了（或四面都不够）⇒ 换空间最大的一侧重落（⛔ 仍不裁字）
  const forced = roomiestSide(space);
  return { ...placeOn(forced, anchor, tip, viewport), placement: forced };
}

/**
 * 尖角沿条边的落位——**返回元素的 `left`/`top` 值**（已减半边长，即元素左上角坐标）。
 *
 * 方向约定（`rotate(45deg)` 的 8×8 正方形）：**留哪两条边 ＝ 指向哪**，与 `HintTip.css` 的
 * `[data-tip-placement]` 四条规则**必须配套**（改一处就要改另一处，否则尖角会指歪 90°——
 * 参考图里踩过这个坑，见返工件 00-README §六）。
 * 落位 = 锚的**副轴中心**投影到条上，再夹进"两端各留 `half + TAIL_EDGE_INSET_PX`"的区间；
 * 条太窄以至于区间反向（`hi <= lo`）时取正中——宁可尖角压圆角，也不让它跑到条外面去。
 */
export function computeTailOffset(
  anchor: TipAnchorRect,
  tip: TipSize,
  pos: { top: number; left: number },
  placement: TipPlacement,
): number {
  const half = TAIL_SIZE_PX / 2;
  const vertical = isVertical(placement);
  const target = vertical ? (anchor.left + anchor.right) / 2 - pos.left : (anchor.top + anchor.bottom) / 2 - pos.top;
  const extent = vertical ? tip.width : tip.height;
  const lo = half + TAIL_EDGE_INSET_PX;
  const hi = extent - lo;
  const center = hi <= lo ? extent / 2 : Math.min(Math.max(target, lo), hi);
  return center - half;
}

/**
 * 尖角落位该写进**哪个属性**——横条（top/bottom）沿横轴走写 `left`，竖条（left/right）写 `top`。
 * 这是渲染器与 `HintTip.css` 的**共同口径**：CSS 那边只管"主轴那一侧露出来"（`bottom/top/left/right`
 * 四个偏移），副轴那一维的值一律由本函数算、由渲染器内联写。
 */
export function tailAxisOf(placement: TipPlacement): "left" | "top" {
  return isVertical(placement) ? "left" : "top";
}

/** 视口坐标下的一个点（`PointerEvent.clientX/clientY` 直接喂——与 `getBoundingClientRect()` 同系） */
export interface TipPoint {
  x: number;
  y: number;
}

/**
 * 沿 `parentNode` 往上走，**跨 Shadow 边界**（ShadowRoot 的 `parentNode` 是 `null`，要改走它的 `host`
 * 才接得上光 DOM 那一侧）——`Element.contains` 不跨影子树，直接用会在"锚里有影子宿主"时误判为"不在锚上"。
 */
function reachesUpTo(node: Node | null, ancestor: Element): boolean {
  for (let cur: Node | null = node; cur; cur = parentOrHost(cur)) {
    if (cur === ancestor) return true;
  }
  return false;
}

/**
 * 上一层祖先。两处 `as unknown as` 是**lib.dom.d.ts 的口径问题**，不是本件在猜：
 * `Node.parentNode` 声明成 `ParentNode | null`（结构上不等于 `Node`，尽管运行时必定是 Node 或 null），
 * 而 `host` 只长在 ShadowRoot 上、不在 `Node` 上。⛔ 别为了去掉这两个转换改成 `parentElement`——
 * 影子树里 `parentElement` 是 `null`，正好把要跨的那一步弄丢。
 */
function parentOrHost(node: Node): Node | null {
  const parent = node.parentNode as unknown as Node | null;
  if (parent) return parent;
  const shadowHosted = node as unknown as { host?: Node | null };
  return shadowHosted.host ?? null;
}

/**
 * 「几何变了之后，指针**还在锚上**吗」——收条判据的**唯一入口**（2026-09-30 用户实机立案）。
 *
 * ── 为什么要有这条判据 ──
 * 条的生命周期原本只有四个收条动作：移开 / 失焦 / Esc / 点下 / 拖拽，而 `scroll`・`resize` 只**重算落点**
 * （设计 §六·⑥「随锚滚动/移动重算」——那半句本身没错）。漏掉的是另一半：**鼠标不动、内容滚动的时刻**，
 * 指针坐标没变、是锚从指针底下走掉了——浏览器**不会**发 `pointerout`（指针没动，动的是元素），
 * 于是条既收不掉、又跟着旧锚一路滚出视口（用户原话「hint-tip 反而跟着滚动容器的东西往上滚动，直到我鼠标移动一下」）。
 * 判据放在"几何重算"这一个点上，一并覆盖 resize / 分栏拖拽 / 面板折叠等**同族**场景——它们都走调用方的 `follow()`。
 *
 * ── 为什么是命中测试，而不是 `anchor.matches(":hover")` ──
 * `:hover` 的刷新时机由引擎自己的指针重算决定，**恰恰在"滚动后指针没动"这个时刻不保证已更新**
 * （要拦的就是它）；且 jsdom 恒为 false ⇒ 不可测。命中测试的输入全是显式的，能钉。
 *
 * ── 返回值三态（🔴 别把 `undefined` 当"不在锚上"）──
 * - `true`：指针在锚上（含其后代）⇒ 照旧跟随；
 * - `false`：指针已不在锚上 ⇒ 调用方收条；
 * - `undefined`：**无从判断**——没记到坐标（键盘路径、合成事件不带 `clientX`）或环境没有
 *   `document.elementFromPoint`（jsdom）。**调用方照旧跟随**：宁可不收，也不许凭猜误收。
 *
 * @param anchor 锚元素（含其后代——指针落在锚内部任何位置都算"还在锚上"）
 * @param point 最后已知的指针位置（`null` = 没记到）
 * @param hitTest 命中测试（生产传 `document.elementFromPoint`；注入是**为了纯函数可测**——
 *   本函数不读 `document`/`window`，也就无所谓运行环境）
 */
export function isPointerOnAnchor(
  anchor: Element,
  point: TipPoint | null,
  hitTest: (x: number, y: number) => Element | null,
): boolean | undefined {
  if (!point) return undefined; // 没有坐标 ⇒ 不判（⛔ 不猜"大概在锚上"）
  const hit = hitTest(point.x, point.y);
  if (!hit) return undefined; // 点不在窗口内 / 命中测试不可用 ⇒ 不判
  return reachesUpTo(hit, anchor);
}
