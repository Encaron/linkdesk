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
