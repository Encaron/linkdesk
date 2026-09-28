/**
 * 壳面板命令——底部面板显隐（E5.8#31）+ 侧栏换边（E5.8#37.6）+ 面板位置/对齐（E5.8#37.7）。
 * E5.8#148：菜单栏「面板」招牌已删（#33）——面板入口迁入 查看→界面→面板 显隐勾选子菜单。
 * E5.8#31：自 coreCommands.ts 划分独立文件（settingsCommands 同款模式）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { shellEvents } from "../../react/events/ShellEvents";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { layoutEngine, narrowSidebarEdge, narrowPanelEdge, DEFAULT_ZONE_SIZE } from "../../services/layout/LayoutEngine"; // #37.6/#37.7 命令真相源；M2 AI#21 尺寸默认值
import { ViewContainerService } from "../../services/layout/ViewContainerService"; // E5.8#37.7.1：面板视图显隐清单命令
import { getLastGeometry } from "../../services/ui/FloatingPanelService"; // M2 AI#20：悬浮面板几何读数
import type { FloatingPanelBounds } from "../../types/pool/poolFloatingPanel"; // M2 AI#20：几何载荷形状

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

/** M1 `AI#8`：位置/对齐八条命令的说明——单选语义（已是目标值则无动作），一句话点明「把它放到哪」。 */
const PANEL_COMMAND_DESCRIPTIONS: Record<string, string> = {
  "workbench.action.positionPanelBottom": "把底部面板停靠到窗口底部（已在该侧则无动作）",
  "workbench.action.positionPanelTop": "把底部面板停靠到窗口顶部（已在该侧则无动作）",
  "workbench.action.positionPanelLeft": "把底部面板停靠到窗口左侧（已在该侧则无动作）",
  "workbench.action.positionPanelRight": "把底部面板停靠到窗口右侧（已在该侧则无动作）",
  "workbench.action.alignPanelLeft": "把面板内容左对齐（已是该对齐则无动作）",
  "workbench.action.alignPanelCenter": "把面板内容居中对齐（已是该对齐则无动作）",
  "workbench.action.alignPanelRight": "把面板内容右对齐（已是该对齐则无动作）",
  "workbench.action.alignPanelJustify": "把面板内容两端对齐（已是该对齐则无动作）",
};

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

/**
 * M2 `AI#21`：面板尺寸应用器（**轴感知**）——`size === null` = 回默认值。
 * 轴判据与池侧 `panel:resize` 的壳消费处（`src/App/bridges.ts` 的 `offResize`）逐字同款：
 * `edge ∈ {left,right}` 走**宽轴**（`resizeZone`），`top/bottom` 走**高轴**（`resizeZoneHeight`）。
 * 钳制仍在 LayoutEngine 一处（竖条 120–800 / 横带 120–600）——本函数只选轴，不管边界。
 */
function applyPanelSize(size: number | null): void {
  const edge = narrowPanelEdge(layoutEngine.getZone("panel")?.dock?.edge);
  if (edge === "left" || edge === "right") {
    layoutEngine.resizeZone("panel", size ?? DEFAULT_ZONE_SIZE.panelWidth);
  } else {
    layoutEngine.resizeZoneHeight("panel", size ?? DEFAULT_ZONE_SIZE.panelHeight);
  }
}

