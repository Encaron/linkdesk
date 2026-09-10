/**
 * ToastHost——E5.7#16。池侧 Toast 哑渲染器（浮层归一化设计.md §6）。
 *
 * 聪慧→哑数据流：壳 toast 服务推送全量快照 {toasts, suppressed}（显示文本铁律——
 * message/sourceText/动作标签全部壳侧 t() 解析后以字符串到达，池原样渲染）。
 * 池只做三件事：
 *   1. 栈渲染（column-reverse，新的在底部）
 *   2. 退出动画检测——快照对比发现消失的 id → 退场动画结束后移除
 *   3. 动作回传（dismiss/action——壳按 id + actionId 重解析后执行原始回调）
 *
 * E6#71h：恒全显（删除折叠两态）——消息整句换行全可见、详情行（来源/动作钮）恒展开、
 * 消息与来源均可选中复制（user-select: text 见 CSS）。浮层归一化仍哑——显示文本全壳侧解析。
 * E6#71i：progress 快照项 → 进度条（percent 有值 = 确定宽 / 无 = 不定态扫动）。
 * suppressed → 整体隐藏（NotificationCenter 打开时）。
 * 状态闭环：壳推送快照驱动一切——池不本地关闭（哑）。
 * 容器层级由 FloatingLayerHost 统一持有（Z_INDEX.toast 基准）——组件不自设 z-index。
 * Path B：不 import @src/core 运行时模块——类型 import type OK。
 */

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PoolToastData, PoolToastItem } from "../../../core/types/pool/poolToast";
import "./ToastHost.css";

/* ── 池 API 形状——global.d.ts 的 window.linkdesk 是宽松类型，此处收窄到精确形状 ── */

interface PoolToastApi {
  onShow: (cb: (data: PoolToastData) => void) => () => void;
  dismiss: (id: string) => void;
  action: (id: string, actionId: string) => void;
}

/** VS Code 默认通知行高——对标壳 ToastContainer */
const ROW_HEIGHT = 42;
/** 退场过渡时长（ms）——必须与 ToastHost.css `.toast-item.toast-exiting { transition-duration: 200ms }` 对齐 */
const EXIT_ANIM_MS = 200;
/** 兜底移除余量（ms）——退场期后若 transitionend 仍未触发，强制清理（幂等 handleExited） */
const EXIT_CLEANUP_MARGIN_MS = 80;

/** MouseEvent.button 中键——用标识符比较绕开 no-restricted-syntax 字面量误报 */
const MIDDLE_BUTTON = 1;
/** transitionend propertyName 过滤——同上，标识符比较绕开误报 */
const OPACITY_PROPERTY = "opacity";
/** 进度百分比钳制 [0,100]——下游数据脏值防御（下载段 Content-Length 真值理论上 0-100） */
const CLAMP_MAX = 100;
const CLAMP_MIN = 0;

export default function ToastHost() {
  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolToastApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.toast ?? null;
  }
  const api = apiRef.current;

  const [data, setData] = useState<PoolToastData | null>(null);
  // 退出动画——被 dismiss 的 toast 保留在 map 中渲染退场，动画结束后移除（对标壳 E3.5 #TO01）
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const mapRef = useRef<Map<string, PoolToastItem>>(new Map());
  const prevIdsRef = useRef<Set<string>>(new Set());

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    return api.onShow((d: PoolToastData) => {
      // 维护全量数据缓存——dismiss 后仍需数据渲染退出动画
      for (const item of d.toasts) {
        mapRef.current.set(item.id, item);
      }
      const currentIds = new Set(d.toasts.map((x) => x.id));
      // 检测消失的 toast → 标记退出中而非立即卸载（对标壳 E3.5 #TO01）
      for (const id of prevIdsRef.current) {
        if (!currentIds.has(id) && mapRef.current.has(id)) {
          setExitingIds((prev) => new Set(prev).add(id));
        }
      }
      prevIdsRef.current = currentIds;
      setData(d);
    });
  }, [api]);

  // NotificationCenter 打开时壳推 suppressed=true → 整体隐藏（对标壳 ToastContainer）
  if (!data || data.suppressed) return null;

  // 合并活跃 + 退出中（对标壳 E3.5 #TO02）
  const renderToasts: Array<{ item: PoolToastItem; exiting: boolean }> = [
    ...data.toasts.map((item) => ({ item, exiting: false })),
  ];
  for (const id of exitingIds) {
    if (!data.toasts.some((x) => x.id === id)) {
      const item = mapRef.current.get(id);
      if (item) renderToasts.push({ item, exiting: true });
    }
  }

  if (renderToasts.length === 0) return null;

  // 退出动画结束 → 从 exitingIds + 缓存移除（对标壳 E3.5 #TO05）
  const handleExited = (id: string) => {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    mapRef.current.delete(id);
  };

  return (
    <div className="toast-container">
      {renderToasts.map(({ item, exiting }) => (
        <ToastItemView
          key={item.id}
          item={item}
          exiting={exiting}
          onDismiss={() => api?.dismiss(item.id)}
          onAction={(actionId) => api?.action(item.id, actionId)}
          onExited={() => handleExited(item.id)}
        />
      ))}
    </div>
  );
}

