/**
 * 主软件更新服务——E6#57.4（设计：[06-主软件更新/01-更新机制设计.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/01-更新机制设计.md)
 * §2.1-§2.5 + [07-数据流通格式.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/07-数据流通格式.md) §四）。
 *
 * 职责 = **状态机**（九态判别联合 + 每次迁移广播）+ **检查触发命令化**（手动/后台同源入口）。
 * 三条腿**不在本模块**，由构造注入（各格实现）：
 *   - `probe`  检查腿（#57.5）：读 product.json.updateUrl → main-fetch 拉 Releases → compareVersions
 *              比对 → 归六类错误之一。**必须自行分类返回 error 结果，不许抛**（抛出 = 契约违反，见 runCheck）。
 *   - `download` 下载腿（#57.6）：流式下载 + sha256 校验 + 残留清理 → 落 `{userData}/update/`。
 *   - `install`  安装腿（#57.7）：relaunch / spawn 编排 → 进程退出。
 * 三条腿**都是必填**——没有「未接线」的静默兜底分支（默认实现 = 用户点「立即更新」什么都没有发生）。
 * 本模块不构造单例：真实三条腿在 #57.6/#57.7 落地后由 #57.8 的 handler 装配。
 *
 * 🔴 **记账铁律（#57.4b 判据子项）**：「手动 / 后台」之分**只影响出不出声，不影响记不记账**——
 * 两条路都照常把失败写进 `idle.lastError`。出声与否由**发起方（壳）**决定（07 §4.3「手动时：通知面条目…」），
 * 壳自己知道传的是 true 还是 false，不需要从态里反推。反过来做（后台静默 ⇒ 不记账）=
 * 「只有一次机会 + 失败不出声」复发：自动检查悄悄失败，用户永远不知道更新为什么没来。
 *
 * 对标 `serial-service.ts` 的主进程服务先例：回调注入（`setCallbacks`）、推送走 IpcBridge.broadcast。
 */

import type {
  DownloadProgress, UpdateError, UpdateInfo, UpdateState,
} from '../../src/core/types/ipc/update';

/** 进度广播节流窗口（#57.6a 的「节流 ≤500ms」由本模块统一持有——广播面归状态机） */
const PROGRESS_THROTTLE_MS = 500;

/** 检查腿结果——**已分类**，不含「未知错误」这一档 */
export type UpdateProbeResult =
  | { kind: 'available'; update: UpdateInfo }
  | { kind: 'up-to-date' }
  | { kind: 'error'; error: UpdateError };

/**
 * 腿失败的结构化载体——腿**抛**本错误（错误码 + 文案），服务落进 `idle.lastError`。
 * 抛别的东西 = 腿自己出了 bug（契约违反）⇒ 不吞、不发假错误码（见 downloadUpdate / quitAndInstall）。
 */
export class UpdateLegError extends Error {
  readonly detail: UpdateError;
  constructor(detail: UpdateError) {
    super(detail.message);
    this.name = 'UpdateLegError';
    this.detail = detail;
  }
}

/**
 * 下载腿（#57.6）——成功返回本地安装器路径；失败抛 `UpdateLegError`。
 *
 * `warning` = **降级放行的记账**（如 `checksum-unavailable`：未附校验值，照常安装但要记一笔）。
 * 🔴 它是「成了，但有一件发布侧该知道的事」，与「没成」（`UpdateLegError` → `idle.lastError`）
 * 是两条不同的路——**不许把它塞进失败那条路**（那会让用户看到一次并不存在的失败）。
 */
export type DownloadLeg = (
  update: UpdateInfo,
  onProgress: (progress: DownloadProgress) => void,
) => Promise<{ installerPath: string; warning?: UpdateError }>;

/**
 * 安装腿（#57.7）——成功即进程退出（本函数不返回）；失败抛 `UpdateLegError`。
 *
 * `warning` = 从 `downloaded`/`ready` 传下来的降级放行记账。**为什么腿要拿到它**：07 §三 规定它
 * `downloaded → ready` 一路传递，而安装这一步是**进程退出前的最后一站**——不在这里落进记录（#57.7a
 * 的 `PendingInstallRecord`），这笔账就随内存态一起没了：#57.6 拍板要它「不许在最短路径上丢」，
 * 最短路径正是「下载完 → 直接点重启并更新」（全程不经过 `idle`）。
 */
