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
    };
