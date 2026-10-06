/**
 * 壳级右键菜单注册——ExtensionGear / TabContext / MenuBar / SettingItemGear 等。
 * E5#44-6：从 coreCommands.ts 提取。菜单项通过命令 ID 引用命令——命令由各自模块注册。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { shellEvents } from "../../react/events/ShellEvents";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

export function registerShellMenus(): void {
  // ── ☰ 菜单栏 ──
  registerMenuItems(MENU_SLOTS.MenuBar, APP_PLUGIN_ID, [
    {
      command: "",
      label: "文件",
      group: "file",
      children: [
        { command: "workbench.action.exportWorkspace", group: "file" },
        { command: "workbench.action.importWorkspace", group: "file" },
        { command: "core.openSettings", group: "file" },
      ],
    },
    {
      command: "",
      label: "查看",
      group: "view",
      children: [
        { command: "workbench.action.showCommands", group: "view" },
        { command: "theme.pick", group: "view" }, // E5.8#50.24：theme.pick 归一化命令 id
        { command: "workbench.action.selectLanguage", group: "view" },
        // E6#57.10：「打开键盘快捷方式」已移入帮助菜单（label「快捷键列表」）——单一入口，不并存。
        // E5.8#37.6：侧栏换边——双 when 门控菜单项（左边 → 显示「移动到右侧」；右边 → 显示「移动到左侧」，
        // 同命令 toggleSidebarPosition，当开关至多一项显示）。when 壳侧一站式过滤
        // （菜单栏序列化 buildTitleBarMenuGroups / 汉堡 / ui.ts getItems）——sidebarPosition
        // context key 由 usePoolSync 随布局推送保持同步。
        { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "view", when: "sidebarPosition == 'left'" },
        { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "view", when: "sidebarPosition == 'right'" },
        // E5.8#148：「界面」嵌套子菜单——zone 显隐勾选菜单（对标 VS Code 查看→面板 显隐区）。
        // 主侧栏/面板 两命令 = 显隐 toggle（emit sidebar:toggle / panel:toggle）；勾选态由壳
        // buildTitleBarMenuGroups/汉堡 经 resolveVisibilityChecked 序列化（zone 可见 = ✓）。
        // 递归渲染：顶部下拉 = 查看→界面 两级；汉堡 = 查看→界面 两级（全链路 ContextMenu 递归 #148）。
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
    // ── E6#57.10：帮助菜单（设计 06-主软件更新/03-菜单与入口设计 §2.2 + mockups/01 Frame 1）──
    // 注册在「查看」之后 ⇒ collectMenuBarGroups 组序（全 order 99 = 注册序）自然排在末位。
    // children 的 group 是**组内二级分组名**（helpRelease/helpLearn/helpDev/helpUpdate…）——ContextMenu 语义：
    // 相邻不同 group 之间出一条分隔线（故当前 4 项 → 3 条线）。这些二级名是**该分组全部成员的
    // 占位锚点**：#57.13 的「显示发行说明」已插 helpRelease、#57.14 的「关于 LinkDesk」与
    // 「检查更新…」同组 helpUpdate、许可证/隐私政策（新任务）插 helpLegal——插进来即自动归位，
    // 不需要再动分隔线。
    //
    // ⚠️ 「打开帮助」「隐私政策」「查看许可证」**仍不放**——前两条是**发行后**的事
    // （无站点 / 政策待制定，见 docs/05-版本更新/壳版本/发行后-帮助菜单待补项.md），
    // 后一条有落点任务（许可证推荐任务），到位才声明，不放空壳菜单项。
    // （「显示发行说明」原也在这条清单里，`#57.13g` 落地后已移出；
    //  「关于 LinkDesk」原在清单里，`#57.14g` 落地后已移出；
    //  「AI 操作手册」M3 `AI#16` 落地后进 `helpLearn`——⚠️ 它**不是**上面那条「打开帮助」：
    //  手册已随包发货、今天就有内容可看，故不受「不放空壳菜单项」的约束。）
    {
      command: "",
      label: "帮助",
      group: "help",
      children: [
        // ── E6#57.13g：发行说明入口——**首项**（设计 05-发行说明 §2.2 入口表第一行）。
        // 为什么独占 helpRelease 而不并进 helpLearn：`helpRelease` 这个二级分组在 #57.10 就
        // 预埋成锚点了（见上注），「发布物相关」（发行说明/关于/许可证）本就该自成一组；
        // 顺带 ContextMenu 会在它与下一项之间画一条分隔线——首项 + 空组分隔线正是设计要的样子。
        // 恒显（无 when）——「入口存在」不是「有更新才给你看」，用户随时可查历史版本说明。
        { command: "update.openReleaseNotes", group: "helpRelease" },
        // ── 欢迎页重设计 W4b：欢迎页入口——helpLearn **首项**（先到家再学手艺：欢迎页是
        //  「我该从哪开始」，先于快捷键/手册）。命令由 welcomeCommands.ts 注册（W4a）；
        //  W7 后欢迎页不再是保底标签，本项是三个显式入口之一（帮助菜单/+/命令面板）。
        //  恒显（无 when）——壳兜底页无需任何插件在场。
        { command: "app.openWelcome", group: "helpLearn" },
        // 从「查看」移出（用户 2026-09-12 裁决：移入帮助，不是并存）。label 覆盖命令 title——
        // 同一命令在不同菜单用不同措辞是 label 的本职（VS Code 同款），命令 title 那一份不动。
        { command: "workbench.action.openKeybindingsSettings", label: "快捷键列表", group: "helpLearn" },
        // ── M3 `AI#16`：AI 操作手册——插进 `helpLearn`（**预埋的学习/帮助锚点**，见上注：
        // 它与将来那条「打开帮助」同组，属于同一类东西「我该去哪学怎么用这个软件」）。
        // 顺序在「快捷键列表」之后：先手（快捷键）后书（手册），读起来自然。
        // 恒显（无 when）——手册随包发货、离线恒可读（⛔ 不做成需要联网才能看，见 M3 档案风险条目）。
        // 它与 `../发行后-帮助菜单待补项.md` 的「打开帮助」**不是同一件事**：那条要等一份独立
        // 设计档（五问）才动菜单项；本条是**已发货的手册**的入口，今天就有内容可看，不放空壳。
        { command: "app.openAiManual", group: "helpLearn" },
        // 复用现有命令 workbench.action.togglePluginDevTools（title「切换开发人员工具」——
        // 归一化夹 02 批⑧ 用户改判：就 VS Code 中文惯例，菜单**不再另起一个名字**）。
        // 不新注册第二条第 5 条命令。**无 when 门控**——
        // 用户 2026-09-12 裁决「开启这个功能」（发行版里也要真能打开 devtool，
        // 对应同批去掉的两道 isPackaged 闸门，见 plugin-view-handlers.ts / electron/main.ts）。
        // 归一化夹 02 批⑧：label 覆写**删**——覆写与命令 title 逐字相同即冗余（同族纪律见档 §四 N4-4）
        { command: "workbench.action.togglePluginDevTools", group: "helpDev" },
        // 恒显入口——见 updateCommands.ts 文件头（入口存在 ≠ 能力承诺，manual 档不禁手动检查）
        { command: "update.checkForUpdates", group: "helpUpdate" },
        // ── E6#57.14g：关于入口——**末项**，与「检查更新…」**同组 `helpUpdate`**（判据①）：
        // 同组 ⇒ ContextMenu 不在两者之间画分隔线（相邻不同组才出线），两行读起来是一件事
        // ——「关于本机 / 软件更新」心智（06 §4.3）。不另开 `helpAbout` 组：画一条线会把
        // 这对本该连读的入口拆成两摊。
        // 恒显（无 when）——同款原则：版本信息随时可查，不挂在「有没有更新」上。
        { command: "app.about", group: "helpUpdate" },
        // ── E6#57.10e：查看许可证——独占 `helpLegal`（预埋锚点，见上注）。
        // 2026-09-13 用户拍板选 **MIT** ⇒ 本项到位才声明（原「不放空壳菜单项」的禁令解除）。
        // 呈现面 = **系统浏览器打开 GitHub 上的 LICENSE 全文**（VS Code「View License」同款先例）：
        // 走 E6#70c 的全局 window-open 路由，**零新增 API 面**（壳不假设编辑器插件存在、
        // 不为一段静态文本造新呈现面）。⚠️ 生效前提 = LICENSE 已推到远端（当前攒本地未推，
        // 推之前点它会 404——随下次推送一并生效，如实记）。
        { command: "app.viewLicense", group: "helpLegal" },
      ],
    },
  ]);

  // ── 设置项齿轮 ──
  registerMenuItems(MENU_SLOTS.SettingItemGear, APP_PLUGIN_ID, [
    { command: "workbench.action.copySettingAsUrl", group: "phase6", when: "false" },
    { command: "workbench.action.toggleSettingSync", group: "phase6", when: "false" },
  ]);

  // ── E5#44c：View header 右键菜单——提供方注册，消费方（SidePanel）只读 menuId ──
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleContainerCollapse",
    title: "折叠",
    category: "视图",
    description: "折叠/展开指定视图容器",
    params: [{ name: "ctx", type: "object", required: true, description: "{ containerId: string }——目标容器 id" }],
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { containerId?: string } | undefined;
      if (ctx?.containerId) shellEvents.emit("view:toggleCollapse", { containerId: ctx.containerId });
    },
  });
  // E5.7#84：侧栏显隐切换（VS Code 标准 Ctrl+B）——矩阵场景 1 验证点「折叠/展开」。
  // 归一化：emit sidebar:toggle 复用池 ◀/▶ 按钮同一转发链（App 侧栏宿主状态机 doCollapse），
  // 零第二套状态——命令只做入口，真相源仍在 zone 宽。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleSidebarVisibility",
    title: "切换侧栏可见性",
    category: "视图",
    description: "显示/隐藏主侧栏",
    handler: async () => {
      shellEvents.emit("sidebar:toggle", undefined);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.resetContainerPosition",
    title: "重置位置",
    category: "视图",
    description: "把指定视图容器重置回默认位置",
    params: [{ name: "ctx", type: "object", required: true, description: "{ containerId: string }——目标容器 id" }],
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { containerId?: string } | undefined;
      if (ctx?.containerId) shellEvents.emit("view:resetPosition", { containerId: ctx.containerId });
    },
  });

  // E5#44d：view 显隐切换命令——Views 子菜单的每个条目用它
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleViewVisibility",
    title: "切换视图可见性",
    category: "视图",
    description: "显示/隐藏指定视图",
    params: [{ name: "ctx", type: "object", required: true, description: "{ viewId: string; containerId?: string }——目标视图 id，containerId 用于同 viewId 消歧" }],
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { viewId?: string; containerId?: string } | undefined;
      if (ctx?.viewId) shellEvents.emit("view:toggleVisibility", { viewId: ctx.viewId, containerId: ctx.containerId });
    },
  });

  registerMenuItems(MENU_SLOTS.ViewTitleContext, APP_PLUGIN_ID, [
    { command: "workbench.action.toggleContainerCollapse", group: "navigation" },
    { command: "workbench.action.resetContainerPosition", group: "navigation" },
    // E5.8#37.6：侧栏换边——双 when 门控（当开关至多一项显示），同命令 toggleSidebarPosition。
    // when 过滤壳侧一站式（ui.ts getItems 的 menu:getItems）——sidebarPosition context key
    // 由 usePoolSync 随布局推送保持同步（折叠/重置位置/视图同组 = 侧栏 title 右键）。
    { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "navigation", when: "sidebarPosition == 'left'" },
    { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "navigation", when: "sidebarPosition == 'right'" },
    // E5#44d：Views 子菜单——空 children 触发 ContextMenu.resolveChildren 回调
    { command: "", label: "视图", group: "views", children: [] },
  ]);
}
