/**
 * installJobs——E6#73c 第 2 步：市场侧「安装 job」只读镜像（订阅壳侧 job 表广播）。
 *
 * 病根（18 档 §五 I.9）：此前市场侧唯一的闸是模块级单例 `_installSession`，命中即静默丢弃请求
 * ⇒ 连点 7 个 = 装 1 丢 6。第 1 步把静默丢弃换成可见「等待安装中」回执，但**仍是 N=1 串行**。
 * 本步起**闸没有了**：并发上限、FIFO 顺序、同插件去重、槽级看门狗全部由壳侧
 * [`install-queue.ts`](../../../../src/pluginLoader/lifecycle/install-queue.ts) 持有，
 * 市场只负责「把壳说的话画出来」。
 *
 * 为什么必须走广播（18 档 §五 I.6⑤）：插件禁止 import `@src/core`（插件通信铁律只认
 * `window.linkdesk.*`），读不到壳进程内存里的 job 表。壳因此开了一条公开事件面
 * `plugin:installJobs`（同族先例 `plugin:installProgress`），**载荷 = 全量快照 `{ jobs: InstallJob[] }`**
 * ——不做增量协议，消费方整表替换，无需合并逻辑、无需处理乱序。
 *
 * 通道名与载荷形状的**唯一权威登记处 = 18 档 §五 I.6⑤**（与 I.5.1 ② 同文）；本文件只是消费方，
 * 形状若变以那份文档为准。`InstallJob` 类型在此**本地声明**（照 `plugin:installProgress` 的
 * `InstallProgressPayload` 先例）——公开事件面的载荷类型不进 `@linkdesk/contracts`：那里登记的是
 * `window.linkdesk.*` API 面，事件通道走泛型 `events.on<T>()`，作者自declare 载荷类型。
 *
 * 铁律 19：`events.on` 是 IPC 通道——订阅走**引用计数**（≥1 消费方挂载才注册，归零即撤），
 * 绝不在模块顶层注册（模块级监听器 = 永不清理的僵尸回调）。
 *
 * E6#73i（F6）：引用计数保留，但**重挂不丢真相**——本通道的载荷是全量快照，池 preload
 * （`electron/preload-pool/events.ts`）对它做**会话级缓存 + 订阅时回放**。此前两个消费方
 * （详情标签页 / 探索侧栏区块）**同时**卸载（关详情页 + 折叠侧栏）会退订，中间广播无补发
 * ⇒ 视图重挂后镜像停在旧快照（徽标卡在「安装中」不再更新）。回放落地后重挂即拿最新整表。
 */

import { useState, useCallback, useEffect } from "react";
import { marketInstallStageLabel } from "./marketplaceShared";

const lk = () => window.linkdesk;

/** 通道名——权威规格在壳侧（`install-queue.ts` 的 `INSTALL_JOBS_EVENT`），此处是消费方对同一字符串的引用 */
const INSTALL_JOBS_EVENT = "plugin:installJobs";

/** 排队 / 在跑 / 已出结果 */
export type InstallJobState = "queued" | "running" | "settled";

/** 终态三类——`parked` = 已安装但缺依赖（**装上了但不可用，不是成功**） */
export type InstallJobTerminal = "success" | "failed" | "parked";

/** 池可达的 job 条目——形状 = 18 档 §五 I.6⑤（壳侧 `snapshot()` 的公共投影） */
export type InstallJob = {
  jobId: string;
  pluginId: string;
  /** 行 = 一次**用户动作**（user）；插件自己拖来的依赖（dependency）藏在那一行里 */
  origin: "user" | "dependency";
  displayName: string;
  state: InstallJobState;
  terminal?: InstallJobTerminal;
  error?: string;
  /** 当前阶段码（`validating` / `downloading` / `extracting` / `loading` …） */
  stage?: string;
  /** 下载段百分比 0-100（无 Content-Length 时缺省 ⇒ 不定态） */
  percent?: number;
  /** 阶段自带文案——**优先于靠 `stage` 派生的短语**（壳/主进程已解析成人类可读串） */
  message?: string;
};

type InstallJobsPayload = { jobs?: InstallJob[] };

/** 最新一次全量快照（事件即快照——整表替换，不做增量合并） */
let _jobs: readonly InstallJob[] = [];
const _listeners = new Set<() => void>();
let _sub: (() => void) | null = null;
let _subUsers = 0;

function ingest(payload: InstallJobsPayload): void {
  _jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  _listeners.forEach((fn) => fn());
}

function mountJobSub(): void {
  _subUsers += 1;
  if (_subUsers > 1 || _sub) return;
  _sub = lk()?.events?.on<InstallJobsPayload>(INSTALL_JOBS_EVENT, ingest) ?? null;
}

function unmountJobSub(): void {
  _subUsers -= 1;
  if (_subUsers > 0) return;
  _sub?.();
  _sub = null;
}

/** 订阅底座——`pick` 渲染期读当前值：notify → 重渲染 → 重读（两个 hook 共用一份通知集，不各造一套） */
function useInstallJobs<T>(pick: () => T): T {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    // E6#73i（F6）：**先挂监听、再订阅**——订阅那一刻的回放（池 preload 的会话级缓存）会同步触发
    // ingest → notify；此时监听器还没进表的话，回放把 _jobs 更新了却没人重渲染，界面仍是旧快照。
    _listeners.add(rerender);
    mountJobSub();
    return () => {
      unmountJobSub();
      _listeners.delete(rerender);
    };
  }, [rerender]);
  return pick();
}

/**
 * 本插件此刻**该显示哪一个 job**——优先级：在跑 > 排队 > 最新一条已出结果。
 *
 * 为什么按优先级挑而不是按 jobId 找：同一个插件在壳侧可以有**多条** job（失败一条已 settle、
 * 重试又开一条 running）——去重只对「未结算」的 job 生效，已出结果的不参与。
 * `_jobs` 保持壳侧快照序（壳的 Map 插入序）⇒ 反向遍历取到的第一条 settled 就是最新那条。
 */
export function pickInstallJob(pluginId: string | undefined): InstallJob | null {
  if (!pluginId) return null;
  let running: InstallJob | null = null;
  let queued: InstallJob | null = null;
  let settled: InstallJob | null = null;
  for (const job of _jobs) {
    if (job.pluginId !== pluginId) continue;
    if (job.state === "running") running = job;
    else if (job.state === "queued") queued = job;
    else settled = job;
  }
  return running ?? queued ?? settled;
}

/** 订阅本插件的 job（空 = 这个插件没有在跑/在等/已出结果的 job） */
export function useInstallJob(pluginId: string | undefined): InstallJob | null {
  return useInstallJobs(() => pickInstallJob(pluginId));
}

/**
 * 列表视图的订阅口——**只建立订阅与重渲染，不返回数据**（一屏几十行、每行 pluginId 不同，
 * 不可能每行调一个 hook：`renderRow` 是普通函数不是组件）。视图顶层调本 hook，行内用纯函数
 * `pickInstallJob(entry.id)` 现查同一份模块级快照。
 */
export function useInstallJobsSubscription(): void {
  useInstallJobs(() => undefined);
}

/**
 * job 行状态短语——`message`（壳/主进程解析过的整句）优先，否则由 `stage` + `percent` 派生。
 * 显示文本铁律：文字要么由壳侧 `t()` 解析过、要么是本视图自己 `t()` 派生，池哑渲染零自产。
 */
export function installJobLabel(t: (key: string, opts?: Record<string, unknown>) => string, job: InstallJob | null): string {
  if (job?.message) return job.message;
  return marketInstallStageLabel(t, job?.stage, job?.percent);
}
