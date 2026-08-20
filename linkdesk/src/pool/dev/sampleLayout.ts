/**
 * 样本 PoolLayout v2——E5.7#31.6。池开发预览（浏览器 mock 模式）的布局快照。
 *
 * 角色扮演：本文件是"壳 pushLayout 之后"的数据形态——照 usePoolSync:775-798 组装形状
 * 手写（显示文本铁律下的"已解析"数据：文字是壳 t() 解析结果、logoUrl 是壳 getAssetPath
 * 解析结果——Path B 池不 import core，fixture 扮演壳给出最终形态，非硬编码违规）。
 *
 * 样本策略（零插件命名空间风险的边界）：
 *   主区只用 shellRendered 壳视图（welcome + output——ShellViewRenderer 池内路由，
 *   零插件代码加载）；侧栏推空容器（emptyText 渲染路径可见）；statusBar 不设
 *   component:true（不触发插件组件 glob）。想预览插件视图 → 需同步补 mock 插件
 *   命名空间（见 mockLinkdesk.ts 头注）。
 *
 * 图标 lucide 名必须存在于 PoolPluginIcon LUCIDE_MAP（与壳 PluginIcon 同步维护）；
 * iconClass 格式照 usePoolSync getNotifIconClass。
 */

import type { PoolLayout } from "../../core/types/pool/poolLayout";
import type { PoolToastItem } from "../../core/types/pool/poolToast";
import type { PoolQuickPickData } from "../../core/types/pool/poolQuickPick";
import type { PoolDialogData } from "../../core/types/pool/poolDialog";

/** 菜单组样例——titlebar 下拉与 ☰ 汉堡共用（titlebar 忽略 shortcut，汉堡显示） */
function buildSampleMenuGroups() {
  return [
    {
      group: "file",
      label: "文件",
      items: [
        { label: "新建文件", command: "workbench.action.files.newUntitledFile" },
        { label: "打开文件夹…", command: "workbench.action.files.openFolder" },
        { label: "打开设置", command: "workbench.action.openSettings" },
        { label: "退出", command: "workbench.action.quit" },
      ],
    },
    {
      group: "view",
      label: "查看",
      items: [
        { label: "命令面板…", command: "workbench.action.showCommands", shortcut: "Ctrl+Shift+P" },
        { label: "切换侧栏", command: "workbench.action.toggleSidebarVisibility", shortcut: "Ctrl+B" },
        { label: "切换底部面板", command: "workbench.action.togglePanel" },
      ],
    },
  ];
}

