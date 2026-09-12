/**
 * 壳侧更新状态 hook——E6#57.9c（06-主软件更新 / 07-数据流通格式 §五）。
 *
 * `useUpdateState(): UpdateState`——壳组件读状态机全量态（通知面 #57.12 / 关于页 #57.14 /
 * TitleBar 按钮与「检查更新」入口 #57.10-#57.11 的共同数据源）。
 * `useUpdateProgress(): DownloadProgress | null`——**同一份数据的另一个视图**（E6#57.12 加）：
 * 进度不随 `stateChanged` 走（服务原地刷状态、只在迁移时广播），必须另走 `update:progress` 通道。
 * 两者共用同一份模块单例与同一个引用计数。
 *
 * ## 三条设计约束，各对应一处实现
 *
 * ① **引用计数，不做模块级监听**（硬约束 19）——`ipcRenderer.on` / `events.on` 的注册必须在
 *    mount 时发生、unmount 时拆掉，否则壳组件卸载后回调变僵尸。多个消费者（面板 + 关于页 + 调度器）
 *    共享**同一份** IPC 订阅：第 1 个消费者到来时挂上，最后一个走时拆掉（`_refCount`）。
 *    对标 `src/core/services/plugins/IpcBridgeHandler.ts` 的 `_refCount` 先例。
 *
 * ② **订阅先于拉初值**（硬约束 20 的渲染侧对应体）——壳 preload 的 `createEventSystem` **没有**
 *    缓冲/回放包装（只有 `preload-pool/events.ts` 有 `_replayCache`）⇒ mount 与 `getState()` 返回
 *    之间发生的迁移**只能靠订阅捕获**。所以 `_start()` 里先 `onStateChanged` 再 `invoke(getState)`。
 *    反过来写 = 那段窗口里的迁移永久丢失，UI 停在旧态直到下一次迁移（07 §4.4 薄壳首帧兜底）。
 *
 * ③ **竞态取舍：广播不回头**（②的配套）——若 `getState()` 的结果回来时**已经**收到过广播，就
 *    丢掉那份快照。理由：广播是**迁移通知**（必然发生在订阅之后），而 `getState()` 是**异步快照**
 *    （发出时刻在订阅之前）。两者谁新谁旧在无版本号时不可判定，但"用旧快照盖掉新迁移"会**永久
 *    停在错态**（直到下次迁移），而"丢掉快照"最坏只是错过一次（下次迁移或重挂载即纠正）——
 *    取不可逆性小的那一侧。
 *
 * 初值 `{ type: 'uninitialized' }` = 状态机自身的起点（07 §五 的 hook 规范），**不是**假装"已就绪"：
 * 消费方据此渲染骨架，避免把"还没拉到"画成"当前已是最新版本"。
 *
 * ⚠️ **本 hook 不区分手动/后台检查**——`UpdateService` 把两条路的记账做得完全一致（服务文件头铁律），
 * 而 `context` 只透传给检查腿（`update-source.ts:103` 实测**不分支**）⇒ 后台检查失败与手动检查失败
 * 在广播里的形状**一模一样**。「后台失败要不要出声」缺**数据路径**，已登记在 #57.12（它才是出声方）。
 */
import { useEffect, useState } from "react";
import type { ShellExposed } from "../core/api/linkdesk-api/surfaces";
import type { DownloadProgress, UpdateState } from "../core/types/ipc/update";

/**
 * 壳侧私有更新面取用点——**全仓唯一的转型处**。
 *
 * `window.linkdesk` 的静态类型是插件契约 `LinkDeskAPI`（其 `update` 面**只有 `getState`**——
 * 「第三方只读」这条约束的落点是类型，见 `src/core/api/linkdesk-api/update.ts` 的 🔴 段）。
 * 壳要用的写命令与事件订阅属**超额暴露**，其声明在 `ShellExposed["update"]`
 * （`src/core/api/linkdesk-api/surfaces.ts`），由 `preload-shell.ts` 的 `satisfies` 用 tsc 兜住。
 * 这里把运行时的超额暴露收窄回那份声明类型 ⇒ 消费方零 `any`、零第二处转型。
 *
 * 非壳环境（vitest 无 preload / 预览页）返回 `undefined`，调用方各自决定怎么退化。
 */
export function getShellUpdateApi(): ShellExposed["update"] | undefined {
  return window.linkdesk?.update as ShellExposed["update"] | undefined;
}

// ── 模块级单例（壳渲染进程内唯一一份；跟随消费者引用计数存活）──
type Listener = (state: UpdateState) => void;
type ProgressListener = (progress: DownloadProgress | null) => void;

const _listeners = new Set<Listener>();
const _progressListeners = new Set<ProgressListener>();
let _state: UpdateState = { type: "uninitialized" };
/** 当前进度——`null` = **不在下载中**（见 `_publishProgress` 的生命周期规则） */
let _progress: DownloadProgress | null = null;
let _refCount = 0;
let _unsubscribeIpc: (() => void) | null = null;
let _unsubscribeProgressIpc: (() => void) | null = null;
/** 本次订阅周期内是否已收到过广播——决定 `getState()` 的快照还要不要采用（约束 ③） */
let _heardBroadcast = false;