/** 单条通知卡片——对标壳 NotificationItem（行为零差异搬运，函数回传换 actionId） */
function ToastItemView({ item, exiting, onDismiss, onAction, onExited }: {
  item: PoolToastItem;
  exiting: boolean;
  onDismiss: () => void;
  onAction: (actionId: string) => void;
  onExited: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // onExited 每次渲染新建（ToastHost 内联箭头）——进 effect deps 会让退场 effect 随父重渲染重跑、重置计时。
  // 用 ref 存最新引用，effect 只在 [exiting, visible] 变化时跑。
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  // 退场双 rAF 句柄——cleanup 时取消未触发的 rAF
  const exitRafRef = useRef<number | null>(null);

  // 首次渲染后触发入场动画（对标壳 NotificationItem 双 rAF——先渲染未含 toast-fade-in 的初帧，
  // 下一帧再补类，CSS 过渡真跑：opacity 0→1 跨帧，不发 transitionend 的瞬跳会让退场兜底逻辑踩空）
  useEffect(() => {
    let innerId: number | null = null;
    const id = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(id);
      if (innerId !== null) cancelAnimationFrame(innerId);
    };
  }, []);

  // 退出动画——exiting 时去掉 toast-fade-in 触发 CSS 反向动画（对标壳 E3.5 #TO03）
  // 🔥 2026-09-05 残骸 bug 修复：原 `if (exiting && visible) setVisible(false)` 直接跑时，React 常把
  //    「加 toast-exiting」与「去 toast-fade-in」提交在同一帧（无中间 painted 态）→ opacity 1→0 同帧瞬跳、
  //    不发 transitionend → onTransitionEnd 永不满足 → 退场节点永不从 DOM 移除（实测堆积 33 条 opacity 0 残骸）。
  //    修法：退场对齐入场双 rAF 跨帧——先让「toast-fade-in + toast-exiting」被 paint，下一帧再去 fade-in，
  //    过渡真跑、transitionend 真触发（onExited 照常由 onTransitionEnd 精确触发）。
  //    另加兜底：退场期（EXIT_ANIM_MS + 余量）后强制 onExited——即便 transitionend 因故丢失也不留残骸
  //    （handleExited 幂等，transitionend 先到先移、兜底后到无害；`!visible` 的从未显示 toast 也走此路径被清）。
  useEffect(() => {
    if (!exiting) return;
    if (visible) {
      exitRafRef.current = requestAnimationFrame(() => {
        exitRafRef.current = requestAnimationFrame(() => setVisible(false));
      });
    }
    const fallback = window.setTimeout(() => onExitedRef.current(), EXIT_ANIM_MS + EXIT_CLEANUP_MARGIN_MS);
    return () => {
      if (exitRafRef.current !== null) window.cancelAnimationFrame(exitRafRef.current);
      window.clearTimeout(fallback);
    };
  }, [exiting, visible]);

  // E6#71h：恒全显——详情行（来源 + 动作钮）有内容即渲染，无折叠两态
  const hasDetails = !!item.sourceText || (item.actions?.length ?? 0) > 0;

  return (
    <div
      className={`toast-item${visible ? " toast-fade-in" : ""}${exiting ? " toast-exiting" : ""}`}
      onMouseUp={(e) => {
        // VS Code：中键关闭
        if (e.button === MIDDLE_BUTTON) {
          e.preventDefault();
          onDismiss();
        }
      }}
      onTransitionEnd={(e) => {
        // CSS transition 结束后才真正从 DOM 移除（对标壳 E3.5 #TO05）
        if (exiting && e.target === e.currentTarget && e.propertyName === OPACITY_PROPERTY) {
          onExited();
        }
      }}
    >
      {/* ── 主行 ── */}
      <div className="toast-main-row" style={{ minHeight: ROW_HEIGHT }}>
        {/* 图标——iconClass 壳侧已解析（codicon + severity 类），原样渲染 */}
        <div className={`toast-icon ${item.iconClass}`} />

        {/* 消息——壳侧原文，原样渲染。71h：整句换行全可见（CSS 无单行截断），可选中复制 */}
        <div className="toast-message" title={item.message}>
          {item.message}
        </div>

        {/* 工具栏——hover 时显示（对标壳） */}
        <div className="toast-toolbar">
          <button
            className="toast-close-btn"
            onClick={onDismiss}
            title={t("关闭")}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>

      {/* ── E6#71i：进度条——progress toast 专属行。percent 有值 = 确定条宽（下载段真值）；
         无 percent = 不定态扫动动画（校验/解压/加载段） ── */}
      {item.progress === true && (
        <div className="toast-progress">
          {item.percent != null ? (
            <div
              className="toast-progress-fill"
              style={{ width: `${Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, item.percent))}%` }}
            />
          ) : (
            <div className="toast-progress-indeterminate" />
          )}
        </div>
      )}

      {/* ── 详情行：source + 按钮（71h：有内容恒显，无折叠） ── */}
      {hasDetails && (
        <div className="toast-details-row">
          {item.sourceText && (
            <span className="toast-source">{item.sourceText}</span>
          )}
          {item.actions && item.actions.length > 0 && (
            <div className="toast-actions">
              {item.actions.map((action) => (
                <button
                  key={action.actionId}
                  className={`toast-action-btn ${action.isPrimary ? "primary" : "secondary"}`}
                  onClick={() => onAction(action.actionId)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
