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
    };
