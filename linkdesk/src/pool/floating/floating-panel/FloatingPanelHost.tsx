/**
 * FloatingPanelHost——E5.8#37（Phase 8 壳内悬浮面板 类型 B）。池侧哑渲染器。
 *
 * 聪慧→哑数据流（DialogHost 同款）：壳 FloatingPanelService 桥把面板请求序列化成 DTO 推送
 * （显示文本铁律——标题/动作文案已由壳侧 t() 解析，池原样渲染，零 useTranslation）。
 * 内容 = 插件视图——DTO 带 pluginId/renderPath，池经 PluginComponent 渲染（壳不持渲染器——#37 验收）。
 *
 * 交互（02-交互细节设计.md §3 I8 矩阵 + mockups/02-壳内悬浮面板-mockup.html 五帧）：
 *   - I8-5  顶部 6px 手柄拖拽（cursor:grab）+ 半透明跟随 + 壳内钳制（6px inset 拖不出壳窗口）
 *   - I8-6  拖拽/调整中松手落在遮罩不得触发「遮罩点击关闭」——suppress 标志 setTimeout(0)（同 #13 纪律）
 *   - I8-7  底部 8px 手柄调高（cursor:ns-resize，min 300px / max 窗口高-80px）
 *   - I8-8  遮罩点击关闭 + 面板本体 stopPropagation + Esc 关闭 + 焦点入面板
 *   - I8-9  最大化 100vw 同按钮 toggle——纯视觉态池本地切换，零壳 roundtrip（两态图标/文案 DTO 携带）
 *   - I8-12 Z_INDEX 1500——层级由 FloatingLayerHost #floating-panel-root 容器承载
 *   - I8-13 淡入 + 微缩放 scale(0.96)→1，250ms cubic-bezier(0.16,1,0.3,1)，prefers-reduced-motion 关闭（#41.6 居中卡——右滑入对居中违和）
 *
 * 状态闭环：壳 push {open:false} 驱动关闭——池不本地关闭（哑，I8-11）。例外：最大化是纯视觉态——池本地 toggle。
 * 几何：默认居中大卡（top:10vh / left:7.5vw / 85vw×80vh，#41.6——vw/vh 随窗口 resize 自适应，零 JS）；
 * 拖拽/调高后转显式 top/left/width/height；窗口 resize 时对显式几何再钳制。
 * 关闭即重置本地几何/最大化态（重开回默认居中大卡）。
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
import { Z_INDEX } from "../../../constants";
import type { PoolFloatingPanelButton, PoolFloatingPanelData } from "../../../core/types/pool/poolFloatingPanel";
import PluginComponent from "../../shared/plugin-component/PluginComponent";
import "./FloatingPanel.css";

/* ── 池 API 形状——global.d.ts 的 window.linkdesk 是宽松类型，此处收窄到精确形状 ── */

interface PoolFloatingPanelApi {
  onShow: (cb: (data: PoolFloatingPanelData) => void) => () => void;
  action: (actionId: string) => void;
}

/* ── 几何常量（I8 矩阵 + mockup 帧 1/3） ──
   #41.6 默认居中大卡几何走 CSS vw/vh（内联 style 字符串）——EDGE_MARGIN/DEFAULT_WIDTH 常量已随右贴边默认态删除 */

const CLAMP_INSET = 6; // I8-5 壳内钳制：拖不出壳窗口边界（mockup clamp-zone inset:6px）
const MIN_HEIGHT = 300; // I8-7 resize 最小高
const RESIZE_MAX_OFFSET = 80; // I8-7 resize 最大 = 窗口高 - 80

/** 显式几何——拖拽/调高后取代默认右贴边布局 */
interface PanelGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

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

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

