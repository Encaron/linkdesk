/**
 * 多 workspace 壳窗注册表——E6#47b 自 `window-manager.ts` 抽出（体积门禁 800 行红线，feature-folder 拆法）。
 *
 * 职责（只此三件，不含池——池注册表仍在 WindowManager）：
 *   ① **壳窗登记**：首窗壳（`main` 池的稳定归属）+ workspace 壳（`ws-N`）；焦点跟随与关窗重指；
 *   ② **按池反查壳**：池事件/键盘/请求按 windowId（或 sender）找它所属的壳；
 *   ③ **最后活跃窗落盘**（E6#47f）：每窗活跃工程 + 焦点/关窗时写 `windows-state.json`。
 *
 * 方案与实证见 `docs/02-Electron架构/E6_插件生态与发布/07-Shell集成与多窗口/01-多窗口架构.md` §五。
 * 两条踩过的坑写在字段与方法注释里（首窗池被焦点带走错壳 / windowId 双重身份），改前先读。
 */

import type { BrowserWindow, WebContents } from 'electron';
import { poolKeyFromShell } from './pool-addressing.js';
import { writeWindowsState } from './windows-state.js';

export interface ShellRegistryHooks {
  /** 焦点壳变化 → WindowManager 维护 `mainWindow`（「当前聚焦的 workspace 窗」语义） */
  onFocusedShell: (win: BrowserWindow) => void;
  /** 池 sender → windowId（池注册表在 WindowManager——本类不持池，反查要借） */
  getPoolWindowId: (sender: WebContents) => string | null;
  /** 当前焦点壳（首窗壳已亡时的回退；`getShellForPoolId` 的「不落空」策略用） */
  getFocusedShell: () => BrowserWindow | null;
  /** userData 目录（windows-state.json 落盘位置；注入便于测试） */
  userDataDir: () => string;
}

export class ShellRegistry {
  /** workspace 壳窗：ws-N → BrowserWindow。池注册表 key 用它（全局唯一）；**
   *  而每个壳渲染进程眼里自己的池都叫 `main`（windowId 双重身份，见 pool-addressing）。 */
  private workspaceShells = new Map<string, BrowserWindow>();

  /**
   * 首窗壳的**稳定引用**——首窗池的注册表 key 是 `main`（沿旧制，全仓多处消费），
   * 而 `main`/detached 池必须回**首窗壳**，绝不能落到「当前焦点窗」（焦点一飘即错页——
   * 2026-09-13 CDP 实证：第二窗打开后首窗文件树拿到空工作区）。焦点窗语义只服务推送类消费方。
   */
  private primaryShell: BrowserWindow | null = null;

  /** E6#47f：每窗「活跃工程」——壳上报后按窗记录；焦点/关窗那一刻落盘（只记最后活跃窗） */
  private windowFolders = new Map<string, string | null>();

  constructor(private hooks: ShellRegistryHooks) {}

  /* ── 登记 ── */

  /** 登记首窗壳（`createWindow` 在建主池之前调用）——`main` 池的稳定归属 */
  registerPrimaryShell(win: BrowserWindow): void {
    this.primaryShell = win;
    win.on('focus', () => {
      if (!win.isDestroyed()) this.hooks.onFocusedShell(win);
      this.persistLastActiveWindow('main'); // E6#47f：焦点即「最后活跃窗」的最强信号
    });
    win.on('closed', () => {
      if (this.primaryShell === win) this.primaryShell = null;
    });
  }

  /**
   * 登记一个 workspace 壳窗（**须在其池创建之前调用**——池的键盘路由要按 windowId 反查所属壳）。
   * focus → 焦点窗跟随；closed → 摘注册表 + 焦点窗重指到仍存活的壳（推送类消费方依赖它非空）。
   */
  registerWorkspaceShell(win: BrowserWindow, wsWindowId: string): void {
    this.workspaceShells.set(wsWindowId, win);
    win.on('focus', () => {
      if (!win.isDestroyed()) this.hooks.onFocusedShell(win);
      this.persistLastActiveWindow(wsWindowId); // E6#47f：焦点 = 最后活跃窗
    });
    win.on('closed', () => {
      if (this.workspaceShells.get(wsWindowId) === win) this.workspaceShells.delete(wsWindowId);
      this.windowFolders.delete(wsWindowId);
      if (this.hooks.getFocusedShell() === win) {
        const next = [...this.workspaceShells.values()].find((w) => !w.isDestroyed());
        if (next) this.hooks.onFocusedShell(next);
      }
    });
  }

  /* ── 反查 ── */

