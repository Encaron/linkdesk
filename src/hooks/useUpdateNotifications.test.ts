/**
 * useUpdateNotifications——更新通知面生产者单测（E6#57.12）。
 *
 * 逐条钉住 `useUpdateNotifications.ts` 文件头那几条**写反了也照样能跑**的约束：
 * ① 一条条目贯穿全程（发现 → 进度 → 完成 复用同一个 id，不闪不换位）；
 * ② **「完成」必须活过「后台运行」的那次关闭**（`ensureEntry` 重新长出来）；
 * ③ 进度段的 `updateEntryIfLive` **不重建**（否则「后台运行」那个按钮等于没用）；
 * ④ **发起方自消化**：同一个 `idle + lastError`，`context=false` 静默、`true` 出声——
 *    这是全仓唯一能区分「后台」与「手动」的地方（态里区分不出来），必须成对断言；
 * ⑤ 唤醒旗标：进度不弹（`wake:false`）、发现/完成/手动已最新要弹。
 *
 * 🔴 被测模块持有**模块级单例**（`_entryId`/`_announcedVersion`/`_warnedKeys`），且它消费的
 * `toast.ts` 同样是模块级队列 ⇒ 每个用例 `vi.resetModules()` + 动态 import 拿一份干净模块
 * （对标 `useUpdateState.test.ts` 的单例手法）；静态 import 会让上一个用例的条目漏进下一个。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9 / 0.0.1、URL 走 `.invalid` 保留域、腿的归因句用
 * `演示腿的归因句` 这种明显不存在的串。**断言的是壳加前缀那一步**——腿自己那六类句子的逐字
 * 覆盖归 `electron/services/update-source.test.ts`，不在这里复读真实文案。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { DownloadProgress, UpdateInfo, UpdateState } from "../core/types/ipc/update";

/** 更新描述桩——字段值全虚构（`.invalid` = RFC 2606 保留域，永不解析） */
const INFO: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.0.1",
  publishedAt: "2026-01-01T00:00:00Z",
  releaseNotesUrl: "https://demo.invalid/releases/v9.9.9",
};
/** 下一个版本——验「版本变了另起一条」 */
const NEXT: UpdateInfo = { ...INFO, version: "9.9.10" };

/** 腿产出的结构化失败（`UpdateError.message` 是 i18n key 形态；这里给一个明显不存在的串） */
const LEG_ERR = { code: "network", message: "演示腿的归因句" } as const;

type HookModule = typeof import("./useUpdateNotifications");
type ToastModule = typeof import("../core/services/ui/toast");

interface Stub {
  /** 模拟主进程广播一次状态迁移 */
  emit: (state: UpdateState) => void;
  /** 模拟主进程推一帧下载进度（`update:progress` 通道） */
  emitProgress: (progress: DownloadProgress) => void;
  /** `checkForUpdates` 收到的 `context` 实参逐次记录——「后台/手动」的分界就在这里 */
  checkContexts: boolean[];
  /** 让下一次 `checkForUpdates` 以该态 resolve */
  setCheckResult: (state: UpdateState) => void;
  /** 让下一次 `downloadUpdate` 以该态 resolve */
  setDownloadResult: (state: UpdateState) => void;
  downloadCalls: () => number;
  installCalls: () => number;
  /** 让 `quitAndInstall` 以该错误 reject（默认 resolve） */
  setInstallError: (err: unknown) => void;
}

