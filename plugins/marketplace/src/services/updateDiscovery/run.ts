/**
 * run — 发现主编排 + 自动更新的两条入口（手动勾选即跑 / 发现代劳）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `updateDiscovery.ts` 原样搬出，零行为变更。
 *
 * 输出：**本模块不存发现结果**（E6#81 第④处，2026-09-11 拆除）。
 *   🔴 拆掉经过：#33b 时代本模块持有一份常驻 store（`getDiscoveredUpdates` / `hasDiscoveredUpdates` /
 *     `onDiscoveredUpdatesChange` / `removeDiscoveredCandidate`），供「可更新」徽标与自动更新读。但徽标实际
 *     由 DetailView / 列表页经 `updateTargetFor` **现算**（同一判定的另一处消费），自动更新也已改为勾选那一下
 *     **就地现算**（见 `runAutoUpdateIfDue` 头注）——store 遂成只写不读的死状态，只剩 vitest 断言与两处
 *     「更新成功后撤销」的调用在喂它。**用户 2026-09-11 拍板拆除。**
 *   ⚠️ 后来者：想再加「发现结果缓存」之前先问——**这份数据有人读吗，还是现算更便宜？** 本模块的教训是
 *     缓存一份现算量（读盘 + 目录比对，目录还有 5min 缓存）换不来收益，只换来一个会与真值漂移的第二副本
 *     （见 memory `snapshot-shadows-truth-bug-class` 第一类）。
 */

import { loadCatalog } from "../marketSources";
import {
  clearNotifiedVersion,
  noteNotifiedVersion,
  patchUpdateMeta,
  readUpdateMetaMap,
  setPinnedVersion,
} from "../installedUpdateMeta";
import { applyEngineAutoUpdate } from "./apply";
import { notifyAutoResult, updateBellMessage } from "./messages";
import { planDiscovery, selectAutoCandidates, selectMetaEvictions } from "./plan";
import { readInstalledSnapshot } from "./snapshot";
import type { DiscoveryPlan, UpdateCandidate } from "./types";

let _running: Promise<DiscoveryPlan | null> | null = null;

/** 空计划——「读完了，没有可更新」的**结论**（区别于 `null` 的「判不了」）。 */
const EMPTY_PLAN: DiscoveryPlan = { candidates: [], toNotify: [], toClearNotified: [] };

/** 发现主编排。force=true 手动刷新用（跳过 5min fresh 缓存）。并发一趟（启动调度 + 手动重叠）复用。
 *
 *  🔴 **返回值判据（E6#82，2026-09-11）：`null` 只表示「判不了」，不表示「没事」。**
 *    · `DiscoveryPlan`（哪怕是空计划）= **结论**——读到盘上现状 + 拿到目录，比过了。
 *    · `null` = **判不了**——读盘不可信 / 目录拉不到或坏 parse（输入全是**一次性外部状态**：网络、代理、IPC）。
 *    调度器据这一位决定要不要换时间再试（见 `armDiscoveryAttempt`）。两者曾经混用：开机那十秒若赶上网络
 *    没热，发现静默跳过且整次开机不再重试 ⇒ 用户勾的自动更新一整天不响（E6#82 实机报障）。 */
export async function runUpdateDiscovery(force = false): Promise<DiscoveryPlan | null> {
  if (_running) return _running;
  _running = doRunDiscovery(force).finally(() => {
    _running = null;
  });
  return _running;
}

/** 测试复位在途发现态（vitest 用；产线不调） */
export function __clearRunningDiscovery(): void {
  _running = null;
}

