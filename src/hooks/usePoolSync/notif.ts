/**
 * usePoolSync 通知中心序列化——_seenIds / formatTimeAgo / getNotifIconClass / buildNotif。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：壳 NotificationCenter 四件套 DTO。
 * 模块级 _seenIds 未读追踪跨渲染保留（useSyncSubscriptions 事件回传共享同一实例）。
 * 依赖方向：notif → toast（存储）；无反向。
 */

import type { TFunction } from "i18next";
import type { NotifLayout } from "../../core/types/pool/poolLayout";
import { getToasts, getFoldedCount, isNotifPanelOpen, OTHER_SOURCE_KEY, sourceKeyOf, type Toast } from "../../core/services/ui/toast";

/** 未读追踪——跨渲染保留，面板关闭期间到来的通知标记为未读 */
export const _seenIds = new Set<string>();

/** 时间格式化——中文友好，零外部依赖（壳 NotificationCenter 同款） */
function formatTimeAgo(t: TFunction, ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("刚刚");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("{{min}} 分钟前", { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{{hr}} 小时前", { hr });
  const d = Math.floor(hr / 24);
  return t("{{d}} 天前", { d });
}

/** 通知图标类——按 severity（+ 进度类）定图标。
 *  E6#72c：进度类通知换 codicon-sync + spin 类——与下方进度条同源语义（「这件事正在跑」）。
 *  E6#73f：删掉「作者显式给 icon 则尊重作者」那条分支——插件面 `notifications.show` 的
 *  options 从来没有 icon 形参（契约只有 type/progress/persistent/actions），`Toast.icon`
 *  全员零生产者 ⇒ 该分支恒假。要开「作者自定义图标」是**新能力**，得走 8 维设计 + 契约生成，
 *  不在本行整肃范围内，故删分支而非补契约。 */
function getNotifIconClass(n: Toast): string {
  if (n.progress) return "codicon codicon-sync notif-icon-spin";
  switch (n.severity) {
    case "error": return "codicon codicon-error notif-severity-error";
    case "warning": return "codicon codicon-warning notif-severity-warning";
    case "info":
    default: return "codicon codicon-info";
  }
}

/** 重要通知判定——E6#72d（用户 Q2 定案的「重要」= 需要用户看见的那几类）：
 *  失败/警告（severity error|warning）∨ 带动作按钮（等用户点）∨ 长驻（等用户手动关）
 *  ∨ 进度类（进行中，用户要看着它跑完）。成功/普通 info 不算重要——照旧几秒自消（Q1 定案）。 */
function isImportantNotif(n: Toast): boolean {
  return (
    n.severity === "error" ||
    n.severity === "warning" ||
    (n.actions?.length ?? 0) > 0 ||
    n.persistent === true ||
    n.progress === true
  );
}

/** 通知面板数据——壳 NotificationCenter（source 分组/未读排序/时间文案）序列化为纯数据 */
export function buildNotif(t: TFunction): NotifLayout {
  const notifications = getToasts();
  const unread = notifications.filter((n) => !_seenIds.has(n.id)).length;

  // E3e #50：source 第一段归类（"terminal.portErrors" → "terminal"）。
  // E6#73f 归一：分桶键走 toast 的 sourceKeyOf——与常驻上限淘汰分桶**同一个键函数**，
  // 面板分组与淘汰分桶不会各算各的（此前两处各写一遍 split(".")[0] || "__other__"）。
  const map = new Map<string, Toast[]>();
  for (const n of notifications) {
    const key = sourceKeyOf(n.source);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  const groups: NotifLayout["groups"] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const groupUnread = items.filter((n) => !_seenIds.has(n.id)).length;
    const folded = getFoldedCount(key);
    groups.push({
      key,
      label: key === OTHER_SOURCE_KEY ? t("其他") : key,
      unread: groupUnread,
      // E6#73f（S3/A6）：本组被上限折叠掉的条数——只在 >0 时带字段（缺省不渲染汇总行）。
      // 文案壳侧解析（池哑渲染），与 timeLabel/sourceLabel 同一「显示文本铁律」。
      ...(folded > 0 ? { foldedLabel: t("本组另有 {{count}} 条较早的已折叠", { count: folded }) } : {}),
      items: items.map((n) => ({
        id: n.id,
        iconClass: getNotifIconClass(n),
        message: n.message,
        timeLabel: n.createdAt ? formatTimeAgo(t, n.createdAt) : "",
        ...(n.source ? { sourceLabel: t("来源: {{source}}", { source: n.source }) } : {}),
        actions: (n.actions ?? []).map((a) => ({ label: a.label, ...(a.isPrimary ? { isPrimary: true } : {}) })),
        // E6#72c：进度旗标 + 百分比透传（原 71i 画在窄卡上，窄卡删后落点改宽面板）。
        // 只在 true 时带字段——非进度通知 DTO 形状不变（省略即缺省，池按 undefined 处理）。
        ...(n.progress ? { progress: true } : {}),
        ...(typeof n.percent === "number" ? { percent: n.percent } : {}),
      })),
    });
  }
  // 有未读的组排前面
  groups.sort((a, b) => b.unread - a.unread);

  return {
    unread,
    bellTitle: unread > 0 ? t("{{count}} 条通知", { count: unread }) : t("通知"),
    panelTitle: t("通知"),
    // E6#73a：头部两钮分工——一个管**内容**（清消息，面板不关），一个管**面板**（收起）。
    // 原「全部清除」删所有通知（含进行中）⇒ 此后进度静默失效、永不再现（18 档 A2/M5）。
    clearLabel: t("清除已完成"),
    minimizeLabel: t("最小化"),
    emptyLabel: t("暂无通知"),
    dismissTitle: t("关闭"),
    groups,
    // E6#72d：重要且未读、且面板当前关着 → 请求池自动展开。
    // 「面板已开」时不再请求（不二次打扰正在看的人）；池打开面板会回传开合镜像 →
    // 本值回落 false，故不存在「关掉又被弹开」的反复。
    // E6#73a：回落**只**靠开合镜像，不再依赖 unread 归零——唤醒开面板不认账（§五 B），
    // 未读会照常留着。⚠️ 已知边界：**最小化**态同样让本式为 false（isNotifPanelOpen 只看「开着没」），
    // 而最小化**不是永久静音**（§五 A 第 4 行）——两者语义的分离归 **E6#73b**。**73b 前不得回退本式。**
    autoOpen:
      !isNotifPanelOpen() && notifications.some((n) => !_seenIds.has(n.id) && isImportantNotif(n)),
  };
}
