/**
 * menu-builder — 将 MenuRegistry 菜单数据转为 Electron 原生 Menu。
 * E3f #52e：menubar 模式——数据来自渲染进程 MenuRegistry.getMenuItems(MenuId.MenuBar)。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二.2
 */

import { Menu, BrowserWindow } from 'electron';

/** IPC 传来的菜单项（MenuRegistry 序列化后的最小结构） */
export interface MenuBarItem {
  command: string;
  label?: string;
  group?: string;
  children?: MenuBarItem[];
}

/** 组名 → 顶级菜单标签 */
const GROUP_LABELS: Record<string, string> = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  help: 'Help',
};

const GROUP_ORDER: Record<string, number> = {
  file: 0,
  edit: 1,
  view: 2,
  help: 3,
};

/**
 * 从 MenuRegistry 数据构建 Electron 原生菜单。
 * menuItems = getMenuItems(MenuId.MenuBar) 序列化后通过 IPC 传来。
 */
export function buildAppMenu(menuItems: MenuBarItem[], mainWindow: BrowserWindow): Menu {
  // 按 group 分组
  const groups = new Map<string, MenuBarItem[]>();
  for (const item of menuItems) {
    const group = item.group ?? 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }

  // 排序
  const sorted = [...groups.entries()].sort(
    (a, b) => (GROUP_ORDER[a[0]] ?? 99) - (GROUP_ORDER[b[0]] ?? 99)
  );

  // 转换——每组的 children 作为子菜单
  const template: any[] = sorted.map(([group, items]) => ({
    label: GROUP_LABELS[group] ?? group,
    submenu: items.map((item) => convertItem(item, mainWindow)),
  }));

  return Menu.buildFromTemplate(template);
}

/** 递归转换单个菜单项 */
function convertItem(item: MenuBarItem, mainWindow: BrowserWindow): any {
  // 有 children → 子菜单
  if (item.children?.length) {
    return {
      label: item.label ?? '',
      submenu: item.children.map((c) => convertItem(c, mainWindow)),
    };
  }

  // 叶子项 → 发 IPC 到渲染进程执行命令
  return {
    label: item.label ?? item.command,
    click: () => {
      if (item.command) {
        mainWindow.webContents.send('menu:command', item.command);
      }
    },
  };
}
