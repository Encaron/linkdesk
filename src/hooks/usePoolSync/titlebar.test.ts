/**
 * titlebar 菜单栏序列化测试——E5.8#148 界面显隐勾选 + group:"panel" 归并。
 *
 * 覆盖：E5.8#148「查看→界面」嵌套子菜单的勾选态序列化（zone 可见 = ✓，buildTitleBarMenuGroups/
 * buildHamburgerMenuGroups 经 resolveVisibilityChecked）/ 面板顶级招牌删除后无 "panel" 组 /
 * 插件 contributes.menus.menuBar + group:"panel" 自动归并 / 插件 contributes.menus.panel（新槽直连）同样归并 /
 * 汉堡菜单同样归并（父项不展平）/ E5.8#37.6 when 过滤（对换菜单当开关至多一项显示）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { registerCommand, clearCommands } from "../../core/registry/commands/CommandRegistry";
import {
  registerMenuItems,
  MENU_SLOTS,
  clearMenus,
  clearTitleBarContributions,
  registerTitleBarContribution,
} from "../../core/registry/commands/MenuRegistry";
import { ContextKeyService } from "../../core/registry/commands/ContextKeyService"; // E5.8#37.6：when 过滤全局 context key
import { registerShellMenus } from "../../core/commands/input-bindings/shellMenus"; // E6#57.10：帮助组真源
import { registerUpdateCommands } from "../../core/commands/shell/updateCommands"; // E6#57.10：命令 title 回退源
import { buildTitleBarMenuGroups, buildHamburgerMenuGroups, buildTitleBarSlots } from "./titlebar";

const SHELL = "linkdesk.shell";
const PLUGIN = "panel-plugin";
const id = (s: string) => s;
/** E5.8#148：zone 显隐勾选上下文——buildTitleBarMenuGroups/汉堡 第二参（真实调用 usePoolSync 传 App state） */
const VIS = (panelVisible: boolean, sidebarVisible: boolean) => ({ panelVisible, sidebarVisible });

/** 注册壳侧 文件/查看 顶级菜单——shellMenus.ts 同款形状（查看含 #148「界面」子菜单） */
function registerShellFileViewMenus(): void {
  registerMenuItems(MENU_SLOTS.MenuBar, SHELL, [
    {
      command: "",
      label: "文件",
      group: "file",
      children: [{ command: "workbench.action.exportWorkspace", group: "file" }],
    },
    {
      command: "",
      label: "查看",
      group: "view",
      children: [
        { command: "workbench.action.showCommands", group: "view" },
        {
          command: "",
          label: "界面",
          group: "view",
          children: [
            { command: "workbench.action.toggleSidebarVisibility", label: "主侧栏", group: "view" },
            { command: "workbench.action.togglePanel", label: "面板", group: "view" },
          ],
        },
      ],
    },
  ]);
}

