/**
 * 壳面板命令——底部面板显隐（E5.8#31）+ 菜单栏「面板」菜单招牌（E5.8#33）+ 侧栏换边（E5.8#37.6）
 * + 面板位置/对齐（E5.8#37.7）。
 * E5.8#31：自 coreCommands.ts 划分独立文件（settingsCommands 同款模式）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry"; // E5.8#33：面板菜单招牌
import { shellEvents } from "../../react/events/ShellEvents";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { layoutEngine, narrowSidebarEdge, narrowPanelEdge } from "../../services/layout/LayoutEngine"; // #37.6/#37.7 命令真相源

/* ── E5.8#37.7：面板位置/对齐命令映射——命令 ID → 目标 edge/align（单一真相：注册 + resolvePanelChecked 共用）── */

const PANEL_POSITION_EDGES = {
  "workbench.action.positionPanelBottom": "bottom",
  "workbench.action.positionPanelTop": "top",
  "workbench.action.positionPanelLeft": "left",
  "workbench.action.positionPanelRight": "right",
} as const;

const PANEL_POSITION_TITLES = {
  "workbench.action.positionPanelBottom": "面板移到底部",
  "workbench.action.positionPanelTop": "面板移到顶部",
  "workbench.action.positionPanelLeft": "面板移到左侧",
  "workbench.action.positionPanelRight": "面板移到右侧",
} as const;

const PANEL_ALIGN_VALUES = {
  "workbench.action.alignPanelLeft": "left",
  "workbench.action.alignPanelCenter": "center",
  "workbench.action.alignPanelRight": "right",
  "workbench.action.alignPanelJustify": "justify",
} as const;

const PANEL_ALIGN_TITLES = {
  "workbench.action.alignPanelLeft": "面板左对齐",
  "workbench.action.alignPanelCenter": "面板居中对齐",
  "workbench.action.alignPanelRight": "面板右对齐",
  "workbench.action.alignPanelJustify": "面板两端对齐",
} as const;

/**
 * E5.8#37.7：面板右键菜单当前项 √（单选）——getItems 桥对 panelViewContext 子项逐项调用。
 * position 命令 → 目标 edge === 当前 edge；align 命令 → 目标 align === 当前 align。
 * 真相源 = LayoutEngine dock（与命令 handler 同源——同一份 dock.edge/align，命中即 √）。
 */
export function resolvePanelChecked(commandId: string): boolean {
  const edge = (PANEL_POSITION_EDGES as Record<string, "bottom" | "top" | "left" | "right">)[commandId];
  if (edge) return layoutEngine.getZone("panel")?.dock?.edge === edge;
  const align = (PANEL_ALIGN_VALUES as Record<string, "left" | "center" | "right" | "justify">)[commandId];
  if (align) return layoutEngine.getZone("panel")?.dock?.align === align;
  return false;
}

/** E5.8#37.7：面板位置选择器——dockTo("panel", edge)。同边 no-op（单选语义：已选边再点不动作，非 toggle）。 */
function positionPanel(edge: "bottom" | "top" | "left" | "right"): void {
  const current = narrowPanelEdge(layoutEngine.getZone("panel")?.dock?.edge);
  if (current === edge) return; // 同边 no-op
  layoutEngine.dockTo("panel", edge);
}

/** E5.8#37.7：面板对齐选择器——setAlign("panel", align)。同对齐 no-op（单选语义同 position）。 */
function alignPanel(align: "left" | "center" | "right" | "justify"): void {
  const current = layoutEngine.getZone("panel")?.dock?.align ?? "center";
  if (current === align) return; // 同对齐 no-op
  layoutEngine.setAlign("panel", align);
}

