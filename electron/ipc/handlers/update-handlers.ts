/**
 * 主软件更新 IPC 处理器——E6#57.8b（06-主软件更新 / 07-数据流通格式 §一 §四）。
 *
 * 本文件是**更新机制的装配处**：#57.4 的状态机 + #57.5/#57.6/#57.7 的三条腿在这里接成一个可用服务，
 * 再由 handler 面暴露给壳/池渲染进程。装配点选在 handler 层，是因为 `update-service.ts` 开头
 * 明写「本模块不构造单例」（服务层不该知道 IPC，也不该知道 main 的启动序）。
 *
 * 🔴 四条不出声的坑，各有一处防线：
 * ① **`initUpdateService()` 必须排在 `cleanupUpdateResidue()` 之后**——清理先按版本方向删掉失效
 *    安装器，复位再看盘上剩什么，两条结论才一致（#57.7a 判据 3）。这个顺序**只有 main 的启动序
 *    看得见**，所以读盘放在本文件、由 main 显式 await，见 `electron/main.ts` 的启动序注释。
 * ② **盘是异步读的，而 `resume` 是同步的**——`UpdateServiceDeps.resume: () => StartupResume | null`
 *    是同步闭包，`resolveStartupInstall()` 却要 await 读盘 ⇒ 先 await 出结果、再把**结果**装进
 *    闭包。顺序由 main 的 await 链锁死，插不了队。
 * ③ **取实例走 `requireService()` 抛错，不返回 null**——漏接线（少调一次 init）不许静默降级成
 *    「没有可安装的更新」：那正是 `UpdateServiceDeps.resume` 注释里明令禁止的「给未接线留兜底」。
 * ④ **`setCallbacks` 在 once-guard 之前**（对标 `serial-handlers.ts`）——回调内走
 *    `IpcBridge.active` 取最新实例，壳崩重建换 bridge 后无需重新初始化服务，只需重绑回调。
 */
import type { UpdateState, DownloadProgress } from '../../../src/core/types/ipc/update';
import { IPC } from '../channels.js';
import { IpcBridge } from '../ipc-bridge.js';
import { loggedHandle } from '../invoke-log.js';
import { UpdateService } from '../../services/update-service.js';
import { createUpdateProbe, isUpdateSourceConfigured } from '../../services/update-source.js';
import { createUpdateDownloader } from '../../services/update-download.js';
import { createUpdateInstaller, resolveStartupInstall } from '../../services/update-install.js';

/** 更新服务单例——装配一次（`initUpdateService`），壳崩重建复用（无状态 handler 只管转发） */
let service: UpdateService | null = null;

// E5.7#36：壳崩重建复用——IPC 通道只注册一次
let _registered = false;

/**
 * 装配更新服务——**由 main 在 `cleanupUpdateResidue()` 之后、`createWindow()` 之前 await 一次**。
 * 幂等：已装配则直接返回（壳崩重建路径会再次走到 createWindow，不该重造服务——重造会丢掉内存态）。
 */
export async function initUpdateService(): Promise<void> {
  if (service) return;

  // 启动复位：先读盘（等清理腿跑完，见文件头 ①），把结果装进同步闭包（②）。
  const resolution = await resolveStartupInstall();

  const instance = new UpdateService({
    isSourceConfigured: isUpdateSourceConfigured,
    probe: createUpdateProbe(),
    download: createUpdateDownloader(),
    install: createUpdateInstaller(),
    resume: () => resolution.resume,
  });

  // `init()` 内部先问 `resume`（跨重启的 `ready` 与更新源配没配无关），故必须在 init 之前装配好。
  instance.init();
  service = instance;
}

/** 取服务单例——未装配即抛（③：漏接线要炸在启动时，不许静默降级） */
function requireService(): UpdateService {
  if (!service) {
    throw new Error(
      '[update-handlers] 更新服务未装配——initUpdateService() 必须排在 cleanupUpdateResidue() 之后、createWindow() 之前（见 electron/main.ts 启动序）',
    );
  }
  return service;
}

/**
 * 注册 `update.*` 命令处理器。
 *
 * **命令四条**（07 §4.1 错误语义逐条对齐）：
 * - `getState`：永不抛（服务必然有态）
 * - `checkForUpdates` / `downloadUpdate`：网络/校验错落**态内** `lastError`，不抛（服务层已收口）
 * - `quitAndInstall`：**抛**（无安装器/校验失败）——`loggedHandle` 记日志后原样 rethrow
 *
 * ⚠️ `update.getReleaseNotes`（#57.8e）**本格不注册**：它要主进程出网 + 落 `{userData}` 缓存 +
 * 24h 过期，是独立一块（消费方 #57.13b 也在后面）。通道常量已在 `channels.ts` 就位，
 * **不注册空壳**——注册了却没有实现 = 死代码 + 一条到不了的通道。
 */
export function registerUpdateHandlers(): void {
  // ④ 回调必须在 guard 之前（每次调用重绑最新 IpcBridge 实例）
  requireService().setCallbacks({
    // 状态迁移逐条广播（07 §4.2：payload = UpdateState 全量）。storeForReplay 取默认 true——
    // 它是低频的「当前真相」，新起的池重放能直接拿到最新态（薄壳首帧另有 getState 兜底，07 §4.4）。
    onStateChanged: (state: UpdateState) => {
      IpcBridge.active?.broadcast(IPC.update.stateChanged, state, 'shell');
    },
    // 下载进度节流已在服务层（PROGRESS_THROTTLE_MS）——这里只负责出口。
    // ⚠️ storeForReplay **必须 false**：进度是瞬时量，重放一个已过期的 50% 给新窗口 = 假进度。
    onProgress: (progress: DownloadProgress) => {
      IpcBridge.active?.broadcast(IPC.update.progress, progress, 'shell', false);
    },
  });

  if (_registered) return;
  _registered = true;

  loggedHandle(IPC.update.getState, () => requireService().getState());

  // `context` 严格收窄到 `=== true`：渲染侧传来任何非布尔值一律按「后台检查」处理（fail-safe 方向
  // 选保守那一侧——误判成后台不会替用户做任何决定）。
  loggedHandle(IPC.update.checkForUpdates, (_event, context: unknown) =>
    requireService().checkForUpdates(context === true));

  loggedHandle(IPC.update.downloadUpdate, () => requireService().downloadUpdate());

  loggedHandle(IPC.update.quitAndInstall, () => requireService().quitAndInstall());
}
