/**
 * HintTip 单例渲染器（04「悬停提示系统」件 1；设计详案 §四·4.1–4.4）。
 *
 * ── 职责（壳给什么 / 调用方给什么）──
 * **壳给**：何时出（触发状态机）· 出在哪（主轴判可贴 · 副轴居中后夹紧 · 绝不压锚 ＋ 气泡尖角
 * → `placement.ts`）· 长什么样（`HintTip.css`）· 何时收（移开/失焦/Esc/点击/拖拽 ＋ **几何变化后指针
 * 已不在锚上** → `placement.ts` 的 `isPointerOnAnchor`）；
 * **调用方给**：文案与命令 id（写在**自己的 DOM 属性**上，见 `hintAttrs.ts`）。
 *
 * ── 为什么是「一处单例 + 全局委托」而不是「每个提示点一个组件」──
 * ① 属性式 = 存量收编（壳侧 43 处 ＋ 插件容器 ~95 处）是**纯属性替换**，DOM 结构零变化；
 * ② 单例 ⇒ 一处状态机、一处样式、一处翻面/夹紧逻辑，不会出现 N 份 `useState`（也就不会出现
 *    "48 个提示各自跟自己打架"）；
 * ③ 插件不需要 import 壳任何东西（插件独立铁律）——第三方仓里只是 `title=` → `data-hint=`。
 *
 * ── 🔴 本件最大的实现风险：常驻监听 ──
 * 全局委托监听是**新增的宿主侧常驻监听**（池层是共享渲染进程，漏清理 = 全软件泄漏——
 * 设计详案 §十一·1）。规矩两条，⛔ 都不许省：
 *   ① 所有监听必须在 `useEffect` 内注册并**返回清理**（⛔ 不许模块级 guard / 模块级 addEventListener）；
 *   ② 只在用得上时挂——滚/resize/Esc 这类"条开着才有意义"的监听带**活跃守卫**（照硬约束 14）。
 * ⚠️ 它是 **DOM 事件不是 IPC** ⇒ 不触发硬约束 19 / ESLint `linkdesk/no-module-level-ipc-listener`；
 *    也不与 SDK 既有腿 `linkdesk/no-global-key-listener`（只判 keydown/keyup）冲突——⛔ 不许顺手放宽它。
 *
 * ── 降级（保底三）──
 * 提示是**纯增强**：本渲染器没挂载（或总开关关掉）⇒ 只是"没有提示"，绝不阻断任何交互
 * （不接管点击、不挡 hover、不占位）。⛔ 也不在失败时"退回原生 title"——那正是要消灭的东西。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import OverlayPortal from "../overlay-portal/OverlayPortal";
import KeybindingHint from "../keybinding-hint/KeybindingHint";
import { computeTailOffset, computeTipPosition, isPointerOnAnchor, tailAxisOf, type TipAnchorRect, type TipPlacement, type TipPoint, type TipPosition, type TipSize } from "./placement";
import { DEFAULT_OPEN_DELAY_MS, HINT_ATTR, HINT_COMMAND_ATTR, HINT_DELAY_ATTR, HINT_PLACEMENT_ATTR, HINT_SELECTOR } from "./hintAttrs";
import type { PoolCommandHints } from "../../../core/types/pool/poolLayout";
import "./HintTip.css";

/** 一条提示的载荷（`resolveHintPayload` 的产出——纯数据，单测直接钉） */
export interface HintPayload {
  label: string;
  /** 壳**已格式化**的快捷键（`"Ctrl+K Ctrl+T"`）——无绑定则无此字段 */
  shortcut?: string;
  placement: TipPlacement;
  /** 意图延时 ms（揭示类为 0 ——「看全被截断的字」要立刻） */
  openDelayMs: number;
}

const PLACEMENTS: readonly string[] = ["top", "bottom", "left", "right"];

/** 粗落点用的零尺寸（`show()` 先按锚给个落点，`useLayoutEffect` 量到真尺寸立刻校正——见 `place`） */
const ZERO_TIP: TipSize = { width: 0, height: 0 };

