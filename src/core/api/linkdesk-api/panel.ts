/**
 * linkdesk-api 底部面板域——E5.8#34.5 自建（通用 API 壳先行建设不等消费方——新铁律）。
 * panel 命名空间面 verbatim。零外部类型依赖；被聚合器交叉组装。
 *
 * 语义（I7-8 reveal）：插件聚焦其底部面板视图——面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）；
 * 已显示 → 切换聚焦到该视图。声明寻址 = contributes.views location:"panel"
 * （#63.7 同源，零新注册面）。无贡献插件时 no-op 不崩。
 *
 * 语义（I8-2 revealFloating）：壳内悬浮面板（类型 B）——按声明弹出某视图为悬浮面板（E5.8#39.5）。
 * 声明寻址 = ViewContainerService 全局视图索引（contributes.views 已注册任意视图，不限 panel 容器）。
 * 身份开关键：无面板 → 开 / 同视图 → 关（toggle）/ 他面板 → 替换。未声明视图时 no-op 不崩。
 *
 * 语义（M2 `AI#20` setFloatingBounds）：悬浮面板**几何**（位置/高度）可精确设定——补上「只能靠拖」
 * 这一「唯一鼠标路径」（A 类里唯一够不着且无替代的自家功能）。部分字段精确设定，null = 回默认；
 * 与拖拽/调高共用同一套隐藏边界（最小高 300 / 最高 = 窗口高 - 80 / 6px 壳内钳制）——API 绕不过限位。
 */

import type { FloatingPanelBounds } from "../../types/pool/poolFloatingPanel";

/** 底部面板命名空间面——对标 VS Code vscode.window.createTreeView 后 focus / 视图提升语义 */
export interface PanelAPI {
  panel: {
    /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时 no-op */
    reveal(viewId: string): Promise<void>;
    /** 壳内悬浮面板（类型 B）——按声明弹出某视图（I8-2 身份开关键）。viewId 未声明视图时 no-op。
     *  E5.8#41.18：可选 pluginId 复合寻址——两插件同名 viewId（双设置套并存）时插件侧携带
     *  pluginId 精确命中目标套（壳侧路径 Ctrl+,/右键已带；裸 viewId 多命中 fail-loud no-op） */
    revealFloating(viewId: string, pluginId?: string): Promise<void>;
    /**
     * M2 `AI#20`：设定当前悬浮面板的几何（**非鼠标路径**——不与拖拽抢，两条路并存）。
     *
     * `bounds` 只带想改的字段（如只 `{ top, left }` 只挪位置，`height` 不动）；`null` = 回默认居中大卡
     * （I8-5/I8-7 拖拽前那一态）。面板**未开**时 no-op（本 API 只改几何，⛔ 不开面板——开面板归 `revealFloating`）。
     *
     * ⚠️ 越界值按**拖拽同一套边界**钳制（不是拒绝）：`height < 300` → 300；`height > 窗口高 - 80` → 钳到上限；
     * `top/left` 被钳进 6px 壳内边界；`width` 只设上限（窗口宽 - 12）。想读回**实际生效**的几何，用
     * `floatingPanelHost.getBounds()`（池内同步直答）或壳命令 `workbench.action.getFloatingPanelBounds`。
     */
    setFloatingBounds(bounds: Partial<FloatingPanelBounds> | null): Promise<void>;
  };
}
