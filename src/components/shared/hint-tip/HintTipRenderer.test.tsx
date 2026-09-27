/**
 * HintTipRenderer 单测——04「悬停提示系统」件 1（设计详案 §四·4.4 状态机 + §五 门禁）。
 *
 * 两条腿：
 *  ① **纯函数** `resolveHintPayload`（属性 + 命令表 → 一条提示的载荷）——所有判空/回退/非法值都在
 *     这一处，直接钉死（比在 DOM 上间接验稳）；
 *  ② **状态机**（委托监听 + 延时 + 开/收 + aria 借还）——用 jsdom 真事件跑一遍。
 *     它在集成层不可见的失效方向正是这里要拦的：出了条收不掉（残留浮层）、延时没到就出（划过闪一串）、
 *     关掉总开关仍然挂监听、aria-describedby 留一个指向已消失元素的 id。
 */
import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { default as HintTipRenderer, resolveHintPayload } from "./HintTipRenderer";
import { DEFAULT_OPEN_DELAY_MS, HINT_DELAY_ATTR, HINT_PLACEMENT_ATTR } from "./hintAttrs";
import type { PoolCommandHints } from "../../../core/types/pool/poolLayout";

const COMMANDS: PoolCommandHints = {
  "workbench.action.closeTab": { title: "关闭标签页", keybinding: "Ctrl+W" },
  "workbench.action.plain": { title: "没有快捷键的命令" },
};

/** 造一个挂在 `document.body` 上的锚（纯函数测试用——不进 React 树） */
function anchorEl(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement("button");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

// 延时是这一件的主轴（120ms 意图延时 / 揭示类 0）——全组统一开假表，免得每个用例各写一遍
beforeEach(() => {
  vi.useFakeTimers();
});

describe("resolveHintPayload 纯函数（属性 + 命令表 → 载荷）", () => {
  it("两个属性都没有 ⇒ null（不是提示点，委托监听白碰到也不出条）", () => {
    expect(resolveHintPayload(anchorEl({}), COMMANDS)).toBeNull();
  });

  it("只有 data-hint ⇒ 用它当文案；无 shortcut；缺省延时/方位", () => {
    const p = resolveHintPayload(anchorEl({ "data-hint": "最小化" }), COMMANDS);
    expect(p).toEqual({ label: "最小化", placement: "top", openDelayMs: DEFAULT_OPEN_DELAY_MS });
  });

  it("只有 data-hint-command ⇒ 文案取命令 title + 快捷键取该命令绑定（与菜单同源）", () => {
    const p = resolveHintPayload(anchorEl({ "data-hint-command": "workbench.action.closeTab" }), COMMANDS);
    expect(p).toEqual({ label: "关闭标签页", shortcut: "Ctrl+W", placement: "top", openDelayMs: DEFAULT_OPEN_DELAY_MS });
  });

  it("data-hint 优先于命令 title；快捷键仍从命令表取（文案自己写、键照样自动带）", () => {
    const p = resolveHintPayload(anchorEl({ "data-hint": "关掉当前这一个", "data-hint-command": "workbench.action.closeTab" }), COMMANDS);
    expect(p?.label).toBe("关掉当前这一个");
    expect(p?.shortcut).toBe("Ctrl+W");
  });

  it("命令无绑定时不出现 shortcut 字段（⛔ 不出空键帽）", () => {
    const p = resolveHintPayload(anchorEl({ "data-hint-command": "workbench.action.plain" }), COMMANDS);
    expect(p?.label).toBe("没有快捷键的命令");
    expect(p?.shortcut).toBeUndefined();
  });

  it("命令表里没有该 id（未注册/表未到达）⇒ 空文案 ⇒ null（不出空条）", () => {
    expect(resolveHintPayload(anchorEl({ "data-hint-command": "no.such.command" }), COMMANDS)).toBeNull();
  });

  it("命令表整个缺席（缺省参数）⇒ 只有 data-hint 能出条", () => {
    expect(resolveHintPayload(anchorEl({ "data-hint": "文案自己有" }))?.label).toBe("文案自己有");
    expect(resolveHintPayload(anchorEl({ "data-hint-command": "workbench.action.closeTab" }))).toBeNull();
  });

  it("空文案/纯空白 ⇒ null（空属性与「命令 title 为空」两条路都拦）", () => {
    expect(resolveHintPayload(anchorEl({ "data-hint": "" }), COMMANDS)).toBeNull();
    expect(resolveHintPayload(anchorEl({ "data-hint": "   " }), COMMANDS)).toBeNull();
    expect(resolveHintPayload(anchorEl({ "data-hint-command": "empty.title" }), { "empty.title": { title: "" } })).toBeNull();
  });

  it("数据 hint 合法性：揭示类可传 0（立刻），非法值落回缺省（⛔ 不抛、也不静默变 0）", () => {
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_DELAY_ATTR]: "0" }), COMMANDS)?.openDelayMs).toBe(0);
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_DELAY_ATTR]: "250" }), COMMANDS)?.openDelayMs).toBe(250);
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_DELAY_ATTR]: "abc" }), COMMANDS)?.openDelayMs).toBe(DEFAULT_OPEN_DELAY_MS);
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_DELAY_ATTR]: "-5" }), COMMANDS)?.openDelayMs).toBe(DEFAULT_OPEN_DELAY_MS);
  });

  it("方位合法性：四向认，乱写落回 top", () => {
    for (const pl of ["top", "bottom", "left", "right"] as const) {
      expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_PLACEMENT_ATTR]: pl }), COMMANDS)?.placement).toBe(pl);
    }
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_PLACEMENT_ATTR]: "diagonal" }), COMMANDS)?.placement).toBe("top");
    expect(resolveHintPayload(anchorEl({ "data-hint": "x", [HINT_PLACEMENT_ATTR]: "TOP" }), COMMANDS)?.placement).toBe("top");
  });
});

