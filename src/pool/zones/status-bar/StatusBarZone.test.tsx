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

/**
 * 装一个只捕获 `events.emit` 的窄 stub 跑 `fn`，收工后把 `window.linkdesk` 摘干净。
 * 回传的 `emitted` 按发生序累积——**别按通道名过滤再断言**：多一条少一条都该被看见。
 */
function withEmit(fn: (emitted: Array<[string, unknown]>) => void): void {
  const emitted: Array<[string, unknown]> = [];
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    events: { emit: (ch: string, p: unknown) => emitted.push([ch, p]) },
  };
  try {
    fn(emitted);
  } finally {
    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  }
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
    withEmit((emitted) => {
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
    });
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

/**
 * E6#73l：池挂载即播当前状态——**壳侧镜像的崩溃复位**。
 *
 * 池崩（crash-recovery 分支 1）= 整个渲染进程重来 = 本组件全新挂载、三态初值 `idle`；可壳侧那份
 * 镜像还停在上一个池留下的值上。旧写法「首帧跳过不发」⇒ 镜像卡在 `open` ⇒ 壳侧 `autoOpen` 的
 * 「面板已开」门禁恒为假 ⇒ 此后重要通知再也不自动弹，界面上完全看不出哪里坏了。
 * 断言只能落在「挂载那一帧到底发没发」上——这正是修的那一行。
 */
describe("E6#73l：挂载即播状态（壳侧镜像崩溃复位）", () => {
  it("mount 就发 notif:panel { idle, 不认账 }——不跳过首帧", () => {
    withEmit((emitted) => {
      render(<StatusBarZone statusBar={{ items: [], notif: NOTIF }} />);
      expect(emitted).toEqual([["notif:panel", { state: "idle", markSeen: false }]]);
    });
  });

  it("点铃铛开面板 → 镜像跟着走到 open（且认账）——挂载那一发不是终点", () => {
    withEmit((emitted) => {
      const { container } = render(<StatusBarZone statusBar={{ items: [], notif: NOTIF }} />);
      fireEvent.click(container.querySelector(".status-bar-notif-btn")!);
      expect(emitted).toEqual([
        ["notif:panel", { state: "idle", markSeen: false }],
        ["notif:panel", { state: "open", markSeen: true }],
      ]);
    });
  });
});

/**
 * E6#73k：可访问性——**读屏器与键盘用户**能不能用这条链。
 *
 * 断言只落在「无障碍树会读到的东西」上（role / aria-* / 焦点落点）——它们是硬的，
 * 而视觉对比度、点按目标尺寸、减动效这四条落在 CSS 里，由 `StatusBarZone.css` 的注释与
 * 人工核对承担（JSDOM 不进样式表，断言 CSS 只会写出一条永远为真的假测试）。
 */
describe("E6#73k：通知面 aria 语义", () => {
  /** 同时拿容器（铃铛/活区）与 baseElement（面板经 portal 挂到 body，不在容器里） */
  function renderBar(statusBar: StatusBarLayout) {
    return render(<StatusBarZone statusBar={statusBar} />);
  }

  it("J1 铃铛：可读名 + 弹出层语义 + 展开态 + 指向面板（此前只有一个裸数字「3」）", () => {
    const { container } = renderBar({ items: [], notif: NOTIF });
    const bell = container.querySelector(".status-bar-notif-btn")!;
    const panelId = "status-bar-notif-panel";
    expect(bell.getAttribute("aria-label")).toBe("通知");
    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    // 收起时不给 aria-controls——指向一个不在 DOM 里的 id 是悬空引用
    expect(bell.getAttribute("aria-controls")).toBeNull();

    fireEvent.click(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(bell.getAttribute("aria-controls")).toBe(panelId);
    expect(document.getElementById(panelId)).not.toBeNull();
  });

  it("J1 铃铛的可读名随未读走（「3 条通知」）——同一句话当 tooltip 也当可读名，不写第二份", () => {
    const { container } = renderBar({
      items: [],
      notif: { ...NOTIF, unread: 3, bellTitle: "3 条通知" },
    });
    expect(container.querySelector(".status-bar-notif-btn")!.getAttribute("aria-label")).toBe("3 条通知");
  });

  it("J1 面板 = role=dialog + 名字；× 有可读名（此前是枚读不出名字的字形）", () => {
    const { baseElement } = renderBar({
      items: [],
      notif: {
        ...NOTIF,
        groups: [{ key: "demo-plugin", label: "demo-plugin", unread: 0, items: [{ id: "toast-1", iconClass: "codicon codicon-info", message: "演示消息", timeLabel: "刚刚", actions: [] }] }],
      },
    });
    fireEvent.click(document.querySelector(".status-bar-notif-btn")!);
    const panel = baseElement.querySelector(".status-bar-notif-panel")!;
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-label")).toBe("通知");
    // 非模态：不遮罩、点外面不关、Tab 不被圈住——标成 aria-modal 是撒谎
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(baseElement.querySelector(".notif-panel-dismiss")!.getAttribute("aria-label")).toBe("关闭");
  });

  it("J2 活区常驻在状态栏里（**不在面板里**）——面板关着也听得见后台装完了", () => {
    const { container } = renderBar({ items: [], notif: NOTIF });
    const live = container.querySelector(".notif-sr-live")!;
    expect(live).not.toBeNull();
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector(".status-bar-notif-panel")).toBeNull(); // 面板确实没开
  });

  it("J2 通知落下来 → 活区跟着变；且**首次扫描只建基线**不出声", () => {
    const { container, rerender } = renderBar({ items: [], notif: NOTIF });
    const live = () => container.querySelector(".notif-sr-live")!;
    expect(live().textContent).toBe(""); // 基线：存量通知不念

    rerender(
      <StatusBarZone
        statusBar={{
          items: [],
          notif: {
            ...NOTIF,
            groups: [{ key: "demo-plugin", label: "demo-plugin", unread: 1, items: [{ id: "toast-1", iconClass: "codicon codicon-info", message: "演示消息", timeLabel: "刚刚", actions: [] }] }],
          },
        }}
      />,
    );
    expect(live().textContent).toBe("演示消息");
  });

  it("J3 确定态进度条：role=progressbar + 百分比 + 可读名 + 值文案", () => {
    const { baseElement } = renderBar({
      items: [],
      notif: {
        ...NOTIF,
        sections: [
          {
            key: "running",
            label: "1 项进行中",
            items: [{ id: "job-a", pluginId: "demo-plugin", name: "演示插件", iconClass: "codicon codicon-sync", statusLabel: "下载中 62%", percent: 62 }],
          },
        ],
      },
    });
    fireEvent.click(document.querySelector(".status-bar-notif-btn")!);
    const bar = baseElement.querySelector(".notif-progress")!;
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("演示插件");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("62");
    // 值文案取壳算好的状态短语（含阶段）——比单念一个数字有用
    expect(bar.getAttribute("aria-valuetext")).toBe("下载中 62%");
  });

  it("J3 不定态进度条**不给** aria-valuenow——ARIA 的「不确定进度」就是靠不给值表达的", () => {
    const { baseElement } = renderBar({
      items: [],
      notif: {
        ...NOTIF,
        groups: [{ key: "demo-plugin", label: "demo-plugin", unread: 0, items: [{ id: "toast-1", iconClass: "codicon codicon-info", message: "演示消息", timeLabel: "刚刚", progress: true, actions: [] }] }],
      },
    });
    fireEvent.click(document.querySelector(".status-bar-notif-btn")!);
    const bar = baseElement.querySelector(".notif-progress")!;
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
  });

  it("J3 畸形 percent 不喂给读屏器（负数钳到 0，不出 NaN）", () => {
    const { baseElement } = renderBar({
      items: [],
      notif: {
        ...NOTIF,
        sections: [
          {
            key: "running",
            label: "1 项进行中",
            items: [{ id: "job-a", pluginId: "demo-plugin", name: "演示插件", iconClass: "codicon codicon-sync", statusLabel: "下载中", percent: -5 }],
          },
        ],
      },
    });
    fireEvent.click(document.querySelector(".status-bar-notif-btn")!);
    expect(baseElement.querySelector(".notif-progress")!.getAttribute("aria-valuenow")).toBe("0");
  });
});