export type InstallLeg = (update: UpdateInfo, installerPath: string, warning?: UpdateError) => Promise<void>;

/**
 * 启动复位结果（#57.7a）——`UpdateServiceDeps.resume` 的返回体。
 * `null` = 没有待续安装（含「记录脏」「上次已经装成了」）⇒ 按 `disabled`/`idle` 正常初始化。
 */
export interface StartupResume {
  /** 强制落这个态（当前唯一生产者 = 跨重启的 `ready`：装到一半重启，安装器还在） */
  state: UpdateState;
  /** 一并还原安装器路径——没有它，`quitAndInstall` 会判「当前没有已下载的更新可安装」 */
  installerPath?: string;
}

export interface UpdateServiceDeps {
  /** 更新源是否已配置（`product.json.updateUrl` 非空）——#57.5a 实现；否 ⇒ `disabled` 态 */
  isSourceConfigured: () => boolean;
  /** 检查腿（#57.5）——`context` = 本次是否用户主动（透传给腿，服务不据此做状态决策） */
  probe: (context: boolean) => Promise<UpdateProbeResult>;
  /** 下载腿（#57.6） */
  download: DownloadLeg;
  /** 安装腿（#57.7） */
  install: InstallLeg;
  /**
   * 启动复位（#57.7a）——`init()` 调用一次，把**跨重启的待续安装**还原进内存态
   * （生产者 = `update-install.ts` 的 `resolveStartupInstall`，装配在 #57.8）。
   *
   * 🔴 **必填，不许可选**：跨重启复位是「重启安装」的正常路径（用户在装到一半的重启后
   * 再点一次「重启并更新」），漏接它不会报任何错——只会静默退回「没有可安装的更新」。
   * 可选参数 = 给「未接线」留一个不出声的兜底，正是本模块开头明令禁止的东西。
   * 注入一个值（而不是让本模块读盘）是因为**读盘要排在 `cleanupUpdateResidue()` 之后**，
   * 那个顺序只有装配处（main 启动序）看得见。
   */
  resume: () => StartupResume | null;
}

/** 推送回调注入（对标 serial-service.setCallbacks）——壳/池广播出口，未注入则只更状态不广播 */
export interface UpdateServiceCallbacks {
  /** 每次状态迁移一条（07 §4.2，payload = UpdateState 全量） */
  onStateChanged?: (state: UpdateState) => void;
  /** 下载中进度（节流 ≤500ms，payload = DownloadProgress） */
  onProgress?: (progress: DownloadProgress) => void;
}

export class UpdateService {
  private state: UpdateState = { type: 'uninitialized' };
  private callbacks: UpdateServiceCallbacks = {};
  /** 已下载安装器路径（`downloaded` 起持有——`quitAndInstall` 消费） */
  private installerPath: string | null = null;
  private lastProgressEmit = 0;

  constructor(private readonly deps: UpdateServiceDeps) {}

