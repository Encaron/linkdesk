/**
 * linkdesk-api 底部面板域——E5.8#34.5 自建（通用 API 壳先行建设不等消费方——新铁律）。
 * panel 命名空间面 verbatim。零外部类型依赖；被聚合器交叉组装。
 *
 * 语义（I7-8 reveal）：插件聚焦其底部面板视图——面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）；
 * 已显示 → 切换聚焦到该视图。声明寻址 = contributes.views location:"panel"
 * （#63.7 同源，零新注册面）。无贡献插件时 no-op 不崩。
 *
 * 语义（I7-9 moveToEditor）：插件将其底部面板视图升级为主区标签页——落点 = 当前活动 group 尾部
 * （文件树规则同款），面板内移除（隐藏）。与悬浮面板「在主窗口中打开」同一底层不重造。
 */

/** 底部面板命名空间面——对标 VS Code vscode.window.createTreeView 后 focus / 视图提升语义 */
export interface PanelAPI {
  panel: {
    /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时 no-op */
    reveal(viewId: string): Promise<void>;
    /** 将底部面板视图升级为主区标签页（当前活动 group 尾部）+ 面板内移除。viewId 不在 panel 容器时 no-op */
    moveToEditor(viewId: string): Promise<void>;
  };
}