describe("HintTipRenderer 状态机（委托监听 + 延时 + 开收 + aria 借还）", () => {
  /** 挂载渲染器 + 一个按钮锚（锚是普通 DOM，与组件的 DOM 结构关系无关——这正是属性式的意义） */
  function mount(attrs: Record<string, string> = { "data-hint": "最小化" }, props: { enabled?: boolean; commands?: PoolCommandHints } = {}) {
    const r = render(
      <>
        <HintTipRenderer commands={props.commands ?? COMMANDS} enabled={props.enabled ?? true} />
        <div id="host">
          <button type="button" {...attrs} />
        </div>
      </>,
    );
    return { ...r, btn: screen.getByRole("button") };
  }

  it("正控：指针进入 → 延时未到不出条；延时到 → 出条（文案 + 键帽 + aria-describedby 指过来）", () => {
    const { btn } = mount({ "data-hint-command": "workbench.action.closeTab" });
    fireEvent.pointerOver(btn);
    expect(screen.queryByRole("tooltip")).toBeNull(); // 意图延时未到
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    const tip = screen.getByRole("tooltip");
    expect(tip.className).toBe("ldk-hint-tip");
    expect(screen.getByText("关闭标签页").className).toBe("ldk-hint-tip-label");
    expect(screen.getByText("Ctrl").tagName).toBe("KBD"); // 键帽（不是等宽纯文本）
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
  });

  it("揭示类延时 0 ⇒ 立刻出条（「看全被截断的字」不该等）", () => {
    const { btn } = mount({ "data-hint": "很长很长的一串名字", "data-hint-delay": "0" });
    fireEvent.pointerOver(btn);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  it("指针移开 ⇒ 收条并归还 aria（⛔ 不留指向已消失元素的 id）", () => {
    const { btn } = mount();
    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.pointerOut(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(btn.hasAttribute("aria-describedby")).toBe(false);
  });

  it("aria 借还：锚自带 aria-describedby ⇒ 收条时**还原**原值（不是删掉）", () => {
    const { btn } = mount({ "data-hint": "最小化" });
    btn.setAttribute("aria-describedby", "原有说明");
    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    expect(btn.getAttribute("aria-describedby")).not.toBe("原有说明"); // 借用期指向条
    fireEvent.pointerOut(btn);
    expect(btn.getAttribute("aria-describedby")).toBe("原有说明"); // 原值归还
  });

  it("延时内移开 ⇒ 计时器作废（⛔ 鼠标早走了条还弹出来）", () => {
    const { btn } = mount();
    fireEvent.pointerOver(btn);
    fireEvent.pointerOut(btn); // 延时未到就离开
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS * 3); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("密集排只出一张：连着划过两个锚 ⇒ 最终只有后一个的条（先收旧再上新）", () => {
    const { container } = render(
      <>
        <HintTipRenderer commands={COMMANDS} />
        <div>
          <button type="button" data-hint="first anchor" />
          <button type="button" data-hint="second anchor" />
        </div>
      </>,
    );
    const [a, b] = Array.from(container.querySelectorAll("button"));
    fireEvent.pointerOver(a);
    act(() => { vi.advanceTimersByTime(30); }); // 还没到 120ms 就移到下一个
    fireEvent.pointerOver(b);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByText("second anchor")).toBeTruthy();
  });

  it("Esc / 点下 / 拖拽开始 ⇒ 收条；拖拽期间进入新锚也不出条（拖标签时别挡视线）", () => {
    const { btn } = mount();
    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    fireEvent.pointerDown(document);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.dragStart(btn);
    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    expect(screen.queryByRole("tooltip")).toBeNull(); // 拖拽中抑制
    fireEvent.dragEnd(btn);
  });

  it("键盘路径不延时（Tab 到按钮立刻看见说明）", () => {
    const { btn } = mount();
    fireEvent.focusIn(btn);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  it("总开关关掉 ⇒ 一个条都不出（不挂委托监听）", () => {
    const { btn } = mount({ "data-hint": "最小化" }, { enabled: false });
    fireEvent.pointerOver(btn);
    fireEvent.focusIn(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS * 3); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("结构零侵入：渲染器不给锚包任何宿主层（锚的父节点仍是原容器）", () => {
    const { btn } = mount();
    expect(btn.parentElement?.id).toBe("host");
    fireEvent.pointerOver(btn);
    act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
    expect(btn.parentElement?.id).toBe("host"); // 出条后也不变（条 portal 到 overlay root / body）
  });

  describe("气泡尖角（DOM 契约——CSS 那四条 `[data-tip-placement]` 规则靠这两样东西挂上）", () => {
    it("条里带尖角元素（纯装饰 ⇒ aria-hidden）＋ 根上写**实际**落点方位；沿边落位内联在副轴那一维", () => {
      const { btn } = mount({ "data-hint": "最小化" });
      fireEvent.pointerOver(btn);
      act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
      const tip = screen.getByRole("tooltip");
      const tail = tip.querySelector(".ldk-hint-tip-tail") as HTMLElement;
      expect(tail).not.toBeNull();
      expect(tail.getAttribute("aria-hidden")).toBe("true"); // 不参与无障碍树（没有任何语义）
      // jsdom 无布局（锚与条尺寸全 0）⇒ 首选 top 那一侧空间只有 0px（< 条长+GAP）⇒ **如实翻面到 bottom**
      expect(tip.getAttribute("data-tip-placement")).toBe("bottom");
      // 横条的沿边落位写 `left`、竖条写 `top`——CSS 只管主轴那一侧的偏移，两处不许撞
      expect(tail.style.getPropertyValue("left")).not.toBe("");
      expect(tail.style.getPropertyValue("top")).toBe("");
    });

    it("首选方位主轴不够 ⇒ 属性反映**翻面后**的方位（left ⇒ right），不回写首选", () => {
      const { btn } = mount({ "data-hint": "最小化", "data-hint-placement": "left" });
      fireEvent.pointerOver(btn);
      act(() => { vi.advanceTimersByTime(DEFAULT_OPEN_DELAY_MS); });
      const tip = screen.getByRole("tooltip");
      expect(tip.getAttribute("data-tip-placement")).toBe("right");
      const tail = tip.querySelector(".ldk-hint-tip-tail") as HTMLElement;
      expect(tail.style.getPropertyValue("top")).not.toBe("");
      expect(tail.style.getPropertyValue("left")).toBe("");
    });
  });
});