async function doRunDiscovery(force: boolean): Promise<DiscoveryPlan | null> {
  const { snapshot: installed, installedIds, available } = await readInstalledSnapshot();
  const meta = await readUpdateMetaMap();

  // 🔴 E6#81：**销账先于一切**，包括下面两个「无事可发现」的早退。理由有二：
  //   ① 销账判的是「盘上还在不在」，与「有没有目录可比」无关——用户把插件全卸光时 `installed.length === 0`
  //      若直接 return，残留记账**永远没有机会被清**（发现循环是唯一的销账机会）。
  //   ② `available === false`（IPC 不可用/读失败）绝不销账——空数组此时不代表「什么都没装」，
  //      拿它当判据 = 一次瞬时故障清光全机记账（见 readInstalledSnapshot 头注）。
  if (available) {
    const evictions = selectMetaEvictions(meta, installedIds);
    await Promise.all(
      evictions.map((id) => patchUpdateMeta(id, { pinnedVersion: undefined, lastNotifiedVersion: undefined })),
    );
  }

  // 「一台没装」是**结论**（读到了、就是空）；「读盘不可信」那条已在上面早退，走不到这里。
  if (installed.length === 0) return EMPTY_PLAN;
  const catalog = await loadCatalog(force);
  if (catalog.entries.length === 0) {
    // 源连上但目录真为空（合法空态）= 结论；拉不到 / 坏 parse = **判不了** → null 交调度器换时间重试。
    return catalog.state === "ok" ? EMPTY_PLAN : null;
  }
  const plan = planDiscovery(catalog.entries, installed, meta);

  // 自愈清提醒（幂等——无变化不写盘，installedUpdateMeta 内部保证）
  await Promise.all(plan.toClearNotified.map((id) => clearNotifiedVersion(id)));

  // #33d auto 候选（autoUpdate on + 未钉版本）——这些插件由下方执行环**代劳**，故不推「有新版本」铃铛
  //  （同一件事说两遍）；改由代劳后的结果通知告知（见 notifyAutoResult）。见文件头 E6#79。
  const autoEligible = selectAutoCandidates(plan.candidates, meta);
  const autoIds = new Set(autoEligible.map((c) => c.pluginId));
  const toNotify = plan.toNotify.filter((c) => !autoIds.has(c.pluginId));

  // 铃铛推一条 + 记版本（每版本一次）。推失败 → 不记（下趟补推，宁重勿漏）。
  // E6#73j（G7）：**整批一条汇总，不是逐插件 N 条**。此前 10 个待更新 = 10 条 info 挤满通知面板；
  //  而 info 级不触发 autoOpen（18 档 §五 B）⇒ 该看的时候没弹出来，只是静静堆了一屏——
  //  「该通知时不弹、该收敛时刷屏」两头错。汇总后：一条说清几件事，面板看得到，铃铛也不淹。
  //  记账仍**逐条做**（幂等键是 per-plugin per-version，不是 per-批次）——整批一次推送成功即整批记账。
  const show = window.linkdesk?.notifications?.show;
  if (toNotify.length > 0) {
    let pushed = false;
    if (show) {
      try {
        // E6#73g（S5）：版本提醒归市场来源桶（组标题解析成市场显示名，不显示内部 id）
        await show(updateBellMessage(toNotify), { type: "info", source: "marketplace" });
        pushed = true;
      } catch {
        pushed = false; // 推送失败 → 不记账（下次发现重推）
      }
    } else {
      pushed = true; // 无铃铛能力（预览/非池）——仍记账防循环重试；发现编排本已池门控，此为兜底
    }
    if (pushed) {
      for (const c of toNotify) await noteNotifiedVersion(c.pluginId, c.remoteLatest);
    }
  }

  // #33d auto 执行（串行——引擎 update 单通道，多插件串行最稳；单败不阻断其余）。G6：插件标签页开着照常
  //  stage + 替换 + 重启生效（引擎 needRestart 恒 true——原子替换开着也能成，§二·七）。
  //  「可更新」徽标不归这里管——它由 `updateTargetFor` 现算：装成了盘上版本就变，徽标自己消失；失败则盘上
  //  没变，徽标照挂（手动重试的入口因此仍在）。
  const autoDone: UpdateCandidate[] = [];
  const autoFailed: UpdateCandidate[] = [];
  for (const c of autoEligible) {
    (await applyEngineAutoUpdate(c) ? autoDone : autoFailed).push(c);
  }
  notifyAutoResult(autoDone, autoFailed);

  return plan;
}

