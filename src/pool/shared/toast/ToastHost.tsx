/**
 * ToastHost——W3a（欢迎页重设计 T5）：池侧「轻提示」呈现层。
 *
 * ── 它是什么（与「通知面板」的分工）──
 *   `notifications.show(msg, { toast: true })` 的条目**不进铃铛面板**（壳侧 `buildNotif` 把它们
 *   分流出 `NotifLayout.toasts`，见该字段注释）——本组件是那条出口的**唯一渲染方**：右下角一张
 *   自动消失的小卡（≈4s、悬停暂停），给「一次操作的结果」一个不打扰的回执。
 *
 * 🔴 **不是复活 E6#72 整删的那张常驻右下卡**（`StatusBarZone.tsx:12` 的注释是那件事的账）：
 *   那张卡是**第二个通知面**——常驻、堆叠、与面板抢同一批条目（两把尺子）。本层三条纪律与它相反：
 *     ① 只渲染 `toast:true` 的条目（面板里根本没有这些 ⇒ 不存在「同一件事两处显示」）；
 *     ② **生命周期归池**——4s 到点由本组件发 `notif:dismiss` 把条目从壳 store 收掉（见下）；
 *     ③ 队列同时最多 3 张，超出顶替**最旧**（设计 §七#4）。
 *
 * ── 为什么定时器不留在壳（`options.toast` 的 ttl 恒 0）──
 *   「悬停暂停」只有**渲染方**知道（鼠标在卡上）。壳侧 `armTimer` 是 setTimeout，池没法让它暂停
 *   ——壳一旦按 4s 自动收，用户正停在卡上读的那条会当场消失。⇒ 壳只标 `toast:true`、不挂定时器；
 *   池按「剩余时间」记账（心跳 200ms，悬停时不扣），到点走已有的 `notif:dismiss` 事件通道回壳删除
 *   ——**不新增 IPC 通道**，用的就是面板 × 按钮那条（`useSubscriptions` 的 `notif:dismiss` 处理器）。
 *
 * ── 无障碍与降级 ──
 *   · 容器**恒在 DOM**（哪怕一张卡都没有）——ARIA live region 必须在内容变化**之前**就存在，
 *     否则读屏器不播（`role="status"` ＋ `aria-live="polite"`：不打断用户正在读的内容）。
 *   · 容器 `pointer-events:none`（不挡底下的界面），仅**卡片自身** `auto`——悬停暂停才有得可悬。
 *   · `prefers-reduced-motion` 下进退场动画关闭（Toast.css）；寿命不变（4s 是信息节奏，不是装饰）。
 *
 * ── 陈旧条目（池重建）──
 *   池刚挂载时 DTO 里若已经有轻提示条目，那是**上一个池**留下的（本池还没来得及给它们计时）。
 *   一律直接收掉不渲染——否则要么凭空冒出一张卡，要么它永远等不到自己的 4s。
 */
import { useEffect, useRef, useState } from "react";
import type { NotifLayout } from "../../../core/types/pool/poolLayout";
import { Z_INDEX } from "../../../constants";
import "./Toast.css";

/** 一张卡的寿命（ms）——设计 ≈4s（比壳侧通知默认 6s 短：轻提示是回执，不是内容） */
const TOAST_LIFE_MS = 4000;
/** 心跳粒度——悬停暂停要求「按剩余时间记账」，200ms 足够细且不烧帧 */
const TICK_MS = 200;
/** 同时最多几张——超出的顶替**最旧**（设计 §七#4） */
const MAX_VISIBLE = 3;
/** 退场动画时长（ms）——须与 Toast.css 的 `.ldk-toast--leaving` 一致（池据此摘 DOM） */
const LEAVE_MS = 150;

interface LiveToast {
  id: string;
  /** 完整 codicon 类串（壳 `getNotifIconClass` 产出）——与面板同一枚图标源，两处不各挑一次图标 */
  iconClass: string;
  message: string;
  /** 剩余寿命（ms）——悬停时不扣；进入 leaving 后继续递减到 `-LEAVE_MS` 即摘掉 */
  remaining: number;
  /** 已到点 / 已被顶替——正在播退场动画 */
  leaving?: boolean;
}

/** 池 → 壳通知事件（与面板 × 按钮同一条通道；壳侧 handler 幂等，重复发无害） */
function dismissToastInShell(id: string) {
  window.linkdesk?.events?.emit("notif:dismiss", id);
}