function installStub(): Stub {
  const handlers = new Set<(state: UpdateState) => void>();
  const progressHandlers = new Set<(progress: DownloadProgress) => void>();
  const checkContexts: boolean[] = [];
  let checkResult: UpdateState = { type: "idle" };
  let downloadResult: UpdateState = { type: "idle" };
  let installError: unknown = null;
  let downloadCalls = 0;
  let installCalls = 0;

  const update = {
    // 立即 resolve 一个中性快照——壳 preload 的形状确实是异步 invoke，但那条竞态已由
    // `useUpdateState.test.ts` 逐条钉过；这里只需要它能落定，好让广播成为唯一的驱动源。
    getState: async () => ({ type: "uninitialized" }) as UpdateState,
    onStateChanged: (cb: (state: UpdateState) => void) => {
      handlers.add(cb);
      return () => { handlers.delete(cb); };
    },
    onProgress: (cb: (progress: DownloadProgress) => void) => {
      progressHandlers.add(cb);
      return () => { progressHandlers.delete(cb); };
    },
    checkForUpdates: async (context: boolean) => { checkContexts.push(context); return checkResult; },
    downloadUpdate: async () => { downloadCalls += 1; return downloadResult; },
    quitAndInstall: async () => { installCalls += 1; if (installError) throw installError; },
  };
  (window as unknown as { linkdesk: unknown }).linkdesk = { update };

  return {
    emit: (state) => { for (const cb of [...handlers]) cb(state); },
    emitProgress: (p) => { for (const cb of [...progressHandlers]) cb(p); },
    checkContexts,
    setCheckResult: (state) => { checkResult = state; },
    setDownloadResult: (state) => { downloadResult = state; },
    downloadCalls: () => downloadCalls,
    installCalls: () => installCalls,
    setInstallError: (err) => { installError = err; },
  };
}

let mod: HookModule;
let toast: ToastModule;
let stub: Stub;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear(); // 通知面的「用户不要了」台账走 localStorage，逐用例清干净
  mod = await import("./useUpdateNotifications");
  toast = await import("../core/services/ui/toast");
  stub = installStub();
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

/** 放掉一串微任务 + 一个宏任务——`reportError` 内部是**动态** import toast，纯微任务放不完 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** 挂上生产者 */
function mountProducer(): void {
  renderHook(() => mod.useUpdateNotifications());
}

/** 推进一次状态迁移 */
function transition(state: UpdateState): void {
  act(() => { stub.emit(state); });
}

/**
 * 点条目上的**主按钮**（「重启并更新」）并放完它内部的异步。
 * ⚠️ 必须 `await flush()`：`notif:action` 的分发器是「`onClick(); dismissToast(id)`」的**同步**调用，
 * onClick 返回的 promise 无人 await——所以测试里的期望必须等这些微任务真的跑完，
 * 而且「漏出去的 rejected promise」这件事本身也只能在这段等待里暴露出来。
 */
async function clickPrimary(): Promise<void> {
  const primary = toast.getToasts()[0].actions?.find((a) => a.isPrimary);
  await act(async () => { primary?.onClick(); await flush(); });
}

