/**
 * Electron 主进程入口
 *
 * E1 步 1-5：Electron 壳 + 串口/文件/插件/dialog + linkdesk:// 协议。
 *
 * 架构：单实例锁 + BrowserWindow + preload 加载确认 + linkdesk:// 自定义协议。
 * 对标 VS Code 的主进程管理模式。
 */

import { app, BrowserWindow, ipcMain, protocol, dialog, nativeTheme, Menu, shell } from 'electron';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { registerSerialHandlers } from './ipc/handlers/serial-handlers.js';
import { registerFileHandlers } from './ipc/handlers/file-handlers.js';
import { loadAllPluginManifests, registerManifestRescanHandler } from './plugins/plugin-manifest-loader.js'; // E5.7#48：Registry 主进程化——三表预加载
import { registerPluginHandlers } from './ipc/handlers/plugin-handlers.js';
import { registerDialogHandlers } from './ipc/handlers/dialog-handlers.js';
import { registerEnvHandlers } from './ipc/handlers/env-handlers.js';
import { registerProductHandlers } from './ipc/handlers/product-handlers.js'; // E6#57.3b：产品身份（app:getVersion/getProductInfo）
import { registerClipboardHandlers } from './ipc/handlers/clipboard-handlers.js';
import { registerRegistryHandlers } from './ipc/handlers/registry-handlers.js'; // E5.7#49：主进程三表直连 IPC
import { registerHotExitHandlers } from './ipc/handlers/hot-exit-handlers.js'; // E5.7#38
import { registerAppearanceHandlers } from './ipc/handlers/appearance-handlers.js'; // E5.8#50.11：外观资产
import { registerPoolHandlers } from './ipc/handlers/plugin-view-handlers.js'; // E5.6#8d
import { registerLspHandlers } from './ipc/handlers/lsp-handlers.js'; // E4V#40s1
import { registerPluginInstallHandlers } from './ipc/handlers/plugin-install-handlers.js'; // E6#11/#13（1.2-5）：装卸更主进程 fs/net 段
import { registerProtocol } from './plugins/protocol.js';
import { ingestPluginBundles } from './plugins/bundle-ingest.js'; // E6#7（1.2-4）：启动解压 .linkdesk-plugin
import { installBundledPlugins } from './plugins/bundled-install.js'; // E6#15c：首启自动装 bundled-plugins（发货夹）
import { recoverInterruptedUpdates } from './plugins/plugin-tree-recovery.js'; // E6#73j（G8）：复原被中断的更新替换（<id>.bak）
import { cleanupStaleDownloads } from './services/plugin-download.js'; // E6#31a：启动清残留下载临时文件（.part/孤立包，01 §四·五 B1）
import { cleanupUpdateResidue } from './services/update-download.js'; // E6#57.6d/e：启动清更新残留（.part + 方向守卫：删旧安装器，防自降级）
import { initUpdateService, registerUpdateHandlers } from './ipc/handlers/update-handlers.js'; // E6#57.8：更新机制装配（状态机 + 三条腿）+ update.* 命令通道
import { fileService } from './services/file-service.js';
import { pluginFileService } from './services/plugin-file-service.js'; // E6#78：插件目录位置解析
import { envService } from './services/env-service.js'; // E6#78：插件数据目录
import { WindowManager } from './windows/window-manager.js';
import { syncKeybindings } from './windows/keyboard-router.js'; // E5.5#7-p6
import { IpcBridge } from './ipc/ipc-bridge.js';
import { setupCrashRecovery, replayAfterShellRebuild, type CrashRecoveryDeps } from './windows/crash-recovery.js'; // E5.7#36
import { setupExternalLinkRouting } from './windows/external-links.js'; // E6#70c：外链 → 系统浏览器
import { parseLaunchPaths, type LaunchPaths } from './windows/launch-args.js'; // E6#46a：intake 解析半
import { APP_SCHEME, APPEARANCE_SCHEME, DEV_SERVER_URL } from './constants.js'; // E5#102b：DEV_SERVER_URL 定义在 constants.ts
import { IPC } from './ipc/channels.js';
// ── 单实例锁 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── 窗口引用（后续 SerialService/file-service 需要 mainWindow.webContents.send()）──
let mainWindow: BrowserWindow | null = null;
// E6#46a：启动/second-instance 收到的文件路径缓存——#46b 壳侧就绪后消费（发送通道在该格接线）。
// 文件夹不走这里：路由层直接开新窗（#47a/#47b）。
const pendingOpenFiles: string[] = [];
// E3a #24：插件 WebContentsView 生命周期管理
let windowManager: WindowManager | null = null;
// E3a #26：池渲染进程 ↔ 壳渲染进程 IPC 中继（E5.7#43）
let ipcBridge: IpcBridge | null = null;