export function registerPanelCommands(): void {
  // E5.8#31：底部面板显隐切换（VS Code 标准 Ctrl+J）——与侧栏 Ctrl+B 同构：
  // 命令只做入口 emit panel:toggle，App usePanelHost 消费翻转 + 持久化。真相源 = App state。
  // 无 panel 贡献插件时命令无可见效果（state 翻转无害，usePoolSync 无 panelViews → 不推 panel 字段）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.togglePanel",
    title: "切换底部面板可见性",
    category: "视图",
    description: "显示/隐藏底部面板",
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
    description: "把主侧栏换到对侧（左 ↔ 右）",
    handler: async () => {
      const current = narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge);
      layoutEngine.dockTo("sidebar", current === "left" ? "right" : "left");
    },
  });

  // ── M2 `AI#21`：三条「拖拽专属」通道的**非鼠标路径**（⛔ 本格只加命令，不改那三条通道本身）──
  // ① `setSidebarWidth`（池分隔线拖拽 commit → useSubscriptions 消费）→ 本命令走**同一个**
  //    `layoutEngine.resizeZone`（钳制同一处：170–600 由 dock.minWidth/maxWidth 决定），只是发起方换成命令。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.setSidebarWidth",
    title: "设置侧栏宽度",
    category: "视图",
    description: "精确设定主侧栏宽度（px）——越界值按拖拽同一套边界钳制（170–600）",
    params: [{ name: "width", type: "number", required: true, description: "侧栏宽度（px，钳到 170–600）" }],
    handler: async (...args: unknown[]) => {
      const width = args[0];
      if (typeof width === "number" && Number.isFinite(width)) layoutEngine.resizeZone("sidebar", width);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.resetSidebarWidth",
    title: "重置侧栏宽度",
    category: "视图",
    description: "把主侧栏宽度恢复成默认值（280px）",
    handler: async () => {
      layoutEngine.resizeZone("sidebar", DEFAULT_ZONE_SIZE.sidebarWidth);
    },
  });

  // ② `panel:resize`（池面板分隔线拖拽 → App/bridges.ts 消费）→ 本命令**镜像**同一套轴感知路由：
  //    edge∈{left,right} → 宽轴 resizeZone；top/bottom → 高轴 resizeZoneHeight。
  //    ⚠️ 两条路径必须同步改（池侧那条在 `src/App/bridges.ts` 的 `offResize`——本格按「只挂门牌」不动它）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.setPanelSize",
    title: "设置面板尺寸",
    category: "视图",
    description: "精确设定底部面板尺寸（px）——按面板当前停靠边自动走宽轴或高轴；越界值按拖拽同一套边界钳制",
    params: [{ name: "size", type: "number", required: true, description: "面板尺寸（px；横带 = 高，竖条 = 宽）" }],
    handler: async (...args: unknown[]) => {
      const size = args[0];
      if (typeof size !== "number" || !Number.isFinite(size)) return;
      applyPanelSize(size);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.resetPanelSize",
    title: "重置面板尺寸",
    category: "视图",
    description: "把面板尺寸恢复成默认值（横带高 220px / 竖条宽 300px）",
    handler: async () => {
      applyPanelSize(null);
    },
  });

  // E5.8#37.7：面板位置四命令——dockTo("panel", edge) + 同边 no-op。持久化经 onDidChangeLayout →
  // App 防抖落盘（#36.9 底座，本命令零额外接线）；启动恢复 dockTo 已由 tabActions 铺好。
  for (const [id, edge] of Object.entries(PANEL_POSITION_EDGES)) {
    registerCommand(APP_PLUGIN_ID, {
      id,
      title: PANEL_POSITION_TITLES[id as keyof typeof PANEL_POSITION_TITLES],
      category: "视图",
      description: PANEL_COMMAND_DESCRIPTIONS[id],
      handler: async () => positionPanel(edge as "bottom" | "top" | "left" | "right"),
    });
  }

  // E5.8#37.7：面板对齐四命令——setAlign("panel", align) + 同对齐 no-op。持久化/恢复同 position。
  for (const [id, align] of Object.entries(PANEL_ALIGN_VALUES)) {
    registerCommand(APP_PLUGIN_ID, {
      id,
      title: PANEL_ALIGN_TITLES[id as keyof typeof PANEL_ALIGN_TITLES],
      category: "视图",
      description: PANEL_COMMAND_DESCRIPTIONS[id],
      handler: async () => alignPanel(align as "left" | "center" | "right" | "justify"),
    });
  }

  // E5.8#37.7.1：面板视图显隐切换命令——面板标签栏右键「视图清单」动态项点击执行。
  // 与切换器勾选同语义（bridges.ts panel:toggleViewVisibility → 同一 endpoint）：
  // 直接调 ViewContainerService.toggleViewVisibility——setVisible 落盘 + fire onDidChangeActiveViews
  // → usePoolSync layoutVersion 重推回执（两端状态一致，本命令零额外接线）。
  // per-item 身份走命令载荷：ContextMenu context 共享，containerId+viewId 由动态项 commandArgs
  // 携带（executeCommand 追加到 context 前）→ handler 收 args = [containerId, viewId, context]。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.togglePanelViewVisibility",
    title: "切换面板视图可见性",
    category: "视图",
    description: "显示/隐藏底部面板中的指定视图",
    params: [
      { name: "containerId", type: "string", required: true, description: "视图所在容器 id" },
      { name: "viewId", type: "string", required: true, description: "目标视图 id" },
    ],
    handler: async (...args: unknown[]) => {
      const [containerId, viewId] = args as [string, string];
      if (typeof containerId === "string" && typeof viewId === "string") {
        ViewContainerService.toggleViewVisibility(containerId, viewId);
      }
    },
  });

  // E5.8#39.5 子项 C：标签页右键「在悬浮面板中打开」命令——薄命令只做入口 emit（同 togglePanel 模式）。
  // 实际编排在 App useFloatingPanelReveal（resolve→toggle→push，子项 B wire 复用）——命令零编排。
  // 命令载荷：menu:getItems 动态注入项 commandArgs=[viewId] 透传（context 共享，per-item 身份走载荷）
  // → handler 收 args = [viewId, ...context]；非字符串 viewId 直接忽略（防坏值穿透）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.revealFloatingPanel",
    title: "在悬浮面板中打开",
    category: "视图",
    description: "把指定视图作为悬浮面板打开（已开同名面板则关闭）",
    params: [
      { name: "viewId", type: "string", required: true, description: "目标视图 id" },
      { name: "pluginId", type: "string", required: false, description: "声明该视图的插件 id——同名 viewId 并存时用于消歧，省略 = 按 viewId 裸扫声明" },
    ],
    handler: async (...args: unknown[]) => {
      const [viewId, pluginId] = args as [string, string];
      // E5.8#41.16：载荷复合寻址——commandArgs 携带 pluginId（标签页右键知道右键的是谁）→
      // 双插件同名 viewId 并存不歧义；仅 viewId（旧调用/插件裸调）→ 退化为裸声明扫描
      if (typeof viewId === "string" && viewId) {
        shellEvents.emit("panel:reveal-floating", {
          viewId,
          pluginId: typeof pluginId === "string" && pluginId ? pluginId : undefined,
        });
      }
    },
  });

  // M2 `AI#20`：悬浮面板几何命令（**非鼠标路径**——面板位置/高度可命令设定，AI 不必拖）。
  // 与插件 API `linkdesk.panel.setFloatingBounds` 同一出口（emit `panel:set-floating-bounds`
  // → App useFloatingPanelReveal → FloatingPanelService.setBounds → DTO 推池，与拖拽/调高同一套钳制）。
  // 面板未开时消费方 no-op——本命令同样无可见效果（⛔ 不凭几何开面板；开面板走 revealFloatingPanel）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.setFloatingPanelBounds",
    title: "设置悬浮面板位置与大小",
    category: "视图",
    description: "精确设定悬浮面板的顶边/左边/宽/高（px，省略的字段保持现值；越界值按拖拽同一套边界钳制）",
    params: [
      { name: "top", type: "number", required: false, description: "顶边距窗口顶部的像素值" },
      { name: "left", type: "number", required: false, description: "左边距窗口左侧的像素值" },
      { name: "width", type: "number", required: false, description: "面板宽度（px，上限 = 窗口宽 - 12）" },
      { name: "height", type: "number", required: false, description: "面板高度（px，下限 300 / 上限 = 窗口高 - 80）" },
    ],
    handler: async (...args: unknown[]) => {
      // 只收有限数——坏值当「未指定」（⛔ 不把 NaN 写进几何；池侧 clampApi 同款守卫双保险）
      const bounds: Partial<FloatingPanelBounds> = {};
      const [top, left, width, height] = args as [unknown, unknown, unknown, unknown];
      for (const [key, value] of [["top", top], ["left", left], ["width", width], ["height", height]] as const) {
        if (typeof value === "number" && Number.isFinite(value)) bounds[key] = value;
      }
      shellEvents.emit("panel:set-floating-bounds", { bounds });
    },
  });

  // 回默认居中大卡（#41.6）——null 语义：回拖拽前那一态（池侧 setGeo(null)，CSS vw/vh 重新接管）
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.resetFloatingPanelBounds",
    title: "重置悬浮面板位置与大小",
    category: "视图",
    description: "把悬浮面板恢复成默认居中大卡（等价于从未拖拽/调高过）",
    handler: async () => {
      shellEvents.emit("panel:set-floating-bounds", { bounds: null });
    },
  });

  // 读面（**对账用**）：返回池上报的最近一次落定几何（FloatingPanelService 只读镜像）。
  // 这是 `AI#20` 验收「设一次 → 读数与落点一致」的读数出口——M4 之后经 CLI `exec` 同一条命令可达。
  // null = 无面板 / 尚未上报（几何真相源在池，壳只是把池的上报发出来）。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.getFloatingPanelBounds",
    title: "读取悬浮面板位置与大小",
    category: "视图",
    description: "返回悬浮面板当前几何（含 viewId/pluginId/最大化态）；无面板时返回 null",
    handler: async () => getLastGeometry(),
  });

  // E5.8#148：菜单栏「面板」顶级招牌已删——面板入口迁入 查看→界面→面板 显隐勾选子菜单
  // 插件 contributes.menus.menuBar/panel + group:"panel" 条目仍归并进"panel"组
  // （titlebar collectMenuBarGroups 按 group 分组——注册表当桌子，双方零耦合，零删）。

  // E5.8#37.7：面板标签栏右键「面板位置」「对齐面板」两子菜单（对标 VS Code Panel 标题栏右键 ②③）。
  // 子项 label 覆盖命令标题（子菜单短标签）；checked 由 getItems 桥 resolvePanelChecked 动态标记
  // （当前项 √——单选：位置当前 edge 一项 / 对齐当前 align 一项）。
  // 04「面板右键隐藏项」（2026-09-27 用户点单）：「隐藏」排在对齐面板之后、插件贡献项之前——
  // 分组按注册序渲染（ContextMenu groupOrder 首遇即排），本数组第三位即天然落在该位置；
  // 用户的痛点 = 不用绕顶栏「查看→界面」就能收起面板。右键时面板必然可见（隐藏了就没有标签栏可右键），
  // 故 label 恒为「隐藏」（无 toggle 双态文案）。
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
    {
      command: "workbench.action.togglePanel",
      label: "隐藏",
      group: "panelHide",
    },
  ]);
}
