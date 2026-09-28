/**
 * Pool Dialog 哑渲染数据——E5.7#17（浮层归一化设计.md §7）。
 *
 * 聪慧→哑数据流：壳 DialogService 桥（renderer 注册）把 options 序列化成 DTO 推送
 * （显示文本铁律——按钮文案已由壳侧 t() 解析，池原样渲染）。
 * Promise 的 resolve 闭包留壳——池只回传动作类型（confirm/cancel），壳侧 settle。
 */

export type PoolDialogData =
  | { open: false }
  | {
      open: true;
      title: string;
      message: string;
      /** 壳侧已 t() 解析——池原样渲染 */
      confirmLabel?: string;
      cancelLabel?: string;
      /** alert 模式——只有确定按钮，无取消/Escape/backdrop 关闭 */
      isAlert: boolean;
      /** E6#71c 富内容槽——present 时替代 title/message/默认按钮渲染（弹窗机制不变：
       *  居中/遮罩/Esc/trap/点遮罩取消仍由 DialogHost 提供）。内容 = 插件视图——
       *  壳不持渲染器，池经 PluginComponent 挂载（仿 FloatingPanel DTO）。payload 不透明——
       *  壳不解释、池原样持，内容视图经 window.linkdesk.dialogHost.current() 读。 */
      content?: {
        pluginId: string;
        /** 池视图注册表寻址键——loader 运行时附挂（ViewContainerService._renderPath） */
        renderPath: string;
        /** 不透明序列化载荷——随打开参数过壳→回池（结构克隆），内容视图取数用 */
        payload?: unknown;
      };
    };

/**
 * M1 `AI#5`：**在途弹窗**的可读投影——「有没有 confirm/alert 正弹着、在等什么」。
 *
 * 🔴 与 `PoolDialogData` 的关系：那个是**哑渲染载荷**（池照它画），这个是**问「现在在等什么」的答案**
 * （读 `DialogService` 登记的在途 options）。两者形状刻意同源但**不是同一条通道**：
 * 那个走 `pool:dialog` 直推，这个走 `plugins:call("getPendingDialogs")` 按需拉。
 *
 * 取用面 = `window.linkdesk.dialogHost.pending()`。
 */
export interface PoolPendingDialog {
  /** `"confirm"` = 可取消（Escape/点遮罩）；`"alert"` = 只有确定（`PoolDialogData.isAlert` 同源） */
  kind: "confirm" | "alert";
  title: string;
  message: string;
  /**
   * 按钮文案——**已由壳按显示文本铁律解析**（显式 `confirmLabel`/`cancelLabel` 优先，否则 i18n 缺省；
   * 与推送面 `bridges.ts` **同一份实现**，见 `DialogService.resolveDialogButtons`）。
   * `kind:"confirm"` → 2 条（确定、取消）；`kind:"alert"` → 1 条（确定）。
   * ⚠️ 富内容模式（`content` 存在）下按钮由插件视图自画 ⇒ **空数组**（⛔ 别拿确定/取消去猜）。
   */
  buttons: string[];
  /** E6#71c 富内容确认——内容 = 插件自绘视图。给**身份**（不给 renderPath：那是池内寻址键，
   *  而本面在池里问的是"壳在等什么"），⛔ 不带 payload（不透明载荷可能很大，读「在等什么」也用不上）。 */
  content?: { pluginId: string; viewId: string };
}