const isDev = !app.isPackaged;
let _windowIpcRegistered = false; // E3f #52f：窗口控制 IPC handler 只注册一次
// E5.7#79：最后应用的缩放因子——壳崩重建/池重建（createWindow → createMainPool）后重放。
// 主进程模块级变量在 rebuildShell 中存活（进程不重启），壳侧配置 onApply 在渲染进程加载后才推来。
let _lastZoomFactor = 1;
// E5.7#36：无状态 shell IPC 只注册一次（壳崩重建 createWindow 会再次经过——不 guard 则重复注册抛异常）
let _keyboardSyncRegistered = false;
let _shellIpcRegistered = false;

/**
 * 创建壳窗。E6#47b-2：`workspaceFolder` = 首窗要载入的工程文件夹（命令行/右键/恢复第一条）；
 * 首窗不带 `?wsWindow=` 参数（等价隐式 ws-1，与 WorkspaceService 的回落值同源）。
 */
function createWindow(workspaceFolder?: string): void {
  // E3f #51：标题栏暗色化——跟随 LinkDesk 暗色主题
  nativeTheme.themeSource = 'dark';
  // E3f #52：去掉 Electron 默认菜单栏（File/Edit/View/Window）——LinkDesk 用自己的
  Menu.setApplicationMenu(null);

  // E5.7#36：local win——closed 处理器需身份校验（旧窗销毁不得清掉重建后的新引用）
  const win = new BrowserWindow(shellWindowOptions());
  mainWindow = win; // E5.7#36：壳崩重建复用 createWindow——模块引用先指向新窗

  // E6#46b：冲刷启动早期缓冲的 intake 文件——did-finish-load 时 preload 模块顶层监听必已注册
  // （preload 先于页面执行），IpcRelay 再兜 React 订阅前的窗口期，两端接力无丢失窗口。
  win.webContents.once('did-finish-load', () => {
    if (pendingOpenFiles.length > 0 && !win.isDestroyed()) {
      win.webContents.send(IPC.workspace.openPath, { paths: pendingOpenFiles.splice(0) });
    }
  });

  // ── 注册 IPC 处理器（E5.7#36：全部幂等——首次注册 + 重建时刷新引用；无状态 handler 重复调用直接跳过）──
  registerPluginHandlers();
  registerEnvHandlers();
  registerProductHandlers(); // E6#57.3b：产品身份 main 直答（app:getVersion / app:getProductInfo）
  registerClipboardHandlers();
  registerRegistryHandlers();  // E5.7#49：三表直连（数据由 plugin-manifest-loader 预加载）
  registerHotExitHandlers();   // E5.7#38
  registerAppearanceHandlers(); // E5.8#50.11：外观资产——选择图片拷贝入库

  // E3a #24：初始化 WindowManager（E5.7#43：PluginViewRegistry 已删）
  windowManager = new WindowManager(win);
  windowManager.registerPrimaryShell(win); // E6#47b-2：首窗壳稳定引用（'main' 池的归属，见 primaryShell 字段注释）
  // E5.5#7-p7：壳同步快捷键表到主进程（无窗口引用——只注册一次）
  if (!_keyboardSyncRegistered) {
    _keyboardSyncRegistered = true;
    ipcMain.handle(IPC.keyboard.syncShortcuts, (_event, data) => {
      syncKeybindings(data);
    });
  }
  // E3a #26-#27：初始化 IpcBridge——注册 config/command 代理 + 事件推送通道（换实例摘旧挂新）
  ipcBridge = new IpcBridge(win, windowManager);
  windowManager.setIpcBridge(ipcBridge); // E3c #40：IpcBridge 注入 WindowManager——新 WebView 重放广播

  // E5#74 + E5.8#6.5：serial/lsp/file 推送改走 IpcBridge.broadcast（IpcBridge.active 取最新实例）——
  // lsp/serial 推送无窗引用依赖 → 可无参；file 必须保留 windowManager——isPoolSender 壳/池来源判定靠它
  // （#6.5 回归：误删参数 → _windowManager 恒 undefined → 壳受信写也被当池来源守卫 → 启动弹十几个"工作区外写入确认"）
  registerLspHandlers();   // E5#74c
  registerSerialHandlers(); // E5#74b
  registerFileHandlers(windowManager);              // E5#80
  registerPluginInstallHandlers();                  // E6#11/#13（1.2-5）：装卸更 fs/net 段——无窗引用（进度走 IpcBridge.active）
  registerDialogHandlers(windowManager);            // E5.8#62 审计#4：对话框 parent 反查宿主窗——须在 windowManager 创建后注入
  registerPoolHandlers(windowManager, win);  // E5.6#8e
  registerUpdateHandlers();                  // E6#57.8b：update.* 命令四条（服务在 whenReady 序列里已装配）

  // E5.6#9 → E5.7#4：创建唯一 Pool WebContentsView——极简Pool 单 WCV（#12 提前：SidebarPool 已删）
  windowManager.createMainPool();

  // E5.7#79：重放最后缩放因子——壳崩重建时壳配置 onApply 尚未跑（渲染进程加载后才有），
  // 新池默认 100% 会闪一下。首次启动 _lastZoomFactor=1 → no-op。
  if (_lastZoomFactor !== 1) {
    const poolView = windowManager.getPoolView();
    if (poolView && !poolView.webContents.isDestroyed()) {
      poolView.webContents.setZoomFactor(_lastZoomFactor);
    }
  }

  // ── 加载内容：dev 模式从 Vite dev server，prod 模式从 dist/ ──
  // E6#47b-2：带 folder 启动 → 查询参数下发（壳 WorkspaceService 首帧读参数 addFolder）
  const firstWinQuery = workspaceFolder ? `?${new URLSearchParams({ folder: workspaceFolder })}` : '';
  if (isDev) {
    win.loadURL(`${DEV_SERVER_URL}${firstWinQuery}`);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'), workspaceFolder ? { query: { folder: workspaceFolder } } : undefined);
  }

  // ready-to-show 后才显示窗口
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });

  // 🔥 E5#114d 诊断：把渲染进程 console 输出转发到文件——生产环境 F12 禁用
  // E6#37e（2026-09-12）：改用新签名——后几个参数已收进事件对象。
  //   旧签名 `(_event, _level, message)` 会打 `DeprecationWarning`（实测见
  //   E6-执行清单 #37e 判据①）。本处只用 message，故直接读 `event.message`。
  forwardShellConsoleToFile(win); // E6#47b-2：与 workspace 窗共用同一实现（去重）

  // E3f #52f：自定义窗口控制（─ □ ×）——TitleBar 按钮 → 主进程窗口操作
  // E5.8#43-2（B3）：按发送者路由——池 TitleBarZone 按钮来自哪个 Pool 窗口就作用于哪个宿主窗
  //（脱出窗点 ─ □ × 作用于自身；壳渲染进程 sender 不在 poolWindows 注册表 → 回退主窗）。
  const hostWindowFor = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow => {
    const windowId = windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    return windowManager?.getHostWindow(windowId) ?? mainWindow!;
  };
  if (!_windowIpcRegistered) {
    _windowIpcRegistered = true;
    ipcMain.on(IPC.window.minimize, (event) => hostWindowFor(event)?.minimize());
    // E6#70d 全屏逃生：宿主窗若处原生全屏（页内 video HTML 全屏拉进），□ 按钮在渲染端以为是「最大化」（全屏≠最大化）
    // → maximize() 对全屏窗是 no-op → 用户被困全屏退不出。这里收成统一逃生口：全屏态点 □ = 还原窗口。
    ipcMain.on(IPC.window.maximize, (event) => {
      const win = hostWindowFor(event);
      if (!win) return;
      if (win.isFullScreen()) win.setFullScreen(false);
      else win.maximize();
    });
    ipcMain.on(IPC.window.unmaximize, (event) => {
      const win = hostWindowFor(event);
      if (!win) return;
      if (win.isFullScreen()) win.setFullScreen(false);
      else win.unmaximize();
    });
    ipcMain.on(IPC.window.close, (event) => hostWindowFor(event)?.close());
    ipcMain.handle(IPC.window.isMaximized, (event) => hostWindowFor(event)?.isMaximized() ?? false);
    // E5.8#46.18：OS 级置顶——setAlwaysOnTop 按 sender 路由宿主窗（脱出窗/漂移窗/主窗各自置顶互不影响）；
    // isAlwaysOnTop 供 TitleBarZone pin 按钮挂载时初始化两态。
    ipcMain.on(IPC.window.setAlwaysOnTop, (event, pinned: boolean) => hostWindowFor(event)?.setAlwaysOnTop(!!pinned));
    ipcMain.handle(IPC.window.isAlwaysOnTop, (event) => hostWindowFor(event)?.isAlwaysOnTop() ?? false);
    // E5.7#79：窗口缩放——壳配置 onApply 推来的因子应用到池 WCV（可见 UI 全在池）。
    // 缓存供 createWindow 重建池后重放（池 WCV 是新 webContents，缩放不随窗口重建保留）。
    // E5.8#62 审计#1：按 sender 路由——原恒取主池 getPoolView()，脱出窗池插件调 setZoom 错指主窗
    //（意图落空副作用错位，#46.8「IPC 路由默认主窗」同款缺陷模式）。池 sender → 其所属窗池 WCV；
    // 壳渲染进程（startup.ts window.zoomLevel onApply）sender 非池 → 回退主池。缩放缓存仅主池——
    // 脱出窗池随宿主窗销毁，无需跨壳崩重建重放（壳按持久化清单重建脱出窗，F5 后缩放回落为既有行为）。
    ipcMain.on(IPC.window.setZoom, (event, factor: number) => {
      // Number.isFinite 而非 typeof === "number"——no-restricted-syntax 字符串比较启发式误报
      const n = Number(factor);
      const zoom = Number.isFinite(n) ? n : 1;
      const windowId = windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
      const poolView = windowManager?.getPoolViewByWindowId(windowId);
      if (poolView && !poolView.webContents.isDestroyed()) {
        poolView.webContents.setZoomFactor(zoom);
      }
      if (windowId === 'main') {
        _lastZoomFactor = zoom;
      }
    });
    // E3f #58：切换壳窗口 DevTools——多 WebView 未激活时的兜底
    // E6#57.10：去掉 `app.isPackaged` 闸门（同 plugin-view-handlers.ts 池侧那一处，用户
    // 2026-09-12 裁决「开启这个功能」）——两道闸门是发行版「选了 WebView 但 devtool 不出现」的根因。
    ipcMain.handle(IPC.window.toggleDevTools, () => {
      if (!mainWindow) return;
      const wc = mainWindow.webContents;
      wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'detach' });
    });
  }
  // E5.8#43-2（B3）：最大化状态 → 该窗池 WCV（TitleBar □/还原按钮态跟随所在窗口）。
  // 原 win.webContents.send 发的是壳渲染进程（index.html）——池是独立 WCV 收不到（E5.7 潜伏缺口），
  // 且脱出窗壳 webContents 无人消费。sendPoolMaximizeChange 按宿主窗反查池定向发送。
  win.on('maximize', () => windowManager?.sendPoolMaximizeChange(win, true));
  win.on('unmaximize', () => windowManager?.sendPoolMaximizeChange(win, false));

  // ── E5.7#36：无状态 shell IPC——无窗口引用，只注册一次 ──
  if (!_shellIpcRegistered) {
    _shellIpcRegistered = true;

    // E4V#18: Shell IPC——revealInOS
    ipcMain.handle(IPC.shell.showItemInFolder, async (_e, p: string) => shell.showItemInFolder(p));

    // E6#78：已装插件的磁盘位置——市场详情页「打开所在位置 / 数据位置」两行的数据源。
    // 主进程解析路径（池内零安装路径知识，渲染侧只拿结果，不自己拼）；盘上找不到该插件 → null。
    // dataDir 只在**真有数据**时才给（目录不存在或空 → null）——与 VS Code 详情页「缓存」行同判据
    // （空则整行不画，不造一行点开是空文件夹的假信息）。
    ipcMain.handle(IPC.shell.pluginLocation, async (_e, pluginId: string) => {
      const installDir = pluginFileService.locateDir(pluginId);
      if (!installDir) return null;
      return { installDir, dataDir: envService.pluginDataDirIfAny(pluginId) };
    });

    // E6#78：资源管理器打开插件的安装目录 / 数据目录——开的是目录**内容**（与 E5.8#153
    // appearance.revealStorage「打开存储位置」同一手感），不是 showItemInFolder 的「父目录 + 选中它」。
    // install：插件不在盘上 → fail-loud 抛错（不假装打开成功）；data：先建空目录再开
    // （打开即见存储位置，空目录同样合法——同 revealStorage）。
    ipcMain.handle(
      IPC.shell.openPluginFolder,
      async (_e, pluginId: string, kind: 'install' | 'data') => {
        const dir =
          kind === 'data' ? envService.pluginDataDir(pluginId) : pluginFileService.locateDir(pluginId);
        if (!dir) throw new Error(`插件目录不存在: ${pluginId}`);
        await fileService.createDir(dir);
        const err = await shell.openPath(dir);
        if (err) throw new Error(`打开插件目录失败: ${err}`);
      },
    );

    // E6#73j（G4）：真重启应用——「点击重启以应用新版」。
    // 与 window.location.reload() 的本质差别：池是独立 WebContentsView，壳 reload 不重建它
    // ⇒ 更新视图类插件后界面仍是旧 bundle（E6#73j G4 实测症状：点了像没点）。
    // 用 app.exit(0) 而非 app.quit()：与主进程心跳兜底处同一写法，且此处语义是「立刻重来」，
    // 不应被任何 beforeunload/close 拦截。窗口与 watcher 的清理由 OS 随进程回收，
    // 未保存内容由热退出（hotExit）在编辑期已落盘，不依赖退出钩子。
    ipcMain.handle(IPC.shell.relaunch, () => {
      app.relaunch();
      app.exit(0);
    });

    // E5#108b：文件拖出到桌面——Electron 原生 API。低版本无 startDrag 则静默
    ipcMain.on(IPC.shell.startDrag, (event, filePath: string, iconPath?: string) => {
      if (!filePath) return;
      // E5.7#98：startDrag 是 WebContents 类型化 API——as any 删除，typeof 守卫保留（低版本运行时无此方法）。
      // 本版 typings Item.icon 必填而运行时可选——按需装配后调用点窄化
      const sender = event.sender;
      if (typeof sender.startDrag !== 'function') return;
      const opts: Record<string, unknown> = { file: filePath };
      if (iconPath && fs.existsSync(iconPath)) opts.icon = iconPath;
      else if (process.platform === 'win32') {
        const defIcon = path.join(__dirname, '../../build/icon.ico');
        if (fs.existsSync(defIcon)) opts.icon = defIcon;
      }
      sender.startDrag(opts as unknown as Electron.Item);
    });

    // E4V#19 + E5#22: 在系统终端打开目录——可配置终端类型，不再硬编码 PowerShell
    ipcMain.handle(IPC.shell.openInTerminal, async (_e, dirPath: string, terminalExe?: string, customCommand?: string) => {
      if (process.platform === 'win32') {
        const exe = terminalExe || 'powershell';
        let cmd: string;
        switch (exe) {
          case 'cmd':
            cmd = `start cmd /K "cd /d "${dirPath}""`;
            break;
          case 'wt':
            cmd = `wt -d "${dirPath}"`;
            break;
          case 'git-bash': {
            const gitBashPaths = [
              'C:\\Program Files\\Git\\git-bash.exe',
              'C:\\Program Files (x86)\\Git\\git-bash.exe',
              `${process.env.LOCALAPPDATA}\\Programs\\Git\\git-bash.exe`,
            ];
            const gitBash = gitBashPaths.find(p => fs.existsSync(p));
            if (gitBash) {
              cmd = `start "" "${gitBash}" --cd="${dirPath}"`;
            } else {
              console.error('[shell:openInTerminal] Git Bash 未找到');
              return;
            }
            break;
          }
          case 'custom':
            // 🔥 不硬编码——渲染进程传模板，替换 {{dirPath}} 占位符
            cmd = (customCommand || '').replace(/\{\{dirPath\}\}/g, dirPath);
            if (!cmd) { console.error('[shell:openInTerminal] 自定义命令为空'); return; }
            break;
          case 'powershell':
          default:
            cmd = `start powershell -NoExit -Command "cd '${dirPath}'"`;
            break;
        }
        exec(cmd, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      } else if (process.platform === 'darwin') {
        exec(`open -a Terminal "${dirPath}"`, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      } else {
        // Linux（E5#22 bug fix——原来无此分支，走 macOS 命令无效）
        exec(`xdg-open "${dirPath}"`, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      }
      });
    }

  win.on('closed', () => {
    // E5.7#36：身份校验——壳崩重建先建新窗后毁旧窗，旧窗的 closed 不得清掉新引用
    if (mainWindow !== win) return;
    mainWindow = null;
    // E5.8#43-3（2026-08-22 用户拍板）：主窗关闭 = 整个应用退出——脱出窗一同关闭（quitApp）。
    // 不能靠 window-all-closed（脱出窗还开着时不触发 → 壳死 + 脱出窗变僵尸：池收不到 pushLayout、
    // 键盘路由挂已销毁 mainWindow）。壳 = 主窗 webContents，主窗没了壳就死 → 必须连带退出全部窗口。
    // app.quit() 关全部窗口 → 壳 beforeunload 落盘（syncWriteLayout 含脱出窗 bounds）→ 正常退出。
    app.quit();
  });
}

/**
 * E5.7#36：壳渲染进程崩溃——全窗口重建（设计 §2.1 场景 B）。
 * createWindow 内全部 ipcMain 注册已 once-guard（审计①）——重复调用只刷新引用，不重注册；
 * IpcBridge 换实例摘旧挂新。先建后毁：窗口数不为零，window-all-closed 不触发退出。
 */
function rebuildShell(): void {
  const oldWin = mainWindow;
  const oldWm = windowManager;
  const oldBridge = ipcBridge;
  oldBridge?.dispose(); // 拒绝旧壳未决请求
  oldWm?.dispose();     // 清内存定时器 + 注销 resize 监听 + 销毁旧池
  createWindow();
  replayAfterShellRebuild(crashRecoveryDeps); // 新池就绪后回放 lastLayout 兜底
  if (oldWin && !oldWin.isDestroyed()) oldWin.destroy();
}

// E5.7#36：崩溃恢复接线——getter 闭包运行时读最新引用（重建后自动指向新实例）
const crashRecoveryDeps: CrashRecoveryDeps = {
  getMainWindow: () => mainWindow,
  getWindowManager: () => windowManager,
  rebuildShell,
};

setupCrashRecovery(crashRecoveryDeps);

setupExternalLinkRouting(); // E6#70c：全 wc 外链 window-open → shell.openExternal（deny 裸窗）

// E3f #51：渲染进程主题变更 → 同步标题栏 + 窗口背景色
ipcMain.on(IPC.theme.changed, (_event, isDark: boolean) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
  // E5.8#6.6 hex 豁免：窗口背景色随主题（OS 层 setBackgroundColor，CSS 变量不可达）
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  const bg = isDark ? '#1e1e1e' : '#f5f5f5';
  // E5.8#62 审计#2：全部宿主窗 OS 层背景随主题——脱出宿主窗 backgroundColor 是创建时一次性值
  //（window-manager.ts:335 nativeTheme 快照），原只更新主窗 → 切主题后脱出窗 OS 背景残留旧主题色
  //（池加载/闪白间隙可见）。getAllHostWindows 覆盖 main + 脱出/漂移窗，setBackgroundColor 幂等。
  if (windowManager) {
    for (const hostWin of windowManager.getAllHostWindows()) {
      if (!hostWin.isDestroyed()) hostWin.setBackgroundColor(bg);
    }
  }
  // 主窗显式兜底（windowManager 未创建/主池未注册的早期窗口期）——getAllHostWindows 已含 main，此处幂等
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(bg);
  }
  // E5.6#10f：Pool WebContentsView 背景跟随主题——池创建时 nativeTheme 尚未反映用户主题
  if (windowManager) {
    for (const poolView of windowManager.getAllPoolViews()) {
      if (!poolView.webContents.isDestroyed()) {
        poolView.setBackgroundColor(bg);
      }
    }
  }
});

