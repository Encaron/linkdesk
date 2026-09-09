/**
 * 池→壳浮层动作回传契约——E5.7#97。
 *
 * 原为 preload-shell.ts 模块级本地 type（E5.7#15/#16/#17/#39），
 * 但同样是跨堆 wire 载荷——归口本目录，壳 preload 与 API 类型层 import type。
 * 注意与 poolQuickPick.ts / poolToast.ts 区分：那些是壳→池的渲染数据 DTO，
 * 这些是池→壳的动作回传（actionId 由壳侧重解析原始 item）。
 */

/** QuickPick 动作——select/highlight/close/itemAction 按 key 回传 */
export interface PoolQuickPickAction {
  type: string;
  key?: string;
  actionId?: string;
}

/** Toast 动作——dismiss/action 按 id + actionId 回传 */
export interface PoolToastAction {
  type: string;
  id: string;
  actionId?: string;
}

/** Dialog 动作——confirm/cancel 回传，壳侧 settle Promise */
export interface PoolDialogAction {
  type: string;
}

/** 悬浮面板动作——action 按 actionId 回传（open-in/close），壳侧 settle Promise（E5.8#37 类型 B） */
export interface PoolFloatingPanelAction {
  type: string;
  actionId?: string;
}

/** 内存压力通知——主进程 window-manager 采样超阈值（E5.7#39） */
export interface MemoryPressureData {
  totalRSS: number;
  threshold: number;
}

/** Pool 就绪通知载荷——主进程按 sender 解析 windowId 转发壳（E5.8#43-1 A3 多窗口就绪流） */
export interface PoolReadyPayload {
  windowId: string;
}

/** 壳→主：创建池窗请求——windowId 壳生成（tabState 归属），bounds 可选（E5.8#43-1 A4 多窗口底座） */
export interface CreatePoolWindowRequest {
  windowId: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

/** 主→壳：池窗被 OS 关闭通知（用户点 × / OS 关窗）——壳据 windowId 按窗口策略处理 tab（E5.8#43-1 A4） */
export interface PoolWindowClosedPayload {
  windowId: string;
}

/** E5.8#43-3：池窗位置/大小变更矩形——主进程 moved/resized 事件上报（壳据 windowId 更新注册表 + 落盘 A6）。
 *  非独立契约入口（契约生成器 walkRefs 命中引用即强制 export 进 linkdesk.d.ts）——源码不 export，knip 不报死面。 */
interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 主→壳：脱出池窗 bounds 变更通知（用户移动/缩放窗口）——壳持久化浮窗位置（I9-14 位置/大小记录） */
export interface PoolWindowBoundsPayload {
  windowId: string;
  bounds: WindowBounds;
}

/** E5.8#44-B：TabBar viewport rect——池侧 getBoundingClientRect 上报（吸附/释放并窗命中检测数据源）。
 *  坐标 = 视口相对（0,0 = 窗口内容区左上），壳持权威 window bounds 后转 screen（bounds.x + rect.left）。
 *  groupId 携带——命中后 mergeTabToWindow 直落目标组。 */
export interface TabBarViewportRect {
  groupId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 池→壳：TabBar rects 上报载荷——主进程按 sender 解析附上 windowId（E5.8#44-B） */
export interface TabBarRectsPayload {
  windowId: string;
  rects: TabBarViewportRect[];
}

/** E5.8#44-C：拖拽位置上报载荷——池拖出手势（拎起后 mousemove 全程）上报，壳排除源窗转 screen 吸附命中检测。
 *  坐标 = 屏幕坐标（e.screenX/screenY——窗口 bounds 同为屏幕坐标，可直接命中）。canceled = Esc 取消（keydown 无坐标）。 */
export interface TabDragPositionPayload {
  tabId: string;
  screenX: number;
  screenY: number;
  /** Esc 取消拖拽——壳清吸附提示（keydown 无坐标，仅置标志；screenX/screenY 填 0） */
  canceled?: boolean;
  /** E5.8#46.19：被拖标签标题——池上报供主进程幽灵窗渲染文字（主进程不持 tabState，标题由池带）。壳/吸附忽略此字段 */
  title?: string;
  /** E5.8#46.19：光标是否在源窗外（屏坐标对照 winScreenX+视口尺寸，与 onMouseUp 窗外判定同源）——
   *  窗外 → 主进程 OS 幽灵显示（DOM 浮块出窗被裁剪）；窗内 → OS 幽灵隐藏（DOM 浮块可见）。壳/吸附忽略此字段 */
  outside?: boolean;
  /** E5.8#46.19 进化：拖拽幽灵外观——主题三色（源池 getComputedStyle 读 --bg-card/--border/--text-primary，
   *  均为纯 hex 值）+ 被拖标签图标（E6#69g：池把 tab.icon 判别联合裁成幽灵窗可渲染形态——emoji 文本或 img
   *  URL；codicon/lucide 无字形字体注入 → null，iconKind 区分渲染）。
   *  仅 outside=true（窗外）时主进程消费；壳/吸附忽略此字段。可选用——旧池不带上限。
   *  iconKind 判定与 DragOverlays 浮块同款（emoji：直渲文本；img：图片 URL）。 */
  ghost?: {
    theme: { bg: string; border: string; text: string };
    icon: string | null;
    iconKind: "emoji" | "img" | null;
  };
}

/** 池→壳：拖拽位置上报载荷——主进程按 sender 解析附上 sourceWindowId（E5.8#44-C 源窗排除——池永远不知自身 windowId） */
export type ShellTabDragPosition = TabDragPositionPayload & { sourceWindowId: string };

/** 壳→池：吸附提示载荷——目标窗 TabBar 插入指示（groupId 命中）/ 清除（groupId null = 无吸附目标，清光）。
 *  E5.8#46.10：groupId 命中时携带 viewportX/Y——光标在目标窗 viewport 坐标（壳由屏坐标 − 窗口 bounds 原点换算），
 *  目标池用它算插入缝隙（竖线落点，复用 computeTabInsertIndex）。 */
export interface AdsorbHintPayload {
  groupId: string | null;
  viewportX?: number;
  viewportY?: number;
}

/** 池→壳：吸附插入缝隙回传——目标池每次算出新的缝隙（竖线落点）就上报，壳存吸附注册表供释放并窗精确落位。
 *  windowId 由主进程按 sender 注入（池永远不知自身 windowId，E5.8#44 定案）。 */
export interface AdsorbIndexPayload {
  windowId: string;
  groupId: string;
  /** 插入缝隙 0..tabs.length（竖线落点）——松手 merge 落位 = 竖线指的那根缝（提示不撒谎） */
  insertIndex: number;
}