/**
 * E6#73k（J5）：焦点进面板 / 关闭归还铃铛。
 *
 * ⚠️ **唤醒（autoOpen）开的面板不抢焦点**——那是程序化打开，用户此刻可能正在文本框里打字
 * （设计 skill `toast-accessibility`：toasts must not steal focus）。两条路分开断言，
 * 因为「抢」与「不抢」正是同一个表达式 `openedByUser` 的全部内容。
 */
describe("E6#73k（J5）：焦点管理", () => {
  const PANEL_ITEM: NotifLayout = {
    ...NOTIF,
    groups: [{ key: "demo-plugin", label: "demo-plugin", unread: 0, items: [{ id: "toast-1", iconClass: "codicon codicon-info", message: "演示消息", timeLabel: "刚刚", actions: [] }] }],
  };

  it("点铃铛开 → 焦点落在**面板容器**上（不是「清除已完成」按钮上——随手一个 Enter 会把通知清了）", () => {
    const { container } = render(<StatusBarZone statusBar={{ items: [], notif: PANEL_ITEM }} />);
    fireEvent.click(container.querySelector(".status-bar-notif-btn")!);
    const panel = document.querySelector(".status-bar-notif-panel")!;
    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute("tabindex")).toBe("-1");
  });

  it("按「最小化」关 → 焦点**归还铃铛**（用户从哪进来的就回哪去）", () => {
    const { container } = render(<StatusBarZone statusBar={{ items: [], notif: PANEL_ITEM }} />);
    const bell = container.querySelector(".status-bar-notif-btn")!;
    fireEvent.click(bell);
    const minimize = [...document.querySelectorAll(".notif-panel-action")].find((b) => b.textContent === "最小化")!;
    fireEvent.click(minimize);
    expect(document.activeElement).toBe(bell);
  });

  it("关之前用户已经把焦点用去别处 → **不夺回来**（只在焦点真丢了时才还）", () => {
    const { container } = render(<StatusBarZone statusBar={{ items: [], notif: PANEL_ITEM }} />);
    fireEvent.click(container.querySelector(".status-bar-notif-btn")!);
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    const minimize = [...document.querySelectorAll(".notif-panel-action")].find((b) => b.textContent === "最小化")!;
    fireEvent.click(minimize);
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("唤醒开面板（autoOpen）→ 焦点**原地不动**（用户可能正在别处打字）", () => {
    const { container } = render(
      <StatusBarZone statusBar={{ items: [], notif: { ...PANEL_ITEM, autoOpen: true } }} />,
    );
    // 面板确实被弹开了（唤醒生效）……
    expect(container.querySelector(".status-bar-notif-btn")!.getAttribute("aria-expanded")).toBe("true");
    // ……但焦点没被拽走
    expect(document.activeElement).toBe(document.body);
  });
});