// ── preload 加载确认（新风险 3 防御——preload 抛异常不进 ErrorBoundary）──
// E5.8#46.11：每次壳加载（fresh+reload）主动 seed 全部池窗 bounds——壳 reload 后注册表 bounds 清空、
// 池不随壳 reload 重发 pool:ready → main.bounds 恒缺直至用户动窗（#46.10 吸附对无 bounds 窗跳过命中）。
// preloadReady 恒在池注册之后触发（windowManager 建于壳页面加载前），此 handler 无需等待窗。
ipcMain.on(IPC.app.preloadReady, () => {
  console.log('[main] preload-shell 加载成功，window.linkdesk 已就绪');
  windowManager?.pushAllWindowBounds();
});

// ── E2a #5：心跳看门狗——检测 JS 主线程死循环/卡死 ──
// 渲染进程每 2s 发 heartbeat。主进程每 3s 检查一次，
// 若超过 30s 未收到 → JS 主线程可能卡死 → 弹出原生对话框。
// 限制：单 WebView 下只能检测，无法恢复。E3 多进程后改为只重载卡死的 WebView。
let lastHeartbeat = 0; // 0 = 尚未收到任何心跳（渲染进程未就绪前不弹窗）
const HEARTBEAT_TIMEOUT = 30_000; // 30s 无心跳 → 判定卡死
const HEARTBEAT_CHECK_INTERVAL = 3000; // 每 3s 检查一次