/** #33d 勾选即跑（DetailView 勾上 autoUpdate → 立即调）——**候选就地现算，不读任何别处的产物**。
 *
 *  🔴 E6#81（2026-09-11）：此前的判据是「发现那趟留下的候选表里有没有这个插件」，而那张表**只由
 *  `doRunDiscovery` 落**——它每会话最多跑一趟，且是市场池首载后 ~10s（DISCOVERY_DELAY_MS）；目录为空
 *  （离线 / 未配源 / 坏 parse）时更在落表之前就早退。⇒ 用户打开详情页勾上开关的那一刻那张表往往还是空的，
 *  函数在 `!c` 处**静默 `return false`**——**勾了等于没勾**，界面上一个字不说。这与 1.0.20 changelog 的承诺
 *  （「勾上开关那一刻如果正好有可更新的版本，立刻装，不用等下一轮检查」）直接冲突，也说明「把判定挂在
 *  别人的一次性产物上」是这次 bug 的形状。
 *
 *  修法 = 不赌「发现跑过了」，勾选那一下**自己现算**：读盘上现状 + 拉目录（5min fresh 缓存命中则零网络
 *  开销）→ 复用**同一个** `planDiscovery` 判定（不另写第二份「这算不算有更新」的逻辑）→ auto 门 → 跑引擎。
 *  该不该自动更新（autoUpdate on + 未钉版本，§二·九）仍由 `selectAutoCandidates` 判——用户没表达过该
 *  意图就不替他动文件。
 *  成功 / 失败都**告知**（`notifyAutoResult`）；「可更新」徽标不在这里管——现算，装成了自己消失。
 *  返回是否成功自动更新。
 *  幂等守卫：发现编排在跑 → 先等收束（编排已含 auto 处理本趟候选，防双跑引擎 update）。 */
export async function runAutoUpdateIfDue(pluginId: string): Promise<boolean> {
  if (_running) await _running;
  const meta = await readUpdateMetaMap();
  const { snapshot, available } = await readInstalledSnapshot();
  if (!available) return false; // 读不到盘上现状（IPC 不可用/失败）→ 判不了，不动文件
  const inst = snapshot.find((x) => x.pluginId === pluginId);
  if (!inst) return false; // 没装 / 盘上没有它 → 无事可做（下趟发现照常处理）
  const catalog = await loadCatalog(false);
  if (catalog.entries.length === 0) return false; // 无目录数据 → 判不出有没有新版，不猜
  // 复用发现编排的**同一份**判定（stable-only + semver.gt + updatable 闸 + 下架跳过）——单插件喂进去取首位。
  const c = planDiscovery(catalog.entries, [inst], meta).candidates[0];
  if (!c) return false; // 没有比本地新的稳定版 → 无候选可跑
  // 复用纯选择函数判定「这个插件本来该被自动更新吗」（autoUpdate on + 未钉版本）——不是 → 用户没表达过
  //  该意图，不该替他动文件。
  if (selectAutoCandidates([c], meta).length === 0) return false;
  const ok = await applyEngineAutoUpdate(c);
  notifyAutoResult(ok ? [c] : [], ok ? [] : [c]);
  return ok;
}

/** 🔴 E6#83（2026-09-11 用户拍板）——勾上「自动更新」的**完整落地动作**：**先清钉，再跑**。
 *
 *  为什么清钉（两条意愿互斥，判给开关赢）：`pinnedVersion`（版本下拉挑旧版时记下）= 「别给我升」，
 *  `autoUpdate`（勾选框）= 「有新版本就自动装上」——**同一条意愿的两个方向，不可能同时为真**。此前只记开关
 *  不动钉 ⇒ 钉**静默**压过开关：用户降级 → 勾上 → 关软件重开 → 什么都没发生，界面一个字不解释
 *  （2026-09-11 用户实机报障；E6#82 修的是「那趟检查只跑一次」，本条是「检查跑到了却被一条看不见的记录拦住」，
 *  两码事——同一个症状，两个病根）。判给开关赢：它**更晚、更直白**，且**它自己的说明文字就是这么承诺的**
 *  （勾选框 title：「勾选后自动更新——有新版本就自动装上，装完发通知告诉你」）——软件得说到做到。
 *
 *  ⚠️ **只清钉，不给 auto 门开后门**：清完仍走原样的 `runAutoUpdateIfDue` → `selectAutoCandidates`
 *  （autoUpdate on + **未钉版本**）。先把「未钉」这一半做真，再让判定照原样跑——判定规则一条没改。
 *
 *  （反过来的方向**不成立**：挑旧版**不**去关开关。挑版本是「这一版我要装」，关开关才是「以后都别自动升」——
 *  两件事，且降级时把用户显式勾的意愿悄悄抹掉是同一类错。） */
export async function enableAutoUpdateAndRun(pluginId: string): Promise<boolean> {
  await setPinnedVersion(pluginId, null);
  return runAutoUpdateIfDue(pluginId);
}