describe("buildTitleBarMenuGroups（E5.8#148 面板招牌删除 + group:\"panel\" 归并保留）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  it("无面板槽 + 无 group:\"panel\" 项 → 无 \"panel\" 组（招牌已删，面板入口在 查看→界面）", () => {
    registerShellFileViewMenus();

    const groups = buildTitleBarMenuGroups(id, VIS(true, true));
    expect(groups.find((g) => g.group === "panel")).toBeUndefined();
    expect(groups.map((g) => g.group)).toEqual(["file", "view"]);
  });

  it("插件 contributes.menus.menuBar + group:\"panel\" 自动归并——无招牌时独立成组，标签回退 groupName", () => {
    registerShellFileViewMenus();
    registerMenuItems(MENU_SLOTS.MenuBar, PLUGIN, [{ command: "panel-plugin.newTerminal", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.newTerminal", title: "新建终端", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "panel")!;
    expect(panel).toBeDefined();
    expect(panel.label).toBe("panel"); // 无招牌父项 → 组标签回退 groupName
    // E6#57.10：item.group 现在透传（画分隔线的依据）——fixture 项本就声明了 group:"panel"，
    // 断言里带上它 = 正控「字段真的流过 resolveItemNode」。
    expect(panel.items).toEqual([{ label: "新建终端", command: "panel-plugin.newTerminal", group: "panel" }]);
  });

  it("插件 contributes.menus.panel（新槽直连）同样自动归并", () => {
    registerMenuItems(MENU_SLOTS.Panel, PLUGIN, [{ command: "panel-plugin.showOutput", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.showOutput", title: "显示输出", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "panel")!;
    expect(panel.items.map((i) => i.command)).toEqual(["panel-plugin.showOutput"]);
  });
});

describe("E5.8#148 界面显隐勾选子菜单——checked 序列化（zone 可见 = ✓）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  /** 断言「查看」组里「界面」子项的两个勾选叶子——0 = 主侧栏 / 1 = 面板 */
  function findUiSubmenu(viewItems: Array<{ label?: string; command?: string; children?: Array<{ label: string; command: string; checked?: boolean }> }>) {
    return viewItems.find((i) => i.label === "界面")!.children!;
  }

  it("顶部菜单栏——侧栏可见 + 面板隐藏 → 主侧栏 ✓ / 面板空白", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(false, true)).find((g) => g.group === "view")!;
    const ui = findUiSubmenu(view.items);
    expect(ui[0]).toEqual({ label: "主侧栏", command: "workbench.action.toggleSidebarVisibility", group: "view", checked: true });
    expect(ui[1]).toEqual({ label: "面板", command: "workbench.action.togglePanel", group: "view", checked: false });
  });

  it("顶部菜单栏——状态翻转 → 勾选翻转（zone 显隐变化即重推 ✓）", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(true, false)).find((g) => g.group === "view")!;
    const ui = findUiSubmenu(view.items);
    expect(ui[0].checked).toBe(false);
    expect(ui[1].checked).toBe(true);
  });

  it("汉堡同款——界面嵌套子项同样勾选（递归 resolveItemNode 序列化）", () => {
    registerShellFileViewMenus();

    const view = buildHamburgerMenuGroups(id, VIS(true, false)).find((g) => g.group === "view")!;
    // 汉堡不展平——「查看」父项保留，子面板含「界面」父项，再展开是两勾选叶子
    const viewParent = view.items[0];
    expect(viewParent).toMatchObject({ label: "查看", command: "" });
    const ui = findUiSubmenu(viewParent.children ?? []);
    expect(ui[0]).toEqual({ label: "主侧栏", command: "workbench.action.toggleSidebarVisibility", group: "view", checked: false });
    expect(ui[1]).toEqual({ label: "面板", command: "workbench.action.togglePanel", group: "view", checked: true });
  });

  it("界面父项自身不带 checked（无命令无谓词命中 → undefined 省略）", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    const uiParent = view.items.find((i) => i.label === "界面")!;
    expect(uiParent).toMatchObject({ command: "" });
    expect("checked" in uiParent).toBe(false);
  });
});

