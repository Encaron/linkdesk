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
import { pushToast, dismissToast, getToasts, setNotifPanelOpen } from "../../core/services/ui/toast";

/** i18n 桩——key 原样返回（断言只看 DTO 结构，不看译文；真实文案归 i18n 审计） */
const t = ((key: string) => key) as unknown as TFunction;

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

  it("进度图标换 sync + spin 类（作者未自定图标时）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].iconClass).toBe("codicon codicon-sync notif-icon-spin");
  });

  it("作者显式给 icon → 尊重作者，不覆盖成 sync", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, icon: "rocket", ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].iconClass).toBe("codicon codicon-rocket");
  });
});

describe("buildNotif——autoOpen 门禁（E6#72d）", () => {
  it("无通知 → autoOpen false", () => {
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("普通 info 未读 → autoOpen false（成功/普通照旧安静自消，Q1 定案）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", severity: "info", ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it.each([
    ["失败", { severity: "error" as const }],
    ["警告", { severity: "warning" as const }],
    ["带动作按钮", { actions: [{ label: "演示动作", onClick: () => {} }] }],
    ["长驻", { persistent: true }],
    ["进度", { progress: true }],
  ])("重要类（%s）未读 → autoOpen true", (_label, extra) => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0, ...extra });
    expect(buildNotif(t).autoOpen).toBe(true);
  });

  it("重要但已读（面板开过一次）→ autoOpen false", () => {
    const id = pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    _seenIds.add(id);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("重要未读但面板已开 → autoOpen false（不二次打扰正在看的人）", () => {
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
});
