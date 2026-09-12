/**
 * useAbout——关于标签页壳侧数据源单测（E6#57.14b/c/d）。
 *
 * 逐条钉住 `useAbout.ts` 文件头那几条**写反了也照样能跑**的约束：
 * ① 取数**一次就够**——成功后 `primeAbout` 再调不许再发 IPC；
 * ② 并发第二次调用**复用同一条 in-flight Promise**（硬约束 13 精神：返回 undefined 另起一条 = 双取）；
 * ③ 🔴 **失败不固化**——`ready` 转真而 `raw` 留 `null`（态从 loading 变成 content 全 `—`），
 *    且下一次 `primeAbout` 会**再试一次**。这条是本文件的核心负控：
 *    把 `ready` 也一起留在 false（或把失败态缓存住），用户就会「本次会话永远看不到身份」；
 * ④ 八行字段的**顺序逐条**（06 §4.2 字段表）＋ 空串也落 `—`（`||` 而非 `??`）；
 * ⑤ `getAboutCopyText` = 八行 `key: value` `\n` 连接，且标签**跟着当前语言**（现算，不缓存）；
 * ⑥ 还没取到数时 `getAboutCopyText` 返回 `null`（不往剪贴板写空串）。
 *
 * 🔴 被测模块持有**模块级单例**（`_snap`/`_raw`/`_inflight`）⇒ 每个用例 `vi.resetModules()` +
 * 动态 import 拿一份干净模块（对标 `useReleaseNotes.test.ts` 的单例手法）。
 *
 * fixture 全虚构（硬约束 21）：版本 9.9.9、提交 `abc1234`、运行时串一律 `演示…`。
 * ⚠️ 字段**标签**不写死中文/英文——被测代码用 `i18n.t` 现算，本文件用同一个 `i18n.t` 反查比对，
 * 于是「翻译资源在不在」都不影响结论（`parseMissingKeyHandler` 返回 key 本身时两边同为 key）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProductInfo } from "../core/types/ipc/product";
import i18n from "../i18n";

/** 全量产品身份（fixture）——`product` 七项 + `runtime` 五项 */
const PRODUCT: ProductInfo = {
  product: {
    nameLong: "演示软件名",
    nameShort: "演示",
    version: "9.9.9",
    commit: "abc1234",
    date: "2026-01-01",
    quality: "stable",
    updateUrl: "https://demo.invalid/releases/latest",
  },
  runtime: {
    electron: "演示E",
    chromium: "演示C",
    node: "演示N",
    v8: "演示V",
    os: "演示OS",
  },
};

/** 字段表的**顺序**（06 §4.2）——与 `buildAboutData` 逐条对齐 */
const FIELD_KEYS = ["版本", "提交", "日期", "Electron", "Chromium", "Node.js", "V8", "OS"] as const;

type Mod = typeof import("./useAbout");

let mod: Mod;
/** `getProductInfo` 被调了几次——①②的核心判据 */
let calls: number;
/**
 * 挂起的 resolver 队列（手控「谁先回」）。
 * `null` = 那一次已被放行（**位置保留**，否则下标漂移）。
 */
let pending: Array<{ resolve: (v: ProductInfo) => void } | null>;
/** 下一次取数怎么回：`resolve` = 成功，`reject` = 失败（主进程还没注册 handler） */
let nextMode: "resolve" | "reject";
/** 下一次取数成功时给哪份数据 */
let nextValue: ProductInfo;

/** 装一次壳侧取数替身；`withProduct` 控制 `app.getProductInfo` 在不在（非壳环境的兜底路） */
function installStub(withProduct = true): void {
  calls = 0;
  pending = [];
  nextMode = "resolve";
  nextValue = PRODUCT;

  const stub: Record<string, unknown> = {};
  if (withProduct) {
    stub.app = {
      getProductInfo: () => {
        calls += 1;
        if (nextMode === "reject") return Promise.reject(new Error("演示取数失败"));
        return new Promise<ProductInfo>((resolve) => { pending.push({ resolve }); });
      },
    };
  }
  (window as unknown as { linkdesk: unknown }).linkdesk = stub;
}

/* E6#57.14 EXEMPT：本块与 `useReleaseNotes.test.ts` 的微任务/放行脚手架同形——两个 hook 都是
   「模块单例 + 手控 resolver 队列」，放行语义（倒扫找最后一个还挂着的、位置保留防下标漂移）
   逐字相同；差异只在**放行的是什么类型**，抽 helper 要把类型参数化，读起来更绕。 */