/** 进度广播出口——`null` 也发（消费方靠它把进度条收掉），但同值不重发（`null` 连发是常态） */
function _publishProgress(next: DownloadProgress | null): void {
  if (_progress === next) return;
  _progress = next;
  for (const listener of _progressListeners) listener(next);
}

/**
 * 状态迁移出口。**进度与态的生死绑在一起**（这一步是「42% 挂住」这类 bug 的唯一防线）：
 * 只要新态不是 `downloading`，进度立刻归 `null`——否则下载结束（或失败回 `idle`）后，
 * 最后那一帧进度会留在模块单例里，下一个消费者进来就读到一个**不存在的下载进度**。
 */
function _publish(next: UpdateState): void {
  _state = next;
  for (const listener of _listeners) listener(next);
  // 迁移时状态里带的是**已知最新**进度（服务在 reportProgress 里原地刷过）：进 downloading 用它垫底，
  // 出来就清空。两条通道由此对齐——态是骨架，进度通道只负责在两次迁移之间**推进**它。
  _publishProgress(next.type === "downloading" ? next.progress : null);
}

function _start(): void {
  const api = getShellUpdateApi();
  if (!api) return; // 非壳环境：停在 uninitialized，不抛（消费方按「未知」渲染）
  _heardBroadcast = false;
  // ② 顺序不能反：先挂订阅，再拉初值
  _unsubscribeIpc = api.onStateChanged((next) => {
    _heardBroadcast = true;
    _publish(next);
  });
  // 进度是**独立通道**（迁移不发进度、进度不改态，见 surfaces.ts 的 onProgress 段）。
  // ⚠️ 它没有重放：订阅前发生的那几帧补不回来——初值由下面的 `getState()` 快照垫
  //    （`downloading.progress` 是被原地刷新的最新值），这里只接后续推进。
  _unsubscribeProgressIpc = api.onProgress((progress) => _publishProgress(progress));
  void api
    .getState()
    .then((initial) => {
      if (!_heardBroadcast) _publish(initial); // ③ 广播已到 ⇒ 快照更旧，丢掉
    })
    .catch((err: unknown) => {
      // 契约面「永不抛」（07 §4.1），但这句 promise 走的是 IPC 本身——通道未注册 / 主进程未装配时
      // 会 reject。不许静默（「状态一直是未初始化」最难查），也不许抛进 React 树。
      console.error("[useUpdateState] 拉取更新状态失败：", err);
    });
}

function _stop(): void {
  _unsubscribeIpc?.();
  _unsubscribeIpc = null;
  _unsubscribeProgressIpc?.();
  _unsubscribeProgressIpc = null;
}

/**
 * 引用计数获取——第 1 个消费者挂订阅，最后一个走时拆（返回释放函数，幂等）。
 * 两个 hook（态 / 进度）**共用同一个计数与同一条 IPC 订阅周期**：它们是同一份数据的两个视图，
 * 拆成两份计数只会多两处需要同步的启停。
 */
function acquire(listener: Listener | null, progressListener: ProgressListener | null): () => void {
  if (listener) _listeners.add(listener);
  if (progressListener) _progressListeners.add(progressListener);
  _refCount += 1;
  if (_refCount === 1) _start();
  let released = false;
  return () => {
    if (released) return; // 幂等：StrictMode 下 cleanup 可能被重复触发
    released = true;
    if (listener) _listeners.delete(listener);
    if (progressListener) _progressListeners.delete(progressListener);
    _refCount -= 1;
    if (_refCount === 0) _stop();
  };
}

/** 读状态机全量态。多个消费者共享一份订阅（引用计数）；全部卸载时拆订阅。 */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>(_state); // 重挂载时直接吃已有态，不闪回 uninitialized

  useEffect(() => {
    // 订阅期间可能已有更新（模块级 _state 领先于本次 render）——先同步一次再挂，避免渲染旧值。
    setState(_state);
    return acquire(setState, null);
  }, []);

  return state;
}

/**
 * 读下载进度（E6#57.12）——`null` = **当前不在下载中**。
 *
 * 🔴 为什么不能只靠 `useUpdateState()`：`UpdateService.reportProgress` 把进度**原地**写进
 * `this.state` 却**不发 `stateChanged`**（那条广播按设计只在迁移时发一次）⇒ 渲染侧的
 * `downloading` 态永远停在 0%，进度条一路不动直到跳成完成。本 hook 走 `update:progress` 通道。
 *
 * 生命周期：进 `downloading` 时有值（初值取自那一次迁移带的进度），离开 `downloading` 立刻
 * 回 `null`（`_publish` 里清）⇒ **消费方不需要自己判 `state.type`**，「下载完了进度还挂在 42%」
 * 从结构上不可能发生。
 *
 * ⚠️ 它是**瞬时量**，不是可复现的真相：晚挂载的消费者拿不到已经过去的那几帧（通道无重放），
 * 只会从快照垫的底开始接后续推进——百分比因此可能一次跳一截，这是有意的（重放过期百分比 = 假进度）。
 */
export function useUpdateProgress(): DownloadProgress | null {
  const [progress, setProgress] = useState<DownloadProgress | null>(_progress);

  useEffect(() => {
    setProgress(_progress);
    return acquire(null, setProgress);
  }, []);

  return progress;
}
