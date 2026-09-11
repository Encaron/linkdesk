/**
 * installFlow — 市场侧**安装 / 更新 / 重试**的发起与终局回执。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：notifications / pluginsStore / catalogStore / installGate → 本文件。
 * 本文件不 import 命令注册（commands 是它的下游）。
 */

// E6#71k「都问」：重试也要过确认门——门位在本模块 retryMarketInstall（三入口单点），"不 import 门" 无从豁免
import { confirmMarketInstallById } from "../installGate";
import { pluginDisplayNameOf } from "./catalogStore";
import { scheduleDataRefresh } from "./pluginsStore";
import { settleInstallFailure } from "./notifications";

const lk = () => window.linkdesk;

const pm = () => window.linkdesk?.pluginManager;

/* ═══ E6#73c 第 2 步（18 档 §五 I.7）：并发闸交给壳，本模块只剩「发起 + 终局回执」 ═══
 *
 * 🔴 **已拆的两样东西**（第 1 步的过渡态，本步整段退役）：
 *   ① `_installSession` 模块级单例——它是今天唯一的 N=1 闸，命中即静默丢弃请求（连点 7 个 = 装 1 丢 6）；
 *   ② `_installQueue` 串行泵——第 1 步用它把「静默丢弃」换成「可见等待」，但同一时刻仍只跑一单。
 *   现在并发上限（N=3）、FIFO 顺序、同插件去重、槽级看门狗**全部归壳侧 `install-queue.ts`**——
 *   本模块不再持有任何队列状态，也不再订阅 `plugin:installProgress`（进度经 `plugin:installJobs`
 *   的 job 行表达，见 `installJobs.ts`）。
 *
 * 本模块对安装还剩两件事：
 *   a. **发起**——`startMarketInstall` 直呼 `installWithProgress`（壳侧 `installPlugin` 全队列唯一入口）；
 *   b. **终局回执**——失败时推一条带 [重试] 的 toast（成功由 lifecycle 消费端唯一发声，见 73h D2）。
 *
 * ⚠️ 本模块**不画进度**（73d 起 job 行是进度的唯一出处）——同一面板里再挂一条自己的进度条
 * = 同一次安装两行，用户看到的是「装了两遍」。故也不需要 NotificationHandle 句柄管理。 ═══ */

/**
 * 单次安装——**直呼** `installWithProgress(downloadUrl, 身份)`，本模块不排队、不限流、不去重。
 *
 * 并发上限（N=3）、FIFO 顺序、同插件去重、排队回执、槽级看门狗全在壳侧 `installPlugin`
 * （全队列唯一入口，两条腿——包源/目录源——同一条队列）。池侧读到的进度/排队态经
 * `plugin:installJobs` 广播回流（见 `installJobs.ts`）。
 *
 * 成功 → 显式 refreshData（30.5e 实机回归：缺依赖的挂起安装 parkForDependencies 后不发任何 lifecycle
 * 事件——onDidInstall 只在成功激活发，挂起不入——事件驱动翻态对 pending 失效；
 * 显式 refresh 统一覆盖 enabled/pending，与事件驱动刷新 microtask 合并幂等）。
 * `installWithProgress` 不 throw（失败 resolve `{success:false, error}`，lifecycle-ops 实证）——
 * 仍留 catch：极端下壳面 reject 也要有终局，不能让调用方的按钮永远转圈。
 */
async function runMarketInstall(pluginId: string, name: string, downloadUrl: string): Promise<boolean> {
  const inst = lk()?.pluginManager?.installWithProgress;
  if (!inst) return false;
  try {
    // E6#73c 第 1 步：请求侧身份随行——壳侧 job 表按 pluginId 去重、job 行取显示名，而两者只有池侧知道
    // （第三个参数见 types.ts PluginInstallRequestOpts；jobId 不在此——它是壳侧 job 表的产物）。
    const r = await inst(downloadUrl, { pluginId, displayName: name, origin: "user" });
    // E6#73d：用户点「取消安装」——**不是失败**。壳侧已把那条 job 整条撤掉（不留红行），本模块也绝不走
    // settleInstallFailure（那会推一条带 [重试] 的错误 toast：用户刚亲口说不要，再问一遍要不要重试
    // = 拿他的决定去烦他）。
    if (r?.cancelled) return false;
    if (r && !r.success) return settleInstallFailure(pluginId, downloadUrl, r.error ?? "");
    scheduleDataRefresh();
    return true;
  } catch (e) {
    return settleInstallFailure(pluginId, downloadUrl, e instanceof Error ? e.message : String(e));
  }
}