export default function FloatingPanelHost() {
  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolFloatingPanelApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.floatingPanelHost ?? null;
  }
  const api = apiRef.current;

  const [data, setData] = useState<PoolFloatingPanelData | null>(null);
  const [geo, setGeo] = useState<PanelGeometry | null>(null); // null = 默认右贴边
  const [maximized, setMaximized] = useState(false); // I8-9 池本地纯视觉 toggle
  const [dragging, setDragging] = useState(false); // I8-5/6 半透明跟随 + CSS 态
  const panelRef = useRef<HTMLDivElement>(null);
  // I8-6 拖拽/调高后松手落在遮罩不得关闭——pointerup 后 click 同步触发，setTimeout(0) 延迟清标志
  const suppressBackdropRef = useRef(false);
  // 手势起始快照——setPointerCapture 持有期间 move/up 无闭包陈旧问题
  const gestureRef = useRef<{ startX: number; startY: number; rect: PanelGeometry } | null>(null);

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    return api.onShow((d: PoolFloatingPanelData) => {
      setData(d);
      if (!d.open) {
        // 关闭即重置本地几何/最大化态——重开回默认右贴边（哑：壳 push {open:false} 驱动关闭）
        setGeo(null);
        setMaximized(false);
        return;
      }
      // I8-8 焦点入面板（对标 DialogHost——Esc/键盘操作不误触面板外）
      setTimeout(() => panelRef.current?.focus(), 50);
    });
  }, [api]);

  // ── 键盘：Esc 关闭（I8-8；硬约束 14：活跃守卫 + data.open 入依赖） ──
  useEffect(() => {
    if (!data?.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") api?.action("close");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data?.open, api]);

  // ── 窗口 resize：显式几何再钳制（窗口变小后不越界；默认右贴边由 CSS 自适） ──
  const hasGeo = geo !== null;
  useEffect(() => {
    if (!hasGeo) return;
    const onResize = () => {
      setGeo((g) => {
        if (!g) return g;
        return {
          ...g,
          top: clamp(g.top, CLAMP_INSET, window.innerHeight - g.height - CLAMP_INSET),
          left: clamp(g.left, CLAMP_INSET, window.innerWidth - g.width - CLAMP_INSET),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hasGeo]);

  /* ── I8-5 拖拽（顶部 6px 手柄）/ I8-7 resize（底部 8px 手柄）── 共用起手势 ── */

  const startGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (maximized) return; // I8-9 最大化态铺满窗口，不可拖/调
    // #41.6 整条标题栏拖拽——动作按钮区排除（点按钮不误触拖拽）
    if ((e.target as Element).closest(".floating-panel-actions")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault(); // 防手势中文本选中
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
    setGeo({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setDragging(true);
    suppressBackdropRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    setGeo({
      // I8-5 壳内钳制——top/left 不出壳窗口边界（6px inset）
      top: clamp(g.rect.top + (e.clientY - g.startY), CLAMP_INSET, window.innerHeight - g.rect.height - CLAMP_INSET),
      left: clamp(g.rect.left + (e.clientX - g.startX), CLAMP_INSET, window.innerWidth - g.rect.width - CLAMP_INSET),
      width: g.rect.width,
      height: g.rect.height,
    });
  };

  /* ── I8-7 resize（底部 8px 手柄，只调高） ── */

  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    setGeo({
      top: g.rect.top, // top 固定——从底部伸展
      left: g.rect.left,
      width: g.rect.width,
      height: clamp(g.rect.height + (e.clientY - g.startY), MIN_HEIGHT, window.innerHeight - RESIZE_MAX_OFFSET),
    });
  };

  /** 手势收尾——清快照 + 退半透明 + 下一拍才放行遮罩点击（I8-6） */
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
      {/* 遮罩——I8-8 点击关闭；I8-9 最大化时消失；I8-6 拖拽/调高后松手一拍内不响应 */}
      {!maximized && (
        <div
          className="floating-panel-backdrop"
          style={{ zIndex: Z_INDEX.floatingPanel - 1 }}
          onClick={() => {
            if (suppressBackdropRef.current) return;
            api?.action("close");
          }}
        />
      )}

      <div
        ref={panelRef}
        className={`floating-panel${dragging ? " dragging" : ""}${maximized ? " maximized" : ""}`}
        style={{ ...panelStyle, zIndex: Z_INDEX.floatingPanel }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 = I8-5 拖拽面（#41.6 顶部 6px 手柄 → 整条标题栏；actions 按钮区 startGesture 内排除）——
            纯图标动作（mockup 帧 1：open-in hover 展开全文 / □✕ hover tooltip） */}
        <div
          className="floating-panel-title"
          onPointerDown={startGesture}
          onPointerMove={onDragMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
        >
          <span className="floating-panel-label">{data.title}</span>
          <div className="floating-panel-actions">
            {data.actions.map((action) => {
              // I8-9 两态图标/文案——池只渲染，语义壳给（零自产文本）
              const iconId = maximized && action.toggledIcon ? action.toggledIcon : action.icon;
              const currentLabel = maximized && action.toggledLabel ? action.toggledLabel : action.label;
              // 分支语义按 DTO 字段判定（不比较字符串字面量）：
              //   expandOnHover = open-in（纯图标 hover 展开全文）；toggledIcon = 本地 toggle（□/⤡）；
              //   其余 = 回传壳（✕ close）
              const actionClass = action.expandOnHover
                ? "floating-panel-act open-in"
                : action.toggledIcon
                  ? "floating-panel-act tip"
                  : "floating-panel-act tip close";
              return (
                <button
                  key={action.id}
                  className={actionClass}
                  data-tip={currentLabel}
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
        <div className="floating-panel-body">
          <PluginComponent pluginId={data.pluginId} isActive={data.open} renderPath={data.renderPath} />
        </div>

        {/* I8-7 底部 8px resize 手柄（调高）——最大化态隐藏 */}
        {!maximized && (
          <div
            className="floating-panel-resize"
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
