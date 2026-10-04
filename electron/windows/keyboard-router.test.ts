/**
 * keyboard-router 单测——件 1「录制吞键」（`docs/04-软件更新/待抉择池/快捷键页-录制与齿轮菜单.md`）。
 *
 * 缺陷：池插件录制组合键时，壳已占用的键（`ctrl+k` = 内置 chord 前缀）在主进程就被
 * `preventDefault()` 吞掉，键根本没投给池 WebView ⇒ 录制器一次都收不到。
 * 修法：按 `webContents.id` 记「键盘直通」，由 `setKeybindingCaptureActive` 代理信号翻转。
 *
 * 五条用例对档内验收判据逐一钉住：
 *   ① 直通态下 `ctrl+k` 不 preventDefault、不转发、**不进 chord pending**；
 *   ② 翻转「开」时已挂起的 chord 被清（否则上一次的 `ctrl+k` 会吞掉录制者的第一个键）；
 *   ③ 视图销毁 / 宿主窗失焦（= clearKeyboardPassthrough）后标志不残留；
 *   ④ 逐视图隔离——A 视图录制不影响 B 视图；
 *   ⑤ 回归：非直通态 `ctrl+k` 照旧拦截并转发壳。
 *
 * 断言落点选 preventDefault（而非 send）是刻意的：send 被 50ms `shouldDedup` 门控，
 * 连续同键容易假阴性；preventDefault 与防抖无关。用例间用假时钟步进 100ms 绕开防抖窗口。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）——此处只需副作用（注册 vi.mock）。
//    本文件不构造 BrowserWindow / WebContentsView（SUT 只把它们用在类型位），
//    故共享桩无需补这两个面——真构造会由 TS 报错，不会静默成 undefined。
import "../services/electron-mock.js";

import { attachKeyboardRouting, setKeyboardPassthrough, clearKeyboardPassthrough, syncKeybindings } from "./keyboard-router.js";
import { IPC } from "../ipc/channels.js";

type EventHandler = (...args: unknown[]) => void;

/** 桩 WebContents——只实现 SUT 用到的面：id / on / isDestroyed */
function makeView(id: number) {
  const handlers = new Map<string, EventHandler[]>();
  const webContents = {
    id,
    isDestroyed: () => false,
    on: (event: string, fn: EventHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 桩对象不必满足 WebContentsView 全量面，边界一次归一
    view: { webContents } as any,
    emit: (event: string, ...args: unknown[]) => {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    },
    listenerCount: (event: string) => (handlers.get(event) ?? []).length,
  };
}

type FakeView = ReturnType<typeof makeView>;

/** 一次按键——`base` 是键位串（`ctrl+shift+alt+9` 故意选表外键：未命中即证明没落进 chord 第二键） */
const CTRL_K = { key: "k", code: "KeyK", control: true };
const UNMAPPED = { key: "9", code: "Digit9", control: true, shift: true, alt: true };

// 假时钟只在模块级单调递增，⛔ 不在 beforeEach 里归零：`shouldDedup` 的模块态跨用例存活，
// 时钟倒退会让 `now - _lastForwarded.time` 变负（< 50ms）⇒ 后续用例被误判重复而静默不转发。
let clock = 0;
const BASE_MS = Date.parse("2026-10-05T00:00:00.000Z");
const SENTINEL_ID = -1; // 归零模块级 chord 态用的哨兵视图 id（真视图 id 恒为正）

function press(view: FakeView, partial: Record<string, unknown>): { preventDefault: ReturnType<typeof vi.fn> } {
  clock += 100; // 步进越过 50ms 防抖窗口——同键连续按也不被 shouldDedup 吃掉
  vi.setSystemTime(new Date(BASE_MS + clock));
  const event = { preventDefault: vi.fn() };
  view.emit("before-input-event", event, {
    type: "keyDown", key: "", code: "", control: false, shift: false, alt: false, meta: false, isAutoRepeat: false,
    ...partial,
  });
  return event;
}

let mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE_MS + clock));
  // 模块级状态归零：哨兵「开」会顺带 clearMainChord()（同步集由下面的 close 摘掉，不留痕）
  setKeyboardPassthrough(SENTINEL_ID, true);
  clearKeyboardPassthrough(SENTINEL_ID);
  syncKeybindings({ shortcuts: ["ctrl+s"], chordPrefixes: ["ctrl+k"], chordCombos: ["ctrl+k ctrl+l"] });
  send = vi.fn();
  mainWindow = { webContents: { send } };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("件 1 · 键盘直通（录制态）", () => {
  it("① 直通态下 ctrl+k 放行：不 preventDefault · 不转发 · 不进 chord pending", () => {
    const a = makeView(101);
    attachKeyboardRouting(a.view, mainWindow as never, "main");

    setKeyboardPassthrough(101, true);
    const ev = press(a, CTRL_K);
    expect(ev.preventDefault).not.toHaveBeenCalled(); // 键照落 WebView——录制器才收得到
    expect(send).not.toHaveBeenCalled();

    // 探针：退出直通后按一个表外键。若刚才那次 ctrl+k 留下了 pending，此键必被当「chord 第二键」
    // 吞掉（preventDefault + forward）；没有 pending 才会原样放行。
    setKeyboardPassthrough(101, false);
    const probe = press(a, UNMAPPED);
    expect(probe.preventDefault).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("② 翻转「开」时已挂起的 chord 被清——录制者的第一个键不被吞", () => {
    const a = makeView(102);
    attachKeyboardRouting(a.view, mainWindow as never, "main");

    const first = press(a, CTRL_K); // 非直通态：命中 chord 前缀，进 pending
    expect(first.preventDefault).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);

    setKeyboardPassthrough(102, true); // 起录制
    const probe = press(a, UNMAPPED); // 表外键：有 pending 会被吞，没 pending 才放行
    expect(probe.preventDefault).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("③ destroyed 与宿主窗 blur 两个清理点都不残留标志", () => {
    const a = makeView(103);
    attachKeyboardRouting(a.view, mainWindow as never, "main");
    expect(a.listenerCount("destroyed")).toBe(1);

    // 清理点 A：视图销毁（attachKeyboardRouting 内注册的 destroyed 钩子）
    setKeyboardPassthrough(103, true);
    a.emit("destroyed");
    expect(press(a, CTRL_K).preventDefault).toHaveBeenCalled();

    // 清理点 B：宿主窗 blur（window-manager 的 onHostBlur 调的就是这个函数）
    setKeyboardPassthrough(103, true);
    expect(press(a, CTRL_K).preventDefault).not.toHaveBeenCalled();
    clearKeyboardPassthrough(103);
    expect(press(a, CTRL_K).preventDefault).toHaveBeenCalled();
  });

  it("④ 逐视图隔离——A 视图录制不影响 B 视图", () => {
    const a = makeView(104);
    const b = makeView(105);
    attachKeyboardRouting(a.view, mainWindow as never, "main");
    attachKeyboardRouting(b.view, mainWindow as never, "main");

    setKeyboardPassthrough(104, true);
    expect(press(a, CTRL_K).preventDefault).not.toHaveBeenCalled(); // 录制中的视图：放行
    expect(press(b, CTRL_K).preventDefault).toHaveBeenCalled(); // 另一视图：照旧拦截
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("⑤ 回归：非直通态 ctrl+k 仍被拦截并转发壳（带 sourceWindowId）", () => {
    const a = makeView(106);
    attachKeyboardRouting(a.view, mainWindow as never, "main");

    const ev = press(a, CTRL_K);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(IPC.keyboard.executeShortcut, expect.objectContaining({
      key: "k", ctrlKey: true, sourceWindowId: "main",
    }));
  });
});
