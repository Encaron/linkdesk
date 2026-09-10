/**
 * @vitest-environment jsdom
 * StatusBarZone 通知面板渲染——E6#73d 三段式（进行中 → 等待安装中 → 已有结果）+ C4 DOM 序。
 *
 * 只测**池哑渲染**关心的两件事：① 三段的结构顺序真的画出来了；② 行内 DOM 序 = 视觉序
 * （复制出来的文本顺序与屏幕一致——这正是 C4 要修的东西，断言只能落在 DOM 上）。
 * 文字内容归壳侧序列化（notif.test.ts 断言 DTO），这里一律用**虚构串**（硬约束 21）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { StatusBarLayout, NotifLayout } from "../../../core/types/pool/poolLayout";
import StatusBarZone from "./StatusBarZone";

afterEach(() => cleanup());

const NOTIF: NotifLayout = {
  unread: 0,
  bellTitle: "通知",
  panelTitle: "通知",
  clearLabel: "清除已完成",
  minimizeLabel: "最小化",
  emptyLabel: "暂无通知",
  dismissTitle: "关闭",
  groups: [],
};

/**
 * 打开面板——铃铛是**唯一**进面板的入口（三态表第 1 行）。
 * ⚠️ 返回 `baseElement`（= document.body）而不是 `container`：面板经 OverlayPortal 挂到 portal
 * 目标（无 #overlay-root 时回退 body），不在渲染容器里 —— 用 container 查会全查空。
 */
function openPanel(statusBar: StatusBarLayout): HTMLElement {
  const { container, baseElement } = render(<StatusBarZone statusBar={statusBar} />);
  fireEvent.click(container.querySelector(".status-bar-notif-btn")!);
  return baseElement;
}

/** 段落标题文本，按 DOM 出现顺序 */
function sectionLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".notif-task-section-label")].map((e) => e.textContent ?? "");
}

describe("E6#73d：面板三段式结构", () => {
  it("进行中 → 等待安装中 → 已有结果，段序即 DOM 序（永不重排）", () => {
    const container = openPanel({
      items: [],
      notif: {
        ...NOTIF,
        summaryLabel: "1 项进行中 · 另有 1 项等待安装中",
        resultLabel: "已有结果",
        resultSummary: "1 项失败",
        sections: [
          {
            key: "running",
            label: "1 项进行中",
            items: [
              { id: "job-a", pluginId: "demo-plugin", name: "演示插件", iconClass: "codicon codicon-sync notif-icon-spin", statusLabel: "下载中 62%", percent: 62, cancellable: true, cancelLabel: "取消安装" },
            ],
          },
          {
            key: "queued",
            label: "另有 1 项等待安装中",
            items: [
              { id: "job-b", pluginId: "demo-plugin-b", name: "演示插件乙", iconClass: "codicon codicon-circle-outline", statusLabel: "等待安装中", cancellable: true, cancelLabel: "取消安装" },
            ],
          },
        ],
      },
    });
    // 结果区得有一条来源分组，才验证得了「结果段标题在分组之上」
    expect(sectionLabels(container)).toEqual(["1 项进行中", "另有 1 项等待安装中", "已有结果"]);
    expect(container.querySelector(".notif-task-section-count")?.textContent).toBe("1 项失败");
  });

  it("排队行不画进度条（没有在途工作，画条是撒谎——壳不带 percent 时池也不画）", () => {
    const container = openPanel({
      items: [],
      notif: {
        ...NOTIF,
        sections: [
          {
            key: "queued",
            label: "另有 1 项等待安装中",
            items: [
              { id: "job-b", pluginId: "demo-plugin-b", name: "演示插件乙", iconClass: "codicon codicon-circle-outline", statusLabel: "等待安装中", cancellable: true, cancelLabel: "取消安装" },
            ],
          },
        ],
      },
    });
    expect(container.querySelectorAll(".notif-progress")).toHaveLength(0);
  });

  it("[取消安装] 走 secondary（不抢失败行 [重试] 的视线），点击回传 notif:cancelJob + jobId", () => {
    const emitted: Array<[string, unknown]> = [];
    (window as unknown as { linkdesk: unknown }).linkdesk = {
      events: { emit: (ch: string, p: unknown) => emitted.push([ch, p]) },
    };
    try {
      const container = openPanel({
        items: [],
        notif: {
          ...NOTIF,
          sections: [
            {
              key: "running",
              label: "1 项进行中",
              items: [
                { id: "job-a", pluginId: "demo-plugin", name: "演示插件", iconClass: "codicon codicon-sync notif-icon-spin", statusLabel: "解压中...", cancellable: true, cancelLabel: "取消安装" },
              ],
            },
          ],
        },
      });
      const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "取消安装")!;
      expect(btn.className).toBe("notif-action-btn secondary");
      fireEvent.click(btn);
      // 行 key 就是 jobId——回传它才能定向中止（不是插件名，同名不同插件要能区分）
      // 只挑 cancelJob 那条：开面板本身也会发 notif:panel（三态镜像），不是本用例的被测面
      expect(emitted.filter(([ch]) => ch === "notif:cancelJob")).toEqual([["notif:cancelJob", { jobId: "job-a" }]]);
    } finally {
      delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    }
  });
});