/** 全量布局快照——initial push（onLayout 订阅时回放） */
export function buildSampleLayout(): PoolLayout {
  const menuGroups = buildSampleMenuGroups();

  return {
    version: 2,
    titleBar: {
      title: "LinkDesk",
      // dev 下 public/ 同源路径——壳 getAssetPath 的 dev 解析结果（fixture 扮演壳）
      logoUrl: "/assets/logo.svg",
      menuBarVisible: true,
      menuGroups,
      slots: { left: [], right: [] },
      windowControls: { minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭" },
    },
    iconBar: {
      icons: [
        { pluginId: "file-tree", icon: { kind: "lucide", name: "FolderTree" }, label: "资源管理器", location: "top" },
        { pluginId: "marketplace", icon: { kind: "lucide", name: "ShoppingBag" }, label: "插件市场", location: "top" },
        { pluginId: "serial-monitor", icon: { kind: "lucide", name: "Monitor" }, label: "串口监视器", location: "top" },
        { pluginId: "settings", icon: { kind: "lucide", name: "Settings" }, label: "设置", location: "bottom" },
      ],
      activePluginId: "file-tree",
      hamburgerVisible: true,
      navLabel: "导航",
      hamburger: { title: "菜单", groups: menuGroups },
    },
    sidebar: {
      visible: true,
      width: 280,
      containerId: "file-explorer",
      containerTitle: "资源管理器",
      views: [], // 空容器——emptyText 渲染路径（零插件视图 = 零插件命名空间风险）
      collapsedViews: [],
      collapsed: false,
      viewId: null,
      emptyText: "此容器没有已注册的视图",
      emptyHint: "安装插件以添加视图",
      expandTooltip: "展开侧栏",
      collapseTooltip: "折叠侧栏",
      minWidth: 170,
      maxWidth: 600,
    },
    groups: [
      {
        id: "group-1",
        flex: 1,
        activeTabId: "tab-welcome",
        tabs: [
          {
            id: "tab-welcome",
            pluginId: "welcome",
            title: "欢迎",
            pinned: true,
            singleton: true,
            closeBehavior: "normal",
            shellRendered: true,
            shellType: "welcome",
          },
          {
            id: "tab-output",
            pluginId: "output",
            title: "输出",
            closeBehavior: "normal",
            shellRendered: true,
            shellType: "output",
          },
        ],
      },
    ],
    root: { type: "leaf", groupId: "group-1" },
    // E5.8#30.15（P5）：dev 预览默认聚焦 group-1——accent 环可见
    activeGroupId: "group-1",
    creatableViews: [
      { pluginId: "file-tree", label: "资源管理器" },
      { pluginId: "serial-monitor", label: "串口监视器" },
      { pluginId: "marketplace", label: "插件市场" },
    ],
    statusBar: {
      items: [
        { id: "shell.git", pluginId: "git", icon: "git-branch", label: "main", align: "left", title: "main" },
        { id: "shell.lang", pluginId: "shell", icon: "globe", label: "中文(简体)", align: "right", title: "选择语言模式" },
        { id: "shell.theme", pluginId: "shell", label: "深色主题", align: "right", dividerBefore: true, title: "切换主题" },
      ],
      notif: {
        unread: 2,
        bellTitle: "2 条通知",
        panelTitle: "通知",
        clearLabel: "清除全部",
        emptyLabel: "没有新通知",
        dismissTitle: "关闭",
        groups: [
          {
            key: "serial-monitor",
            label: "串口监视器",
            unread: 1,
            items: [
              {
                id: "mock-notif-1",
                iconClass: "codicon codicon-info",
                message: "串口 COM3 已连接",
                timeLabel: "刚刚",
                sourceLabel: "来源: 串口监视器",
                actions: [],
              },
            ],
          },
          {
            key: "marketplace",
            label: "插件市场",
            unread: 1,
            items: [
              {
                id: "mock-notif-2",
                iconClass: "codicon codicon-error notif-severity-error",
                message: "插件安装失败：网络不可达",
                timeLabel: "5 分钟前",
                sourceLabel: "来源: 插件市场",
                actions: [{ label: "重试", isPrimary: true }],
              },
            ],
          },
        ],
      },
    },
  };
}

/** Toast 全量快照——install 时 push，ToastHost 订阅时回放可见 */
export function buildSampleToasts(): PoolToastItem[] {
  return [
    {
      id: "mock-toast-1",
      iconClass: "codicon codicon-info",
      message: "串口 COM3 已连接",
      sourceText: "来源: 串口监视器",
      actions: [{ actionId: "0", label: "断开" }],
    },
    {
      id: "mock-toast-2",
      iconClass: "codicon codicon-error notif-severity-error",
      message: "插件安装失败：网络不可达",
      sourceText: "来源: 插件市场",
      actions: [{ actionId: "0", label: "重试", isPrimary: true }],
    },
  ];
}

/** QuickPick 样例——__mockPool.showQuickPick() 推浮层（调样式用） */
export function buildSampleQuickPick(): PoolQuickPickData {
  return {
    open: true,
    placeholder: "输入以过滤命令…",
    prefix: ">",
    items: [
      { key: "mock-qp-1", searchText: "显示命令面板", label: "显示命令面板", keybinding: "ctrl+shift+p" },
      { key: "mock-qp-2", searchText: "打开设置", label: "打开设置", category: "偏好设置" },
      { key: "mock-qp-3", searchText: "切换侧栏", label: "切换侧栏", keybinding: "ctrl+b" },
      { key: "mock-qp-4", searchText: "新建文件", label: "新建文件", detail: "创建未命名文件" },
    ],
  };
}

/** Dialog 样例——__mockPool.showDialog() 推浮层（调样式用） */
export function buildSampleDialog(): PoolDialogData {
  return {
    open: true,
    title: "确认关闭",
    message: "有未保存的更改，确定要关闭吗？",
    confirmLabel: "关闭",
    cancelLabel: "取消",
    isAlert: false,
  };
}