function ToastHost({ notif }: { notif?: NotifLayout }) {
  const [live, setLive] = useState<LiveToast[]>([]);
  /** 鼠标停在卡上——暂停全部计时（悬停任一卡即暂停，符合「用户正在读」的直觉） */
  const hovered = useRef(false);
  /** 入过队的 id——DTO 每帧重发同一批，靠它避免重复入队 */
  const queued = useRef<Set<string>>(new Set());
  /** 已发过 dismiss 的 id——同一张卡在多帧里都是 leaving，靠它避免重复发事件 */
  const dismissed = useRef<Set<string>>(new Set());
  /** 首帧标志——首帧就存在的条目不渲染（那是上一个池留下的，见文件头） */
  const firstPass = useRef(true);

  // ① 入队：DTO → 本地活动集（只认没见过的 id）
  useEffect(() => {
    const incoming = notif?.toasts ?? [];
    const stale = firstPass.current;
    firstPass.current = false;
    const fresh = incoming.filter((item) => !queued.current.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) queued.current.add(item.id);
    if (stale) {
      // 池刚起——这批是上一个池的遗留：直接收掉不渲染（它们等不到自己的 4s）
      for (const item of fresh) dismissToastInShell(item.id);
      return;
    }
    // DTO 是**新在前**（`buildNotif` 同一判据）——反转成入队序，队尾 = 最新
    const incomingOrder: LiveToast[] = fresh
      .map((item) => ({ id: item.id, iconClass: item.iconClass, message: item.message, remaining: TOAST_LIFE_MS }))
      .reverse();
    setLive((prev) => {
      const next = [...prev, ...incomingOrder];
      // 上限只数**在场**的卡（正在退场的不占名额）。超出 ⇒ 顶替**最旧**（数组头部）——
      // 标记退场、立即收掉壳侧条目（不等它自己的 4s），动画播完由心跳摘掉。
      const active = next.filter((item) => !item.leaving);
      const overflow = active.length - MAX_VISIBLE;
      if (overflow <= 0) return next;
      const dropIds = new Set(active.slice(0, overflow).map((item) => item.id));
      for (const id of dropIds) {
        if (dismissed.current.has(id)) continue;
        dismissed.current.add(id);
        dismissToastInShell(id);
      }
      return next.map((item) => (dropIds.has(item.id) ? { ...item, remaining: 0, leaving: true } : item));
    });
  }, [notif]);

  // ② 心跳：按剩余时间记账，到点转 leaving（悬停时不扣）
  //    `changed` 守卫：没有变化就返回原数组——否则每 200ms 都会换一份新数组，把下面 ④ 的退场
  //    定时器反复清掉（症状 = 卡永远摘不掉，只剩一层不可见的 DOM）。
  useEffect(() => {
    if (live.length === 0) return;
    const timer = setInterval(() => {
      setLive((prev) => {
        let changed = false;
        const next: LiveToast[] = [];
        for (const item of prev) {
          const remaining = item.remaining - TICK_MS;
          if (item.leaving) {
            // 退场中：不受悬停影响（条目已收，动画该播完），递减到 -LEAVE_MS 即摘掉
            if (remaining <= -LEAVE_MS) { changed = true; continue; }
            changed = true;
            next.push({ ...item, remaining });
            continue;
          }
          if (hovered.current) { next.push(item); continue; }
          changed = true;
          // `remaining <= 0` 是**显示寿命终点**：转 leaving 播退场，并给面板外的读屏器留出播报时间
          next.push(remaining <= 0 ? { ...item, remaining: 0, leaving: true } : { ...item, remaining });
        }
        return changed ? next : prev;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [live.length]);

  // ③ 收账：leaving 的卡**发一次** dismiss（从壳 store 收掉条目），退场播完由心跳摘 DOM
  useEffect(() => {
    for (const item of live) {
      if (!item.leaving || dismissed.current.has(item.id)) continue;
      dismissed.current.add(item.id);
      dismissToastInShell(item.id);
    }
  }, [live]);

  // ④ 集合有界：id 已不在 DTO 里 ⇒ 壳 store 那边确实没了，两个集合都不用再记（否则长会话只增不减）
  useEffect(() => {
    const present = new Set((notif?.toasts ?? []).map((item) => item.id));
    for (const id of queued.current) if (!present.has(id)) queued.current.delete(id);
    for (const id of dismissed.current) if (!present.has(id)) dismissed.current.delete(id);
  }, [notif]);

  return (
    // 恒在 DOM 的 live region（见文件头「无障碍」）——空时不占位、不吃点击
    <div className="ldk-toast-host" role="status" aria-live="polite" style={{ zIndex: Z_INDEX.toast }}>
      {live.map((item) => (
        <div
          key={item.id}
          className={`ldk-toast${item.leaving ? " ldk-toast--leaving" : ""}`}
          onMouseEnter={() => { hovered.current = true; }}
          onMouseLeave={() => { hovered.current = false; }}
        >
          {/* 图标复用面板那一枚（iconClass 同源），严重度靠它的颜色分（`.ldk-notif-severity-*`）——
              设计 §六#5：**不用 3px 彩色左边条**（那是品类俗手），也不加零偏移彩色光晕 */}
          <span className={`codicon ${item.iconClass} ldk-toast-icon`} />
          <span className="ldk-toast-msg">{item.message}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastHost;
