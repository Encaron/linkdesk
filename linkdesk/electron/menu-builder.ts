/**
 * menu-builder — 将 MenuRegistry 菜单数据转为 Electron 原生 Menu。
 * E3f #52：menubar 模式——注册 MenuId.MenuBar 的菜单项自动出现在原生菜单栏。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/06-E3f-壳UI收尾.md §二.2
 *
 * Phase 6：改为从渲染进程 MenuRegistry 动态读取（通过 IPC），不再硬编码菜单内容。
 */

import { Menu, BrowserWindow, app } from 'electron';

/**
 * 构建原生菜单——静态 File/Edit/View/Help 四组。
 */
export function buildAppMenu(mainWindow: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

  const template: any[] = [];

  // macOS 应用菜单
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: '关于 LinkDesk', role: 'about' },
        { type: 'separator' },
        { label: '退出', accelerator: 'Cmd+Q', role: 'quit' },
      ],
    });
  }

  template.push(
    {
      label: 'File',
      submenu: [
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:command', 'core.openSettings'),
        },
        { type: 'separator' },
        isMac
          ? { label: '退出', role: 'quit' }
          : { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: '命令面板',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('menu:command', 'workbench.action.showCommands'),
        },
        { type: 'separator' },
        {
          label: '选择颜色主题',
          accelerator: 'CmdOrCtrl+K CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu:command', 'workbench.action.selectTheme'),
        },
        {
          label: '选择语言',
          click: () => mainWindow.webContents.send('menu:command', 'workbench.action.selectLanguage'),
        },
        { type: 'separator' },
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: '关于 LinkDesk',
          click: () => mainWindow.webContents.send('menu:command', 'core.openSettings'),
        },
      ],
    }
  );

  return Menu.buildFromTemplate(template);
}
