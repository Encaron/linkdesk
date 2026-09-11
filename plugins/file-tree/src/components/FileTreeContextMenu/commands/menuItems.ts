/**
 * menuItems——注册右键菜单项（"FileContext"）与 MenuBar 菜单贡献（E6#87a 二次拆分）。
 *
 * when 条件由 ContextMenu 组件调用 ContextKeyService.matches() 求值。
 */
export function registerFileTreeMenuItems(): void {
  // ── 注册菜单项到 "FileContext" ──
  // 5 组：navigation / editing / creation / modify / search

  window.linkdesk?.menu?.registerItems("FileContext", "file-tree", [
    // 第 1 组：导航/打开
    { command: "explorer.openFile",        group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.openToSide",      group: "1_navigation", when: "explorerItemIsFile" },
    // E5.6#11.5-bug5：这两命令未在 plugin.json contributes.commands 中声明，
    // menu:getItems 从核心 CommandRegistry 查不到 title → fallback 到 command ID 字符串 → t() 无法翻译。
    // 加 label 属性提供 i18n key（中文原文），ContextMenu.tsx 的 t(item.label) 映射到翻译文件。
    { command: "editor.selectForCompare",   group: "1_navigation", when: "explorerItemIsFile", label: "选择以比较" },
    { command: "editor.compareWithSelected", group: "1_navigation", when: "explorerItemIsFile", label: "与已选项比较" },
    { command: "explorer.openWith",        group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.revealInOS",      group: "1_navigation" },
    { command: "explorer.openInTerminal",  group: "1_navigation", when: "explorerItemIsDir" },

    // 第 2 组：编辑
    { command: "explorer.cut",             group: "2_editing", when: "!explorerItemIsRoot" },
    { command: "explorer.copy",            group: "2_editing", when: "!explorerItemIsRoot" },
    { command: "explorer.copyPath",        group: "2_editing" },
    { command: "explorer.copyRelativePath",group: "2_editing" },
    { command: "explorer.paste",           group: "2_editing", when: "explorerItemIsDir && !explorerClipboardEmpty" },

    // 第 3 组：新建
    { command: "explorer.newFile",         group: "3_creation", when: "explorerItemIsDir || explorerItemIsRoot" },
    { command: "explorer.newFolder",       group: "3_creation", when: "explorerItemIsDir || explorerItemIsRoot" },

    // 第 4 组：重命名/删除
    { command: "explorer.rename",          group: "4_modify", when: "!explorerItemIsRoot" },
    { command: "explorer.delete",          group: "4_modify", when: "!explorerItemIsRoot" },

    // 第 5 组：搜索
    { command: "explorer.findInFolder",    group: "5_search", when: "explorerItemIsDir" },

    // 第 6 组：工作区操作
    { command: "explorer.removeFolder",    group: "6_workspace", when: "explorerItemIsRoot", label: "关闭文件夹" },
  ]);

  // ── E4V#33: MenuBar 菜单栏贡献——[文件] 追加 + 新建 [编辑] 菜单 ──
  // pattern: 父项 command="" label="按钮名" children=[...]——对标 coreCommands.ts
  window.linkdesk?.menu?.registerItems("MenuBar", "file-tree", [
    // 追加到已有 [文件] 菜单
    { command: "explorer.newFile",        group: "file", label: "新建文件" },
    { command: "explorer.newFolder",      group: "file", label: "新建文件夹" },
    { command: "explorer.openFolder",     group: "file", label: "打开文件夹…" },
    { command: "explorer.closeAllEditors",group: "file", label: "关闭所有编辑器" },
    { command: "explorer.removeFolder",   group: "file", label: "关闭文件夹" },
    // 新建 [编辑] 菜单——父项 label="编辑" 给按钮名，子项是下拉菜单内容
    {
      command: "",
      label: "编辑",
      group: "edit",
      children: [
        { command: "explorer.cut",    group: "edit" },
        { command: "explorer.copy",   group: "edit" },
        { command: "explorer.paste",  group: "edit" },
        { command: "explorer.search", group: "edit", label: "搜索" },
      ],
    },
  ]);
}
