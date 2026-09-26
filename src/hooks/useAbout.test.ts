/**
 * useAbout——关于标签页壳侧数据源单测（E6#57.14b/c/d；04「关于页重设计」四区改版）。
 *
 * 逐条钉住 `useAbout.ts` 文件头那几条**写反了也照样能跑**的约束：
 * ① 取数**一次就够**——成功后 `primeAbout` 再调不许再发 IPC；
 * ② 并发第二次调用**复用同一条 in-flight Promise**（硬约束 13 精神：返回 undefined 另起一条 = 双取）；
 * ③ 🔴 **失败不固化**——`ready` 转真而 `raw` 留 `null`（态从 loading 变成 content 全 `—`），
 *    且下一次 `primeAbout` 会**再试一次**。这条是本文件的核心负控：
 *    把 `ready` 也一起留在 false（或把失败态缓存住），用户就会「本次会话永远看不到身份」；
 * ④ 卡片行的**顺序逐条**（04 设计 §四.1 三卡）＋ 空串也落 `—`（`||` 而非 `??`）；
 * ⑤ 作者卡三态：author 形状合法 ⇒ 3 卡（姓名/邮箱主备/GitHub 推导）；缺席 ⇒ 2 卡整块不画；
 *    updateUrl 非 GitHub 形态 ⇒ 无 GitHub 行、无 repoUrl（不写死仓库地址）；
 * ⑥ `getAboutCopyText` = 名片全文（首行名+版本 → [卡] → 作者行 → 版权行），且标签**跟着当前语言**；
 * ⑦ 还没取到数时 `getAboutCopyText` 返回 `null`（不往剪贴板写空串）。
 *
 * 🔴 被测模块持有**模块级单例**（`_snap`/`_raw`/`_inflight`）⇒ 每个用例 `vi.resetModules()` +
 * 动态 import 拿一份干净模块（对标 `useReleaseNotes.test.ts` 的单例手法）。
 *
 * fixture 全虚构（硬约束 21）：版本 9.9.9、提交 `abc1234`、作者「演示张三」、仓库 demo-owner/demo-repo、
 * 运行时串一律 `演示…`。⚠️ 字段**标签**不写死中文/英文——被测代码用 `i18n.t` 现算，本文件用同一个
 * `i18n.t` 反查比对，于是「翻译资源在不在」都不影响结论。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProductInfo } from "../core/types/ipc/product";
import i18n from "../i18n";

/** 作者身份 fixture（04 拍板②：product.json 的 author 块——全虚构，硬约束 21） */
const AUTHOR = {
  nameZh: "演示张三",
  nameEn: "Demo Zhang",
  emailPrimary: "demo-primary@demo.invalid",
  emailSecondary: "demo-secondary@demo.invalid",
  copyrightHolder: "演示张三（Demo Zhang）",
};

/** 全量产品身份（fixture）——updateUrl 用 GitHub API 形态（owner/repo 推导的输入），但仓库名虚构 */
const PRODUCT: ProductInfo = {
  product: {
    nameLong: "演示软件名",
    nameShort: "演示",
    version: "9.9.9",
    commit: "abc1234",
    date: "2026-01-01",
    quality: "stable",
    updateUrl: "https://api.github.com/repos/demo-owner/demo-repo/releases/latest",
    author: AUTHOR,
  },
  runtime: {
    electron: "演示E",
    chromium: "演示C",
    node: "演示N",
    v8: "演示V",
    os: "演示OS",
  },
};

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
    // 通道行恒有值（quality 三值枚举有默认 'stable'，不是「缺失占位」的那类值）——只断其余行
    const values = data.cards
      .flatMap((c) => c.rows)
      .filter((r) => r.value !== i18n.t("稳定版") && r.value !== i18n.t("预览版"))
      .map((r) => r.value);
    for (const v of values) expect(v).toBe("—");
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
    expect(data.cards).toHaveLength(2); // author 缺席 ⇒ 作者卡不画（保底：整块不出现）
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

/* ── ④ HERO 与三卡（04「关于页重设计」四区） ── */