describe("when 过滤（E5.8#37.6 侧栏换边菜单项——当开关至多一项显示）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    ContextKeyService.clear();
  });

  /** 注册完整「查看」组 + 换边双 when 门控项——shellMenus.ts 同款形状（菜单栏/汉堡共用 MenuBar 槽） */
  function registerViewMenuWithToggle(): void {
    registerMenuItems(MENU_SLOTS.MenuBar, SHELL, [
      {
        command: "",
        label: "查看",
        group: "view",
        children: [
          { command: "workbench.action.showCommands", group: "view" },
          { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "view", when: "sidebarPosition == 'left'" },
          { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "view", when: "sidebarPosition == 'right'" },
        ],
      },
    ]);
    registerCommand(SHELL, { id: "workbench.action.toggleSidebarPosition", title: "切换侧栏位置", handler: async () => {} });
  }

  it("菜单栏「查看」——sidebarPosition=left → 只显示「移动到右侧」；=right → 只显示「移动到左侧」", () => {
    registerViewMenuWithToggle();

    ContextKeyService.setValue("sidebarPosition", "left");
    const left = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    expect(left.items.filter((i) => i.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到右侧", command: "workbench.action.toggleSidebarPosition", group: "view" }]);

    ContextKeyService.setValue("sidebarPosition", "right");
    const right = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    expect(right.items.filter((i) => i.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到左侧", command: "workbench.action.toggleSidebarPosition", group: "view" }]);
  });

  it("汉堡同款——when 不满足项隐藏（原灰显）", () => {
    registerViewMenuWithToggle();

    ContextKeyService.setValue("sidebarPosition", "left");
    const view = buildHamburgerMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    // 父项保留（汉堡不展平）——子面板只含 when 命中的换边项（另一项被过滤隐藏）
    expect(view.items[0].children!.filter((c) => c.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到右侧", command: "workbench.action.toggleSidebarPosition", group: "view" }]);
  });
});

/**
 * E6#57.10：菜单内二级分组（`item.group`）透传——**分隔线的唯一依据**。
 *
 * 顶部菜单栏下拉此前画不出分隔线（PoolMenuItem 无 group / resolveItemNode 不序列化 /
 * toDescriptor 丢弃），本次三处打通。判据分两半，缺一不可：
 *   正控 = 帮助组的三个子项**真的带着三个不同的二级分组名**出来（否则 ContextMenu 一条线都不画）；
 *   负控 = 既有 文件/查看 组内**仍然只有一个分组名**（否则这次通用扩展会往老菜单里塞分隔线）。
 * 真源走 `registerShellMenus()`（不抄一份 fixture）——抄 fixture 只会测出 fixture 自洽
 * （[[test-double-must-match-contract-not-impl]]）。
 */
describe("E6#57.10 菜单内二级分组透传——帮助组正控 / 既有菜单负控", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  /** 真源注册：shellMenus（文件/查看/帮助）+ updateCommands（检查更新… 的 title 回退源） */
  function registerRealMenus(): void {
    registerUpdateCommands();
    registerShellMenus();
  }

  it("正控——帮助组：顺序 / label 覆盖 / 三个互不相同的二级分组名（= 2 条分隔线）", () => {
    registerRealMenus();

    const help = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "help")!;
    expect(help).toBeDefined();
    // 组标签 = 无 command 容器项的 label；顶部下拉展平它 ⇒ 点「帮助」直接见命令
    expect(help.label).toBe("帮助");
    expect(help.items.map((i) => i.command)).toEqual([
      "workbench.action.openKeybindingsSettings",
      "workbench.action.togglePluginDevTools",
      "update.checkForUpdates",
    ]);
    // label 覆盖：commands 自报的 title 是「打开键盘快捷方式」/「切换插件 DevTools」，
    // 菜单里用更短/更贴切的说法——同一命令在不同菜单不同措辞是 label 的本职
    expect(help.items.map((i) => i.label)).toEqual(["快捷键列表", "切换开发人员工具", "检查更新…"]);
    // 🔴 画线的依据：三个值两两不同 ⇒ 相邻各出一条线（ContextMenu 语义，恰好 2 条）
    expect(help.items.map((i) => i.group)).toEqual(["helpLearn", "helpDev", "helpUpdate"]);
  });

  it("正控——帮助组落在「查看」之后（注册序 = 组序，全 order 缺省 99）", () => {
    registerRealMenus();

    expect(buildTitleBarMenuGroups(id, VIS(true, true)).map((g) => g.group)).toEqual(["file", "view", "help"]);
  });

  it("正控——汉堡同款（不展平，「帮助」父项保留 + 子项分组名照带）", () => {
    registerRealMenus();

    const help = buildHamburgerMenuGroups(id, VIS(true, true)).find((g) => g.group === "help")!;
    const parent = help.items[0];
    expect(parent).toMatchObject({ label: "帮助", command: "" });
    expect(parent.children!.map((c) => c.group)).toEqual(["helpLearn", "helpDev", "helpUpdate"]);
  });

  it("「打开键盘快捷方式」已移出「查看」——不并存（单一入口）", () => {
    registerRealMenus();

    const view = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    expect(view.items.map((i) => i.command)).not.toContain("workbench.action.openKeybindingsSettings");
  });

  it("负控——既有 文件/查看 组内仍只有一个分组名（通用扩展没往老菜单塞分隔线）", () => {
    registerRealMenus();

    const groups = buildTitleBarMenuGroups(id, VIS(true, true));
    for (const name of ["file", "view"]) {
      const g = groups.find((x) => x.group === name)!;
      // 组内所有序列化项（含嵌套子菜单父项）同组 ⇒ 0 条分隔线
      expect(new Set(g.items.map((i) => i.group))).toEqual(new Set([name]));
    }
  });
});

/**
 * E6#57.11：TitleBar 插槽 `label` 全文字按钮——解析规则 / when 门控 / tooltip 回退。
 *
 * 核心判据**可证伪**：`$键` 有值时断言拿到的是**键的值**——把实现换成「label 恒当静态字符串」，
 * 这条必红（那时会得到字面 `$demoStatus`）。
 */
describe("E6#57.11 buildTitleBarSlots——label 解析 + when 门控", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    // 🔴 必须显式清——`clearMenus()` 只清 _menus、`clearRegistrationLayers()` 只清登记不跑 disposer，
    // 两者都**不会**让槽位表变空（E6#57.11 补此重置口的原因）。
    clearTitleBarContributions();
    ContextKeyService.clear();
  });

  it("正控——`$键` 取 context key 的值（通用性：非更新专用的第三方文字按钮同样生效）", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", label: "$demoStatus" });
    ContextKeyService.setValue("demoStatus", "Alpha");

    expect(buildTitleBarSlots(id, "right")[0].label).toBe("Alpha");
  });

  it("负控——键值变了文字跟着变（证明是「渲染时现场读键」而不是「注册时抄一份」）", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", label: "$demoStatus" });
    ContextKeyService.setValue("demoStatus", "Alpha");
    expect(buildTitleBarSlots(id, "right")[0].label).toBe("Alpha");

    ContextKeyService.setValue("demoStatus", "Beta");
    expect(buildTitleBarSlots(id, "right")[0].label).toBe("Beta");
  });

  it("边界——`$键` 不存在 / 值为空串 ⇒ 显示**字面** `$demoStatus`（失败可见，不是静默空白）", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", label: "$demoStatus" });
    expect(buildTitleBarSlots(id, "right")[0].label).toBe("$demoStatus");

    ContextKeyService.setValue("demoStatus", "");
    expect(buildTitleBarSlots(id, "right")[0].label).toBe("$demoStatus");
  });

  it("正控——无 `$` 前缀 ⇒ 当静态 i18n key 走 t()（同一字段两种形态）", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", label: "Alpha" });
    expect(buildTitleBarSlots(id, "right")[0].label).toBe("Alpha");
  });

  it("图标项**不带** label 键（不是带个空串往下游走——池按「有没有这个键」二选一渲染）", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", icon: "codicon-graph" });
    const btn = buildTitleBarSlots(id, "right")[0];
    expect(btn.label).toBeUndefined();
    expect(btn.icon).toBe("codicon-graph");
    expect("label" in btn).toBe(false);
  });

  it("when 门控——不满足 ⇒ 该条**根本不出现**，不是画个占位的空按钮", () => {
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", label: "Alpha", when: "demoVisible" });
    expect(buildTitleBarSlots(id, "right")).toHaveLength(0);

    ContextKeyService.setValue("demoVisible", true);
    expect(buildTitleBarSlots(id, "right")).toHaveLength(1);
  });

  it("tooltip——回退到命令自报的 title，不是命令 id（此前会把 update.openUpdateFlow 原样露给用户）", () => {
    registerCommand("demo-plugin", { id: "demo.cmd", title: "Alpha", handler: async () => {} });
    registerTitleBarContribution("demo-plugin", "right", { command: "demo.cmd", icon: "codicon-graph" });
    expect(buildTitleBarSlots(id, "right")[0].title).toBe("Alpha");

    // 命令没注册时退回命令 id——兜底不炸（图标按钮的 label 解析也不该因缺命令而抛）
    clearCommands();
    expect(buildTitleBarSlots(id, "right")[0].title).toBe("demo.cmd");
  });
});

