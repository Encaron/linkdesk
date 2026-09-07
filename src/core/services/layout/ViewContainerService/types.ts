/**
 * ViewContainerService 类型层——自 ViewContainerService.ts 拆出（E5.8#0d.10-11a）。
 * 7 接口 + 1 类型 verbatim（ViewContainerLocation / ViewContainerDescriptor / ViewDescriptor /
 * ViewContainerChangeEvent / ViewEmptyContentDescriptor / ViewChangeEvent / ActiveViewChangeEvent）。
 * 依赖方向：types → React 全局命名空间（ComponentType/ReactNode）；零业务逻辑；被聚合器 re-export。
 */

import type { TitleActionWidget } from "../../../api/types"; // E5.8#36.5：titleActions 声明面——JSON 可序列化，壳↔池直传

/** 容器所在位置。对标 VS Code ViewContainerLocation。 */
export type ViewContainerLocation = "sidebar" | "panel" | "auxiliarybar" | "main";

/** 容器描述符——对标 VS Code IViewContainerDescriptor */
export interface ViewContainerDescriptor {
  /** 容器 ID。命名：a-z + 连字符。如 "explorer" / "marketplace" / "serial-monitor" */
  id: string;
  /** 侧栏 header 显示的标题。如 "资源管理器" */
  title: string;
  /** 容器图标——覆盖插件自身的图标。可选。 */
  icon?: string;
  /** 位置。默认 'sidebar'。 */
  location?: ViewContainerLocation;
  /** 无活跃 view 时自动隐藏容器。对标 VS Code hideIfEmpty。默认 false。 */
  hideIfEmpty?: boolean;
  /** 同位置内的排序权重。小值靠前。 */
  order?: number;
  /** 容器内只有一个 view 时，隐藏 view header——标题合并到容器 header。
   *  对标 VS Code mergeViewWithContainerWhenSingleView */
  mergeHeaderWhenSingle?: boolean;
}

/** View 描述符——对标 VS Code IViewDescriptor */
export interface ViewDescriptor {
  /** View 唯一 ID。如 "folders" / "sessions" / "settings" */
  id: string;
  /** 显示标题——SidebarSection 的 header 文字。可为空字符串（不显示折叠头） */
  title: string;
  /** React 组件 */
  render: React.ComponentType;
  /** 🆕 E36#ROLE：容器角色——替代 title="" hack。默认 "section"。
   *  "toolbar" = 粘顶，不被 section 覆盖。 "section" = 有折叠头，同级替换。 */
  role?: "toolbar" | "section";
  /** Context key when 条件——满足时才显示。null = 始终显示。对标 VS Code IViewDescriptor.when */
  when?: string;
  /** 同容器内的排序权重。小值在上。对标 VS Code IViewDescriptor.order */
  order?: number;
  /** 初始折叠状态。true = 首次渲染时折叠。对标 VS Code IViewDescriptor.collapsed */
  collapsed?: boolean;
  /** 用户可通过 Views 子菜单切换可见性。对标 VS Code IViewDescriptor.canToggleVisibility */
  canToggleVisibility?: boolean;
  /** 用户可将此 view 移到其他容器。对标 VS Code IViewDescriptor.canMoveView */
  canMoveView?: boolean;
  /** 默认隐藏——用户需手动从 Views 菜单开启。对标 VS Code IViewDescriptor.hideByDefault */
  hideByDefault?: boolean;
  /** 折叠头右侧的操作按钮。ReactNode——不可在 plugin.json 声明，仅命令式 registerView 使用 */
  actions?: React.ReactNode;
  /** 🆕 PinnedSlot——粘顶内容。壳在 Section header 下方渲染，position:sticky。每次渲染调用——内容动态变化 */
  pinnedContent?: () => React.ReactNode;
  /** 标题旁的副文字。对标 VS Code ViewPane.titleDescription */
  titleDescription?: string;
  /** 单 view 且容器 mergeHeaderWhenSingle 时，容器 header 显示此标题替代容器 title。
   *  对标 VS Code singleViewPaneContainerTitle */
  singleViewPaneContainerTitle?: string;
  /** E4V#45——拖拽 resize 最小高度（px）。不声明默认 100 */
  minHeight?: number;
  /** 控制 actions 的显隐时机。对标 VS Code ViewPaneShowActions */
  showActions?: "always" | "whenExpanded" | "default";
  /** 标题 hover tooltip——标题截断时显示完整文字。对标 VS Code titleContainerHover */
  titleTooltip?: string;
  /** 标题右侧标记——数字/短文字（如已安装数量 "15"）。对标 VS Code IViewDescriptor.badge */
  badge?: string | number;
  /** E5.8#36.5：视图动作区声明——contributes.views[].titleActions 透传（JSON 可序列化）。
   *  壳统一渲染器消费（面板标签栏/侧栏 header 右侧），随视图走随视图迁移。 */
  titleActions?: TitleActionWidget[];
}

/** 容器变更事件 */
export interface ViewContainerChangeEvent {
  added: ViewContainerDescriptor[];
  removed: ViewContainerDescriptor[];
}

/** E4V#44——View 空状态占位内容。对标 VS Code IViewContentDescriptor。
 *  通用——不限于"欢迎"：搜索无结果/串口未连接/加载失败 等都走此机制。 */
export interface ViewEmptyContentDescriptor {
  /** E5.8#41.9.1：声明此空态内容的插件 id——复合键 `pluginId:viewId` 归属（同名视图空态各存各的） */
  pluginId: string;
  viewId: string;
  containerId: string;
  /** 占位内容——view 无数据/不满足条件时显示 */
  content: React.ReactNode;
  /** Context key when 条件。null = 始终显示 */
  when?: string;
}

/** View 变更事件 */
export interface ViewChangeEvent {
  containerId: string;
  views: ViewDescriptor[];
}

/** 活跃 View 变更事件 */
export interface ActiveViewChangeEvent {
  containerId: string;
  added: ViewDescriptor[];
  removed: ViewDescriptor[];
}
