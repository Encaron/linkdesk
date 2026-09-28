/**
 * FloatingPanelHost——E5.8#37（Phase 8 壳内悬浮面板 类型 B）。池侧哑渲染器。
 *
 * 聪慧→哑数据流（DialogHost 同款）：壳 FloatingPanelService 桥把面板请求序列化成 DTO 推送
 * （显示文本铁律——标题/动作文案已由壳侧 t() 解析，池原样渲染，零 useTranslation）。
 * 内容 = 插件视图——DTO 带 pluginId/renderPath，池经 PluginComponent 渲染（壳不持渲染器——#37 验收）。
 *
 * 交互（02-交互细节设计.md §3 I8 矩阵 + mockups/02-壳内悬浮面板-mockup.html 五帧）：
 *   - I8-5  顶部 6px 手柄拖拽（cursor:grab）+ 拖拽中投影抬升（无半透明——用户 2026-08-22 否决）+ 壳内钳制（6px inset 拖不出壳窗口）
 *   - I8-6  拖拽/调整中松手落在遮罩不得触发「遮罩点击关闭」——suppress 标志 setTimeout(0)（同 #13 纪律）
 *   - I8-7  底部 8px 手柄调高（cursor:ns-resize，min 300px / max 窗口高-80px）
 *   - I8-8  遮罩点击关闭 + 面板本体 stopPropagation + Esc 关闭 + 焦点入面板（refresh 重推——语言切换文案刷新——不抢焦点）
 *   - I8-9  最大化 100vw 同按钮 toggle——纯视觉态池本地切换，零壳 roundtrip（两态图标/文案 DTO 携带）
 *   - I8-12 Z_INDEX 1500——层级由 FloatingLayerHost #floating-panel-root 容器承载
 *   - I8-13 淡入 + 微缩放 scale(0.96)→1，250ms cubic-bezier(0.16,1,0.3,1)，prefers-reduced-motion 关闭（#41.6 居中卡——右滑入对居中违和）
 *
 * 状态闭环：壳 push {open:false} 驱动关闭——池不本地关闭（哑，I8-11）。例外：最大化是纯视觉态——池本地 toggle。
 * 几何：默认居中大卡（top:10vh / left:7.5vw / 85vw×80vh，#41.6——vw/vh 随窗口 resize 自适应，零 JS）；
 * 拖拽/调高后转显式 top/left/width/height；窗口 resize 时对显式几何再钳制。
 * 关闭即重置本地几何/最大化态（重开回默认居中大卡）。
 *
 * M2 `AI#20`（**给浮动面板补非鼠标路径**——「A 类唯一够不着且无替代」）：除鼠标拖拽/调高外，
 * 位置与高度可经 API/命令精确设定：
 *   · 写 = `linkdesk.panel.setFloatingBounds(bounds|null)`（壳路由 → DTO `bounds` 字段 → 本组件应用）；
 *   · 读 = `linkdesk.floatingPanelHost.getBounds()`（池内同步直答，零 IPC）＋ 几何上报壳
 *     （`events.emit("floating-panel:geometry")` → 壳镜像 → 壳命令/CLI 可读）。
 * 三条路径（拖拽 / 调高 / API）共用 `./floatingBounds` 的同一组常量与钳制 —— API 不可能把面板
 * 设成「拖不出来」的状态（隐藏边界 MIN_HEIGHT / RESIZE_MAX_OFFSET / 6px inset 全生效）。
 *
 * Path B：不 import @src/core 运行时模块——类型 import type OK，Z_INDEX 走 constants。
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Z_INDEX } from "../../../constants";
import { getScrimTarget } from "../../../components/shared/overlay-portal/OverlayPortal"; // E5.8#107 浮层权威：遮罩归 scrim-plane
import { OVERLAY_LAYER_ATTR, isTopmostOverlay } from "../../../components/shared/overlay-portal/overlayLayer"; // E6#73b ④ Esc 分层
import { HINT_ATTR } from "../../../components/shared/hint-tip/hintAttrs"; // 04「悬停提示系统」：属性名走单一真相源（⛔ 别写 "data-hint" 字面量）
import type {
  FloatingPanelBounds,
  FloatingPanelBoundsHostRequest,
  PoolFloatingPanelButton,
  PoolFloatingPanelData,
  PoolFloatingPanelGeometry,
} from "../../../core/types/pool/poolFloatingPanel";
import PluginComponent from "../../shared/plugin-component/PluginComponent";
import { boundsOfRect, clampApi, clampDragTo, clampResizeTo, CLAMP_INSET } from "./floatingBounds";
import "./FloatingPanel.css";

/* ── 池 API 形状——global.d.ts 的 window.linkdesk 是宽松类型，此处收窄到精确形状 ── */