ipcMain.on(IPC.app.heartbeat, () => {
  lastHeartbeat = Date.now();
});

setInterval(() => {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  if (lastHeartbeat === 0) return; // 渲染进程未就绪——还没开始发心跳
  const elapsed = Date.now() - lastHeartbeat;
  if (elapsed > HEARTBEAT_TIMEOUT) {
    // 防止重复弹窗——重置计时器避免连续弹出
    lastHeartbeat = Date.now();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '应用无响应',
      message: 'LinkDesk 界面无响应，可能是插件导致的主线程阻塞。',
      buttons: ['刷新', '等待'],
      defaultId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        app.relaunch();
        app.exit(0);
      }
    });
  }
}, HEARTBEAT_CHECK_INTERVAL);

// ── 注册 linkdesk:// 协议（必须在 app.whenReady 之前声明 privileged）──
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  // E5.6#9h：注册 extension-file 协议——@codingame Monaco 内部虚拟文件系统，
  // 无此注册则 extension-file:// fetch 请求全 404，console 噪音。
  { scheme: "extension-file", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // E5.8#64：受控外观图片协议——importImage 拷贝进 userData/appearance 的图（实机 bug 13：
  // plain 绝对路径被 Chromium 归一 file:// 拦截报「Not allowed to load local resource」）。
  // standard+secure+fetch 才能被 sandboxed pool 的 CSS background-image 加载。
  { scheme: APPEARANCE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ── 应用生命周期 ──
/**
 * E6#47b-2：壳窗 BrowserWindow 公共选项（首窗 / workspace 窗同源——改一处两窗同变）。
 * 色值走 hex 豁免（OS 层窗口背景，渲染进程 CSS 变量不可达；防启动白屏）。
 */
function shellWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    icon: isDev
      ? path.join(__dirname, '../../build/icon.ico')
      : path.join(process.resourcesPath, 'icon.ico'), // 打包后 icon.ico 在 extraResources，不在 ASAR 中
    frame: false, // E3f #52f：隐藏原生窗口框架——LinkDesk 自己画 TitleBar
    // E5.8#6.6 hex 豁免：主进程窗口初始背景色（OS 层，渲染进程 CSS 变量不可达；E3f #51 防启动白屏）
    // eslint-disable-next-line linkdesk/no-hardcoded-hex
    backgroundColor: '#1e1e1e', // E3f #51：暗色背景——消除启动白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API 做 contextBridge
      backgroundThrottling: false, // E2c fix：禁止 Chromium 节流后台定时器——心跳看门狗失焦时误判"无响应"
    },
    title: 'LinkDesk',
    show: false, // ready-to-show 后再显示，避免白屏闪烁
  };
}