export function registerPanelCommands(): void {
  // E5.8#31：底部面板显隐切换（VS Code 标准 Ctrl+J）——与侧栏 Ctrl+B 同构：
  // 命令只做入口 emit panel:toggle，App usePanelHost 消费翻转 + 持久化。真相源 = App state。
  // 无 panel 贡献插件时命令无可见效果（state 翻转无害，usePoolSync 无 panelViews → 不推 panel 字段）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.togglePanel",
    title: "切换底部面板可见性",
    category: "视图",
    handler: async () => {
      shellEvents.emit("panel:toggle", undefined);
    },
  });

  // E5.8#37.6：侧栏换边（VS Code Move Side Bar 同款）——双 when 门控菜单项共用此命令。
  // 命令 = 切到对边（toggle：当前 left → right / right → left）。真相源 = LayoutEngine dock.edge；
  // dockTo 附 swap 规则联动 rightSidebar 对边（主侧栏换右 → agent 自动跳左）；持久化经
  // onDidChangeLayout → App 防抖落盘（#36.9 底座，本命令零额外接线）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleSidebarPosition",
    title: "切换侧栏位置",
    category: "视图",
    handler: async () => {
      const current = narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge);
      layoutEngine.dockTo("sidebar", current === "left" ? "right" : "left");
    },
  });

  // E5.8#37.7：面板位置四命令——dockTo("panel", edge) + 同边 no-op。持久化经 onDidChangeLayout →
  // App 防抖落盘（#36.9 底座，本命令零额外接线）；启动恢复 dockTo 已由 tabActions 铺好。
  for (const [id, edge] of Object.entries(PANEL_POSITION_EDGES)) {
    registerCommand(APP_PLUGIN_ID, {
      id,
      title: PANEL_POSITION_TITLES[id as keyof typeof PANEL_POSITION_TITLES],
      category: "视图",
      handler: async () => positionPanel(edge as "bottom" | "top" | "left" | "right"),
    });
  }

  // E5.8#37.7：面板对齐四命令——setAlign("panel", align) + 同对齐 no-op。持久化/恢复同 position。
  for (const [id, align] of Object.entries(PANEL_ALIGN_VALUES)) {
    registerCommand(APP_PLUGIN_ID, {
      id,
      title: PANEL_ALIGN_TITLES[id as keyof typeof PANEL_ALIGN_TITLES],
      category: "视图",
      handler: async () => alignPanel(align as "left" | "center" | "right" | "justify"),
    });
  }

  // E5.8#33：菜单栏「面板」顶级菜单——壳声明招牌（空间归宿主，[[content-vs-space-ownership]]）。
  // 归并机制零新设施：插件 contributes.menus.menuBar/panel + group:"panel" 与壳招牌同组自动归入
  // （titlebar collectMenuBarGroups 按 group 分组——注册表当桌子，双方零耦合）。
  // order: 100 让「面板」排在「文件/查看」（缺省 99）之后。
  registerMenuItems(MENU_SLOTS.Panel, APP_PLUGIN_ID, [
    {
      command: "",
      label: "面板",
      group: "panel",
      order: 100,
      children: [
        // 招牌条目——togglePanel 同命令（点击 = 打开/折叠底部面板）
        { command: "workbench.action.togglePanel", label: "打开面板", group: "panel" },
      ],
    },
  ]);

  // E5.8#37.7：面板标签栏右键「面板位置」「对齐面板」两子菜单（对标 VS Code Panel 标题栏右键 ②③）。
  // 子项 label 覆盖命令标题（子菜单短标签）；checked 由 getItems 桥 resolvePanelChecked 动态标记
  // （当前项 √——单选：位置当前 edge 一项 / 对齐当前 align 一项）。
  registerMenuItems(MENU_SLOTS.PanelViewContext, APP_PLUGIN_ID, [
    {
      command: "",
      label: "面板位置",
      group: "panelPosition",
      children: [
        { command: "workbench.action.positionPanelTop", label: "顶部" },
        { command: "workbench.action.positionPanelLeft", label: "左侧" },
        { command: "workbench.action.positionPanelRight", label: "右侧" },
        { command: "workbench.action.positionPanelBottom", label: "底部" },
      ],
    },
    {
      command: "",
      label: "对齐面板",
      group: "panelAlign",
      children: [
        { command: "workbench.action.alignPanelCenter", label: "居中" },
        { command: "workbench.action.alignPanelJustify", label: "两端对齐" },
        { command: "workbench.action.alignPanelLeft", label: "左对齐" },
        { command: "workbench.action.alignPanelRight", label: "右对齐" },
      ],
    },
  ]);
}