  /**
   * 注入推送回调——**覆盖式**（对标 serial-service.setCallbacks：换 IpcBridge 实例时重绑最新，
   * 不是累加）。可在任何时刻调用。
   */
  setCallbacks(callbacks: UpdateServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 初始化：`uninitialized` → `disabled`（更新源不可用）/ `idle`。**幂等**——已离开 `uninitialized` 则不动。
   * 装配期调用一次；照常走 `transition`（装配时回调多为空 = 广播自然丢弃，壳首帧另有 `getState()` 兜底，07 §4.4）。
   */
  init(): UpdateState {
    if (this.state.type !== 'uninitialized') return this.state;
    // 启动复位**先于** disabled/idle：跨重启的 `ready`（装到一半重启、安装器还在盘上）与更新源
    // 配没配无关——盘上那份安装器不需要网络也装得了，把它丢给 `disabled` 就是把用户已经下好的更新作废。
    const resumed = this.deps.resume();
    if (resumed) {
      if (resumed.installerPath) this.installerPath = resumed.installerPath;
      return this.transition(resumed.state);
    }
    return this.deps.isSourceConfigured()
      ? this.transition({ type: 'idle' })
      : this.transition({ type: 'disabled', reason: 'update-source-unconfigured' });
  }

  getState(): UpdateState {
    return this.state;
  }

  /**
   * 检查更新——**手动（`context: true`）与后台（`context: false`）同源入口**（#57.4b）。
   *
   * 返回检查触发后的新态；网络错**不抛**（落态内 `lastError`，07 §4.1）。忙态（`checking`/`downloading`/
   * `updating`）与 `disabled` 直接返回当前态——不打断正在跑的动作。
   *
   * ⚠️ `context` 本身不参与状态机决策（两条路记账一致，见文件头铁律）；它原样透传给检查腿
   * （#57.5 可据「用户主动」决定自己的取数策略），出声由发起方决定。下周期重试的调度在 #57.9d（壳侧）。
   *
   * 🔴 **`downloaded`/`ready` 也进「不查」那一档**（E6#57.12g，2026-09-12）：这两个态的含义是
   * **「安装器已经在盘上等着装」**，而检查腿比对的是 `latest > current` —— 已下好的那个版本**必然**
   * 还大于当前版本 ⇒ 一查就判「有更新」⇒ `available`。后果两头都错：
   *   ① **界面说错话**——TitleBar 从「重新启动」退回「下载更新」，而包早就下完了（用户会以为白下了）；
   *   ② **反复打扰**——每 4h 后台一查就重新走一遍 `available`，通知面再出一次「有可用更新」
   *      （去重只对**点过 ✕** 的条目生效，没点过的照弹）。
   * 语义上这是**不该发生的状态倒退**：检查的职责是「发现有没有新版本」，而这两个态已经是
   * 「发现了、下好了、只差装上」——再问一次不会得到新信息。
   * ⚠️ **`available` 不在此列**（仍照常检查）：用户可能把它晾着，此时若有更新的版本发布，
   *   重新发现是对的。（已知副作用：`checking` 那一段 TitleBar 按钮会短暂消失再回来——这是
   *   **既有行为**，与本次改动无关。）
   */
  async checkForUpdates(context: boolean): Promise<UpdateState> {
    if (
      this.state.type === 'checking' || this.state.type === 'downloading' || this.state.type === 'updating'
      || this.state.type === 'downloaded' || this.state.type === 'ready'
    ) {
      return this.state;
    }
    if (this.state.type === 'disabled' || this.state.type === 'uninitialized') return this.state;

    this.transition({ type: 'checking' });

    let result: UpdateProbeResult;
    try {
      result = await this.deps.probe(context);
    } catch (err) {
      // 检查腿契约违反（应自行分类返回 error 结果）——不吞、不编错误码：态先回 idle
      // （否则状态机卡在「检查中」转圈到永远 = 无出口 + 假进度），再把真 bug 抛出去。
      this.transition({ type: 'idle' });
      throw err;
    }

    if (result.kind === 'available') return this.transition({ type: 'available', update: result.update });
    if (result.kind === 'up-to-date') return this.transition({ type: 'idle' });
    // 🔴 失败也照常记账（两条路一致）；「出声」不在这层
    return this.fail(result.error);
  }

  /**
   * 开始下载——`available` 态专用。进度走 `onProgress`（节流），完成落 `downloaded`。
   * 失败（校验不符/落盘失败/中断/取消）→ `idle` + `lastError`（下载腿抛 `UpdateLegError` 承载错误码）；
   * **成功但有话要说**（降级放行）→ `downloaded.warning`（见 `DownloadLeg.warning`，两条路不许混）。
   *
   * 进度播报节流在**本模块**（`PROGRESS_THROTTLE_MS`）——下载腿只管逐块回调，不关心广播频率。
   */
  async downloadUpdate(): Promise<UpdateState> {
    if (this.state.type !== 'available') {
      // 重入/误触（例如用户在后台检查刚把态打回 idle 的那一瞬点了「立即更新」）——
      // 不静默吞（点了「立即更新」却什么都没有发生 = 最难查的一类）。错误码取 `canceled`
      // （语义 = 该请求没有产生下载），**不新造码**：错误码全集由 07 §三 固定。
      return this.fail({ code: 'canceled', message: '当前没有可下载的更新' });
    }
    const update = this.state.update;
    this.lastProgressEmit = 0;
    this.transition({ type: 'downloading', update, progress: { transferred: 0, total: update.size ?? 0, percent: 0 } });

    let done: { installerPath: string; warning?: UpdateError };
    try {
      done = await this.deps.download(update, (progress) => this.reportProgress(progress));
    } catch (err) {
      if (err instanceof UpdateLegError) return this.fail(err.detail);
      this.transition({ type: 'idle' });
      throw err;
    }

    this.installerPath = done.installerPath;
    // 🔴 降级放行的账**随成功态走**（`warning`），不是 `lastError`：用户直接点「重启并更新」时
    // 根本不经过 `idle`，塞进 `idle.lastError` 会在那条最短路径上把账丢掉（2026-09-12 拍板选 (a)）。
    return this.transition(done.warning
      ? { type: 'downloaded', update, warning: done.warning }
      : { type: 'downloaded', update });
  }

  /**
   * 重启并安装——`downloaded` / `ready` 态专用。先落 `updating` 并**广播出去**再动手
   * （Windows 文件锁：旧进程没退干净时 NSIS 覆盖不了 LinkDesk.exe，01 §2.5）——状态必须比退出早一步到。
   *
   * 安装腿正常路径**不返回**（进程退出）。返回/抛出 = 安装失败 ⇒ 回 `idle` + `lastError` 后**重抛**
   * （07 §4.1：本命令错误语义 = 抛错，与检查/下载两条「态内记账」不同）。
   */
  async quitAndInstall(): Promise<void> {
    const state = this.state;
    if ((state.type !== 'downloaded' && state.type !== 'ready') || !this.installerPath) {
      throw new UpdateLegError({ code: 'canceled', message: '当前没有已下载的更新可安装' });
    }
    const update = state.update;
    this.transition({ type: 'updating', update });
    try {
      // `warning` 一并交给腿（07 §三：它要从 `downloaded`/`ready` 传下去）——退出前不落进记录就没了，
      // 而这条正是「下载完直接点更新」的最短路径（全程不经过 `idle`，塞 `idle.lastError` 也捡不回来）。
      await this.deps.install(update, this.installerPath, state.warning);
    } catch (err) {
      // 安装失败：态**不许停在 `updating`**（进程还在跑却自称「正在装」= 假状态 + 无出口）。
      // 回 `idle` 且**保留 update**（安装器还在盘上，用户能再试）。
      // ⚠️ 只有安装腿自己带了结构化错误才落 `lastError` 记账；别的抛出一律原样重抛——
      //    **不拿一个不相关的错误码去搪塞**（错误码全集由 07 §三 固定，其中没有「安装失败」这一档）。
      this.transition(err instanceof UpdateLegError
        ? { type: 'idle', update, lastError: err.detail }
        : { type: 'idle', update });
      throw err;
    }
    // 走到这里 = 安装腿返回了却没让进程退出。契约违反（成功路径的唯一出口是进程消失）——
    // 态回 idle 后重抛，**不编错误码**：进程还在跑却以为自己在装，本身就是 bug，不该伪装成一次失败。
    this.transition({ type: 'idle', update });
    throw new Error('update-service: 安装腿返回但进程未退出（契约违反，见 electron/services/update-service.ts）');
  }

  // ── 内部 ──

  /** 状态迁移的**唯一出口** + 广播（#57.4c：每次迁移一条 stateChanged，payload = UpdateState 全量） */
  private transition(next: UpdateState): UpdateState {
    this.state = next;
    this.callbacks.onStateChanged?.(next);
    return next;
  }

  /** 失败落账——回 `idle` + `lastError`（`lastError` 不跨态残留：每次迁移都换新对象，账随新态走） */
  private fail(error: UpdateError): UpdateState {
    return this.transition({ type: 'idle', lastError: error });
  }

  /** 进度上报：状态内实时更新（`getState()` 拿到的是新鲜的），广播按窗口节流（末帧必发） */
  private reportProgress(progress: DownloadProgress): void {
    if (this.state.type !== 'downloading') return;
    this.state = { ...this.state, progress };
    const now = Date.now();
    if (progress.percent < 100 && now - this.lastProgressEmit < PROGRESS_THROTTLE_MS) return;
    this.lastProgressEmit = now;
    this.callbacks.onProgress?.(progress);
  }
}