/** E6#47b-2：workspace 窗自增标识——首窗隐式 ws-1（不带参数），新建窗从 ws-2 起。 */
let _nextWorkspaceId = 2;

/**
 * E6#47b-2：新建 workspace 窗（一个 Electron 进程 + 多 BrowserWindow 的「第二窗起」路径）。
 *
 * 与首窗的差异（都是有意为之，别「顺手统一」）：
 *   · 不带 IPCs 注册块——全部 handler 已在首窗创建时注册且幂等（WindowManager/IpcBridge 单实例，
 *     它们按 windowId / sender 路由，天然多窗）；重复注册会把「主壳回退引用」指向新窗（错）。
 *   · 带 `?wsWindow=ws-N`（壳据此派生每窗持久化 key，见 #47e）+ `folder`（该窗要载入的工程）。
 *   · 池注册表 key = ws-N（全局唯一）；壳内视角仍叫 'main'（pool-addressing 双向翻译）。
 */
function createWorkspaceWindow(workspaceFolder: string): void {
  if (!windowManager) return; // 启动序保证：只在首窗创建后调用（whenReady/second-instance）
  const wsId = `ws-${_nextWorkspaceId++}`;

  const win = new BrowserWindow(shellWindowOptions());

  // 壳注册（池创建之前——键盘路由按 windowId 反查所属壳依赖它）+ focus 焦点窗跟随 + closed 摘表
  windowManager.registerWorkspaceShell(win, wsId);
  windowManager.createWorkspacePool(wsId);

  // 缩放跟随（与首窗同款重放；工作窗池不跨重建，无需缓存）
  if (_lastZoomFactor !== 1) {
    const poolView = windowManager.getPoolViewByWindowId(wsId);
    if (poolView && !poolView.webContents.isDestroyed()) {
      poolView.webContents.setZoomFactor(_lastZoomFactor);
    }
  }

  forwardShellConsoleToFile(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  // 关窗清理：池 WCV 不随宿主 BrowserWindow 自动销毁（registerPool 挂在其 contentView 上）
  win.on('closed', () => {
    windowManager?.destroyWorkspacePool(wsId);
  });

  const query = new URLSearchParams({ wsWindow: wsId, folder: workspaceFolder });
  if (isDev) {
    win.loadURL(`${DEV_SERVER_URL}/?${query}`);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'), { query: { wsWindow: wsId, folder: workspaceFolder } });
  }
  console.log(`[main] workspace 窗已创建 ${wsId} folder=${workspaceFolder}`);
}

/** E6#47b-2：壳渲染进程 console 转发到 protocol-debug.log（首窗/工作窗共用，防两处漂移） */
function forwardShellConsoleToFile(win: BrowserWindow): void {
  win.webContents.on('console-message', (event) => {
    try {
      const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `[${ts}] [renderer] ${event.message}\n`);
    } catch { /* ignore */ }
  });
}