/**
 * 🔴 C4：DOM 序与视觉序统一。此前 `column-reverse` 把视觉翻回来，拖选复制出来的文本顺序
 * 与屏幕从上到下**相反**（复制一条失败通知得到按钮文字打头的乱序串）。
 * 断言只能落在 DOM 上——CSS 翻转与否看不见，DOM 里谁先谁后是硬的。
 */
describe("E6#73d（C4）：行内 DOM 序 = 视觉序", () => {
  /** 行内直接子元素的类名序——「谁先入 DOM」的硬证据；`indexOf` 找不到时返回 -1，让顺序断言真失败 */
  const childClasses = (item: Element) => [...item.children].map((c) => c.className);
  const before = (classes: string[], a: string, b: string) => {
    const ia = classes.indexOf(a);
    expect(ia).toBeGreaterThanOrEqual(0); // a 必须真在 DOM 里——否则顺序断言会因 -1 假过
    expect(ia).toBeLessThan(classes.indexOf(b));
  };

  it("任务行：主行 → 进度条 → [取消安装]（详情动作殿后）", () => {
    const container = openPanel({
      items: [],
      notif: {
        ...NOTIF,
        sections: [
          {
            key: "running",
            label: "1 项进行中",
            items: [
              { id: "job-a", pluginId: "demo-plugin", name: "演示插件", iconClass: "codicon codicon-sync notif-icon-spin", statusLabel: "下载中 62%", percent: 62, cancellable: true, cancelLabel: "取消安装" },
            ],
          },
        ],
      },
    });
    const classes = childClasses(container.querySelector(".notif-panel-item")!);
    before(classes, "notif-main-row", "notif-progress");
    before(classes, "notif-progress", "notif-details-row");
  });

  it("通知行：主行 → 进度 → 详情（来源 + 动作按钮）", () => {
    const container = openPanel({
      items: [],
      notif: {
        ...NOTIF,
        groups: [
          {
            key: "demo-plugin",
            label: "demo-plugin",
            unread: 0,
            items: [
              {
                id: "toast-1",
                iconClass: "codicon codicon-error notif-severity-error",
                message: "演示消息",
                timeLabel: "刚刚",
                sourceLabel: "来源: demo-plugin",
                actions: [{ label: "演示动作", isPrimary: true }],
              },
            ],
          },
        ],
      },
    });
    const item = container.querySelector(".notif-panel-item")!;
    before(childClasses(item), "notif-main-row", "notif-details-row");
    // 文本顺序 = 屏幕顺序（拖选复制的顺序）：消息在前、来源与按钮在后
    expect(item.textContent).toMatch(/演示消息[\s\S]*来源: demo-plugin[\s\S]*演示动作/);
  });
});