/**
 * 在途安装登记——`pluginId → 本单 promise`。**这不是队列**：并发全开（上限在壳），这里只做一件事——
 * 保证「同一个插件的同一次安装只有一个 promise、只走一次终局回执」。
 *
 * 为什么壳侧已按 pluginId 去重了、这里还要一道：两份调用方各自 `await installWithProgress` 会拿到
 * **同一个结果对象**（壳侧去重命中的第二方 `waitInstallJob` 等第一方）⇒ 失败时**两条一模一样的
 * 失败 toast**。壳管的是「装几次」，这里管的是「报几次」。
 */
const _openInstalls = new Map<string, Promise<boolean>>();

/**
 * 发起市场安装——直呼壳侧安装入口，返回**本单**结果。无队列、无 N=1 闸（E6#73c 第 2 步）。
 *
 * 同 pluginId 已在途 → 复用同一 promise（点两下不是两件事，两个调用方等同一结果，只推一条失败回执）。
 * 重试 = 手动触发（行内 [重试]/toast [重试]）无自动风暴。
 */
export function startMarketInstall(
  pluginId: string,
  downloadUrl: string,
  displayName?: string,
): Promise<boolean> {
  if (!lk()?.pluginManager?.installWithProgress) return Promise.resolve(false);
  const open = _openInstalls.get(pluginId);
  if (open) return open;
  const p = runMarketInstall(pluginId, displayName ?? pluginDisplayNameOf(pluginId), downloadUrl).finally(() => {
    _openInstalls.delete(pluginId);
  });
  _openInstalls.set(pluginId, p);
  return p;
}

/**
 * 重试安装（#30.9b [重试] 入口——toast 命令 / 详情页行内钮 / 侧栏行内钮，三入口共用）。
 * 重发同一安装，无自动风暴。
 *
 * E6#71k「都问」：**重试也要过一次确认门**——重试不是「用户刚点过所以免问」的豁免券：失败可能隔了很久、
 * 期间用户早忘了装的什么、从哪来。此处是**单点门位**（三个重试入口全部经本函数，无第二条路），
 * 门内按 pluginId 现查目录条目构造富内容卡；条目查不到（离线/下架）→ 回落纯文字确认，仍要问。
 * `displayName` 只用于回落确认的显示名（有目录条目时忽略）。
 */
export async function retryMarketInstall(
  pluginId: string,
  downloadUrl: string,
  displayName?: string,
): Promise<boolean> {
  if (!pluginId || !downloadUrl) return false;
  if (!(await confirmMarketInstallById(pluginId, displayName))) return false;
  return startMarketInstall(pluginId, downloadUrl, displayName);
}

/**
 * 重试更新——[重试] 的落点（命令 `marketplace.retryUpdate`）。
 *
 * E6#71k「都问」：与重试安装同一条规矩——**重试不是免问券**，仍过一次确认门（单点门位：
 * `confirmMarketInstallById` 现查目录条目构造富内容卡；条目查不到 → 回落纯文字确认，仍要问）。
 *
 * 成功后做一件收敛（与详情页 `doVersionAction` 成功分支同款，否则重试成功却看不到变化）：
 *   `scheduleDataRefresh` 重拉已装列表版本号——徽标/版本号都是现算的，盘上版本一变自己就对了
 *   （E6#81 第④处：原先还要 `removeDiscoveredCandidate` 去撤一份 store，那份 store 已拆）。
 * ⚠️ 失败**不再递归推新 toast**：失败本身就是用户点这条 [重试] 的答案，再挂一条 [重试] 等于
 * 无限自助餐（常驻条已被 G3 纳入按来源上限，但那是护栏不是设计）。失败结果由 job 行 + 详情页表达。
 */
export async function retryMarketUpdate(
  pluginId: string,
  downloadUrl: string,
  displayName?: string,
): Promise<boolean> {
  if (!pluginId || !downloadUrl) return false;
  if (!(await confirmMarketInstallById(pluginId, displayName))) return false;
  const upd = pm()?.update;
  if (!upd) return false;
  try {
    const r = await upd(pluginId, { url: downloadUrl });
    if (!r?.success) return false;
    scheduleDataRefresh();
    return true;
  } catch {
    return false;
  }
}