interface PoolFloatingPanelApi {
  onShow: (cb: (data: PoolFloatingPanelData) => void) => () => void;
  action: (actionId: string) => void;
  /** M2 `AI#20`：几何宿主注册（`panel.setFloatingBounds` / `floatingPanelHost.getBounds` 落到它上面）。
   *  可缺省——旧池 preload 无此面时组件不崩（能力降级为「只有鼠标路径」，同面板本身的老行为）。 */
  registerBoundsHost?: (fn: (req: FloatingPanelBoundsHostRequest) => boolean | PoolFloatingPanelGeometry | null) => () => void;
}

/* ── 显示文本 / 几何常量 ── */
/* I8-5/I8-7 的隐藏边界（CLAMP_INSET / MIN_HEIGHT / RESIZE_MAX_OFFSET）与三条路径的钳制纯函数
   住 `./floatingBounds`（M2 `AI#20` 抽——拖拽 / 调高 / API 共用一套边界，防 API 绕过限位）。 */

/** #41.6 默认居中大卡几何——CSS 走 vw/vh（10vh / 7.5vw / 85vw / 80vh），此函数按同一配方折算 px。
 *  用途仅一个：API 路径「只设部分字段」时，未指定字段的基线（面板尚未上屏 / 已最大化时按此折算）。 */
const defaultBoundsOf = (vp: { width: number; height: number }): FloatingPanelBounds => ({
  top: vp.height * 0.1,
  left: vp.width * 0.075,
  width: vp.width * 0.85,
  height: vp.height * 0.8,
});

/* ── 内建图标 id → SVG（DTO icon 字段，mockup 标题栏 SVG） ── */
const ICONS: Record<string, ReactNode> = {
  "open-in": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5h7v7M19 5l-8 8" />
      <path d="M5 9a2 2 0 0 1 2-2h2M5 15v4h4M19 15v4h-4" />
    </svg>
  ),
  maximize: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  restore: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4h11v11M9 4a5 5 0 0 1 11 0" />
      <rect x="4" y="9" width="11" height="11" rx="1.5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  ),
};