describe("useUpdateNotifications（① 一条条目贯穿全程）", () => {
  it("发现 → 进度 → 完成 复用同一个 id（不 dismiss+push：行不闪、不换位）", () => {
    mountProducer();

    transition({ type: "available", update: INFO });
    const discovered = toast.getToasts();
    expect(discovered).toHaveLength(1);
    // 消息里必须带版本号——`isCloseAffordance` 的抑制键是 `source::message`，不带版本号就
    // 变成「关掉 9.9.9 时把 9.9.10 一起静音」
    expect(discovered[0].message).toContain(INFO.version);
    expect(discovered[0].isCloseAffordance).toBe(true);
    expect(discovered[0].wake).toBe(true);

    transition({ type: "downloading", update: INFO, progress: { transferred: 3, total: 10, percent: 30 } });
    const downloading = toast.getToasts();
    expect(downloading).toHaveLength(1);
    expect(downloading[0].id).toBe(discovered[0].id);
    expect(downloading[0].progress).toBe(true);
    expect(downloading[0].percent).toBe(30);

    transition({ type: "downloaded", update: INFO });
    const done = toast.getToasts();
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe(discovered[0].id);
    // 完成必须**退出进行中**——否则「清除已完成」收不掉它、面板也不画 ×（`isPending`）
    expect(done[0].progress).toBe(false);
    expect(done[0].percent).toBeUndefined();
    expect(done[0].actions).toHaveLength(2);
  });

  it("🔴 完成条目**不设** isCloseAffordance——它的消息里没有版本号，设了就是「关一次、永远静音」", () => {
    mountProducer();
    transition({ type: "downloaded", update: INFO });

    // 对照正控：发现那条**必须**设（上一个用例已断言），完成这条**必须不设**
    expect(toast.getToasts()[0].isCloseAffordance).not.toBe(true);
  });

  it("同一版本不重复弹（后台每 4h 回到 available 一次，不该凭空多一条）", () => {
    mountProducer();
    transition({ type: "available", update: INFO });
    transition({ type: "checking" });
    transition({ type: "available", update: INFO });

    expect(toast.getToasts()).toHaveLength(1);
  });

  it("🔴 同版本**回** available 不许改写正在跑的那条——否则留下「发现文案 + progress:true」的半截条目", () => {
    mountProducer();
    transition({ type: "available", update: INFO }); // 发现
    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });
    transition({ type: "idle", lastError: { ...LEG_ERR } }); // 下载失败（本模块对 idle 静默，条目原地留着）
    transition({ type: "available", update: INFO }); // [重试] 重查又查到同一个版本

    // `_announcedVersion` 这道去重拦的就是这一步：发现补丁里**没有** `progress` 字段，
    // 一旦改写，`{...prev, ...patch}` 会留下「有可用的更新」+ `progress: true` 的半截条目——
    // 那种条目面板里不画 ×、`notif:clearAll` 也跳过，用户**清不掉它**。
    const now = toast.getToasts()[0];
    expect(now.message).not.toContain("有可用的更新");
    expect(now.progress).toBe(true);
  });

  it("版本变了另起一条，且带的是**新**版本号", () => {
    mountProducer();
    transition({ type: "available", update: INFO });
    transition({ type: "available", update: NEXT });

    const live = toast.getToasts();
    expect(live.some((t) => t.message.includes(NEXT.version))).toBe(true);
  });
});

describe("useUpdateNotifications（② 进度段：独立通道 + 校验段的诚实归零）", () => {
  it("进度帧推进条目——不靠状态迁移（服务原地刷状态、不发 stateChanged）", () => {
    mountProducer();
    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });
    const id = toast.getToasts()[0].id;

    act(() => { stub.emitProgress({ transferred: 7, total: 10, percent: 70 }); });

    const now = toast.getToasts()[0];
    expect(now.id).toBe(id);
    expect(now.percent).toBe(70);
  });

  it("🔴 收到 100% ⇒ 落「正在校验…」并把 percent **显式归 undefined**（留着 100 不动会被读成卡死）", () => {
    mountProducer();
    transition({ type: "downloading", update: INFO, progress: { transferred: 5, total: 10, percent: 50 } });

    act(() => { stub.emitProgress({ transferred: 10, total: 10, percent: 100 }); });

    const now = toast.getToasts()[0];
    expect(now.percent).toBeUndefined();
    expect(now.message).not.toContain("100");
  });

  it("🔴 进度条目 wake:false——否则它每帧都会命中 autoOpen，用户按一次「最小化」就被弹回来", () => {
    mountProducer();
    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });

    // 本条带一个 action；不显式压掉 wake，`defaultWake` 会判「该弹」
    expect(toast.getToasts()[0].wake).toBe(false);
  });
});

