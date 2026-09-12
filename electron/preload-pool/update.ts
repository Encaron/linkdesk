/**
 * Pool preload 更新域——update 命名空间（E6#57.8）。
 *
 * **只读一法**：`getState` 直连主进程 handler（`electron/ipc/handlers/update-handlers.ts`
 * 自己 `ipcMain.handle` 的那条通道）。🔴 **不进 `PROXY_CHANNELS`**——PROXY 那套会给每个通道
 * 再挂一个 `ipcMain.handle`，同一通道注册两次会在启动时抛
 * `Attempted to register a second handler`。池 preload 直达主进程 handler 是既成事实
 * （同款先例：`app` 域也只走主进程直答，不在 PROXY 里）。
 *
 * 写命令（检查 / 下载 / 重启安装）**不在此面**——第三方插件不得触发（07 §一：重启安装会关掉
 * 用户正在用的软件，不是插件能替用户决定的事）。这条约束的落点是**类型**不是文档：池 preload
 * 只注入本面 ⇒ 插件侧根本没有写命令的入口（`satisfies PoolExposed` 编译期即门禁）。
 * 壳侧那半由 `preload-shell.ts` 的 `buildShellUpdate()` **超额暴露**。
 *
 * 依赖方向：update → electron/ipc（channels）；无反向。
 */
import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

/** update 命名空间——主软件更新只读态。返回不标注：`ipcRenderer.invoke` 推断 `Promise<any>`，
 *  assignable 到契约面（`satisfies PoolExposed` 门禁），与 `settings.ts` 同款。 */
export function buildUpdate() {
  return {
    /** 读当前状态机全量态（07 §4.1：永不抛——服务必然有态） */
    getState: () => ipcRenderer.invoke(IPC.update.getState),
  };
}