/**
 * E6#46a：intake 路由器——三条源（启动 argv / second-instance / macOS open-file）统一走这里，
 * 只允许这一个路由逻辑（归一化，不许每源各写一份）。
 *   folders → #47 开新窗；files → pendingOpenFiles 缓存，#46b 壳侧消费。
 * E6#47b-2 收口：folders → createWorkspaceWindow（各开一窗）；files → 直投壳/启动早期缓存。
 */
function routeLaunchItems(items: LaunchPaths): void {
  if (items.folders.length > 0) {
    // E6#47a 收口：文件夹 → 各开一个新窗（对标 code C:\projectA + code C:\projectB）
    for (const folder of items.folders) {
      createWorkspaceWindow(folder);
      console.log(`[launch-args] 文件夹 intake 开新窗: ${folder}`);
    }
  }
  if (items.files.length > 0) {
    // E6#46b：窗在 → 直投壳（preload 模块顶层监听已注册，IpcRelay 兜 React 订阅前的窗口期）；
    // 窗未建（启动早期/壳崩重建间隙）→ pendingOpenFiles 缓冲，createWindow 的 did-finish-load 冲刷。
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.workspace.openPath, { paths: items.files });
    } else {
      pendingOpenFiles.push(...items.files);
    }
    console.log(`[launch-args] 文件 intake ${items.files.length} 项: ${items.files.join(', ')}`);
  }
}