  /**
   * 池所属壳窗——workspace 池（key = ws-N）取自己的壳；其余（main / detached:*）归**首窗壳**。
   * detached 窗没有自己的壳（tab 归主窗），键盘与事件一律回首窗壳——旧行为不变。
   * 未知/已销毁 → 回退焦点壳（「不落空」策略）；全无存活壳返回 null。
   */
  getShellForPoolId(windowId: string): BrowserWindow | null {
    if (windowId.startsWith('ws-')) {
      const shell = this.workspaceShells.get(windowId);
      if (shell && !shell.isDestroyed()) return shell;
    }
    if (this.primaryShell && !this.primaryShell.isDestroyed()) return this.primaryShell;
    const focused = this.hooks.getFocusedShell();
    return focused && !focused.isDestroyed() ? focused : null;
  }

  /** 按池 sender 反查所属壳窗（池事件回壳用）——非池来源返回 null */
  getShellForPoolSender(sender: WebContents): BrowserWindow | null {
    const windowId = this.hooks.getPoolWindowId(sender);
    return windowId ? this.getShellForPoolId(windowId) : null;
  }

  /** sender 是否任一壳渲染进程（IpcBridge 的 shell/pool 来源判定——原判定只认主壳，多窗下会把 ws-N 壳误判成池） */
  isShellWebContents(sender: WebContents): boolean {
    if (this.primaryShell && !this.primaryShell.isDestroyed() && this.primaryShell.webContents === sender) return true;
    for (const shell of this.workspaceShells.values()) {
      if (!shell.isDestroyed() && shell.webContents === sender) return true;
    }
    return false;
  }

  /** 全部存活壳窗——全局状态（config/contextKey/plugin:push）广播目标 */
  getAllShells(): BrowserWindow[] {
    const out: BrowserWindow[] = [];
    if (this.primaryShell && !this.primaryShell.isDestroyed()) out.push(this.primaryShell);
    for (const shell of this.workspaceShells.values()) {
      if (!shell.isDestroyed() && shell !== this.primaryShell) out.push(shell);
    }
    return out;
  }

  /** 壳 sender → 其壳标识（ws-N；首窗壳/非壳 sender 返回 null）——壳→池寻址归一的输入 */
  getWorkspaceIdByShellWebContents(wc: WebContents): string | null {
    for (const [id, shell] of this.workspaceShells) {
      if (!shell.isDestroyed() && shell.webContents === wc) return id;
    }
    return null;
  }

  /** workspace 壳窗（`ws-N`）——建池时取宿主用（未登记/已销毁 → null，调用方按失败处理） */
  getWorkspaceShell(wsWindowId: string): BrowserWindow | null {
    const shell = this.workspaceShells.get(wsWindowId);
    return shell && !shell.isDestroyed() ? shell : null;
  }

  /**
   * 壳发来的池定向寻址**归一**（壳内视角 → 主进程注册表 key）。
   * ws-N 壳送 'main'（或不带）⇒ 目标是**它自己的池** ws-N；送别的 id（它知道的脱出窗）原样放行。
   */
  resolvePoolKeyFromShellSender(sender: WebContents, payloadWindowId?: string): string {
    return poolKeyFromShell(this.getWorkspaceIdByShellWebContents(sender), payloadWindowId);
  }

  /* ── 最后活跃窗（E6#47f） ── */

  /** 壳上报本窗活跃工程——记录并落盘（上报即「这窗现在是活跃的」的最强信号） */
  setWindowWorkspaceFolder(windowId: string, folder: string | null): void {
    this.windowFolders.set(windowId, folder);
    this.persistLastActiveWindow(windowId);
  }

  /** 某个壳 sender 的窗 key——首窗壳返回 'main'（池注册表 key），workspace 壳返回 ws-N */
  resolveShellWindowKey(sender: WebContents): string | null {
    if (this.primaryShell && !this.primaryShell.isDestroyed() && this.primaryShell.webContents === sender) return 'main';
    return this.getWorkspaceIdByShellWebContents(sender);
  }

  /** 把指定窗记成「最后活跃窗」（无参数冷启动恢复它） */
  persistLastActiveWindow(windowId: string): void {
    try {
      writeWindowsState(this.hooks.userDataDir(), {
        lastActiveWindow: {
          workspaceFolder: this.windowFolders.get(windowId) ?? null,
          // 'main' = 首窗（隐式 ws-1）→ 恢复时用隐式 id（不带参数）
          wsWindowId: windowId === 'main' ? null : windowId,
        },
      });
    } catch { /* 落盘失败不影响运行（恢复是便利不是正确性） */ }
  }

  /** 退出清理——窗口已由 Electron 销毁，防跨重建残留引用 */
  dispose(): void {
    this.workspaceShells.clear();
    this.windowFolders.clear();
    this.primaryShell = null;
  }
}