/**
 * **纯函数**：锚元素 + 壳推的命令表 → 该元素要出的条（`null` = 不出条）。
 *
 * 判定（全在这一个函数里，⛔ 别在调用处再判一遍）：
 * - 两个属性都没有 ⇒ 不是提示点 ⇒ `null`；
 * - 文案 = `data-hint` 优先，其次命令表里的 `title`（`command` 给了但表里没有 ⇒ 空文案）；
 * - **空文案 ⇒ `null`**（⛔ 不出空条——照 HintCard 保底④，也防"命令表还没到就先出一根空条"）；
 * - 快捷键只认命令表（与右键菜单**同源**——两把尺子必然漂移，memory `two-rulers-one-caliber`）；
 * - 延时/方位取属性覆盖，非法值落回缺省（⛔ 不抛、不静默变成 0）。
 */
export function resolveHintPayload(el: Element, commands?: PoolCommandHints): HintPayload | null {
  const own = el.getAttribute(HINT_ATTR);
  const commandId = el.getAttribute(HINT_COMMAND_ATTR);
  if (own == null && commandId == null) return null;
  const meta = commandId != null ? commands?.[commandId] : undefined;
  const label = (own ?? meta?.title ?? "").trim();
  if (label === "") return null; // 空文案不出条（含"命令表未到/命令不存在"两种情形）
  const rawDelay = el.getAttribute(HINT_DELAY_ATTR);
  const delay = rawDelay == null ? Number.NaN : Number(rawDelay);
  const rawPlacement = el.getAttribute(HINT_PLACEMENT_ATTR) ?? "";
  return {
    label,
    ...(meta?.keybinding ? { shortcut: meta.keybinding } : {}),
    placement: (PLACEMENTS.includes(rawPlacement) ? rawPlacement : "top") as TipPlacement,
    openDelayMs: Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_OPEN_DELAY_MS,
  };
}

