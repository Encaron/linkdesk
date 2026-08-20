/**
 * linkdesk-api 底部面板域——E5.8#34.5 自建（通用 API 壳先行建设不等消费方——新铁律）。
 * panel 命名空间面 verbatim。零外部类型依赖；被聚合器交叉组装。
 *
 * 语义（I7-8）：插件聚焦其底部面板视图——面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）；
 * 已显示 → 切换聚焦到该视图。声明寻址 = contributes.views location:"panel"
 * （#63.7 同源，零新注册面）。无贡献插件时 no-op 不崩。
 */

/** 底部面板命名空间面——对标 VS Code vscode.window.createTreeView 后 focus 语义 */
export interface PanelAPI {
  panel: {
    /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时 no-op */
    reveal(viewId: string): Promise<void>;
  };
}