export default function FloatingPanelHost() {
  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolFloatingPanelApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.floatingPanelHost ?? null;
  }
  const api = apiRef.current;

  const [data, setData] = useState<PoolFloatingPanelData | null>(null);
  const [geo, setGeo] = useState<FloatingPanelBounds | null>(null); // null = 默认居中大卡（vw/vh）
  const [maximized, setMaximized] = useState(false); // I8-9 池本地纯视觉 toggle
  const [dragging, setDragging] = useState(false); // I8-5 拖拽 CSS 态（投影抬升，无半透明）
  const panelRef = useRef<HTMLDivElement>(null);
  // I8-6 拖拽/调高后松手落在遮罩不得关闭——pointerup 后 click 同步触发，setTimeout(0) 延迟清标志
  const suppressBackdropRef = useRef(false);
  // 手势起始快照——setPointerCapture 持有期间 move/up 无闭包陈旧问题
  const gestureRef = useRef<{ startX: number; startY: number; rect: FloatingPanelBounds } | null>(null);

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  /** 基线几何——API 路径「只设部分字段」时未指定字段的取值来源。
   *  优先本轮已生效的显式几何；否则按 #41.6 默认配方折算（面板尚未上屏 / 最大化态下都走这条）。 */
  const currentBounds = (): FloatingPanelBounds => geo ?? defaultBoundsOf(viewport());

  /**
   * 生效几何——**单一尺子**：渲染用的 `panelStyle`、读数 `floatingPanelHost.getBounds()`、
   * 上报壳的 `floating-panel:geometry` 三处**共用本表达式**（同一个决策，不是三次测量）。
   *   · 最大化 → 满窗盒（6px inset；与 `panelStyle` 的 right/bottom inset 同盒）
   *   · 否则 → 显式几何；未设定（null）= #41.6 默认居中大卡折算 px
   *
   * 🔴 刻意**不**用 `getBoundingClientRect()` 实测：面板有 I8-13 入场动画（`scale(0.96)→1`，250ms），
   * 实测会把**缩放后**的盒当几何报出去（调用方拿它跟刚设的 px 对账会差 4%，且开局 250ms 内读数不稳定）。
   * 本函数返回的就是渲染决策本身 ⇒ 零误差、零动画耦合（`boundsOfRect` 仍只用于手势起始快照——
   * 那里要的正是「此刻屏幕上真实的盒」）。
   */
  const effectiveBounds = (): FloatingPanelBounds => {
    if (maximized) {
      const vp = viewport();
      return {
        top: CLAMP_INSET,
        left: CLAMP_INSET,
        width: vp.width - CLAMP_INSET * 2,
        height: vp.height - CLAMP_INSET * 2,
      };
    }
    return geo ?? defaultBoundsOf(viewport());
  };

  /**
   * M2 `AI#20` 几何宿主实现——`panel.setFloatingBounds` 与 `floatingPanelHost.getBounds` 都落到这里。
   *   · `set`：无面板 → false（⛔ 不报成功）；null → 回默认居中大卡；对象 → 精确设定（**同一套** I8-5/I8-7
   *     钳制，见 `./floatingBounds`）；最大化态先退出最大化（几何与满窗态互斥——「设定必生效」）。
   *   · `get`：生效几何（`effectiveBounds`——钳制/最大化后的**真实结果**，非调用方意图值）；无面板 → null。
   */
  const handleBoundsHost = (req: FloatingPanelBoundsHostRequest): boolean | PoolFloatingPanelGeometry | null => {
    if (!data?.open) return req.op === "get" ? null : false;
    if (req.op === "get") {
      return { ...effectiveBounds(), viewId: data.viewId, pluginId: data.pluginId, maximized };
    }
    setMaximized(false);
    setGeo(req.bounds === null ? null : clampApi(currentBounds(), req.bounds, viewport()));
    return true;
  };

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    return api.onShow((d: PoolFloatingPanelData) => {
      setData(d);
      if (!d.open) {
        // 关闭即重置本地几何/最大化态——重开回默认居中大卡（哑：壳 push {open:false} 驱动关闭）
        setGeo(null);
        setMaximized(false);
        return;
      }
      // M2 `AI#20`：API 路径几何——DTO 带 bounds 才动（缺省 = 保留拖拽/调高后的本地态）。
      // ⛔ 与手势共用一套钳制（防 API 把面板设成拖不出来的状态）。
      if (d.bounds !== undefined) {
        setMaximized(false);
        setGeo(d.bounds === null ? null : clampApi(geo ?? defaultBoundsOf(viewport()), d.bounds, viewport()));
      }
      // I8-8 焦点入面板（对标 DialogHost——Esc/键盘操作不误触面板外）。
      // refresh 重推（语言切换文案刷新）不抢焦点——面板已开，用户焦点可能在语言选择器/主区（2026-08-22 点修③）
      if (!d.refresh) setTimeout(() => panelRef.current?.focus(), 50);
    });
    // ⚠️ 依赖含 geo：onShow 闭包要靠它取 API 路径的基线（事件发生在渲染后，闭包取自本次渲染）
  }, [api, geo]);

  // ── M2 `AI#20`：向 preload 注册几何宿主（池是几何真相源——面板渲染在池，壳不存几何） ──
  useEffect(() => {
    if (!api?.registerBoundsHost) return undefined;
    return api.registerBoundsHost(handleBoundsHost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, data, maximized, geo]);

  // ── M2 `AI#20`：几何上报壳（**可读面**——壳/命令/CLI 据此对账：设了什么、此刻落在哪） ──
  // 池仍是唯一尺（本上报是**单向发布**，壳只存只读镜像，⛔ 壳侧不拿它做任何几何计算）。
  // 只在「落定」时上报：拖拽/调高**进行中跳过**——每 pointermove 一发会把 IPC 打成洪水；
  // 松手（dragging false）那一拍补发最终值，等效「一次手势一条消息」。
  // ⚠️ 拖拽中途的镜像会滞后（价值有限，消费者是命令/CLI 而非渲染方）；关闭不上报——壳侧
  //   closePanel/handleFloatingPanelAction 自清镜像（那些路径壳本来就知道）。
  useEffect(() => {
    if (!data?.open || dragging) return;
    const { viewId, pluginId } = data;
    window.linkdesk?.events?.emit("floating-panel:geometry", {
      viewId,
      pluginId,
      maximized,
      ...effectiveBounds(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dragging, maximized, geo]);

  // ── 键盘：Esc 关闭（I8-8；硬约束 14：活跃守卫 + data.open 入依赖） ──
  useEffect(() => {
    if (!data?.open) return;
    const handler = (e: KeyboardEvent) => {
      // E6#73b ④：只关最上层浮层（对话框 / QuickPick 盖在面板上时，一发 Esc 不该关掉两个）
      if (e.key === "Escape" && isTopmostOverlay(panelRef.current)) api?.action("close");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data?.open, api]);

  // ── 窗口 resize：显式几何原地再钳制（窗口变小后不越界；默认居中大卡由 CSS vw/vh 自适） ──
  const hasGeo = geo !== null;
  useEffect(() => {
    if (!hasGeo) return;
    const onResize = () => {
      // dx/dy = 0 = 不改位置，只把 top/left 重新钳进壳窗口（I8-5 同一套边界）
      setGeo((g) => (g ? clampDragTo(g, 0, 0, viewport()) : g));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hasGeo]);

  /* ── I8-5 拖拽（整条标题栏）/ I8-7 调高（底部 8px 手柄）── 共用起手势；钳制住 ./floatingBounds ── */

  const startGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (maximized) return; // I8-9 最大化态铺满窗口，不可拖/调
    // #41.6 整条标题栏拖拽——动作按钮区排除（点按钮不误触拖拽）
    if ((e.target as Element).closest(".ldk-floating-panel-actions")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault(); // 防手势中文本选中
    gestureRef.current = { startX: e.clientX, startY: e.clientY, rect: boundsOfRect(rect) };
    setGeo(boundsOfRect(rect));
    setDragging(true);
    suppressBackdropRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    // I8-5 壳内钳制——top/left 不出壳窗口边界（6px inset）
    setGeo(clampDragTo(g.rect, e.clientX - g.startX, e.clientY - g.startY, viewport()));
  };

  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    // I8-7 只调高——top 固定（从底部伸展），高度 ∈ [MIN_HEIGHT, 窗口高 - 80]
    setGeo(clampResizeTo(g.rect, e.clientY - g.startY, viewport()));
  };

  /** 手势收尾——清快照 + 退拖拽 CSS 态 + 下一拍才放行遮罩点击（I8-6） */
  const endGesture = () => {
    gestureRef.current = null;
    setDragging(false);
    // click 在 pointerup 后同步触发——延到下一拍才允许遮罩点击关闭（同 #13 buttons===0 纪律）
    setTimeout(() => {
      suppressBackdropRef.current = false;
    }, 0);
  };

  /* ── I8-9 动作点击：本地 toggle（toggledIcon 标记） vs 回传壳（open-in/close） ── */
  const handleAction = (action: PoolFloatingPanelButton) => {
    if (action.toggledIcon) {
      setMaximized((m) => !m); // 纯视觉态，零壳 roundtrip（两态图标/文案 DTO 携带）
      return;
    }
    api?.action(action.id); // 业务语义壳侧重解析（bridges → FloatingPanelService.handleFloatingPanelAction）
  };

  if (!data || !data.open) return null;

  const panelStyle = maximized
    ? { top: CLAMP_INSET, left: CLAMP_INSET, right: CLAMP_INSET, bottom: CLAMP_INSET, width: "auto" as const }
    : geo
      ? { top: geo.top, left: geo.left, width: geo.width, height: geo.height }
      // #41.6 默认居中大卡——vw/vh 随窗口 resize 自适应（零 JS）；拖拽/调高后转显式 px
      : { top: "10vh", left: "7.5vw", width: "85vw", height: "80vh" };

  return (
    <>
      {/* 遮罩——E5.8#107 浮层权威：归 #ld-scrim-plane（遮罩平面，无磨砂）。I8-8 点击关闭；
          I8-9 最大化时消失；I8-6 拖拽/调高后松手一拍内不响应。 */}
      {!maximized &&
        createPortal(
          <div
            className="ldk-floating-panel-backdrop"
            style={{ zIndex: Z_INDEX.floatingPanel - 1 }}
            onClick={() => {
              if (suppressBackdropRef.current) return;
              api?.action("close");
            }}
          />,
          getScrimTarget()
        )}

      <div
        ref={panelRef}
        className={`ldk-floating-panel${dragging ? " dragging" : ""}${maximized ? " maximized" : ""}`}
        {...{ [OVERLAY_LAYER_ATTR]: "" }}
        style={{ ...panelStyle, zIndex: Z_INDEX.floatingPanel }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 = I8-5 拖拽面（#41.6 顶部 6px 手柄 → 整条标题栏；actions 按钮区 startGesture 内排除）——
            纯图标动作（mockup 帧 1：open-in hover 展开全文 / □✕ 悬停提示见下）。
            🔴 2026-09-27 收编：□✕ 原先是 `.tip::after { content: attr(data-tip) }` 的**纯 CSS 提示**
            （12px / 内边距 3×8、无气泡尖角、不跟主题字号缩放）——与主窗标题栏那几个窗口按钮
            （`TitleBarZone` 的 `wc.minimize/maximize/close`，走 `data-hint`）是**两把尺子**，
            用户实机挑出「没有气泡、偏小一点」。现改挂 `data-hint`：长相/延时/尖角/键帽全归 HintTip。
            ⛔ 别再回 CSS 造提示——门禁 `check-css-tooltip.mjs`（腿 3）判 `content: attr()` 的新增。
            open-in 那颗**不**收编：它是"hover 就地展开全文"（`open-in` 分支 + `.lbl`），另一种交互。 */}
        <div
          className="ldk-floating-panel-title"
          onPointerDown={startGesture}
          onPointerMove={onDragMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
        >
          <span className="ldk-floating-panel-label">{data.title}</span>
          <div className="ldk-floating-panel-actions">
            {data.actions.map((action) => {
              // I8-9 两态图标/文案——池只渲染，语义壳给（零自产文本）
              const iconId = maximized && action.toggledIcon ? action.toggledIcon : action.icon;
              const currentLabel = maximized && action.toggledLabel ? action.toggledLabel : action.label;
              // 分支语义按 DTO 字段判定（不比较字符串字面量）：
              //   expandOnHover = open-in（纯图标 hover 展开全文）；toggledIcon = 本地 toggle（□/⤡）；
              //   其余 = 回传壳（✕ close）
              const actionClass = action.expandOnHover
                ? "ldk-floating-panel-act open-in"
                : action.toggledIcon
                  ? "ldk-floating-panel-act"
                  : "ldk-floating-panel-act close";
              return (
                <button
                  key={action.id}
                  className={actionClass}
                  {...{ [HINT_ATTR]: currentLabel }}
                  aria-label={currentLabel}
                  onClick={() => handleAction(action)}
                >
                  {ICONS[iconId]}
                  {action.expandOnHover && <span className="lbl">{action.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 内容——壳不持渲染器，池经 PluginComponent 渲染插件视图（isActive=打开中） */}
        <div className="ldk-floating-panel-body">
          <PluginComponent pluginId={data.pluginId} isActive={data.open} renderPath={data.renderPath} />
        </div>

        {/* I8-7 底部 8px resize 手柄（调高）——最大化态隐藏 */}
        {!maximized && (
          <div
            className="ldk-floating-panel-resize"
            onPointerDown={startGesture}
            onPointerMove={onResizeMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onLostPointerCapture={endGesture}
          />
        )}
      </div>
    </>
  );
}