/** 锚矩形——`DOMRect` 只取本件用得到的四个数（与 `placement.ts` 的 `TipAnchorRect` 同形） */
function toAnchorRect(r: DOMRect): TipAnchorRect {
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 事件坐标 → 点（**只为真鼠标路径服务**）：拿不到有限数就是"没记到"（`null`），
 * ⛔ 不许拿 `undefined`/`NaN` 当 0 去判——`isPointerOnAnchor` 的三态正是靠这个 `null` 立起来的。
 */
function eventPoint(e: PointerEvent): TipPoint | null {
  const { clientX, clientY } = e;
  return Number.isFinite(clientX) && Number.isFinite(clientY) ? { x: clientX, y: clientY } : null;
}

/** 条是用什么开的——只有鼠标开的条才受"指针还在锚上吗"约束（键盘路径没有指针可言） */
type OpenSource = "pointer" | "focus";

interface OpenState {
  anchor: Element;
  payload: HintPayload;
  /** 开条来源（见 `OpenSource`——收条判据按它分流） */
  openedBy: OpenSource;
  /** 实测落点（先出一个粗落点，`useLayoutEffect` 量到真尺寸立刻校正——paint 前完成，不闪帧） */
  pos: TipPosition;
  /** 尖角元素沿条边的落位（与 `pos` **同批**算出——渲染期不读布局） */
  tail: number;
  /** 是否已完成一次实测（未实测时先按粗落点定位，肉眼不可见差别，仅防首帧跳动） */
  measured: boolean;
}

export interface HintTipRendererProps {
  /** 壳推的「命令 → { title, keybinding }」表（与菜单同源；缺省 ⇒ 只有 `data-hint` 能出条） */
  commands?: PoolCommandHints;
  /** 总开关（`app.hint.enabled`，缺省开）——关掉 = 全软件不出条 */
  enabled?: boolean;
}

/**
 * 单例渲染器——**由壳在池根无条件挂载**（保底一：无插件时壳自身的提示照样工作）。
 * 渲染 `null` 之外只多一个 portal 出去的条；⛔ 不产出任何占位 DOM。
 */
export default function HintTipRenderer({ commands, enabled = true }: HintTipRendererProps) {
  const [state, setState] = useState<OpenState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** 正在"延时待出"的锚（与已开的锚分开记——否则鼠标在延时内移开，计时器仍会把条弹出来） */
  const pendingRef = useRef<Element | null>(null);
  /** 拖拽抑制（设计详案 §六·6.6：拖拽中不出条——拖标签/拖图标时弹条会挡视线） */
  const suppressed = useRef(false);
  /** 当前**已开条**的锚（与"待出"分开记——`close` 要按它归还 aria；ref 引用稳定 ⇒ 不引发监听重挂） */
  const shownRef = useRef<Element | null>(null);
  /** 出条时写进锚的 `aria-describedby`，收条时归还（⛔ 不能留一个指向已消失元素的 id） */
  const prevDescribedBy = useRef<string | null>(null);
  /**
   * 最后已知的指针位置（只有鼠标路径写它，见 `show` / `enter`）——「指针还在锚上吗」判据的输入。
   * 开条那刻**必须记一次**（用触发 `pointerover` 的坐标）：本件报障场景正是"鼠标一动不动直接滚"，
   * 那时除了开条那一刻，没有任何事件会把坐标交出来。条开着期间由 `pointermove` 续（见活跃守卫 effect）。
   */
  const lastPoint = useRef<TipPoint | null>(null);
  const tipId = useId();

  /** 收条：清待出计时器 ＋ 收已开的条 ＋ 归还 aria（＋ 丢掉指针坐标——它只属于刚收掉的那条）。幂等（没有条时也安全） */
  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    pendingRef.current = null;
    const a = shownRef.current;
    if (a) {
      if (prevDescribedBy.current == null) a.removeAttribute("aria-describedby");
      else a.setAttribute("aria-describedby", prevDescribedBy.current);
    }
    prevDescribedBy.current = null;
    shownRef.current = null;
    lastPoint.current = null;
    setState(null);
  }, []);

  /**
   * 量一次锚 → **落点 ＋ 尖角落位**（三处调用点共用，⛔ 别再各算一遍——两把尺子必然漂移）。
   * `tip` 传 [`ZERO_TIP`] 时是"粗落点"：真尺寸要等条渲染出来才量得到，`useLayoutEffect` 立刻校正。
   * 尖角与落点同批算：它的落位依赖 `pos`（条被夹到哪里），晚一步就会指歪。
   */
  const place = useCallback((anchor: Element, payload: HintPayload, tip: TipSize): { pos: TipPosition; tail: number } => {
    const rect = toAnchorRect(anchor.getBoundingClientRect());
    const pos = computeTipPosition(rect, tip, viewportSize(), payload.placement);
    return { pos, tail: computeTailOffset(rect, tip, pos, pos.placement) };
  }, []);

  /** 出条（同步）：写 aria ＋ 先按锚矩形给粗落点（尺寸用 0——`useLayoutEffect` 立刻校正） */
  const show = useCallback(
    (anchor: Element, payload: HintPayload, openedBy: OpenSource, point: TipPoint | null) => {
      if (!anchor.isConnected) return; // 锚已卸载 ⇒ 不出（保底①的结构等价物）
      const { pos, tail } = place(anchor, payload, ZERO_TIP);
      // 归属判据的输入与条同批立起：键盘路径没有指针可言 ⇒ 记 null（判据那头成"不判"）
      lastPoint.current = openedBy === "pointer" ? point : null;
      prevDescribedBy.current = anchor.getAttribute("aria-describedby");
      shownRef.current = anchor;
      anchor.setAttribute("aria-describedby", tipId);
      setState({ anchor, payload, openedBy, pos, tail, measured: false });
    },
    [place, tipId],
  );

  /* ── 实测校正（翻面 ＋ 副轴居中 ＋ 夹紧 ＋ 尖角）——量到真尺寸立刻重算，paint 前完成不闪帧（照 HintCard 先例）──
     ⚠️ 只在落点**真的变了**时 setState——否则"重算 → 落点未变 → 又重算"会成死循环。 */
  useLayoutEffect(() => {
    if (!state || !tipRef.current) return;
    const t = tipRef.current.getBoundingClientRect();
    const { pos, tail } = place(state.anchor, state.payload, { width: t.width, height: t.height });
    const same =
      Math.abs(pos.top - state.pos.top) < 0.5 &&
      Math.abs(pos.left - state.pos.left) < 0.5 &&
      Math.abs(tail - state.tail) < 0.5 &&
      pos.placement === state.pos.placement;
    if (same) {
      if (!state.measured) setState({ ...state, measured: true });
      return;
    }
    setState({ ...state, pos, tail, measured: true });
  }, [state, place]);

  /* ── 主委托：pointerover/out ＋ focusin/out ＋ 点击收 ＋ 拖拽抑制（挂载期常驻，enabled 关闭即不挂）── */
  useEffect(() => {
    if (!enabled) return;
    const findAnchor = (target: EventTarget | null): Element | null => (target instanceof Element ? target.closest(HINT_SELECTOR) : null);

    /** 进入一个提示点（pointer 走延时 / 键盘直达）——「密集排只出一张」的机制就在这里：
     *  换锚时**先收旧再上新的延时**，⛔ 不排队不堆叠（窗口按钮那排鼠标扫过去只会看到一张，且是最后那个）。
     *  `point` 只有鼠标路径给得出来（延时到点才出条，所以坐标要**随事件传进来**——⛔ 不在这里读"当前的"指针）。 */
    const enter = (el: Element, by: OpenSource, point: TipPoint | null = null, delayOverride?: number) => {
      if (el === shownRef.current || el === pendingRef.current) return; // 同一锚——不动
      const payload = resolveHintPayload(el, commands);
      close();
      if (!payload) return;
      const delay = delayOverride ?? payload.openDelayMs;
      if (delay <= 0) {
        show(el, payload, by, point);
        return;
      }
      pendingRef.current = el;
      timer.current = setTimeout(() => {
        timer.current = undefined;
        pendingRef.current = null;
        show(el, payload, by, point);
      }, delay);
    };

    /** 离开（移开 / 失焦）——只在"确实离开这个锚"时收；锚内子元素之间移动不算离开 */
    const leave = (el: Element, related: EventTarget | null) => {
      if (el !== shownRef.current && el !== pendingRef.current) return;
      if (related instanceof Node && el.contains(related)) return;
      close();
    };

    const onPointerOver = (e: PointerEvent) => {
      if (suppressed.current) return; // 拖拽中——不出条
      const el = findAnchor(e.target);
      if (el) enter(el, "pointer", eventPoint(e));
    };
    const onPointerOut = (e: PointerEvent) => {
      const el = findAnchor(e.target);
      if (el) leave(el, e.relatedTarget);
    };
    // 键盘路径不延时（Tab 到按钮要立刻看见说明——延时是给鼠标"防划过闪一下"的）
    const onFocusIn = (e: FocusEvent) => {
      const el = findAnchor(e.target);
      if (el) enter(el, "focus", null, 0);
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = findAnchor(e.target);
      if (el) leave(el, e.relatedTarget);
    };
    // 点击即收（点下去说明用户已经知道这是什么了）＋ 拖拽抑制（capture：拖拽起点在任何元素上都要拦住）
    const onPointerDown = () => close();
    const onDragStart = () => {
      suppressed.current = true;
      close();
    };
    const onDragEnd = () => {
      suppressed.current = false;
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("drop", onDragEnd, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      document.removeEventListener("drop", onDragEnd, true);
    };
  }, [enabled, commands, close, show]);

  /* ── 条开着时才有意义的监听（活跃守卫——硬约束 14）：Esc 收 ＋ 滚动/缩放重算 ＋ 指针坐标续采 ──
     滚动重算用 capture 才能听到**内层滚动容器**（侧栏/主区各自滚，事件不冒泡到 window）。 */
  useEffect(() => {
    if (!state) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    /** 命中测试（生产走 `document.elementFromPoint`；环境没有它——如 jsdom——就交回"无从判断"） */
    const hitTest = (x: number, y: number): Element | null =>
      typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null;
    /**
     * 几何一变（滚动/缩放/reflow）就重算落点——**顺带判一次"指针还在锚上吗"**（2026-09-30 用户实机立案）。
     * 为什么判据落在这里：这是全部几何变化的**唯一汇合点**（`scroll` capture ＋ `resize` 都走它），
     * 判据放这里就一并覆盖了"内容滚动但鼠标没动"这族场景；⚠️ 只在**鼠标开的条**上判
     * （键盘开的条没有指针，`openedBy` 一票否决）。
     * ⚠️ 判据用 `=== false` 而非 `!`：`undefined` = 无从判断（没坐标/没命中测试）⇒ **照旧跟随**，
     *    宁可多跟一帧，也不许凭猜把用户正看着的条收掉。
     */
    const follow = () => {
      if (!state.anchor.isConnected) {
        close(); // 锚被卸载（切视图/换标签）——条不能留在屏幕上
        return;
      }
      if (state.openedBy === "pointer" && isPointerOnAnchor(state.anchor, lastPoint.current, hitTest) === false) {
        close(); // 锚从指针底下走掉了（滚动把内容挪了）——浏览器不发 pointerout，只能在这里收
        return;
      }
      const t = tipRef.current?.getBoundingClientRect();
      const { pos, tail } = place(state.anchor, state.payload, { width: t?.width ?? 0, height: t?.height ?? 0 });
      setState((cur) => (cur === state ? { ...cur, pos, tail, measured: true } : cur));
    };
    /** 续采指针坐标（只写 ref，不引发渲染）——条开着时指针可能还在锚内移动，
     *  坐标不更新的话"滚动后指针在哪"用的就是开条那一刻的旧样本。方向键/?都不需要：它只服务鼠标路径。 */
    const onPointerMove = (e: PointerEvent) => {
      lastPoint.current = eventPoint(e);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", follow, true);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", follow, true);
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", follow);
    };
  }, [state, close, place]);

  /* 卸载清计时器 ＋ 归还 aria（硬约束 14——让"漏清理"在这里不可能发生） */
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    const a = shownRef.current;
    if (a) {
      if (prevDescribedBy.current == null) a.removeAttribute("aria-describedby");
      else a.setAttribute("aria-describedby", prevDescribedBy.current);
    }
  }, []);

  if (!enabled || !state) return null;

  // 尖角：方位决定写哪一维（`tailAxisOf` 的口径与 CSS 里四条 `[data-tip-placement]` 规则配套）
  const tailStyle: CSSProperties = tailAxisOf(state.pos.placement) === "left" ? { left: state.tail } : { top: state.tail };

  return (
    <OverlayPortal>
      {/* 无 onClose：本件不是"可关浮层"（无遮罩、无外部点击关闭语义、不抢焦点、不 trapFocus）——
          收条只由"移开/失焦/Esc/点击/拖拽"这五个动作触发，见上面的监听。
          role="tooltip" 是给读屏的语义锚；可访问名仍归调用方的 aria-label（本件只补 describedby）。 */}
      <div
        ref={tipRef}
        id={tipId}
        className="ldk-hint-tip"
        data-tip-placement={state.pos.placement}
        role="tooltip"
        style={state.measured ? { top: state.pos.top, left: state.pos.left } : { top: state.pos.top, left: state.pos.left, visibility: "hidden" }}
      >
        <span className="ldk-hint-tip-label">{state.payload.label}</span>
        {state.payload.shortcut && <KeybindingHint label={state.payload.shortcut} />}
        {/* 气泡尖角（用户 2026-09-27 改判：初版拍板的「就是一个框型」作废）——纯装饰零语义 ⇒ aria-hidden；
            "露哪两条边"由 CSS 按 data-tip-placement 决定，沿边落位由 `computeTailOffset` 算好内联写。 */}
        <span className="ldk-hint-tip-tail" aria-hidden="true" style={tailStyle} />
      </div>
    </OverlayPortal>
  );
}