/* jscpd:ignore-start */
/** 放掉一串微任务——`_load` 在取数回来之后还有置快照 + 通知两跳 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** 放行挂起的请求（`index < 0` = 最后一个）；已被放过 ⇒ 只 flush，不报错 */
async function settle(index = -1): Promise<void> {
  let at = index;
  if (at < 0) {
    for (let i = pending.length - 1; i >= 0; i -= 1) if (pending[i]) { at = i; break; }
  }
  const slot = at >= 0 ? pending[at] : null;
  if (slot) {
    pending[at] = null;
    slot.resolve(nextValue);
  }
  await flush();
}
/* jscpd:ignore-end */

/** 读当前内容态——非 content 直接抛（`useReleaseNotes.test.ts` 的 `expectState` 同款收窄） */
function content(): Extract<ReturnType<Mod["useAbout"]>, { state: "content" }> {
  const data = mod.getAboutState();
  if (data.state !== "content") throw new Error(`应为 content，实为 ${data.state}`);
  return data;
}

/**
 * 取数 → 放行 → 等到落地。**顺序不能反**：替身把结果挂在 resolver 上，
 * `await mod.primeAbout()` 单写会**永久挂住**（没人放行 ⇒ 那条 Promise 永不 settle ⇒ 用例超时）。
 */
async function primeAndSettle(): Promise<void> {
  const p = mod.primeAbout();
  await settle();
  await p;
}