describe("useAbout（④ HERO 与卡片：顺序、占位、推导）", () => {
  it("HERO：版本药丸取 `product.version`、tagline = 定位句现算（标签、随语言）", async () => {
    await primeAndSettle();

    const data = content();
    expect(data.version).toBe(PRODUCT.product.version);
    expect(data.tagline).toBe(i18n.t("一个容器，装下你所有的工作方式"));
  });

  it("三卡顺序与行序逐条（本版本 → 运行环境 → 作者），标签 = `i18n.t` 现算", async () => {
    await primeAndSettle();

    const cards = content().cards;
    expect(cards.map((c) => c.title)).toEqual([i18n.t("本版本"), i18n.t("运行环境"), i18n.t("作者")]);
    expect(cards[0].rows.map((r) => r.label)).toEqual([i18n.t("提交"), i18n.t("日期"), i18n.t("通道")]);
    expect(cards[1].rows.map((r) => r.label)).toEqual([
      i18n.t("Electron"),
      i18n.t("Chromium"),
      i18n.t("Node.js"),
      i18n.t("V8"),
      i18n.t("OS"),
    ]);
  });

  it("值逐条取自 `product` / `runtime` 对应字段；通道 = 稳定版（quality=stable）", async () => {
    await primeAndSettle();

    const [version, env] = content().cards;
    expect(version.rows.map((r) => r.value)).toEqual([
      PRODUCT.product.commit,
      PRODUCT.product.date,
      i18n.t("稳定版"),
    ]);
    expect(env.rows.map((r) => r.value)).toEqual([
      PRODUCT.runtime!.electron,
      PRODUCT.runtime!.chromium,
      PRODUCT.runtime!.node,
      PRODUCT.runtime!.v8,
      PRODUCT.runtime!.os,
    ]);
    // 逐行异值——防「取错字段」这类改法悄悄绿
    const values = content().cards.flatMap((c) => c.rows.map((r) => r.value));
    expect(new Set(values).size).toBe(values.length);
  });

  it("🔴 空串也是「没有」⇒ 落 `—`（写 `??` 而非 `||` 这条必须红——空行比占位符更糟）", async () => {
    nextValue = {
      product: { ...PRODUCT.product, commit: "", date: "" },
      runtime: { ...PRODUCT.runtime!, v8: "" },
    };
    await primeAndSettle();

    const byLabel = new Map(
      content().cards.flatMap((c) => c.rows).filter((r) => r.label !== "").map((r) => [r.label, r.value]),
    );
    expect(byLabel.get(i18n.t("提交"))).toBe("—");
    expect(byLabel.get(i18n.t("日期"))).toBe("—");
    expect(byLabel.get(i18n.t("V8"))).toBe("—");
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

/* ── ④b 作者卡与 GitHub 推导（04 拍板②③④） ── */

describe("useAbout（④b 作者卡：author 块三态 + owner 推导不写死）", () => {
  it("author 合法 ⇒ 作者卡三行：姓名（中英并列）/ 邮箱主（mailto）/ 备（空 label + secondary）/ GitHub 行", async () => {
    await primeAndSettle();

    const author = content().cards[2];
    expect(author.rows).toHaveLength(4);
    expect(author.rows[0]).toMatchObject({ label: i18n.t("姓名"), value: `${AUTHOR.nameZh} ${AUTHOR.nameEn}` });
    // 姓名与邮箱是**值**不是标签——不过 t()（验收 8/12）
    expect(author.rows[1]).toMatchObject({
      label: i18n.t("邮箱"),
      value: AUTHOR.emailPrimary,
      href: `mailto:${AUTHOR.emailPrimary}`,
    });
    expect(author.rows[2]).toMatchObject({
      label: "",
      value: AUTHOR.emailSecondary,
      href: `mailto:${AUTHOR.emailSecondary}`,
      secondary: true,
    });
    // GitHub 从 updateUrl owner 段推出——fixture 的 demo-owner 虚构仓，**没有写死 Encaron**
    expect(author.rows[3]).toMatchObject({
      label: i18n.t("GitHub"),
      value: "github.com/demo-owner",
      href: "https://github.com/demo-owner",
    });
  });

  it("author 缺席（旧 shape）⇒ 作者卡整块不画（2 张卡）＋ 页脚版权行也缺席——同生共死", async () => {
    nextValue = { product: { ...PRODUCT.product, author: undefined }, runtime: PRODUCT.runtime };
    await primeAndSettle();

    const data = content();
    expect(data.cards).toHaveLength(2);
    expect(data.footerCopyright).toBeUndefined();
  });

  it("updateUrl 非 GitHub API 形态 ⇒ 无 GitHub 行、无 repoUrl（推导不出就不画——空链接比没有链接更糟）", async () => {
    nextValue = { product: { ...PRODUCT.product, updateUrl: "https://demo.invalid/releases/latest" }, runtime: PRODUCT.runtime };
    await primeAndSettle();

    const data = content();
    expect(data.cards[2].rows.some((r) => r.label === i18n.t("GitHub"))).toBe(false);
    expect(data.repoUrl).toBeUndefined();
  });

  it("页脚：repoUrl = 仓库主页（github.com/O/R，非 releases 页）＋ 版权行 = 年份动态 + 署名口径（拍板④）", async () => {
    await primeAndSettle();

    const data = content();
    expect(data.repoUrl).toBe("https://github.com/demo-owner/demo-repo");
    expect(data.footerCopyright).toBe(`© ${new Date().getFullYear()} ${AUTHOR.copyrightHolder} · MIT License`);
  });
});

/* ── ⑤⑥ 复制文本（拍板⑥：带作者行的名片全文） ── */

describe("useAbout（⑤⑥ 复制文本 = 名片全文）", () => {
  it("首行 `名字 版本` → 每卡 `[标题]` 与 `label: value` 行 → 版权行；备用邮箱行不带空 label", async () => {
    await primeAndSettle();

    const text = mod.getAboutCopyText()!;
    const lines = text.split("\n");

    expect(lines[0]).toBe(`${PRODUCT.product.nameLong} ${PRODUCT.product.version}`);
    expect(lines).toContain(`[${i18n.t("本版本")}]`);
    expect(lines).toContain(`${i18n.t("提交")}: ${PRODUCT.product.commit}`);
    expect(lines).toContain(`[${i18n.t("作者")}]`);
    // 作者行全带（拍板⑥：贴进 issue 对方知道找谁）；姓名行有 label；备用行没有 label ⇒ 只出值
    expect(lines).toContain(`${i18n.t("姓名")}: ${AUTHOR.nameZh} ${AUTHOR.nameEn}`);
    expect(lines).toContain(`${i18n.t("邮箱")}: ${AUTHOR.emailPrimary}`);
    expect(lines).toContain(AUTHOR.emailSecondary);
    expect(lines).toContain(`© ${new Date().getFullYear()} ${AUTHOR.copyrightHolder} · MIT License`);
  });

  it("复制文本与**推给池的那份**值同源（现算 ⇒ 语言一换两边一起换；姓名与邮箱本身不变）", async () => {
    await primeAndSettle();

    const text = mod.getAboutCopyText()!;
    // 页面上画的值逐个出现在复制文本里（标签是翻译、值是身份——两者同源即可）
    for (const row of content().cards.flatMap((c) => c.rows)) {
      expect(text).toContain(row.value);
    }
  });

  it("🔴 还没取到数 ⇒ `null`（按钮理论上点不到；真点到也不许把空串写进剪贴板）", () => {
    expect(mod.getAboutCopyText()).toBeNull();
  });

  it("取数失败（全 `—`）**不**返回 null——author 也取不到 ⇒ 无版权行，但卡片行仍在", async () => {
    nextMode = "reject";
    await mod.primeAbout();
    await flush();

    const text = mod.getAboutCopyText()!;
    const lines = text.split("\n");
    expect(lines[0]).toBe(`${i18n.t("主软件")} —`);
    expect(lines.every((l) => l === "—" || l.endsWith(": —") || l.startsWith("[") || !l.includes(": —"))).toBe(true);
    expect(text).not.toContain("©"); // author 取不到 ⇒ 版权行缺席
  });
});
