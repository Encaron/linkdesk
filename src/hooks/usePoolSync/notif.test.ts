/**
 * buildNotif 单测——E6#72c（进度透传）+ #72d（autoOpen 重要通知自动展开）。
 *
 * 被测面：壳侧通知序列化（toast 存储 → NotifLayout DTO）。纯函数 + 一个模块级未读集。
 * 桩数据一律虚构（硬约束 21：fixture 禁用真实插件名/真实 UI 文案）——`demo-plugin` / `演示消息`。
 * 存储隔离：toast 存储是模块单例，每个用例前后清空（ttl:0 避免 setTimeout 挂住 suite）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TFunction } from "i18next";
import { buildNotif, _seenIds } from "./notif";
import { pushToast, dismissToast, getToasts, setNotifPanelOpen, TOAST_SOURCE_CAP } from "../../core/services/ui/toast";

/** i18n 桩——key 原样返回 + 做 {{x}} 插值（断言只看 DTO 结构/参数带没带对，不看译文；真实译文归 i18n 审计） */
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? key.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts[k] ?? "")) : key) as unknown as TFunction;

function clearStore(): void {
  for (const n of getToasts()) dismissToast(n.id);
  _seenIds.clear();
  setNotifPanelOpen(false);
}

beforeEach(clearStore);
afterEach(clearStore);

describe("buildNotif——进度字段透传（E6#72c）", () => {
  it("progress:true 无 percent → DTO 带 progress、不带 percent（不定态）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBe(true);
    expect(item.percent).toBeUndefined();
  });

  it("progress:true + percent:42 → DTO 两个字段都带（确定态）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, percent: 42, ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBe(true);
    expect(item.percent).toBe(42);
  });

  it("percent:0 边界——不被当成 falsy 丢掉", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, percent: 0, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].percent).toBe(0);
  });

  it("非进度通知 → DTO 不带 progress/percent（形状零变化）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBeUndefined();
    expect(item.percent).toBeUndefined();
  });

  it("进度图标换 sync + spin 类", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].iconClass).toBe("codicon codicon-sync notif-icon-spin");
  });

  // E6#73f：原「作者显式给 icon → 尊重作者」用例已删——`notifications.show` 契约里根本没有
  // icon 形参（只有 type/progress/persistent/actions），壳 handler 也从不填 ⇒ 那条分支恒假。
  // 图标类的完整对照（error/warning/info 三档）见下。
  it("非进度通知按 severity 定图标（error/warning/info 三档）", () => {
    pushToast({ message: "演示消息 甲", source: "demo-plugin", severity: "error", ttl: 0 });
    pushToast({ message: "演示消息 乙", source: "demo-plugin", severity: "warning", ttl: 0 });
    pushToast({ message: "演示消息 丙", source: "demo-plugin", severity: "info", ttl: 0 });
    // 按消息取图标——不依赖组内时间排序（同毫秒时间戳下顺序不稳）
    const byMsg = new Map(buildNotif(t).groups[0].items.map((i) => [i.message, i.iconClass]));
    expect(byMsg.get("演示消息 甲")).toBe("codicon codicon-error notif-severity-error");
    expect(byMsg.get("演示消息 乙")).toBe("codicon codicon-warning notif-severity-warning");
    expect(byMsg.get("演示消息 丙")).toBe("codicon codicon-info");
  });
});

describe("buildNotif——折叠汇总（E6#73f S3/A6）", () => {
  it("本组有折叠 → DTO 带壳侧解析好的 foldedLabel（面板哑渲染，不再无声消失）", () => {
    for (let i = 0; i < TOAST_SOURCE_CAP + 3; i++) {
      pushToast({ message: `演示消息 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    expect(buildNotif(t).groups[0].foldedLabel).toBe("本组另有 3 条较早的已折叠");
  });

  it("没折叠过 → 不带 foldedLabel 字段（形状零变化，不渲染汇总行）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    expect(buildNotif(t).groups[0].foldedLabel).toBeUndefined();
  });

  it("折叠计数归到本组——别的来源不受影响", () => {
    pushToast({ message: "演示消息 别的来源", source: "demo-other", ttl: 0 });
    for (let i = 0; i < TOAST_SOURCE_CAP + 1; i++) {
      pushToast({ message: `演示消息 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    const groups = new Map(buildNotif(t).groups.map((g) => [g.key, g]));
    expect(groups.get("demo-plugin")?.foldedLabel).toBe("本组另有 1 条较早的已折叠");
    expect(groups.get("demo-other")?.foldedLabel).toBeUndefined();
  });
});

/**
 * E6#73b：判据从「重要」（`isImportantNotif`）换成**唤醒白名单**（`Toast.wake`）。
 * 这里既要验「该弹的弹」，也要把「不该弹的」钉成反向测试——它们是 R5-4/R5-6 的机械保证。
 */
describe("buildNotif——autoOpen 唤醒白名单（E6#73b，18 档 §五 B）", () => {
  it("无通知 → autoOpen false", () => {
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it.each([
    ["普通 info", { severity: "info" as const }],
    // 🔴 反向：进度增量永不唤醒（R5-6「从 10% 到 50% 这个间断期间他不叫新状态」）
    ["进度", { progress: true }],
    // 🔴 反向：内存墙 / 主题数据坏 / 工作区丢文件夹 / 孤儿依赖**全是 warning 级**（§五 B 明确不唤醒）
    ["警告", { severity: "warning" as const }],
    ["长驻", { persistent: true }],
  ])("不该弹（%s）未读 → autoOpen false", (_label, extra) => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0, ...extra });
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it.each([
    ["失败（缺省 error 级）", { severity: "error" as const }],
    ["带动作按钮（缺省）", { actions: [{ label: "演示动作", onClick: () => {} }] }],
    ["job 终态显式置位", { severity: "info" as const, wake: true }],
  ])("该弹（%s）未读 → autoOpen true", (_label, extra) => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0, ...extra });
    expect(buildNotif(t).autoOpen).toBe(true);
  });

  it("显式 wake:false 压过缺省——error 级也能被生产者按住", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", wake: false, ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("该弹但已读（面板开过一次）→ autoOpen false", () => {
    const id = pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    _seenIds.add(id);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("该弹未读但面板已开 → autoOpen false（不二次打扰正在看的人）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    setNotifPanelOpen(true);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("面板打开即时标已读 → autoOpen 回落到 false（关掉后不会被同一条弹回来）", () => {
    const id = pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(true);
    // 模拟壳侧 notif:panel(true) 处理：置镜像 + 全量标已读（useSubscriptions 同款）
    setNotifPanelOpen(true);
    _seenIds.add(id);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  /**
   * 🔴 「最小化」不带静音权力（18 档 §五 A 第 4 行 + §五 B 计数表 + R5-4/R5-5）。
   * minimized 与 idle 在壳侧镜像里**同值**（useSubscriptions：`state === "open"` 一个派生位），
   * 所以此处只需断言「面板收着 + 该弹的新条目 → 唤醒」——这正是最小化后终态能冒出来的原因。
   * ⚠️ 反过来说：**本表达式不得出现 `!isNotifMinimized()`**——加了就等于终态唤不回。
   */
  it("面板收着（含最小化）时新到的该弹条目 → autoOpen true（R5-5「出结果必冒出来」）", () => {
    setNotifPanelOpen(false); // = 最小化在壳侧镜像里的取值（同一派生位）
    pushToast({ message: "演示消息 装完了", source: "demo-plugin", severity: "info", wake: true, ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(true);
  });
});