describe("useUpdateNotifications（③ 「后台运行」之后，完成必须自己长回来）", () => {
  /** 复刻面板那条路：`notif:action` 分发器 = `action.onClick(); dismissToast(id)`（无条件 dismiss） */
  function clickActionThenDismiss(actionIndex: number): void {
    const target = toast.getToasts()[0];
    act(() => {
      target.actions?.[actionIndex]?.onClick();
      toast.dismissToast(target.id);
    });
  }

  it("🔴 下载中点「后台运行」⇒ 条目消失；进度帧不把它拉回来", () => {
    mountProducer();
    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });
    clickActionThenDismiss(0);
    expect(toast.getToasts()).toHaveLength(0);

    // 🔴 发**两帧**：第一帧只是发现 `_entryId` 指向的条目已死（`replaceToast` 返 false ⇒ 落 null），
    //    第二帧才是「条目不在了，要不要重建」那一刻。只发一帧的话，把 `updateEntryIfLive`
    //    写成「不在就重建」的变异实现照样绿——实测过，这条断言是被变异逼出来的。
    act(() => { stub.emitProgress({ transferred: 6, total: 10, percent: 60 }); });
    act(() => { stub.emitProgress({ transferred: 8, total: 10, percent: 80 }); });

    // 长回来 = 那个按钮没用（用户还白按了一次）
    expect(toast.getToasts()).toHaveLength(0);
  });

  it("🔴 但**完成**必须长回来——否则按下「后台运行」就再也等不到「已下载，重启后生效」", () => {
    mountProducer();
    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });
    clickActionThenDismiss(0);

    transition({ type: "downloaded", update: INFO });

    const live = toast.getToasts();
    expect(live).toHaveLength(1);
    expect(live[0].progress).toBe(false);
    expect(live[0].actions?.some((a) => a.isPrimary)).toBe(true); // 「重启并更新」是主按钮
  });

  it("发现条目被 × 掉（落「用户不要了」台账）后，进度条**照常**出现——那是用户自己按的「立即更新」", () => {
    mountProducer();
    transition({ type: "available", update: INFO });
    const id = toast.getToasts()[0].id;
    act(() => { toast.dismissToast(id); }); // × = 台账记账 + 移除
    expect(toast.getToasts()).toHaveLength(0);

    transition({ type: "downloading", update: INFO, progress: { transferred: 1, total: 10, percent: 10 } });

    expect(toast.getToasts()).toHaveLength(1);
    expect(toast.getToasts()[0].progress).toBe(true);
  });
});

describe("useUpdateNotifications（④ 降级放行的记账单独一条）", () => {
  it("downloaded 带 warning ⇒ 完成一条 + warning 一条（severity 区分、warning 不唤醒）", () => {
    mountProducer();
    transition({ type: "downloaded", update: INFO, warning: { code: "checksum-unavailable", message: "演示腿的降级句" } });

    const live = toast.getToasts();
    expect(live).toHaveLength(2);
    const warn = live.find((t) => t.severity === "warning");
    expect(warn?.message).toBe("演示腿的降级句");
    // warning 不在唤醒白名单里——它不该把面板弹开
    expect(warn?.wake).toBe(false);
  });

  it("重挂载不重复报同一笔账（同版本同码只一条）", () => {
    mountProducer();
    transition({ type: "downloaded", update: INFO, warning: { code: "checksum-unavailable", message: "演示腿的降级句" } });
    mountProducer(); // 第二个消费者（引用计数共享同一份订阅）+ 一次全新的首次观察
    transition({ type: "ready", update: INFO, warning: { code: "checksum-unavailable", message: "演示腿的降级句" } });

    expect(toast.getToasts().filter((t) => t.severity === "warning")).toHaveLength(1);
  });
});

