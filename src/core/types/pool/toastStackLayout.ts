/**
 * 轻 Toast 栈 DTO——自 poolLayout.ts 拆出（文件体积门禁 800 行：poolLayout 825 超限的拆分件，
 * 2026-11-20 随轻 Toast 棒 0 同笔）。
 * 壳想池画：壳 toast store `presentation:"toast"` 条目经 buildToastStack 序列化后随 PoolLayout
 * 顶层推送，池 TransientToastStack 哑渲染；正典 = 待抉择池/底部Toast轻提示/01-API与组件契约.md。
 */

/** 轻 Toast 栈条目——壳 store `presentation:"toast"` 条目的 DTO（TransientToast 池侧哑渲染）。
 *  与面板 DTO（NotifItem）同源异面：一条条目只进一个面（2026-11-19 改判）。 */
export interface ToastStackItem {
  id: string;
  key?: string;
  message: string;
  severity: "info" | "success" | "warning";
  /** 动作（最多 1 个）——command/args 由**池**执行（插件命令注册在池；未注册 → 点击只关闭 B10） */
  action?: { title: string; command?: string; args?: unknown[] };
  /** false = 隐藏 severity 图标（01 契约 §2 icon 形参）；缺省/true = 恒显 */
  icon?: boolean;
  /** 到期时间戳（epoch ms）——池侧计时真相（B21 hover 暂停 / B34 最小化继续都按 time-based 判定；
   *  池侧 interval 比对 now 与本值，过期即经 dismissToastItem 回壳删条目）。壳侧已按同 key 合并/上限 3 裁剪。 */
  expiresAt: number;
}

/** 轻 Toast 栈 DTO——挂在 PoolLayout 顶层与 statusBar.notif 同帧推送（壳想池画）。空数组 = 无在显条目 */
export interface ToastStackLayout {
  items: ToastStackItem[];
  /** × 按钮文案（壳 t("关闭")——显示文本铁律） */
  dismissLabel?: string;
}