beforeEach(async () => {
  vi.resetModules();
  installStub();
  mod = await import("./useAbout");
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

/* ── ① 取一次就够 ── */

describe("useAbout（① 取数一次就够）", () => {
  it("`primeAbout` 落地后态从 loading 变 content，且**再调不再发 IPC**", async () => {
    const first = mod.primeAbout();
    expect(calls).toBe(1);

    await settle();
    await first;

    expect(content().name).toBe(PRODUCT.product.nameLong);
    // 会话内第二次——命中缓存，一个 IPC 都不发
    await mod.primeAbout();
    expect(calls).toBe(1);
  });

  it("🔴 **同步段**：`primeAbout` 返回时取数已发起、态仍是 loading（`openAboutTab` 先设态后开 tab 的判据）", () => {
    void mod.primeAbout();

    // 返回前就发起了（不是「等一个微任务才开始」）
    expect(calls).toBe(1);
    // 但结果还没到 ⇒ 仍是 loading（池第一帧画骨架，不是画一屏 `—`）
    expect(mod.getAboutState().state).toBe("loading");
  });
});

/* ── ② 并发复用同一条 ── */

describe("useAbout（② 并发第二次复用 in-flight）", () => {
  it("🔴 连调两次只发**一个** IPC，且两条 Promise 同一时刻落地（返回 undefined 另起一条这条必须红）", async () => {
    const both = Promise.all([mod.primeAbout(), mod.primeAbout()]);
    await settle();
    await both;

    expect(calls).toBe(1);
    expect(content().name).toBe(PRODUCT.product.nameLong);
  });

  it("并发第二次拿到的**就是**第一条的 Promise 对象（同一引用，非等值）", () => {
    const a = mod.primeAbout();
    const b = mod.primeAbout();

    expect(b).toBe(a);
  });
});

/* ── ③ 失败不固化（核心负控） ── */

describe("useAbout（③ 失败不固化 + 快照必须可见）", () => {
  it("🔴 取数失败 ⇒ 态照样落 content（值全 `—`），**不许永远停在 loading**", async () => {
    nextMode = "reject";
    await mod.primeAbout();
    await flush();

    expect(calls).toBe(1);
    const data = content(); // ← 卡在 loading 的话这一行就抛了
    expect(data.name).toBe(i18n.t("主软件"));
    for (const f of data.fields) expect(f.value).toBe("—");
  });

  it("🔴 失败**不缓存失败态**：下一次 `primeAbout` 会再试一次（瞬时故障不许固化成「永远看不到身份」）", async () => {
    nextMode = "reject";
    await mod.primeAbout();
    await flush();
    expect(calls).toBe(1);

    // 再开一次关于页——应当重新发起
    nextMode = "resolve";
    const retry = mod.primeAbout();
    expect(calls).toBe(2);

    await settle();
    await retry;
    expect(content().name).toBe(PRODUCT.product.nameLong);
  });

  it("非壳环境（`window.linkdesk.app` 不在）⇒ 不抛，走全 `—` 兜底", async () => {
    installStub(false);

    await mod.primeAbout();
    await flush();

    const data = content();
    expect(data.fields).toHaveLength(FIELD_KEYS.length);
    expect(data.logoUrl).toBeTruthy();
  });

  it("🔴 快照**整体换对象**：失败路上 `getSnapshot` 也必须变（换成 `_raw` 这条必须红——它恒为 null ⇒ 池永远停在骨架）", async () => {
    const before = mod.getAboutState();
    nextMode = "reject";
    await mod.primeAbout();
    await flush();

    expect(mod.getAboutState()).not.toBe(before);
    expect(mod.getAboutState().state).toBe("content");
  });
});

/* ── ④ 八行字段 ── */

describe("useAbout（④ 八行字段的顺序与占位）", () => {
  it("顺序逐条对齐 06 §4.2 字段表，标签 = `i18n.t` 现算", async () => {
    await primeAndSettle();

    const labels = content().fields.map((f) => f.label);
    expect(labels).toEqual(FIELD_KEYS.map((k) => i18n.t(k)));
  });

  it("值逐条取自 `product` / `runtime` 对应字段（不是同一份值填八遍）", async () => {
    await primeAndSettle();

    const values = content().fields.map((f) => f.value);
    expect(values).toEqual([
      PRODUCT.product.version,
      PRODUCT.product.commit,
      PRODUCT.product.date,
      PRODUCT.runtime!.electron,
      PRODUCT.runtime!.chromium,
      PRODUCT.runtime!.node,
      PRODUCT.runtime!.v8,
      PRODUCT.runtime!.os,
    ]);
    // 八行八个不同值——防「取错字段」这类改法悄悄绿
    expect(new Set(values).size).toBe(values.length);
  });

  it("🔴 空串也是「没有」⇒ 落 `—`（写 `??` 而非 `||` 这条必须红——空行比占位符更糟）", async () => {
    nextValue = {
      product: { ...PRODUCT.product, commit: "", date: "" },
      runtime: { ...PRODUCT.runtime!, v8: "" },
    };
    await primeAndSettle();

    const byLabel = new Map(content().fields.map((f) => [f.label, f.value]));
    expect(byLabel.get(i18n.t("提交"))).toBe("—");
    expect(byLabel.get(i18n.t("日期"))).toBe("—");
    expect(byLabel.get(i18n.t("V8"))).toBe("—");
    // 没缺的那几行照旧
    expect(byLabel.get(i18n.t("版本"))).toBe(PRODUCT.product.version);
  });

  it("`nameLong` 缺席 ⇒ 用既有 i18n 键「主软件」兜底（不在代码里写死品牌名）", async () => {
    nextValue = { product: { ...PRODUCT.product, nameLong: "" }, runtime: PRODUCT.runtime };
    await primeAndSettle();

    expect(content().name).toBe(i18n.t("主软件"));
  });

  it("`logoUrl` 走 `getAssetPath`（硬约束 12——不许手写 `/assets/...`）", async () => {
    await primeAndSettle();

    expect(content().logoUrl).toContain("assets/logo.svg");
  });
});

/* ── ⑤⑥ 复制文本 ── */

describe("useAbout（⑤⑥ 复制文本）", () => {
  it("八行 `key: value`、`\\n` 连接、顺序与字段表一致", async () => {
    await primeAndSettle();

    const text = mod.getAboutCopyText()!;
    const lines = text.split("\n");

    expect(lines).toHaveLength(FIELD_KEYS.length);
    expect(lines.map((l) => l.split(": ")[0])).toEqual(FIELD_KEYS.map((k) => i18n.t(k)));
    expect(lines[0]).toBe(`${i18n.t("版本")}: ${PRODUCT.product.version}`);
  });

  it("复制文本与**推给池的那份**标签同源（现算 ⇒ 语言一换两边一起换）", async () => {
    await primeAndSettle();

    const text = mod.getAboutCopyText()!;
    const labels = content().fields.map((f) => `${f.label}: ${f.value}`).join("\n");

    expect(text).toBe(labels);
  });

  it("🔴 还没取到数 ⇒ `null`（按钮理论上点不到；真点到也不许把空串写进剪贴板）", () => {
    expect(mod.getAboutCopyText()).toBeNull();
  });

  it("取数失败（全 `—`）**不**返回 null——那是取到了、只是机器报不出身份，复制出去仍是八行", async () => {
    nextMode = "reject";
    await mod.primeAbout();
    await flush();

    const lines = mod.getAboutCopyText()!.split("\n");
    expect(lines).toHaveLength(FIELD_KEYS.length);
    expect(lines.every((l) => l.endsWith(": —"))).toBe(true);
  });
});