describe("发起方自消化（⑤ 后台静默 / 手动出声——**成对的负控**）", () => {
  it("🔴 手动（context=true）失败 ⇒ 出声，带腿的人话 + [重试]", async () => {
    stub.setCheckResult({ type: "idle", lastError: { ...LEG_ERR } });

    const next = await mod.checkForUpdatesAndReport(true);

    expect(next).toMatchObject({ type: "idle" });
    const live = toast.getToasts();
    expect(live).toHaveLength(1);
    expect(live[0].message).toContain("演示腿的归因句"); // 腿的人话被渲染进来，不是壳另写一份
    expect(live[0].severity).toBe("error");
    expect(live[0].actions?.[0]?.label).toBe("重试");
    expect(live[0].ttl).toBe(toast.TOAST_TTL_ERROR);
  });

  it("🔴 负控：**同一个** idle+lastError 走后台（context=false）⇒ 一条都不出", async () => {
    stub.setCheckResult({ type: "idle", lastError: { ...LEG_ERR } });

    const next = await mod.checkForUpdatesAndReport(false);

    // 态照常返回（记账在服务里，后台只是不说话）
    expect(next).toMatchObject({ type: "idle", lastError: { code: "network" } });
    expect(toast.getToasts()).toHaveLength(0);
    // 而且 context 原样透传给了检查腿（说不说话与腿收到的必须是同一个值）
    expect(stub.checkContexts).toEqual([false]);
  });

  it("手动查到无更新 ⇒ 短提示，且**显式 wake**（否则铃铛悄悄 +1，用户以为点了没反应）", async () => {
    stub.setCheckResult({ type: "idle" });

    await mod.checkForUpdatesAndReport(true);

    const live = toast.getToasts();
    expect(live).toHaveLength(1);
    expect(live[0].wake).toBe(true);
    expect(live[0].ttl).toBe(toast.TOAST_TTL_SUCCESS);
  });

  it("🔴 available **不由调用方出声**——发现条目归迁移驱动，两条路都出就是两条", async () => {
    stub.setCheckResult({ type: "available", update: INFO });

    await mod.checkForUpdatesAndReport(true);

    expect(toast.getToasts()).toHaveLength(0);
  });

  it("[重试] 真的重走了一遍检查（context 仍为 true）", async () => {
    stub.setCheckResult({ type: "idle", lastError: { ...LEG_ERR } });
    await mod.checkForUpdatesAndReport(true);

    await act(async () => {
      toast.getToasts()[0].actions?.[0]?.onClick();
      await flush();
    });

    expect(stub.checkContexts).toEqual([true, true]);
  });

  it("下载失败 ⇒ 「下载更新失败：」前缀（与检查失败**分开**，两件事不共用一句话）", async () => {
    stub.setDownloadResult({ type: "idle", lastError: { code: "write-error", message: "演示腿的落盘句" } });

    await mod.downloadUpdateAndReport();

    const live = toast.getToasts();
    expect(live).toHaveLength(1);
    expect(live[0].message).toContain("下载更新失败");
    expect(live[0].message).toContain("演示腿的落盘句");
  });

  it("下载失败的 [重试] **先回头重查**再重下（失败落账把 update 丢了，直接重下会被守卫挡住）", async () => {
    stub.setDownloadResult({ type: "idle", lastError: { code: "interrupted", message: "演示腿的断流句" } });
    await mod.downloadUpdateAndReport();
    // 重查这一步查到「仍有更新」⇒ 才允许重下
    stub.setCheckResult({ type: "available", update: INFO });

    await act(async () => {
      toast.getToasts()[0].actions?.[0]?.onClick();
      await flush();
    });

    expect(stub.checkContexts).toEqual([true]);
    expect(stub.downloadCalls()).toBe(2);
  });
});

describe("useUpdateNotifications（「重启并更新」按钮）", () => {
  it("点它 ⇒ 调 quitAndInstall", async () => {
    mountProducer();
    transition({ type: "downloaded", update: INFO });

    await clickPrimary();

    expect(stub.installCalls()).toBe(1);
    expect(toast.getToasts().some((t) => t.severity === "error")).toBe(false);
  });

  it("🔴 装不上 ⇒ 自己收住异常并报一条**用户能读**的提示（漏出去就是 unhandled rejection）", async () => {
    stub.setInstallError(new Error("Error invoking remote method 'update:quitAndInstall': boom"));
    mountProducer();
    transition({ type: "downloaded", update: INFO });

    await clickPrimary();

    const errToast = toast.getToasts().find((t) => t.severity === "error");
    expect(errToast).toBeDefined();
    // 用户看到的是人话，不是 Electron 那串 `Error invoking remote method ...`
    expect(errToast?.message).not.toContain("remote method");
  });
});

describe("非壳环境退化（vitest / 纯 Vite 预览）", () => {
  it("无 window.linkdesk ⇒ 两个包装函数静默返回 null，hook 不抛", async () => {
    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    mountProducer();

    expect(await mod.checkForUpdatesAndReport(true)).toBeNull();
    expect(await mod.downloadUpdateAndReport()).toBeNull();
    expect(toast.getToasts()).toHaveLength(0);
  });
});
