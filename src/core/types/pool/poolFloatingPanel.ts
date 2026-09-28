/**
 * Pool 悬浮面板哑渲染数据——E5.8#37（Phase 8 壳内悬浮面板 类型 B）。
 *
 * 聪慧→哑数据流（DialogService 同款——归一化不重造）：壳 FloatingPanelService 桥把面板请求
 * 序列化成 DTO 推送（显示文本铁律——标题/动作文案已由壳侧 t() 解析，池原样渲染，零 useTranslation）。
 * 内容 = 插件视图——DTO 带 pluginId/renderPath，池经 PluginComponent 按 viewId 寻址视图注册表渲染
 * （壳不持渲染器——#37 验收）。
 *
 * 状态闭环：壳 push {open:false} 驱动关闭——池不本地关闭（哑，I8-11）。
 * 例外：最大化（I8-9 同按钮 toggle）是纯视觉态（CSS 100vw）——池本地 toggle，零壳 roundtrip；
 * 两态文案/图标都由 DTO 携带（池零自产文本）。
 * Promise settle 闭包留壳——池只回传动作类型（action/actionId），壳侧重解析业务语义（#38 接线）。
 */

/** 标题栏动作按钮——池渲染 + 回传壳侧重解析业务语义（池零语义，UI 机械知识除外）。
 *  E5.8#20-c：改名 PoolFloatingPanelButton——与 poolActions.ts PoolFloatingPanelAction（IPC 回传动作）
 *  同名，契约平铺进单文件会声明合并成幽灵复合型；按钮描述型用 Button 后缀消歧（契约族命名消歧惯例）。 */
export interface PoolFloatingPanelButton {
  /** 动作 id——open-in（在主窗口中打开）/ maximize（最大化）/ close（关闭），壳侧重解析 */
  id: string;
  /** 壳 t() 已解析的动作名——mockup：hover tooltip（open-in 展开全文） */
  label: string;
  /** 内建图标 id——池按 id 选 SVG（open-in/maximize/restore/close） */
  icon: string;
  /** 本地 toggle 专用（I8-9 最大化→还原 同按钮）——切换态图标，缺省 = 非 toggle 动作（回传壳） */
  toggledIcon?: string;
  /** 本地 toggle 切换态文案（如「还原」）——池零自产文本，两态文案都壳 t() 给 */
  toggledLabel?: string;
  /** open-in 类型——默认纯图标、hover 展开全文（mockup .fp-act.open-in） */
  expandOnHover?: boolean;
}

/** 面板显式几何（px）——I8-5/I8-7 拖拽/调高后取代默认居中大卡布局。
 *  M2 `AI#20`：同一形状经 `panel.setFloatingBounds` 走 API 路径（非鼠标路径）设定。 */
export interface FloatingPanelBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** `floatingPanelHost.getBounds()` 读数——池侧渲染盒的**真实**几何 + 面板身份 + 最大化态。
 *  「无面板」不在此型内——返回类型是 `PoolFloatingPanelGeometry | null`。 */
export interface PoolFloatingPanelGeometry extends FloatingPanelBounds {
  viewId: string;
  pluginId: string;
  /** I8-9 最大化（纯视觉态，铺满窗口）——true 时几何 = 满窗盒（如实报，⛔ 不报「最大化前」的旧值） */
  maximized: boolean;
}

export type PoolFloatingPanelData =
  | { open: false }
  | {
      open: true;
      /** 面板身份——壳 FloatingPanelService 单实例语义按 viewId 裁决（I8-10：同 viewId 聚焦 / 异 viewId 替换） */
      viewId: string;
      /** 标题——壳 t() 已解析，池原样渲染 */
      title: string;
      /** 内容插件——池经 PluginComponent(pluginId, renderPath) 渲染（壳不持渲染器） */
      pluginId: string;
      /** 内容视图 renderPath——池视图注册表寻址 */
      renderPath: string;
      /** 标题栏动作按钮（顺序 = 渲染顺序：open-in / maximize / close） */
      actions: PoolFloatingPanelButton[];
      /** 语言切换文案重推标记（refreshPanelText）——池仅更新标题/动作渲染，跳过焦点获取（I8-8 首次打开才入焦点） */
      refresh?: boolean;
      /** M2 `AI#20`：**API 路径**显式几何（`panel.setFloatingBounds` 推入，一次性——⛔ 壳不把它存进
       *  refreshPanelText 的底稿，否则语言切换重推会把用户拖过的面板弹回旧位）。
       *  语义三分：**缺省** = 不动几何（拖拽/调高后的本地态原样保留）｜**部分字段** = 精确设定
       *  （未带字段保持现值，同一套 I8-5/I8-7 钳制）｜**null** = 回默认居中大卡（拖拽前那一态）。 */
      bounds?: Partial<FloatingPanelBounds> | null;
    };

/** M2 `AI#20`：几何宿主请求——preload 转发 API 路径到池 FloatingPanelHost（池是几何真相源：
 *  面板渲染在池，只有池知道它此刻真在哪；壳不存几何 ⇒ 不会是第二把尺）。
 *  `set` 在最大化态下先退出最大化再设定（「设定必生效」——几何与满窗态互斥）。 */
export type FloatingPanelBoundsHostRequest =
  | { op: "set"; bounds: Partial<FloatingPanelBounds> | null }
  | { op: "get" };

/** M2 `AI#20`：池侧几何宿主实现——`set` 返回「有面板且已应用」，`get` 返回当前渲染几何（无面板 = null）。
 *  形状对标 `quickPickHost.registerHost(fn)`（主世界函数经 contextBridge 代理进隔离世界存储）。 */
export type FloatingPanelBoundsHostFn = (
  req: FloatingPanelBoundsHostRequest,
) => boolean | PoolFloatingPanelGeometry | null;