/**
 * E6#57.11 真源——`registerUpdateCommands()` 里那条 TitleBar 声明。
 *
 * 走真源而不是抄一份 fixture（[[test-double-must-match-contract-not-impl]]）：抄 fixture 只会测出
 * fixture 自洽——声明里的命令 id / 键名写歪了照样绿。
 */
describe("E6#57.11 真源声明——更新按钮（无更新不占位 / 有更新出文字）", () => {
  const UPDATE_CMD = "update.openUpdateFlow";

  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    clearTitleBarContributions();
    ContextKeyService.clear();
    registerUpdateCommands();
  });

  it("无更新（门控键未设）⇒ 右槽**没有**这个按钮——「不占位」是默认态", () => {
    expect(buildTitleBarSlots(id, "right").map((b) => b.command)).not.toContain(UPDATE_CMD);
  });

  it("门控开 ⇒ 出现，文字取 `$updateButtonLabel` 的值，tooltip = 命令 title「处理更新」，且无 icon", () => {
    ContextKeyService.setValue("updateActionable", true);
    ContextKeyService.setValue("updateButtonLabel", "下载更新");

    const btn = buildTitleBarSlots(id, "right").find((b) => b.command === UPDATE_CMD)!;
    expect(btn).toBeDefined();
    expect(btn.label).toBe("下载更新");
    expect(btn.title).toBe("处理更新"); // 命令自报 title（E6#57.10 注册），不是命令 id
    expect(btn.icon).toBeUndefined(); // 全文字按钮不渲染 icon
  });
});
