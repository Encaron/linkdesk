/**
 * usePoolSync 通知中心序列化——_seenIds / formatTimeAgo / getNotifIconClass / buildNotif。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：壳 NotificationCenter 四件套 DTO。
 * 模块级 _seenIds 未读追踪跨渲染保留（useSyncSubscriptions 事件回传共享同一实例）。
 * 依赖方向：notif → toast（存储）；无反向。
 */

import type { TFunction } from "i18next";
import type { NotifLayout } from "../../core/types/pool/poolLayout";
import { getToasts, type Toast } from "../../core/services/ui/toast";

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

/** 通知图标类——壳 getNotifIconClass 同款 */
function getNotifIconClass(n: Toast): string {
  if (n.icon) return n.icon.startsWith("codicon") ? n.icon : `codicon codicon-${n.icon}`;
  switch (n.severity) {
    case "error": return "codicon codicon-error notif-severity-error";
    case "warning": return "codicon codicon-warning notif-severity-warning";
    case "info":
    default: return "codicon codicon-info";
  }
}

/** 通知面板数据——壳 NotificationCenter（source 分组/未读排序/时间文案）序列化为纯数据 */
export function buildNotif(t: TFunction): NotifLayout {
  const notifications = getToasts();
  const unread = notifications.filter((n) => !_seenIds.has(n.id)).length;

  // E3e #50：source 第一段归类（"terminal.portErrors" → "terminal"）
  const map = new Map<string, Toast[]>();
  for (const n of notifications) {
    const src = n.source?.split(".")[0] || "";
    const key = src || "__other__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  const groups: NotifLayout["groups"] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const groupUnread = items.filter((n) => !_seenIds.has(n.id)).length;
    groups.push({
      key,
      label: key === "__other__" ? t("其他") : key,
      unread: groupUnread,
      items: items.map((n) => ({
        id: n.id,
        iconClass: getNotifIconClass(n),
        message: n.message,
        timeLabel: n.createdAt ? formatTimeAgo(t, n.createdAt) : "",
        ...(n.source ? { sourceLabel: t("来源: {{source}}", { source: n.source }) } : {}),
        actions: (n.actions ?? []).map((a) => ({ label: a.label, ...(a.isPrimary ? { isPrimary: true } : {}) })),
      })),
    });
  }
  // 有未读的组排前面
  groups.sort((a, b) => b.unread - a.unread);

  return {
    unread,
    bellTitle: unread > 0 ? t("{{count}} 条通知", { count: unread }) : t("通知"),
    panelTitle: t("通知"),
    clearLabel: t("全部清除"),
    emptyLabel: t("暂无通知"),
    dismissTitle: t("关闭"),
    groups,
  };
}