app.whenReady().then(async () => {
  registerProtocol();
  // E6#73j（G8）：先把「进程死在两次 rename 之间」留下的 <id>.bak 放回原位，再谈 ingest/发货/扫表。
  // 必须抢在这三步之前——否则发货夹会把内置版补进「看起来没装」的位置，覆盖掉本该复原的用户版。
  await recoverInterruptedUpdates();
  // E6#7（1.2-4）+ 2026-09-05 塌平单根：启动解压 userData/plugins 顶层待安装的 *.linkdesk-plugin → <id>/。
  // 必须抢在 loadAllPluginManifests + createWindow 之前——落盘后三表扫描、壳发现、协议解析、
  // 账本 reconcile 才能同见这批包（"放 zip → 重启 → 出现"的启动语义）。失败不阻断（内部吞错）。
  await ingestPluginBundles();
  // E6#15c：首启自动装 bundled-plugins 发货夹 → userData/plugins/<id>/（内置 pre-bundle 随壳分发，
  // 与第三方插件同一棵树——差异只剩 manifest.core:true）。与 ingest 同批（registerProtocol 后、
  // 三表扫描前）——同见、同幂等；发货源保留为恢复备份。
  await installBundledPlugins();
  // E6#31a：启动清 {userData}/tmp 下载残留（单实例保证启动瞬间无在途下载 = *.part 半截 + 孤立 .linkdesk-plugin
  // 全孤儿；缝隙 B1「下载中关软件」不留垃圾，01 §四·五）。内部吞错不拖垮启动。
  await cleanupStaleDownloads();
  // E6#57.6d/e：启动清 {userData}/update 残留——删半截 `.part` + **按版本方向删失效安装器**
  // （同版/更旧的删、比当前新的留；判据复用插件侧锚①）。🔴 真因：用户升到新版后磁盘里还躺着上一轮
  // 下好的**旧安装器** ⇒ 点「重启并更新」会把自己降级。内部吞错不拖垮启动。
  await cleanupUpdateResidue();
  // E6#57.8：装配更新服务（状态机 + 三条腿 + 启动复位）。🔴 **必须排在 cleanupUpdateResidue() 之后**——
  // 清理先按版本方向删掉失效安装器，复位再看盘上剩什么，两条结论才一致（#57.7a 判据 3；顺序反了会
  // 出现「清理说删了、复位说还在」）。复位要读盘（异步），而服务的 resume 是同步闭包 ⇒ 在
  // initUpdateService 内部 await 出结果再装进闭包，顺序由这条 await 链锁死。
  await initUpdateService();
  // E5.7#48：Registry 主进程化——静态声明三表（LangDef/Protocol/FileAssociation）预加载，
  // 必须在 createWindow（池 WCV 创建于其内）之前——首个 IPC 查询到达时表已填好，无竞态窗口。
  // 装/卸/重装重扫通道注册一次；壳崩重建走 rebuildShell→createWindow，不经过 whenReady，
  // 主进程三表数据天然存活、无需重扫。
  registerManifestRescanHandler();
  loadAllPluginManifests();
  // E6#46a/#47a：启动 argv intake——文件关联双击 / 右键菜单 / 命令行带参启动（slice(1) 跳过 exe 本体）。
  // 文件夹参数 = 窗口：首窗直接载入 folders[0]（无参数则空窗；也不读恢复记录——有显式意图），
  // 其余文件夹各开一窗（routeLaunchItems 统一走 createWorkspaceWindow）。
  const launchPaths = parseLaunchPaths(process.argv.slice(1));
  createWindow(launchPaths.folders[0]);
  routeLaunchItems({ files: launchPaths.files, folders: launchPaths.folders.slice(1) });
});

app.on('window-all-closed', () => {
  fileService.closeAllWatchers();
  app.quit();
});

// 保险：非 window-all-closed 路径退出时（如 app.quit() 直接调用）也清理 watcher
app.on('before-quit', () => {
  // E3a #24：先销毁所有插件 WebContentsView，再关文件 watcher
  windowManager?.dispose();
  ipcBridge?.dispose();
  fileService.closeAllWatchers();
});

app.on('activate', () => {
  // macOS: Dock 图标点击时无窗口 → 重新创建
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 第二个实例启动时 → 解析其 argv 并路由（E6#46a）；无路径参数时维持聚焦行为
app.on('second-instance', (_event, argv) => {
  routeLaunchItems(parseLaunchPaths(argv));
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 导出窗口引用——后续步 2-4 的 SerialService 等服务需要它推送数据到渲染进程
// E3a #24-#26：导出 WindowManager + IpcBridge（E5.7#43：PluginViewRegistry 已删）
export { mainWindow, windowManager, ipcBridge };
